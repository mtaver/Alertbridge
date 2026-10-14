import { useEffect, useMemo, useState } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { removePublicAlertSubscription, subscribeToOutcomeChanges } from './alertRealtime'
import { fetchOutcomeHistory, recordAssistanceOutcomeAction, submitOutcomeFeedback } from './reportingChannels'
import type { AssistanceOutcomeAction, AssistanceOutcomeActionType, OutcomeConfirmation, OutcomeFeedback } from './types'
import { outcomeLabel, useI18n } from './i18n'

const confirmations: OutcomeConfirmation[] = ['Assistance received', 'Partly addressed', 'Assistance not received', 'Cannot confirm']

export function OutcomeFeedbackPanel({ reportId, canRecord, isOwner, onChanged }: { reportId: string; canRecord: boolean; isOwner: boolean; onChanged: () => void }) {
  const { t, locale } = useI18n()
  const [actions, setActions] = useState<AssistanceOutcomeAction[]>([])
  const [feedback, setFeedback] = useState<OutcomeFeedback[]>([])
  const [outcomeAction, setOutcomeAction] = useState<AssistanceOutcomeActionType>('Assistance provided')
  const [outcomeNote, setOutcomeNote] = useState('')
  const [confirmation, setConfirmation] = useState<OutcomeConfirmation | ''>('')
  const [comment, setComment] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const confirmationRequested = actions.some((item) => item.actionType === 'Assistance provided' || item.actionType === 'Issue attended to')
  const latestFeedback = feedback.at(-1)
  const followUpRecorded = actions.some((item) => item.actionType === 'Follow-up action' && latestFeedback && item.recordedAt > latestFeedback.submittedAt)
  const followUpRequired = !followUpRecorded && (latestFeedback?.confirmation === 'Partly addressed' || latestFeedback?.confirmation === 'Assistance not received')
  const actionOptions = useMemo<AssistanceOutcomeActionType[]>(() => followUpRequired ? ['Assistance provided', 'Issue attended to', 'Follow-up action'] : ['Assistance provided', 'Issue attended to'], [followUpRequired])

  async function load() {
    try {
      const next = await fetchOutcomeHistory(reportId)
      setActions(next.actions); setFeedback(next.feedback)
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not load outcome history.') }
  }

  useEffect(() => {
    void load()
    const channel = subscribeToOutcomeChanges(reportId, () => { void load(); onChanged() })
    return () => { void removePublicAlertSubscription(channel) }
  }, [reportId])

  async function saveResponderOutcome() {
    if (!outcomeNote.trim()) { setMessage('Enter a note describing the recorded outcome or follow-up.'); return }
    setSaving(true); setMessage('')
    try {
      await recordAssistanceOutcomeAction(reportId, outcomeAction, outcomeNote)
      setOutcomeNote(''); setMessage('Responder outcome action recorded. Reporter confirmation is kept separate.'); await load(); onChanged()
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not record the outcome action.') }
    finally { setSaving(false) }
  }

  async function saveReporterFeedback() {
    if (!confirmation) { setMessage('Choose the outcome that best describes what happened.'); return }
    if (comment.length > 2000) { setMessage('The optional comment must be 2000 characters or fewer.'); return }
    setSaving(true); setMessage('')
    try {
      await submitOutcomeFeedback(reportId, confirmation, comment, requestId)
      setConfirmation(''); setComment(''); setRequestId(crypto.randomUUID()); setMessage('Your outcome confirmation was saved.'); await load(); onChanged()
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not save your confirmation. Your response has been preserved for retry.') }
    finally { setSaving(false) }
  }

  return <section className="history-card outcome-panel" aria-labelledby={`outcome-${reportId}`}>
    <h2 id={`outcome-${reportId}`}>{t('outcome.title', 'Was your issue attended to?')}</h2>
    <p>Responder acknowledgement, agency handoff, messages and report status do not prove that assistance was received. Responder-reported outcomes and reporter confirmations are shown separately.</p>

    <div className="outcome-columns">
      <div><h3>{t('outcome.responder', 'Responder-reported outcome')}</h3>{actions.length === 0 ? <p>No assistance outcome has been recorded.</p> : <ol>{[...actions].reverse().map((item) => <li key={item.id}><span className="timeline-dot"></span><div><b>{item.actionType}</b><time>{new Date(item.recordedAt).toLocaleString(locale)}</time><p>{item.note}</p></div></li>)}</ol>}</div>
      <div><h3>{t('outcome.reporter', 'Reporter confirmation')}</h3>{confirmationRequested && feedback.length === 0 ? <p className="outcome-awaiting">{t('outcome.awaiting', 'Awaiting reporter confirmation')}</p> : feedback.length === 0 ? <p>Confirmation will be requested after a responder records that assistance was provided or the issue was attended to.</p> : <ol>{[...feedback].reverse().map((item) => <li key={item.id}><span className="timeline-dot"></span><div><b>{outcomeLabel(item.confirmation, t)}</b><time>Revision {item.revision} · {new Date(item.submittedAt).toLocaleString(locale)}</time>{item.comment && <p>{item.comment}</p>}</div></li>)}</ol>}{followUpRequired && <p className="follow-up-flag">{t('outcome.followUp', 'Follow-up required')}</p>}</div>
    </div>

    {canRecord && <div className="assistance-form"><h3>Record an assistance outcome or follow-up</h3><label>Action<select value={outcomeAction} onChange={(event) => setOutcomeAction(event.target.value as AssistanceOutcomeActionType)}>{actionOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label>Outcome or follow-up note <b>*</b><textarea rows={3} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} /></label><button className="primary" disabled={saving} onClick={() => void saveResponderOutcome()}><Check /> {saving ? 'Saving…' : 'Record outcome action'}</button></div>}

    {isOwner && confirmationRequested && <div className="assistance-form"><h3>{latestFeedback ? 'Submit another confirmation' : 'Confirm what happened'}</h3><p>Submitting again creates a new revision and does not erase earlier feedback.</p><fieldset><legend>Outcome <b>*</b></legend><div className="outcome-options">{confirmations.map((item) => <label key={item}><input type="radio" name={`outcome-${reportId}`} checked={confirmation === item} onChange={() => setConfirmation(item)} /> {outcomeLabel(item, t)}</label>)}</div></fieldset><label>{t('outcome.comment', 'Optional comment')}<textarea rows={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} /></label><button className="primary" disabled={saving} onClick={() => void saveReporterFeedback()}><Check /> {saving ? 'Saving…' : t('outcome.save', 'Save confirmation')}</button></div>}

    {message && <p className="auth-message" role="status">{message}</p>}
    <button type="button" className="text-button" onClick={() => void load()}><RefreshCw /> Refresh outcome history</button>
  </section>
}
