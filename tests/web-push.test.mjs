import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261009000400_web_push_notifications.sql', import.meta.url), 'utf8')
const scheduler = readFileSync(new URL('../supabase/migrations/20261009000500_supabase_push_scheduler.sql', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../api/process-push-queue.ts', import.meta.url), 'utf8')
const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

test('push subscription endpoints have no browser table grants and owner-scoped RPCs require auth', () => {
  assert.match(migration, /revoke all on public\.notification_areas, public\.push_subscriptions/)
  assert.match(migration, /if auth\.uid\(\) is null then raise exception 'Authentication required'/)
  assert.match(migration, /existing_owner <> auth\.uid\(\)/)
  assert.doesNotMatch(migration, /grant select on public\.push_subscriptions to authenticated/)
})

test('queue uses structured areas, suppresses duplicate versions and rechecks eligibility', () => {
  assert.match(migration, /primary key \(subscription_id, area_id\)/)
  assert.match(migration, /unique \(subscription_id, source_kind, alert_id, alert_version\)/)
  assert.match(migration, /status = 'Published' and expires_at > now\(\)/)
  assert.match(migration, /status = 'Verified' and expires_at > now\(\)/)
  assert.match(migration, /state = 'Cancelled'/)
})

test('delivery retries transient failures and invalidates gone subscriptions', () => {
  assert.match(worker, /statusCode === 404 \|\| statusCode === 410/)
  assert.match(migration, /state = case when attempts >= 8 then 'Failed' else 'Retry' end/)
  assert.match(migration, /power\(2, greatest\(attempts - 1, 0\)\)/)
  assert.match(migration, /enabled = false, invalidated_at = now\(\)/)
})

test('disable cancels queued work and service worker opens the alert feed', () => {
  assert.match(migration, /create function public\.disable_push_notifications\(subscription_endpoint text\)/)
  assert.match(migration, /state in \('Pending', 'Retry', 'Processing'\)/)
  assert.match(serviceWorker, /notificationclick/)
  assert.match(serviceWorker, /clients\.openWindow/)
})

test('server secrets remain non-VITE runtime variables', () => {
  assert.match(worker, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(worker, /VAPID_PRIVATE_KEY/)
  assert.doesNotMatch(worker, /VITE_SUPABASE_SERVICE_ROLE_KEY|VITE_VAPID_PRIVATE_KEY/)
})

test('Supabase performs immediate statement-level wake-up and one-minute recovery', () => {
  assert.match(scheduler, /referencing new table as new_push_deliveries[\s\S]*for each statement/)
  assert.match(scheduler, /'alertbridge-push-queue-recovery',[\s\S]*'\* \* \* \* \*'/)
  assert.match(scheduler, /vault\.decrypted_secrets[\s\S]*alertbridge_push_worker_url/)
  assert.match(scheduler, /vault\.decrypted_secrets[\s\S]*alertbridge_push_worker_secret/)
  assert.equal(vercel.crons, undefined)
})

test('wake-up failures cannot abort reporting and worker execution is bounded', () => {
  assert.match(scheduler, /exception when others[\s\S]*return null/)
  assert.match(scheduler, /timeout_milliseconds := 15000/)
  assert.match(worker, /const BATCH_SIZE = 20/)
  assert.match(worker, /const MAX_BATCHES = 3/)
  assert.match(worker, /const MAX_RUNTIME_MS = 40_000/)
  assert.match(worker, /export const config = \{ maxDuration: 60 \}/)
  assert.match(worker, /remainingMayExist: lastBatchFull/)
})
