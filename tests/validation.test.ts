import test from 'node:test'
import assert from 'node:assert/strict'
import { requiresStatusReason, validateDraft } from '../src/validation.ts'
import type { Draft } from '../src/types.ts'

const validDraft: Draft = {
  reportingChannel: 'assistance', publicArea: '', publicSummary: '', publicExpiry: '', publicLatitude: '', publicLongitude: '', publicRadiusKm: '1',
  mode: 'guided', category: 'Flood', description: 'Water is covering the road',
  happeningNow: 'Yes', anyoneInjured: 'Not sure', additionalDetails: '',
  latitude: '0', longitude: '0',
}

test('community and both channels require explicit public fields', () => {
  const errors = validateDraft({ ...validDraft, reportingChannel: 'community' })
  assert.ok(errors.publicArea)
  assert.ok(errors.publicSummary)
  assert.ok(errors.publicExpiry)
  assert.deepEqual(validateDraft({ ...validDraft, reportingChannel: 'both', publicArea: 'Riverside', publicSummary: 'River is above the bank', publicExpiry: '2099-01-01T00:00:00.000Z', publicLatitude: '0', publicLongitude: '0', publicRadiusKm: '1' }), {})
})

test('public danger-zone coordinates are validated separately from private assistance coordinates', () => {
  const community = { ...validDraft, reportingChannel: 'community' as const, latitude: '', longitude: '', publicArea: 'Market', publicSummary: 'Smoke reported', publicExpiry: '2099-01-01T00:00:00.000Z', publicLatitude: '91', publicLongitude: '-181' }
  const errors = validateDraft(community)
  assert.equal(errors.latitude, undefined)
  assert.equal(errors.longitude, undefined)
  assert.ok(errors.publicLatitude)
  assert.ok(errors.publicLongitude)
  assert.deepEqual(validateDraft({ ...community, publicLatitude: '0', publicLongitude: '0' }), {})
})

test('accepts zero latitude and longitude', () => {
  assert.deepEqual(validateDraft(validDraft), {})
})

test('rejects missing fields, whitespace descriptions, and coordinate ranges', () => {
  const errors = validateDraft({ ...validDraft, category: '', description: '   ', happeningNow: '', latitude: '91', longitude: '-181' })
  assert.ok(errors.category)
  assert.ok(errors.description)
  assert.ok(errors.happeningNow)
  assert.ok(errors.latitude)
  assert.ok(errors.longitude)
})

test('written reports do not require guided answers', () => {
  assert.deepEqual(validateDraft({ ...validDraft, mode: 'written', happeningNow: '', anyoneInjured: '' }), {})
})

test('verification and rejection require a non-whitespace reason', () => {
  assert.equal(requiresStatusReason('Verified', '   '), true)
  assert.equal(requiresStatusReason('Rejected', ''), true)
  assert.equal(requiresStatusReason('Verified', 'Confirmed'), false)
  assert.equal(requiresStatusReason('Under review', ''), false)
})
