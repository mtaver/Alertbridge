import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

interface Delivery {
  delivery_id: number
  endpoint: string
  p256dh: string
  auth_secret: string
  alert_id: string
  source_kind: 'responder_alert' | 'community_post'
  alert_version: string
  title: string
  body: string
}

const BATCH_SIZE = 20
const MAX_BATCHES = 3
const MAX_RUNTIME_MS = 40_000
const SEND_CONCURRENCY = 10

export const config = { maxDuration: 60 }

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST' && request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' })
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CRON_SECRET'] as const
  if (required.some((key) => !process.env[key])) return response.status(503).json({ error: 'Push delivery is not configured' })
  if (request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return response.status(401).json({ error: 'Unauthorized' })

  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)
  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  const startedAt = Date.now()
  let claimed = 0, sent = 0, retried = 0, invalid = 0, batches = 0, lastBatchFull = false
  async function deliver(delivery: Delivery) {
    try {
      await webpush.sendNotification({ endpoint: delivery.endpoint, keys: { p256dh: delivery.p256dh, auth: delivery.auth_secret } }, JSON.stringify({
        title: delivery.title, body: delivery.body, alertId: delivery.alert_id,
        tag: `alertbridge-${delivery.source_kind}-${delivery.alert_id}-${delivery.alert_version}`,
        url: `/?screen=alerts&alert=${encodeURIComponent(delivery.alert_id)}`,
      }), { TTL: 3600, urgency: 'high', timeout: 8_000 })
      const { error } = await admin.rpc('complete_push_delivery', { target_delivery_id: delivery.delivery_id, outcome: 'sent', failure_message: null })
      if (error) throw error
      sent++
    } catch (caught) {
      const statusCode = typeof caught === 'object' && caught && 'statusCode' in caught ? Number(caught.statusCode) : 0
      const outcome = statusCode === 404 || statusCode === 410 ? 'invalid' : 'retry'
      const message = caught instanceof Error ? caught.message : 'Push provider request failed'
      await admin.rpc('complete_push_delivery', { target_delivery_id: delivery.delivery_id, outcome, failure_message: message })
      if (outcome === 'invalid') invalid++; else retried++
    }
  }
  while (batches < MAX_BATCHES && Date.now() - startedAt < MAX_RUNTIME_MS) {
    const { data, error } = await admin.rpc('claim_push_deliveries', { batch_size: BATCH_SIZE })
    if (error) return response.status(500).json({ error: 'Queue claim failed', claimed, sent, retried, invalid })
    const deliveries = (data ?? []) as Delivery[]
    if (!deliveries.length) { lastBatchFull = false; break }
    batches++; claimed += deliveries.length; lastBatchFull = deliveries.length === BATCH_SIZE
    for (let offset = 0; offset < deliveries.length; offset += SEND_CONCURRENCY) {
      await Promise.all(deliveries.slice(offset, offset + SEND_CONCURRENCY).map(deliver))
    }
    if (!lastBatchFull) break
  }
  return response.status(200).json({ claimed, sent, retried, invalid, batches, remainingMayExist: lastBatchFull })
}
