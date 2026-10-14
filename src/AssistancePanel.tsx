import { useEffect, useState } from 'react'
import { Check, Send } from 'lucide-react'
import { fetchAssistanceActions, recordAssistanceAction } from './reportingChannels'
import type { AssistanceAction } from './types'
import { useI18n } from './i18n'

function localDateTime() { const value = new Date(); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 16) }

export function AssistancePanel({ reportId, canRecord }: { reportId: string; canRecord: boolean }) {
  const { t, locale } = useI18n()
  const [actions, setActions] = useState<AssistanceAction[]>([])
  const [action, setAction] = useState<AssistanceAction['actionType']>('Acknowledged')
  const [note, setNote] = useState('')
  const [agency, setAgency] = useState('')
  const [reference, setReference] = useState('')
  const [handoffTime, setHandoffTime] = useState(localDateTime)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  async function load() { try { setActions(await fetchAssistanceActions(reportId)) } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not load coordination history.') } }
  useEffect(() => { void load() }, [reportId])
  async function save() {
    if (action === 'Coordination note' && !note.trim()) { setMessage('Enter a coordination note.'); return }
    if (action === 'Forwarded to agency' && (!agency.trim() || !handoffTime || (!reference.trim() && !note.trim()))) { setMessage('Agency, handoff time, and a reference or note are required.'); return }
    setSaving(true); setMessage('')
    try { await recordAssistanceAction(reportId, action, note, agency, handoffTime, reference); setNote(''); setReference(''); setMessage('Coordination action recorded.'); await load() }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not record the coordination action.') }
    finally { setSaving(false) }
  }
  return <section className="history-card assistance-panel"><h2>{t('assistance.title', 'Assistance coordination')}</h2><p>{t('assistance.notice', 'Delivery to AlertBridge, responder acknowledgement, verification, agency handoff and resolution are separate events. Recording a handoff documents an action already taken; it does not send a message to an agency or dispatch help.')}</p>
    {canRecord && <div className="assistance-form"><label>{t('assistance.action', 'Action')}<select value={action} onChange={(event) => setAction(event.target.value as AssistanceAction['actionType'])}><option value="Acknowledged">{t('assistance.ack', 'Acknowledged')}</option><option value="Coordination note">{t('assistance.coordination', 'Coordination note')}</option><option value="Forwarded to agency">{t('assistance.forwarded', 'Forwarded to agency')}</option></select></label><label>{t('assistance.note', 'Note')}<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></label>{action === 'Forwarded to agency' && <div className="handoff-fields"><label>{t('assistance.agency', 'Agency actually contacted')} <b>*</b><input value={agency} onChange={(event) => setAgency(event.target.value)} /></label><label>{t('assistance.time', 'Handoff time')} <b>*</b><input type="datetime-local" value={handoffTime} onChange={(event) => setHandoffTime(event.target.value)} /></label><label>{t('assistance.reference', 'Reference')} <input value={reference} onChange={(event) => setReference(event.target.value)} /></label></div>}<button className="primary" disabled={saving} onClick={() => void save()}>{action === 'Forwarded to agency' ? <Send /> : <Check />} {saving ? 'Saving…' : t('assistance.record', 'Record action')}</button></div>}
    {message && <p className="auth-message" role="status">{message}</p>}
    {actions.length === 0 ? <p>{t('assistance.none', 'No acknowledgement or coordination action has been recorded.')}</p> : <ol>{[...actions].reverse().map((item) => <li key={item.id}><span className="timeline-dot"></span><div><b>{item.actionType}</b><time>{new Date(item.recordedAt).toLocaleString(locale)}</time>{item.agency && <p>Agency: {item.agency}</p>}{item.handedOffAt && <p>Handoff time: {new Date(item.handedOffAt).toLocaleString(locale)}</p>}{item.agencyReference && <p>Reference: {item.agencyReference}</p>}{item.note && <p>{item.note}</p>}</div></li>)}</ol>}
  </section>
}
