import type { CommunityAlert } from './types'

export function displayedAlertGuidance(alert: CommunityAlert): string {
  if (alert.sourceKind === 'responder_alert') return alert.guidance
  return alert.verified
    ? 'Verified by an authorised responder.'
    : 'Reported by a community member. Not yet confirmed by a responder.'
}
