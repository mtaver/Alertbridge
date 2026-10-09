import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261008000400_reporting_channels.sql', import.meta.url), 'utf8')
const gpsSql = readFileSync(new URL('../supabase/migrations/20261009000100_separate_public_danger_zone.sql', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const feed = readFileSync(new URL('../src/CommunityAlerts.tsx', import.meta.url), 'utf8')
const realtime = readFileSync(new URL('../src/alertRealtime.ts', import.meta.url), 'utf8')

test('public community posts are separate from private reports and the safe view omits the internal link and author', () => {
  assert.match(sql, /create table public\.community_posts/i)
  assert.match(sql, /linked_report_id uuid references public\.incident_reports/i)
  const view = sql.match(/create view public\.community_alert_feed[\s\S]*?grant select on public\.community_alert_feed to anon, authenticated;/i)?.[0] ?? ''
  assert.ok(view)
  assert.doesNotMatch(view, /linked_report_id|author_id|reporter_id|private_description|questionnaire|email/i)
  assert.match(view, /'community_post'::text as source_kind/i)
})

test('authenticated submission is transactional and retry-safe for assistance, community, or both', () => {
  assert.match(sql, /create table public\.reporting_submission_receipts/i)
  assert.match(sql, /primary key \(user_id, request_id\)/i)
  assert.match(sql, /reporting_channel not in \('assistance', 'community', 'both'\)/i)
  assert.match(sql, /if existing_result is not null then return existing_result/i)
  assert.match(sql, /insert into public\.incident_reports[\s\S]*insert into public\.community_posts[\s\S]*update public\.reporting_submission_receipts set result/i)
  assert.match(sql, /if auth\.uid\(\) is null then raise exception 'Authentication required'/i)
})

test('ordinary users cannot directly write base tables or moderate posts', () => {
  assert.match(sql, /revoke all on public\.community_posts,[\s\S]*from anon, authenticated/i)
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*(community_posts|incident_reports|report_assistance_actions)[^;]*(anon|authenticated)/i)
  assert.match(sql, /moderate_community_post[\s\S]*not private\.is_responder\(\)/i)
  assert.match(sql, /private_report_events_responder_read[\s\S]*private\.is_responder\(\)/i)
})

test('moderation, verification and withdrawal append immutable audit history with required reasons', () => {
  assert.match(sql, /create table public\.community_post_history/i)
  assert.match(sql, /moderation_action not in \('Verified', 'Removed'\)/i)
  assert.match(sql, /A moderation reason is required/i)
  assert.match(sql, /insert into public\.community_post_history/g)
  assert.match(sql, /status not in \('Withdrawn', 'Removed'\)/i)
})

test('agency handoff is recorded only with actual handoff details and does not imply transmission', () => {
  assert.match(sql, /Forwarded to agency[\s\S]*agency[\s\S]*handed_off_at/i)
  assert.match(sql, /Agency, past or current handoff time, and reference or note are required/i)
  assert.match(sql, /handed_off_at <= recorded_at/i)
  assert.match(sql, /inserting it does not contact an agency/i)
  assert.match(app, /Emergency services are not automatically contacted/)
})

test('public and private live signals remain separated', () => {
  assert.match(sql, /signal_public_community_post_change[\s\S]*insert into public\.community_alert_events/i)
  assert.match(sql, /signal_private_report_change[\s\S]*insert into public\.private_report_events/i)
  assert.match(realtime, /table: 'private_report_events'/)
  const privateSubscription = realtime.match(/subscribeToPrivateReportChanges[\s\S]*?\n}/)?.[0] ?? ''
  assert.doesNotMatch(privateSubscription, /incident_reports|community_alert_events/)
})

test('UI labels community posts and defaults nearby warnings to verified sources only', () => {
  assert.match(feed, /Community report — unverified/)
  assert.match(feed, /useState\(false\).*includeCommunityWarnings|includeCommunityWarnings.*useState\(false\)/s)
  assert.match(feed, /alert\.verified \|\| includeCommunityWarnings/)
  assert.doesNotMatch(feed, /dangerouslySetInnerHTML/)
})

test('dashboard keeps demo and connected report data sources separate', () => {
  assert.match(app, /const activeReports = appMode === 'demo' \? reports : connectedReports/)
  assert.match(app, /reports=\{activeReports\}/)
  assert.match(app, /appMode !== 'connected' \|\| !session[\s\S]*setConnectedReports\(\[\]\)/)
  assert.match(app, /fetchConnectedReports\(\)/)
  assert.match(app, /Authorised reports loaded from AlertBridge storage for responder review/)
  assert.match(app, /Precise incident locations are restricted to authorised responder tools/)
})

test('authorised responder dashboard links to public community-post moderation', () => {
  assert.match(app, /Public community-post moderation/)
  assert.match(app, /Review public posts/)
  assert.match(feed, /isResponder[\s\S]*CommunityPostActions/)
  assert.match(feed, /moderateCommunityPost\(alert\.id, action, reason\)/)
  assert.match(feed, /onClick=\{\(\) => void act\('Verified'\)\}[\s\S]*?Verify<\/button>/)
})

test('reporting form explains the public fields and offers all three channels', () => {
  assert.match(app, /Warn the community/)
  assert.match(app, /Request emergency assistance/)
  assert.match(app, /title="Both"/)
  assert.match(app, /Your email, private description, questionnaire answers and additional details will not be published automatically/)
  assert.match(app, /Use my current location/)
  assert.match(app, /Incident is somewhere else/)
  assert.match(app, /Advanced: enter public coordinates manually/)
  assert.match(app, /never copies the private assistance location automatically/)
})

test('database submission keeps public danger-zone coordinates separate from private assistance coordinates', () => {
  assert.doesNotMatch(sql, /public_latitude double precision default null/)
  assert.match(gpsSql, /public_latitude double precision default null/)
  assert.match(gpsSql, /public_longitude double precision default null/)
  assert.match(gpsSql, /public_latitude, public_longitude, public_radius_km, public_expiry/)
  assert.match(gpsSql, /Valid public danger-zone coordinates are required/)
  assert.match(gpsSql, /drop function public\.submit_reporting_channels/)
})
