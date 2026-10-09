import test from 'node:test'
import assert from 'node:assert/strict'
import { distanceKm, isActiveAlert, nearbyAlerts, newWarningMatches, validCoordinates } from '../src/proximity.ts'
import type { CommunityAlert } from '../src/types.ts'

const future = '2099-01-01T00:00:00.000Z'
const alert: CommunityAlert = {
  id: 'alert-1', title: 'Flood warning', summary: 'Water rising', affectedArea: 'Riverside', category: 'Flood',
  guidance: 'Avoid low areas.', expiresAt: future, dangerLatitude: 0, dangerLongitude: 0, dangerRadiusKm: 1,
  displayStatus: 'Published', publishedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T01:00:00.000Z',
  sourceKind: 'responder_alert', verified: true,
}

test('proximity includes points inside and exactly on the configurable approach boundary', () => {
  const pointTwoKmNorth = { latitude: 2 / 111.195, longitude: 0 }
  assert.equal(nearbyAlerts([alert], { latitude: 0, longitude: 0 }, 0).length, 1)
  assert.ok(distanceKm({ latitude: 0, longitude: 0 }, pointTwoKmNorth) > 1.99)
  assert.equal(nearbyAlerts([alert], pointTwoKmNorth, 1.001).length, 1)
  assert.equal(nearbyAlerts([alert], pointTwoKmNorth, 0.9).length, 0)
})

test('expired, resolved and withdrawn alerts never produce nearby warnings', () => {
  const location = { latitude: 0, longitude: 0 }
  assert.equal(nearbyAlerts([{ ...alert, expiresAt: '2020-01-01T00:00:00.000Z' }], location, 5).length, 0)
  assert.equal(nearbyAlerts([{ ...alert, displayStatus: 'Resolved' }], location, 5).length, 0)
  assert.equal(nearbyAlerts([{ ...alert, displayStatus: 'Withdrawn' }], location, 5).length, 0)
  assert.equal(isActiveAlert(alert, new Date(future).getTime()), false)
})

test('warning versions suppress duplicates and allow material updates', () => {
  const matches = nearbyAlerts([alert], { latitude: 0, longitude: 0 }, 0)
  assert.equal(newWarningMatches(matches, new Map()).length, 1)
  assert.equal(newWarningMatches(matches, new Map([[alert.id, alert.updatedAt]])).length, 0)
  assert.equal(newWarningMatches([{ ...matches[0], alert: { ...alert, updatedAt: '2026-01-01T02:00:00.000Z' } }], new Map([[alert.id, alert.updatedAt]])).length, 1)
})

test('coordinate validation accepts zero and rejects invalid destination values', () => {
  assert.equal(validCoordinates(0, 0), true)
  assert.equal(validCoordinates(91, 0), false)
  assert.equal(validCoordinates(0, -181), false)
  assert.equal(validCoordinates(Number.NaN, 0), false)
})
