import { supabase } from './supabase'
import type { AlertDraft, AlertStatus, CommunityAlert } from './types'

interface AlertRow {
  id: string; title: string; summary: string; affected_area: string; category: CommunityAlert['category']
  guidance: string; expires_at: string; danger_latitude: number | null; danger_longitude: number | null
  danger_radius_km: number | null; display_status: CommunityAlert['displayStatus']; published_at: string; updated_at: string
  source_kind: CommunityAlert['sourceKind']; verified: boolean
}

function client() {
  if (!supabase) throw new Error('AlertBridge service is unavailable.')
  return supabase
}

function mapAlert(row: AlertRow): CommunityAlert {
  return {
    id: row.id, title: row.title, summary: row.summary, affectedArea: row.affected_area,
    category: row.category, guidance: row.guidance, expiresAt: row.expires_at,
    dangerLatitude: row.danger_latitude ?? undefined, dangerLongitude: row.danger_longitude ?? undefined,
    dangerRadiusKm: row.danger_radius_km ?? undefined, displayStatus: row.display_status,
    publishedAt: row.published_at, updatedAt: row.updated_at,
    sourceKind: row.source_kind, verified: row.verified,
  }
}

export async function fetchPublicAlerts(): Promise<CommunityAlert[]> {
  const { data, error } = await client().from('community_alert_feed').select('*').order('published_at', { ascending: false })
  if (error) throw error
  return (data as AlertRow[]).map(mapAlert)
}

function alertArguments(draft: AlertDraft) {
  const hasDangerZone = draft.dangerLatitude.trim() || draft.dangerLongitude.trim() || draft.dangerRadiusKm.trim()
  return {
    public_title: draft.title.trim(), public_summary: draft.summary.trim(),
    public_affected_area: draft.affectedArea.trim(), public_category: draft.category,
    public_guidance: draft.guidance.trim(), public_expires_at: new Date(draft.expiresAt).toISOString(),
    public_danger_latitude: hasDangerZone ? Number(draft.dangerLatitude) : null,
    public_danger_longitude: hasDangerZone ? Number(draft.dangerLongitude) : null,
    public_danger_radius_km: hasDangerZone ? Number(draft.dangerRadiusKm) : null,
  }
}

export async function publishAlert(reportId: string, draft: AlertDraft): Promise<string> {
  const { data, error } = await client().rpc('publish_community_alert', { verified_report_id: reportId, ...alertArguments(draft) })
  if (error) throw error
  return String(data)
}

export async function updateAlert(alertId: string, draft: AlertDraft): Promise<void> {
  const { error } = await client().rpc('update_community_alert', { target_alert_id: alertId, ...alertArguments(draft) })
  if (error) throw error
}

export async function setAlertStatus(alertId: string, status: Extract<AlertStatus, 'Resolved' | 'Withdrawn'>): Promise<void> {
  const { error } = await client().rpc('set_community_alert_status', { target_alert_id: alertId, target_status: status })
  if (error) throw error
}

export async function fetchAlertForReport(reportId: string): Promise<(CommunityAlert & { sourceReportId: string }) | null> {
  const { data, error } = await client().from('community_alerts').select('id, source_report_id, title, summary, affected_area, category, guidance, expires_at, danger_latitude, danger_longitude, danger_radius_km, status, published_at, updated_at').eq('source_report_id', reportId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as Omit<AlertRow, 'display_status' | 'source_kind' | 'verified'> & { source_report_id: string; status: CommunityAlert['displayStatus'] }
  return { ...mapAlert({ ...row, display_status: row.status, source_kind: 'responder_alert', verified: true }), sourceReportId: row.source_report_id }
}

export function validateAlertDraft(draft: AlertDraft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!draft.title.trim()) errors.title = 'Enter a public title.'
  if (!draft.summary.trim()) errors.summary = 'Enter a public summary.'
  if (!draft.affectedArea.trim()) errors.affectedArea = 'Enter the affected area.'
  if (!draft.category) errors.category = 'Choose a category.'
  if (!draft.guidance.trim()) errors.guidance = 'Enter public guidance.'
  const expiry = new Date(draft.expiresAt)
  if (!draft.expiresAt || Number.isNaN(expiry.getTime()) || expiry <= new Date()) errors.expiresAt = 'Choose a future expiry time.'
  const dangerValues = [draft.dangerLatitude.trim(), draft.dangerLongitude.trim(), draft.dangerRadiusKm.trim()]
  if (dangerValues.some(Boolean) && !dangerValues.every(Boolean)) errors.dangerZone = 'Enter latitude, longitude and radius together, or leave all three blank.'
  if (dangerValues.every(Boolean)) {
    const latitude = Number(dangerValues[0]); const longitude = Number(dangerValues[1]); const radius = Number(dangerValues[2])
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.dangerLatitude = 'Latitude must be between −90 and 90.'
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.dangerLongitude = 'Longitude must be between −180 and 180.'
    if (!Number.isFinite(radius) || radius <= 0 || radius > 500) errors.dangerRadiusKm = 'Radius must be greater than 0 and no more than 500 km.'
  }
  return errors
}
