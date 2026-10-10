import { supabase } from './supabase'

export interface NotificationArea { id: string; code: string; name: string }
export interface PushSettings { enabled: boolean; areaIds: string[] }

function client() { if (!supabase) throw new Error('AlertBridge service is unavailable.'); return supabase }
export function webPushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window }
export function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)))
}
export async function fetchNotificationAreas(): Promise<NotificationArea[]> {
  const { data, error } = await client().rpc('list_notification_areas'); if (error) throw error
  return (data ?? []) as NotificationArea[]
}
export async function fetchPushSettings(): Promise<PushSettings> {
  const { data, error } = await client().rpc('get_push_notification_settings'); if (error) throw error
  const settings = (data ?? {}) as { enabled?: boolean; area_ids?: string[] }
  return { enabled: settings.enabled === true, areaIds: settings.area_ids ?? [] }
}
export async function enableWebPush(areaIds: string[]): Promise<void> {
  const publicKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
  if (!publicKey) throw new Error('Web Push is not configured for this deployment.')
  if (!areaIds.length) throw new Error('Select at least one area to follow.')
  if (!webPushSupported()) throw new Error('Web Push is not supported by this browser or device.')
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notification permission was not granted. You can continue reading public alerts in the app.')
  const registration = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  const json = subscription.toJSON()
  const { error } = await client().rpc('save_push_subscription', { subscription_endpoint: subscription.endpoint, subscription_p256dh: json.keys?.p256dh, subscription_auth: json.keys?.auth, followed_area_ids: areaIds, browser_user_agent: navigator.userAgent.slice(0, 500) })
  if (error) { await subscription.unsubscribe().catch(() => false); throw error }
}
export async function updateFollowedAreas(areaIds: string[]): Promise<void> {
  if (!areaIds.length) throw new Error('Select at least one area to follow.')
  const { error } = await client().rpc('update_push_followed_areas', { followed_area_ids: areaIds }); if (error) throw error
}
export async function disableWebPush(): Promise<void> {
  const registration = webPushSupported() ? await navigator.serviceWorker.getRegistration('/sw.js') : undefined
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) throw new Error('No notification subscription was found on this device.')
  const { error } = await client().rpc('disable_push_notifications', { subscription_endpoint: subscription.endpoint }); if (error) throw error
  if (subscription) await subscription.unsubscribe()
}

export async function fetchAlertNotificationAreas(sourceKind: 'responder_alert' | 'community_post', alertId: string): Promise<string[]> {
  const { data, error } = await client().rpc('get_alert_notification_areas', { target_source_kind: sourceKind, target_alert_id: alertId })
  if (error) throw error
  return (data ?? []) as string[]
}

export async function setAlertNotificationAreas(sourceKind: 'responder_alert' | 'community_post', alertId: string, areaIds: string[]): Promise<void> {
  if (!areaIds.length) throw new Error('Select at least one structured notification area.')
  const { error } = await client().rpc('set_alert_notification_areas', { target_source_kind: sourceKind, target_alert_id: alertId, target_area_ids: areaIds })
  if (error) throw error
}
