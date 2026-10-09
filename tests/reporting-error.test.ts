import test from 'node:test'
import assert from 'node:assert/strict'
import { messageErrorText, reportingErrorMessage } from '../src/reportingErrors.ts'

test('submission-limit errors include the database-provided retry time', () => {
  const message = reportingErrorMessage({
    code: 'P0001',
    message: 'Submission limit reached. Try again after 2026-10-09T12:00:00Z.',
    details: '{"retry_after":"2026-10-09T12:00:00Z"}',
  })
  assert.match(message, /^Submission limit reached\. Try again after .+\.$/)
  assert.doesNotMatch(message, /undefined|Invalid Date/)
})

test('other database messages remain visible to the user', () => {
  assert.equal(
    reportingErrorMessage({ code: '42501', message: 'Account suspended. New submissions and account write actions are disabled.' }),
    'Account suspended. New submissions and account write actions are disabled.',
  )
})

test('message-limit errors include the database-provided retry time', () => {
  const message = messageErrorText({ code: 'P0001', message: 'Message limit reached.', details: '{"retry_after":"2026-10-09T12:00:00Z"}' })
  assert.match(message, /^Message limit reached\. Try again after .+\.$/)
})
