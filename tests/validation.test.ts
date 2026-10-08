import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStoredReports, requiresStatusReason, validateDraft } from '../src/validation.ts'
import type { Draft, Report } from '../src/types.ts'

const validDraft: Draft = {
  mode: 'guided', category: 'Flood', description: 'Water is covering the road',
  happeningNow: 'Yes', anyoneInjured: 'Not sure', additionalDetails: '',
  latitude: '0', longitude: '0',
}

const validReport: Report = {
  id: 'AB-TEST', createdAt: '2026-10-08T12:00:00.000Z', mode: 'written',
  category: 'Fire', description: '<img src=x onerror=alert(1)>',
  location: { latitude: 0, longitude: 0 }, status: 'Verified',
  history: [
    { status: 'Unverified', at: '2026-10-08T12:00:00.000Z' },
    { status: 'Verified', at: '2026-10-08T12:05:00.000Z', reason: 'Confirmed locally' },
  ],
}

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

test('stored reports preserve valid data and history', () => {
  assert.deepEqual(parseStoredReports(JSON.stringify([validReport])), [validReport])
})

test('malformed storage returns an empty list and invalid entries are skipped', () => {
  assert.deepEqual(parseStoredReports('{bad json'), [])
  assert.deepEqual(parseStoredReports(JSON.stringify({ reports: [] })), [])
  assert.deepEqual(parseStoredReports(JSON.stringify([null, { id: 'broken' }, validReport])), [validReport])
})
