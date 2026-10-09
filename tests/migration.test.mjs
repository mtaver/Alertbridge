import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261008000100_alertbridge_core.sql', import.meta.url), 'utf8')

test('all client-facing tables enable row-level security', () => {
  for (const table of ['profiles', 'authorized_responders', 'incident_reports', 'report_status_history']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
})

test('report ownership and initial status are enforced by policy', () => {
  assert.match(sql, /reports_insert_own_unverified[\s\S]*auth\.uid\(\)[\s\S]*reporter_id[\s\S]*status = 'Unverified'/i)
  assert.match(sql, /reports_select_own_or_responder[\s\S]*auth\.uid\(\)[\s\S]*reporter_id[\s\S]*private\.is_responder\(\)/i)
})

test('clients cannot manage responder membership or mutate history', () => {
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete)[^;]*authorized_responders[^;]*authenticated/i)
  assert.doesNotMatch(sql, /grant\s+(insert|update|delete)[^;]*report_status_history[^;]*authenticated/i)
  assert.match(sql, /grant select on public\.authorized_responders to authenticated/i)
  assert.match(sql, /grant select on public\.report_status_history to authenticated/i)
})

test('direct report status updates are not granted to clients', () => {
  assert.doesNotMatch(sql, /grant\s+update[^;]*incident_reports[^;]*authenticated/i)
  assert.match(sql, /grant insert \(reporter_id, mode, category, description,[^;]+\) on public\.incident_reports to authenticated/i)
})

test('status RPC authorises responders, locks rows, validates transitions and writes history', () => {
  assert.match(sql, /create function public\.change_report_status/i)
  assert.match(sql, /not private\.is_responder\(\)/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /non-empty reason is required for verification or rejection/i)
  assert.match(sql, /insert into public\.report_status_history/i)
  assert.match(sql, /revoke all on function public\.change_report_status[^;]+from public, anon/i)
})

test('security-definer functions pin an empty search path', () => {
  const definerFunctions = sql.match(/create function[\s\S]*?\$\$;/gi) ?? []
  assert.ok(definerFunctions.length >= 4)
  for (const definition of definerFunctions) {
    if (/security definer/i.test(definition)) assert.match(definition, /set search_path = ''/i)
  }
})
