import { useEffect, useRef, useState } from 'react'
import { MessageCircle, RefreshCw, Send } from 'lucide-react'
import { fetchReportMessages, markReportConversationRead, removeReportMessageSubscription, sendReportMessage, subscribeToReportMessages } from './reportMessages'
import { messageErrorText } from './reportingErrors'
import type { ReportMessage } from './types'

export function ReportConversation({ reportId, currentUserId, onRead }: { reportId: string; currentUserId: string; onRead: () => void }) {
  const [messages, setMessages] = useState<ReportMessage[]>([])
  const [draft, setDraft] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [connected, setConnected] = useState(false)
  const mounted = useRef(true)

  async function load() {
    try {
      const next = await fetchReportMessages(reportId)
      if (!mounted.current) return
      setMessages(next)
      await markReportConversationRead(reportId)
      if (mounted.current) onRead()
    } catch (caught) {
      if (mounted.current) setNotice(caught instanceof Error ? caught.message : 'Could not load the conversation.')
    } finally { if (mounted.current) setLoading(false) }
  }

  useEffect(() => {
    mounted.current = true
    setMessages([]); setLoading(true); setNotice(''); setConnected(false)
    void load()
    const channel = subscribeToReportMessages(reportId, () => void load(), setConnected)
    const recover = () => void load()
    window.addEventListener('online', recover)
    return () => { mounted.current = false; window.removeEventListener('online', recover); void removeReportMessageSubscription(channel) }
  }, [reportId])

  async function send() {
    if (!draft.trim()) { setNotice('Enter a message.'); return }
    if (draft.length > 2000) { setNotice('Messages must be 2000 characters or fewer.'); return }
    if (sending) return
    setSending(true); setNotice('')
    try {
      await sendReportMessage(reportId, draft, requestId)
      setDraft(''); setRequestId(crypto.randomUUID()); setNotice('Sent')
      await load()
    } catch (caught) { setNotice(messageErrorText(caught)) }
    finally { setSending(false) }
  }

  return <section className="history-card conversation-card" aria-labelledby="conversation-title">
    <div className="conversation-heading"><div><h2 id="conversation-title"><MessageCircle /> Private conversation</h2><p>Only the reporter and authorised responders can read these messages.</p></div><span className={`conversation-connection ${connected ? 'connected' : ''}`} role="status">{connected ? 'Live' : 'Reconnecting'}</span></div>
    <div className="conversation-notice" role="note">Messages stay inside AlertBridge. Sending a message does not mean officers or emergency services were dispatched.</div>
    {loading ? <p>Loading conversation…</p> : messages.length === 0 ? <p className="neutral-message">No messages yet.</p> : <ol className="message-list">{messages.map((message) => <li key={message.id} className={message.senderId === currentUserId ? 'own-message' : ''}><div><b>{message.authorRole}</b><time>{new Date(message.createdAt).toLocaleString()}</time></div><p>{message.body}</p></li>)}</ol>}
    <label className="message-compose">Message <span>{draft.length}/2000</span><textarea rows={4} maxLength={2000} value={draft} onChange={(event) => { setDraft(event.target.value); setNotice('') }} placeholder="Write a private message…" /></label>
    {notice && <p className={notice === 'Sent' ? 'auth-message' : 'control-message'} role="status">{notice}</p>}
    <div className="conversation-actions"><button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw /> Refresh</button><button className="primary" onClick={() => void send()} disabled={sending || !draft.trim()}><Send /> {sending ? 'Sending…' : 'Send message'}</button></div>
  </section>
}
