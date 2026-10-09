import type { Draft, Status } from './types'

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
