self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  event.waitUntil(self.registration.showNotification(data.title || 'AlertBridge community alert', {
    body: data.body || 'A responder-verified alert was updated.',
    tag: data.tag || `alertbridge-${data.alertId || 'alert'}`,
    renotify: true,
    data: { url: data.url || '/?screen=alerts' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/?screen=alerts', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) { await existing.navigate(target); return existing.focus() }
    return clients.openWindow(target)
  })())
})
