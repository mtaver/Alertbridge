import type { Category, Draft, Mode, Report, Status, StatusEvent } from './types'

const categories: Category[] = ['Security threat', 'Flood', 'Landslide', 'Fire', 'Other']
const modes: Mode[] = ['guided', 'written']
const statuses: Status[] = ['Unverified', 'Under review', 'Verified', 'Rejected', 'Resolved']
const answers = ['Yes', 'No', 'Not sure'] as const

export function validateDraft(draft: Draft): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!draft.mode) errors.mode = 'Choose how you want to report.'
  if (!draft.category) errors.category = 'Choose an incident category.'
  if (!draft.description.trim()) errors.description = draft.mode === 'guided' ? 'Tell us what is happening.' : 'Enter a description.'
  if (draft.mode === 'guided' && !draft.happeningNow) errors.happeningNow = 'Choose an answer.'
  if (draft.mode === 'guided' && !draft.anyoneInjured) errors.anyoneInjured = 'Choose an answer.'
  if (draft.reportingChannel === 'community' || draft.reportingChannel === 'both') {
    if (!draft.publicArea.trim()) errors.publicArea = 'Enter the public affected area.'
    if (!draft.publicSummary.trim()) errors.publicSummary = 'Enter a public summary.'
    const expiry = new Date(draft.publicExpiry)
    if (!draft.publicExpiry || Number.isNaN(expiry.getTime()) || expiry <= new Date()) errors.publicExpiry = 'Choose a future expiry time.'
    const radius = Number(draft.publicRadiusKm)
    if (!draft.publicRadiusKm.trim() || !Number.isFinite(radius) || radius <= 0 || radius > 50) errors.publicRadiusKm = 'Enter a radius greater than 0 and no more than 50 km.'
  }

  if (draft.reportingChannel !== 'community') {
    const latitude = Number(draft.latitude); const longitude = Number(draft.longitude)
    if (draft.latitude.trim() === '' || Number.isNaN(latitude)) errors.latitude = 'Enter a valid latitude.'
    else if (latitude < -90 || latitude > 90) errors.latitude = 'Latitude must be between −90 and 90.'
    if (draft.longitude.trim() === '' || Number.isNaN(longitude)) errors.longitude = 'Enter a valid longitude.'
    else if (longitude < -180 || longitude > 180) errors.longitude = 'Longitude must be between −180 and 180.'
  }
  if (draft.reportingChannel !== 'assistance') {
    const publicLatitude = Number(draft.publicLatitude); const publicLongitude = Number(draft.publicLongitude)
    if (draft.publicLatitude.trim() === '' || Number.isNaN(publicLatitude)) errors.publicLatitude = 'Enter a valid public danger-zone latitude.'
    else if (publicLatitude < -90 || publicLatitude > 90) errors.publicLatitude = 'Public latitude must be between −90 and 90.'
    if (draft.publicLongitude.trim() === '' || Number.isNaN(publicLongitude)) errors.publicLongitude = 'Enter a valid public danger-zone longitude.'
    else if (publicLongitude < -180 || publicLongitude > 180) errors.publicLongitude = 'Public longitude must be between −180 and 180.'
  }
  return errors
}

export function requiresStatusReason(status: Status, reason: string): boolean {
  return (status === 'Verified' || status === 'Rejected') && !reason.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function parseHistory(value: unknown): StatusEvent[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const events: StatusEvent[] = []
  for (const item of value) {
    if (!isRecord(item) || !statuses.includes(item.status as Status) || !isIsoDate(item.at)) return null
    if (item.reason !== undefined && typeof item.reason !== 'string') return null
    events.push({ status: item.status as Status, at: item.at, ...(typeof item.reason === 'string' && item.reason.trim() ? { reason: item.reason.trim() } : {}) })
  }
  return events
}

function parseReport(value: unknown): Report | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim() || !isIsoDate(value.createdAt)) return null
  if (!modes.includes(value.mode as Mode) || !categories.includes(value.category as Category)) return null
  if (typeof value.description !== 'string' || !value.description.trim() || !statuses.includes(value.status as Status)) return null
  if (!isRecord(value.location) || typeof value.location.latitude !== 'number' || typeof value.location.longitude !== 'number') return null
  if (!Number.isFinite(value.location.latitude) || value.location.latitude < -90 || value.location.latitude > 90) return null
  if (!Number.isFinite(value.location.longitude) || value.location.longitude < -180 || value.location.longitude > 180) return null
  const history = parseHistory(value.history)
  if (!history) return null
  if (value.happeningNow !== undefined && !answers.includes(value.happeningNow as typeof answers[number])) return null
  if (value.anyoneInjured !== undefined && !answers.includes(value.anyoneInjured as typeof answers[number])) return null
  if (value.additionalDetails !== undefined && typeof value.additionalDetails !== 'string') return null

  return {
    id: value.id.trim(), createdAt: value.createdAt, mode: value.mode as Mode,
    category: value.category as Category, description: value.description.trim(),
    ...(value.happeningNow ? { happeningNow: value.happeningNow as Report['happeningNow'] } : {}),
    ...(value.anyoneInjured ? { anyoneInjured: value.anyoneInjured as Report['anyoneInjured'] } : {}),
    ...(typeof value.additionalDetails === 'string' && value.additionalDetails.trim() ? { additionalDetails: value.additionalDetails.trim() } : {}),
    location: { latitude: value.location.latitude, longitude: value.location.longitude },
    status: value.status as Status, history,
  }
}

export function parseStoredReports(raw: string | null): Report[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.map(parseReport).filter((report): report is Report => report !== null)
  } catch {
    return []
  }
}
