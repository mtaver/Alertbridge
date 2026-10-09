import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261009000300_private_report_messaging.sql', import.meta.url), 'utf8')
const conversation = readFileSync(new URL('../src/ReportConversation.tsx', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/reportMessages.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const publicMigrations = [
  '../supabase/migrations/20261008000200_community_alerts.sql',
  '../supabase/migrations/20261008000400_reporting_channels.sql',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')

test('messages are private, immutable, and absent from public feeds', () => {
  assert.match(sql, /create table public\.report_messages/i)
  assert.match(sql, /report_messages_immutable[\s\S]*before update or delete/i)
  assert.match(sql, /revoke all on public\.report_messages[\s\S]*from public, anon, authenticated/i)
  assert.doesNotMatch(publicMigrations, /report_messages|message_body|private_message_events/i)
})

test('only the report owner or authorised responders can read and send', () => {
  assert.match(sql, /report\.reporter_id = auth\.uid\(\) or private\.is_responder\(\)/i)
  assert.match(sql, /report_messages_accessible_read[\s\S]*private\.can_access_report/i)
  assert.match(sql, /if not private\.can_access_report\(target_report_id\)[\s\S]*access denied/i)
  assert.doesNotMatch(sql, /can_access_report\(target_report_id uuid, target_user_id/i)
  assert.doesNotMatch(sql, /grant (insert|update|delete) on public\.report_messages/i)
})

test('community-only posts cannot acquire a private conversation', () => {
  assert.match(sql, /report_id uuid not null references public\.incident_reports/i)
  assert.match(app, /<ReportConversation reportId=\{report\.id\}/)
  assert.doesNotMatch(app, /CommunityAlertsFeed[\s\S]{0,200}ReportConversation/)
})

test('message validation and suspension are enforced inside the send RPC', () => {
  assert.match(sql, /private\.is_account_suspended\(auth\.uid\(\)\)[\s\S]*Sending messages is disabled/i)
  assert.match(sql, /char_length\(btrim\(coalesce\(message_body, ''\)\)\) = 0/i)
  assert.match(sql, /char_length\(message_body\) > 2000/i)
  assert.match(sql, /check \(char_length\(btrim\(body\)\) between 1 and 2000\)/i)
})

test('message retry is idempotent and checked before rate counting', () => {
  assert.match(sql, /unique \(sender_id, client_message_id\)/i)
  const firstReturn = sql.indexOf('if existing_message_id is not null then return existing_message_id')
  const rateLock = sql.indexOf("pg_advisory_xact_lock(hashtextextended('alertbridge-message:")
  assert.ok(firstReturn > -1 && rateLock > firstReturn)
  assert.match(conversation, /setRequestId\(crypto\.randomUUID\(\)\)/)
  assert.match(conversation, /catch \(caught\)[\s\S]*setNotice\(messageErrorText\(caught\)\)/)
})

test('separate message limits are concurrency-safe and return retry time', () => {
  assert.match(sql, /recent_count >= 10/i)
  assert.match(sql, /daily_count >= 100/i)
  assert.match(sql, /interval '1 minute'/i)
  assert.match(sql, /interval '24 hours'/i)
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\('alertbridge-message:' \|\| auth\.uid\(\)::text, 0\)\)/i)
  assert.match(sql, /detail = jsonb_build_object\('retry_after', retry_at\)::text/i)
})

test('Realtime carries metadata only and is scoped to the open report', () => {
  assert.match(sql, /create table public\.private_message_events[\s\S]*report_id[\s\S]*message_id[\s\S]*changed_at/i)
  const eventsTable = sql.match(/create table public\.private_message_events[\s\S]*?\);/i)?.[0] ?? ''
  assert.doesNotMatch(eventsTable, /body|sender_id|sender_role/i)
  assert.match(sql, /private_message_events_accessible_read[\s\S]*private\.can_access_report/i)
  assert.match(client, /table: 'private_message_events'.*filter: `report_id=eq\.\$\{reportId\}`/s)
  assert.match(conversation, /removeReportMessageSubscription\(channel\)/)
})

test('reconnect refetch, unread counts, and read markers are implemented', () => {
  assert.match(conversation, /window\.addEventListener\('online', recover\)/)
  assert.match(client, /get_report_unread_counts/)
  assert.match(client, /mark_report_conversation_read/)
  assert.match(app, /unreadCounts\[report\.id\][\s\S]*unread/)
})

test('messages are plain text and Sent appears only after database success', () => {
  assert.doesNotMatch(conversation, /dangerouslySetInnerHTML/)
  assert.match(conversation, /<p>\{message\.body\}<\/p>/)
  const sendFlow = conversation.match(/async function send\(\)[\s\S]*?finally \{ setSending\(false\) \}/)?.[0] ?? ''
  assert.match(sendFlow, /await sendReportMessage[\s\S]*setNotice\('Sent'\)/)
  assert.doesNotMatch(sendFlow.split('await sendReportMessage')[0], /setNotice\('Sent'\)/)
})

test('the interface preserves drafts on failure and makes no dispatch claim', () => {
  const sendFlow = conversation.match(/async function send\(\)[\s\S]*?finally \{ setSending\(false\) \}/)?.[0] ?? ''
  assert.doesNotMatch(sendFlow.match(/catch \(caught\)[\s\S]*/)?.[0] ?? '', /setDraft\(''\)/)
  assert.match(conversation, /does not mean officers or emergency services were dispatched/i)
  assert.match(conversation, /maxLength=\{2000\}/)
  assert.doesNotMatch(conversation, /attachment|SMS|email delivery/i)
})
