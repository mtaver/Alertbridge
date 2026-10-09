import test from 'node:test'
import assert from 'node:assert/strict'
import { displayedAlertGuidance } from '../src/alertPresentation.ts'
import type { CommunityAlert } from '../src/types.ts'

const communityPost: CommunityAlert = {
  id: 'post-1', title: 'Community warning', summary: 'Test report', affectedArea: 'Test area', category: 'Other',
  guidance: 'Community report — unverified. Review official guidance and use caution.',
  expiresAt: '2099-01-01T00:00:00.000Z', displayStatus: 'Published',
  publishedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  sourceKind: 'community_post', verified: false,
}

test('community-post guidance stays consistent when verification changes', () => {
  assert.equal(displayedAlertGuidance(communityPost), 'Reported by a community member. Not yet confirmed by a responder.')
  assert.equal(displayedAlertGuidance({ ...communityPost, verified: true }), 'Verified by an authorised responder.')
})

test('genuine responder-written guidance is preserved', () => {
  const responderAlert: CommunityAlert = { ...communityPost, sourceKind: 'responder_alert', verified: true, guidance: 'Use the northern entrance.' }
  assert.equal(displayedAlertGuidance(responderAlert), 'Use the northern entrance.')
})
