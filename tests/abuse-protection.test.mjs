import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261009000200_abuse_protection.sql', import.meta.url), 'utf8')

test('submission limits count completed receipts across channels and Both only once', () => {
  assert.match(sql, /reporting_submission_receipts[\s\S]*result is not null[\s\S]*interval '10 minutes'/i)
  assert.match(sql, /recent_count >= 3/i)
  assert.match(sql, /daily_count >= 10/i)
  assert.match(sql, /interval '24 hours'/i)
  assert.match(sql, /jsonb_build_object\('report_id',[\s\S]*'channel', reporting_channel\)/i)
  assert.doesNotMatch(sql, /case when reporting_channel = 'both' then 2/i)
})

test('retry receipts return before rate counting and expose an exact retry time', () => {
  const receiptReturn = sql.indexOf('if existing_result is not null then return existing_result')
  const limitCount = sql.indexOf("perform pg_advisory_xact_lock(hashtextextended('alertbridge-submit:")
  assert.ok(receiptReturn > -1 && limitCount > receiptReturn)
  assert.match(sql, /detail = jsonb_build_object\('retry_after', retry_at\)::text/i)
  assert.match(sql, /These limits reduce repeated submissions but do not prevent all spam/i)
})

test('per-account transaction lock serializes simultaneous distinct requests', () => {
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('alertbridge-submit:' \|\| auth\.uid\(\)::text, 0\)\)/i)
  assert.match(sql, /order by created_at desc offset 2 limit 1/i)
  assert.match(sql, /order by created_at desc offset 9 limit 1/i)
})

test('direct private-report insertion is revoked so the shared counter cannot be bypassed', () => {
  assert.match(sql, /revoke insert on public\.incident_reports from authenticated/i)
  assert.match(sql, /grant execute on function public\.submit_reporting_channels[\s\S]*to authenticated/i)
})

test('suspension is separate from responder membership and only trusted database access can change it', () => {
  assert.match(sql, /create table public\.account_suspensions/i)
  assert.match(sql, /create table public\.account_suspension_history/i)
  assert.doesNotMatch(sql, /account_suspensions[\s\S]{0,250}authorized_responders/i)
  assert.match(sql, /revoke all on function public\.admin_set_account_suspension[\s\S]*from public, anon, authenticated/i)
  assert.doesNotMatch(sql, /grant execute on function public\.admin_set_account_suspension/i)
})

test('suspension and restoration require reasons and append immutable history', () => {
  assert.match(sql, /A non-empty suspension reason is required/i)
  assert.match(sql, /case when should_suspend then 'Suspended' else 'Restored' end/i)
  assert.match(sql, /insert into public\.account_suspension_history/i)
  assert.match(sql, /account_suspension_history_immutable[\s\S]*before update or delete/i)
  assert.match(sql, /revoke all on public\.account_suspensions, public\.account_suspension_history from public, anon, authenticated/i)
})

test('suspended callers are rejected across user and responder write surfaces', () => {
  for (const table of [
    'profiles', 'incident_reports', 'report_status_history', 'community_alerts',
    'community_alert_history', 'community_posts', 'community_post_history',
    'community_post_flags', 'report_assistance_actions',
  ]) {
    assert.match(sql, new RegExp(`before [^;]+ on public\\.${table}[\\s\\S]*?execute function private\\.reject_suspended_writer`, 'i'))
  }
  assert.match(sql, /private\.is_account_suspended\(auth\.uid\(\)\)[\s\S]*Account suspended/i)
})

test('suspension tables have RLS and no policies that expose them to ordinary users', () => {
  assert.match(sql, /alter table public\.account_suspensions enable row level security/i)
  assert.match(sql, /alter table public\.account_suspension_history enable row level security/i)
  assert.doesNotMatch(sql, /create policy[^;]+account_suspension/i)
})
