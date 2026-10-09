import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AlertConnectionStatus = 'unavailable' | 'connecting' | 'connected' | 'disconnected'

export function subscribeToPublicAlertChanges(onChange: () => void, onStatus: (status: AlertConnectionStatus) => void): RealtimeChannel | null {
  if (!supabase) { onStatus('unavailable'); return null }
  onStatus('connecting')
  return supabase
    .channel('public-community-alert-events')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_alert_events' }, onChange)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') { onStatus('connected'); onChange() }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus('disconnected')
    })
}

export async function removePublicAlertSubscription(channel: RealtimeChannel | null) {
  if (supabase && channel) await supabase.removeChannel(channel)
}

export function subscribeToPrivateReportChanges(onChange: () => void): RealtimeChannel | null {
  if (!supabase) return null
  return supabase
    .channel('responder-private-report-events')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_report_events' }, onChange)
    .subscribe((status) => { if (status === 'SUBSCRIBED') onChange() })
}
