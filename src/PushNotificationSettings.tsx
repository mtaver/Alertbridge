import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Bell, BellOff } from 'lucide-react'
import { disableWebPush, enableWebPush, fetchNotificationAreas, fetchPushSettings, updateFollowedAreas, webPushSupported, type NotificationArea } from './pushNotifications'

export function PushNotificationSettings({ session }: { session: Session | null }) {
  const [areas, setAreas] = useState<NotificationArea[]>([]), [selected, setSelected] = useState<string[]>([])
  const [enabled, setEnabled] = useState(false), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  useEffect(() => {
    let active = true; setLoading(true)
    Promise.all([fetchNotificationAreas(), session ? fetchPushSettings() : Promise.resolve({ enabled: false, areaIds: [] })])
      .then(([nextAreas, settings]) => { if (active) { setAreas(nextAreas); setSelected(settings.areaIds); setEnabled(settings.enabled) } })
      .catch(() => { if (active) setMessage('Notification settings could not be loaded.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session?.user.id])
  const toggle = (id: string) => { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); setMessage('') }
  async function run(action: 'enable' | 'save' | 'disable') {
    if (!session) { setMessage('Sign in to enable notifications. Public alerts remain available without signing in.'); return }
    setSaving(true); setMessage('')
    try {
      if (action === 'enable') { await enableWebPush(selected); setEnabled(true); setMessage('Notifications enabled for the selected areas.') }
      if (action === 'save') { await updateFollowedAreas(selected); setMessage('Followed areas updated.') }
      if (action === 'disable') { await disableWebPush(); setEnabled(false); setMessage('Notifications disabled on this device.') }
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Notification settings could not be saved.') }
    finally { setSaving(false) }
  }
  return <section className="push-settings" aria-labelledby="push-heading"><div><span className="mini-label">OPTIONAL WEB PUSH</span><h2 id="push-heading">Follow area alerts</h2><p>Receive minimal notifications for active responder-verified alerts in selected areas. Public alerts remain readable without notifications.</p></div>
    {!webPushSupported() && <p className="control-message">This browser or device does not support Web Push.</p>}
    {!loading && areas.length === 0 && <p className="control-message">No notification areas have been configured yet.</p>}
    {areas.length > 0 && <fieldset><legend>Areas to follow</legend>{areas.map((area) => <label key={area.id}><input type="checkbox" checked={selected.includes(area.id)} onChange={() => toggle(area.id)} /> <span>{area.name}</span></label>)}</fieldset>}
    <div className="push-actions">{!enabled ? <button className="primary" onClick={() => void run('enable')} disabled={saving || loading || !areas.length}><Bell /> {saving ? 'Enabling…' : 'Enable notifications'}</button> : <><button className="secondary" onClick={() => void run('save')} disabled={saving}><Bell /> Save followed areas</button><button className="danger-button" onClick={() => void run('disable')} disabled={saving}><BellOff /> Disable notifications</button></>}</div>
    {message && <p role="status" className="control-message">{message}</p>}
    <details><summary>Browser and delivery limitations</summary><p>Permission must be granted on each device. Installed-app requirements vary by browser and operating system; on iPhone and iPad, Web Push requires adding the site to the Home Screen. Delivery depends on the browser push service, network access and device settings, so it is not guaranteed or always immediate. This does not use continuous background GPS and does not contact emergency services.</p></details>
  </section>
}
