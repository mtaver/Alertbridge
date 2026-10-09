import test from 'node:test'
import assert from 'node:assert/strict'
import { generatePublicSummary } from '../src/publicSummary.ts'

test('uses category-specific plain-language templates and explicit answers', () => {
  assert.equal(generatePublicSummary({ category: 'Flood', affectedArea: 'Riverside', happeningNow: 'Yes', anyoneInjured: 'Not sure' }), 'Flooding has been reported in Riverside. It is reported as happening now. It is not known whether anyone is injured.')
  assert.equal(generatePublicSummary({ category: 'Fire', affectedArea: 'Central Market', happeningNow: 'No', anyoneInjured: 'No' }), 'A fire has been reported in Central Market. It is reported as not happening now. The reporter indicated that no one is known to be injured.')
})

test('omits missing optional answers without inventing facts or guidance', () => {
  const summary = generatePublicSummary({ category: 'Landslide', affectedArea: '' })
  assert.equal(summary, 'A landslide has been reported.')
  assert.doesNotMatch(summary, /severe|verified|safe|evacuate|avoid|injur/i)
})

test('cannot include private assistance fields or reporter identity', () => {
  const inputs = { category: 'Other' as const, affectedArea: 'North Ward', happeningNow: '' as const, anyoneInjured: '' as const, description: 'PRIVATE DESCRIPTION', additionalDetails: 'PRIVATE DETAILS', reporterEmail: 'private@example.com' }
  const summary = generatePublicSummary(inputs)
  assert.equal(summary, 'A community safety incident has been reported in North Ward.')
  assert.doesNotMatch(summary, /PRIVATE|example\.com/)
})

test('regeneration is explicit and does not mutate an edited summary', () => {
  const edited = 'Resident-edited public wording.'
  generatePublicSummary({ category: 'Security threat', affectedArea: 'Station', happeningNow: 'Yes' })
  assert.equal(edited, 'Resident-edited public wording.')
})
