import { supabase } from './supabase'
import type { Answer, Category, Mode, Report, Status, StatusEvent } from './types'

interface HistoryRow { new_status: Status; changed_at: string; reason: string | null }
interface ReportRow {
  id: string; created_at: string; mode: Mode; category: Category; description: string
  happening_now: Answer | null; anyone_injured: Answer | null; additional_details: string | null
  latitude: number; longitude: number; status: Status; report_status_history?: HistoryRow[]
}

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function mapReport(row: ReportRow): Report {
  const history: StatusEvent[] = (row.report_status_history ?? [])
    .map((event) => ({ status: event.new_status, at: event.changed_at, reason: event.reason ?? undefined }))
    .sort((a, b) => a.at.localeCompare(b.at))
  return {
    id: row.id, createdAt: row.created_at, mode: row.mode, category: row.category,
    description: row.description, happeningNow: row.happening_now ?? undefined,
    anyoneInjured: row.anyone_injured ?? undefined, additionalDetails: row.additional_details ?? undefined,
    location: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
    status: row.status, history,
  }
}

const reportSelection = 'id, created_at, mode, category, description, happening_now, anyone_injured, additional_details, latitude, longitude, status, report_status_history(new_status, changed_at, reason)'

export async function fetchConnectedReports(): Promise<Report[]> {
  const client = requireClient()
  const { data, error } = await client.from('incident_reports').select(reportSelection).order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as ReportRow[]).map(mapReport)
}

export async function fetchResponderMembership(userId: string): Promise<boolean> {
  const client = requireClient()
  const { data, error } = await client.from('authorized_responders').select('user_id').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function changeConnectedStatus(reportId: string, status: Status, reason: string): Promise<void> {
  const client = requireClient()
  const { error } = await client.rpc('change_report_status', {
    target_report_id: reportId, target_status: status, change_reason: reason.trim() || null,
  })
  if (error) throw error
}

export async function updateDisplayName(userId: string, displayName: string): Promise<void> {
  const client = requireClient()
  const cleanName = displayName.trim()
  const { error } = await client.from('profiles').update({ display_name: cleanName }).eq('id', userId)
  if (error) throw error
  const { error: authError } = await client.auth.updateUser({ data: { display_name: cleanName } })
  if (authError) throw authError
}
