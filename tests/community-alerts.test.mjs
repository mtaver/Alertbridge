import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261008000200_community_alerts.sql', import.meta.url), 'utf8')
const ui = readFileSync(new URL('../src/CommunityAlerts.tsx', import.meta.url), 'utf8')
const presentation = readFileSync(new URL('../src/alertPresentation.ts', import.meta.url), 'utf8')
const realtimeSql = readFileSync(new URL('../supabase/migrations/20261008000300_community_alert_realtime.sql', import.meta.url), 'utf8')
const realtimeClient = readFileSync(new URL('../src/alertRealtime.ts', import.meta.url), 'utf8')

test('public alerts and audit history are separate tables from private reports', () => {
  assert.match(sql, /create table public\.community_alerts/i)
  assert.match(sql, /source_report_id uuid not null unique references public\.incident_reports/i)
  assert.match(sql, /create table public\.community_alert_history/i)
})

test('public feed exposes an explicit safe field list without private relationship data', () => {
  const view = sql.match(/create view public\.community_alert_feed[\s\S]*?where status <> 'Withdrawn';/i)?.[0] ?? ''
  assert.ok(view)
  assert.doesNotMatch(view, /source_report_id|published_by|updated_by|reporter_id|description|happening_now|anyone_injured/i)
  assert.match(view, /title, summary, affected_area, category, guidance, expires_at/i)
  assert.match(sql, /grant select on public\.community_alert_feed to anon, authenticated/i)
})

test('public roles cannot write alerts or read alert base tables', () => {
  assert.match(sql, /revoke all on public\.community_alerts, public\.community_alert_history from anon, authenticated/i)
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*community_alerts[^;]*(anon|authenticated)/i)
  assert.doesNotMatch(sql, /grant select on public\.community_alerts[^;]*anon/i)
})

test('publishing is responder-only, transactional and limited to Verified reports', () => {
  assert.match(sql, /create function public\.publish_community_alert[\s\S]*security definer set search_path = ''/i)
  assert.match(sql, /not private\.is_responder\(\)/i)
  assert.match(sql, /report_status <> 'Verified'/i)
  assert.match(sql, /insert into public\.community_alerts[\s\S]*insert into public\.community_alert_history/i)
  assert.doesNotMatch(sql, /create trigger[^;]*incident_reports[^;]*(community|alert)/i)
})

test('responder update, resolve and withdraw operations append audit history', () => {
  assert.match(sql, /create function public\.update_community_alert/i)
  assert.match(sql, /create function public\.set_community_alert_status/i)
  assert.match(sql, /target_status not in \('Resolved', 'Withdrawn'\)/i)
  const historyWrites = sql.match(/insert into public\.community_alert_history/g) ?? []
  assert.equal(historyWrites.length, 3)
})

test('feed distinguishes expired, resolved and active published alerts', () => {
  assert.match(sql, /status = 'Published' and expires_at <= now\(\) then 'Expired'/i)
  assert.match(sql, /else status::text end as display_status/i)
  assert.match(ui, /alert\.displayStatus\.toLowerCase\(\)/)
})

test('near-me location remains component state and is requested only by the button action', () => {
  assert.match(ui, /const \[location, setLocation\] = useState/)
  assert.match(ui, /function useNearMe\(\)[\s\S]*navigator\.geolocation\.getCurrentPosition/)
  assert.doesNotMatch(ui, /localStorage.*location|sessionStorage.*location|supabase.*location/i)
})

test('realtime subscribes only to a public metadata signal and refetches the safe feed on reconnect', () => {
  assert.match(realtimeClient, /table: 'community_alert_events'/)
  assert.doesNotMatch(realtimeClient, /incident_reports|community_alerts'/)
  assert.match(realtimeClient, /status === 'SUBSCRIBED'[\s\S]*onChange\(\)/)
  assert.match(realtimeSql, /create table public\.community_alert_events/i)
  assert.match(realtimeSql, /grant select on public\.community_alert_events to anon, authenticated/i)
  assert.match(realtimeSql, /alter publication supabase_realtime add table public\.community_alert_events/i)
  const eventColumns = realtimeSql.match(/create table public\.community_alert_events \([\s\S]*?\);/i)?.[0] ?? ''
  assert.doesNotMatch(eventColumns, /reporter|published_by|updated_by|latitude|longitude|guidance|title|summary/i)
})

test('location watch is opt-in, stopped when disabled, and supports permission and accuracy failures', () => {
  assert.match(ui, /warningsEnabled[\s\S]*navigator\.geolocation\.watchPosition/)
  assert.match(ui, /clearWatch/)
  assert.match(ui, /PERMISSION_DENIED/)
  assert.match(ui, /coords\.accuracy > 1000/)
  assert.match(ui, /does not reliably warn you when the app is closed/)
})

test('responders must explicitly select and confirm a public danger zone', () => {
  assert.match(ui, /Select private incident location for review/)
  assert.match(ui, /dangerZoneConfirmed/)
  assert.match(ui, /appropriate to publish/)
})

test('public feed defaults to active alerts and separates activity from verification', () => {
  assert.match(ui, /showPastAlerts, setShowPastAlerts.*useState\(false\)/)
  assert.match(ui, /Show past alerts/)
  assert.match(ui, /const activity = .*'Active'.*'Resolved'.*'Expired'/)
  assert.match(ui, /Responder-verified/)
  assert.match(ui, /Community report — unverified/)
  assert.match(presentation, /Reported by a community member\. Not yet confirmed by a responder\./)
  assert.match(ui, /displayedAlertGuidance\(alert\)/)
  assert.ok(ui.indexOf('className="alerts-grid"') < ui.indexOf('className="warning-controls"'))
})

test('notification denial guidance is produced only by the opt-in action', () => {
  const pushUi = readFileSync(new URL('../src/PushNotificationSettings.tsx', import.meta.url), 'utf8')
  const pushClient = readFileSync(new URL('../src/pushNotifications.ts', import.meta.url), 'utf8')
  assert.match(pushUi, /onClick=\{\(\) => void run\('enable'\)\}/)
  assert.match(pushClient, /Notification\.requestPermission\(\)[\s\S]*permission was not granted/)
})
