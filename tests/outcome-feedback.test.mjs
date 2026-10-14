import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261009000600_reporter_outcome_feedback.sql', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/OutcomeFeedbackPanel.tsx', import.meta.url), 'utf8')
const connected = readFileSync(new URL('../src/connected.ts', import.meta.url), 'utf8')
const realtime = readFileSync(new URL('../src/alertRealtime.ts', import.meta.url), 'utf8')
const reporting = readFileSync(new URL('../src/reportingChannels.ts', import.meta.url), 'utf8')

test('frontend RPC payload names match the applied database signatures', () => {
  assert.match(reporting, /rpc\('submit_reporting_channels',[\s\S]*client_request_id: requestId/)
  assert.match(reporting, /rpc\('submit_reporter_outcome_feedback',[\s\S]*feedback_request_id: requestId/)
  assert.doesNotMatch(reporting, /rpc\('submit_reporting_channels',[\s\S]{0,100}feedback_request_id/)
})

test('only the report owner can submit feedback and responders cannot answer for another reporter', () => {
  assert.match(sql, /select reporter_id into report_owner from public\.incident_reports where id = target_report_id/i)
  assert.match(sql, /if report_owner <> auth\.uid\(\) then raise exception 'Only the report owner can submit outcome feedback'/i)
  assert.doesNotMatch(sql, /private\.is_responder\(\)[\s\S]{0,100}submit_reporter_outcome_feedback/i)
})

test('reporter feedback requires a recorded assistance outcome and is retry-safe', () => {
  assert.match(sql, /action_type in \('Assistance provided', 'Issue attended to'\)/i)
  assert.match(sql, /unique \(reporter_id, client_request_id\)/i)
  assert.match(sql, /where feedback\.reporter_id = auth\.uid\(\)[\s\S]*feedback\.client_request_id = feedback_request_id[\s\S]*if found then return next/i)
  assert.match(sql, /pg_advisory_xact_lock/i)
  assert.match(sql, /coalesce\(max\(feedback\.revision\), 0\) \+ 1/i)
})

test('outcome and feedback histories are private, immutable and suspension-protected', () => {
  assert.match(sql, /alter table public\.report_assistance_outcomes enable row level security/i)
  assert.match(sql, /alter table public\.report_outcome_feedback enable row level security/i)
  assert.match(sql, /report\.reporter_id = \(select auth\.uid\(\)\) or \(select private\.is_responder\(\)\)/i)
  assert.match(sql, /revoke all on public\.report_assistance_outcomes, public\.report_outcome_feedback,[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /assistance_outcomes_immutable before update or delete/i)
  assert.match(sql, /outcome_feedback_immutable before update or delete/i)
  assert.match(sql, /private\.is_account_suspended\(auth\.uid\(\)\)/i)
})

test('partial and negative feedback create a follow-up signal without removing responder history', () => {
  assert.match(connected, /latestFeedback\?\.confirmation === 'Partly addressed'/)
  assert.match(connected, /latestFeedback\?\.confirmation === 'Assistance not received'/)
  assert.match(connected, /item\.actionType === 'Follow-up action'/)
  assert.match(panel, /Follow-up required/)
  assert.match(panel, /Submit another confirmation/)
  assert.match(panel, /creates a new revision and does not erase earlier feedback/)
  assert.doesNotMatch(sql, /delete from public\.(report_assistance_outcomes|report_outcome_feedback)/i)
})

test('interface separates responder outcome from reporter confirmation and does not equate handoff with receipt', () => {
  assert.match(panel, /Responder-reported outcome/)
  assert.match(panel, /Reporter confirmation/)
  assert.match(panel, /Awaiting reporter confirmation/)
  assert.match(panel, /agency handoff, messages and report status do not prove that assistance was received/i)
  for (const option of ['Assistance received', 'Partly addressed', 'Assistance not received', 'Cannot confirm']) assert.match(panel, new RegExp(option))
})

test('outcome live updates expose report IDs only and never enter the public feed', () => {
  assert.match(sql, /create table public\.report_outcome_events[\s\S]*report_id uuid not null[\s\S]*changed_at timestamptz/i)
  assert.match(sql, /alter publication supabase_realtime add table public\.report_outcome_events/i)
  assert.match(realtime, /table: 'report_outcome_events'/)
  assert.doesNotMatch(sql, /community_alert_feed[\s\S]*(report_outcome_feedback|report_assistance_outcomes)/i)
})
