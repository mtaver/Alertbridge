import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { ReportMessage } from './types'

interface MessageRow { id: string; report_id: string; sender_id: string; sender_role: ReportMessage['authorRole']; body: string; created_at: string }
function client() { if (!supabase) throw new Error('AlertBridge service is unavailable.'); return supabase }
function mapMessage(row: MessageRow): ReportMessage { return { id: row.id, reportId: row.report_id, senderId: row.sender_id, authorRole: row.sender_role, body: row.body, createdAt: row.created_at } }

export async function fetchReportMessages(reportId: string): Promise<ReportMessage[]> {
  const { data, error } = await client().from('report_messages').select('id, report_id, sender_id, sender_role, body, created_at').eq('report_id', reportId).order('created_at')
  if (error) throw error
  return (data as MessageRow[]).map(mapMessage)
}

export async function sendReportMessage(reportId: string, body: string, requestId: string): Promise<string> {
  const { data, error } = await client().rpc('send_report_message', { target_report_id: reportId, message_body: body, client_request_id: requestId })
  if (error) throw error
  return data as string
}

export async function markReportConversationRead(reportId: string): Promise<void> {
  const { error } = await client().rpc('mark_report_conversation_read', { target_report_id: reportId })
  if (error) throw error
}

export async function fetchUnreadMessageCounts(): Promise<Record<string, number>> {
  const { data, error } = await client().rpc('get_report_unread_counts')
  if (error) throw error
  return Object.fromEntries(((data ?? []) as { report_id: string; unread_count: number | string }[]).map((row) => [row.report_id, Number(row.unread_count)]))
}

export function subscribeToReportMessages(reportId: string, onChange: () => void, onStatus: (connected: boolean) => void): RealtimeChannel | null {
  if (!supabase) return null
  return supabase.channel(`private-report-messages-${reportId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_message_events', filter: `report_id=eq.${reportId}` }, onChange)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') { onStatus(true); onChange() }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus(false)
    })
}

export async function removeReportMessageSubscription(channel: RealtimeChannel | null) {
  if (supabase && channel) await supabase.removeChannel(channel)
}
