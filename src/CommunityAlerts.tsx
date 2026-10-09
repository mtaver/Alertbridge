import { useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AlertTriangle, Bell, BellOff, Check, LocateFixed, MapPin, Megaphone, Navigation, RefreshCw, X } from 'lucide-react'
import { fetchAlertForReport, fetchPublicAlerts, publishAlert, setAlertStatus, updateAlert, validateAlertDraft } from './alerts'
import { removePublicAlertSubscription, subscribeToPublicAlertChanges, type AlertConnectionStatus } from './alertRealtime'
import { nearbyAlerts, newWarningMatches, validCoordinates, type Coordinates, type NearbyAlert } from './proximity'
import { fetchCommunityPostFlagCount, moderateCommunityPost, reportCommunityPost } from './reportingChannels'
import { isSupabaseConfigured } from './supabase'
import type { AlertDraft, Category, CommunityAlert, Report } from './types'
import { PlaceSearch } from './PlaceSearch'
import { displayedAlertGuidance } from './alertPresentation'

const alertCategories: Array<Category | 'All'> = ['All', 'Security threat', 'Flood', 'Landslide', 'Fire', 'Other']

function formatAlertDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function CommunityAlertsFeed({ session, isResponder }: { session: Session | null; isResponder: boolean }) {
  const [alerts, setAlerts] = useState<CommunityAlert[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<Category | 'All'>('All')
  const [area, setArea] = useState('')
  const [showPastAlerts, setShowPastAlerts] = useState(false)
  const [location, setLocation] = useState<Coordinates | null>(null)
  const [warningLocation, setWarningLocation] = useState<Coordinates | null>(null)
  const [locationMessage, setLocationMessage] = useState('')
  const [locating, setLocating] = useState(false)
  const [connection, setConnection] = useState<AlertConnectionStatus>(isSupabaseConfigured ? 'connecting' : 'unavailable')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [warningsEnabled, setWarningsEnabled] = useState(false)
  const [approachDistance, setApproachDistance] = useState(1)
  const [warningMatches, setWarningMatches] = useState<NearbyAlert[]>([])
  const [warningAnnouncement, setWarningAnnouncement] = useState('')
  const [notificationOptIn, setNotificationOptIn] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState('')
  const [includeCommunityWarnings, setIncludeCommunityWarnings] = useState(false)
  const [destinationLatitude, setDestinationLatitude] = useState('')
  const [destinationLongitude, setDestinationLongitude] = useState('')
  const [destinationMatches, setDestinationMatches] = useState<NearbyAlert[] | null>(null)
  const [destinationError, setDestinationError] = useState('')
  const warnedVersions = useRef(new Map<string, string>())
  const watchId = useRef<number | null>(null)

  async function loadAlerts() {
    if (!isSupabaseConfigured) { setLoading(false); return }
    setLoading(true); setError('')
    try { setAlerts(await fetchPublicAlerts()); setLastRefresh(new Date()) }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Community alerts could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    void loadAlerts()
    const channel = subscribeToPublicAlertChanges(() => void loadAlerts(), setConnection)
    const recover = () => void loadAlerts()
    window.addEventListener('online', recover)
    return () => { window.removeEventListener('online', recover); void removePublicAlertSubscription(channel) }
  }, [])

  const filtered = useMemo(() => alerts.filter((alert) => {
    const active = alert.displayStatus === 'Published' && new Date(alert.expiresAt).getTime() > Date.now()
    if (!showPastAlerts && !active) return false
    if (category !== 'All' && alert.category !== category) return false
    if (area.trim() && !alert.affectedArea.toLowerCase().includes(area.trim().toLowerCase())) return false
    if (location) {
      if (alert.dangerLatitude === undefined || alert.dangerLongitude === undefined || alert.dangerRadiusKm === undefined) return false
      return nearbyAlerts([alert], location, 0).length > 0
    }
    return true
  }), [alerts, category, area, location, showPastAlerts])
  const warningAlerts = useMemo(() => alerts.filter((alert) => alert.verified || includeCommunityWarnings), [alerts, includeCommunityWarnings])

  function useNearMe() {
    setLocationMessage('')
    if (!navigator.geolocation) { setLocationMessage('Location is unavailable in this browser.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocation({ latitude: coords.latitude, longitude: coords.longitude }); setLocationMessage('Showing alerts whose optional danger zone includes your current location. Your location stays on this device.'); setLocating(false) },
      () => { setLocationMessage('Location could not be used. Check permission or use category and area filters.'); setLocating(false) },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }

  useEffect(() => {
    if (!warningsEnabled) {
      if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null; setWarningLocation(null); setWarningMatches([])
      return
    }
    if (!navigator.geolocation) { setLocationMessage('Location monitoring is unavailable in this browser.'); setWarningsEnabled(false); return }
    setLocationMessage('Requesting location permission. Your location stays on this device and is used only while this page is open.')
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (coords.accuracy > 1000) { setLocationMessage(`Location accuracy is too low (${Math.round(coords.accuracy)} m). Move to an open area or check device location settings.`); return }
        setWarningLocation({ latitude: coords.latitude, longitude: coords.longitude })
        setLocationMessage(`Nearby warnings are active while this page is open. Location accuracy: about ${Math.round(coords.accuracy)} m. Your location stays on this device.`)
      },
      (failure) => { setLocationMessage(failure.code === failure.PERMISSION_DENIED ? 'Location permission was denied. Nearby warnings are off.' : 'Location monitoring is unavailable or was interrupted. Nearby warnings are off.'); setWarningsEnabled(false) },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
  }, [warningsEnabled])

  useEffect(() => {
    if (!warningsEnabled || !warningLocation) { setWarningMatches([]); return }
    const matches = nearbyAlerts(warningAlerts, warningLocation, approachDistance)
    setWarningMatches(matches)
    const fresh = newWarningMatches(matches, warnedVersions.current)
    if (fresh.length) setWarningAnnouncement(`Reported danger nearby. Avoid the affected area and review guidance. ${fresh.map(({ alert }) => `${alert.category} in ${alert.affectedArea}, updated ${formatAlertDate(alert.updatedAt)}`).join('; ')}`)
    fresh.forEach(({ alert, boundaryDistanceKm }) => {
      warnedVersions.current.set(alert.id, alert.updatedAt)
      if (notificationOptIn && Notification.permission === 'granted') new Notification('Reported danger nearby', { body: `${alert.category} in ${alert.affectedArea}, ${boundaryDistanceKm.toFixed(1)} km from the danger-zone boundary. Review responder guidance.` })
    })
  }, [warningAlerts, warningLocation, warningsEnabled, approachDistance, notificationOptIn])

  async function enableNotifications() {
    if (!('Notification' in window)) { setNotificationMessage('Browser notifications are not supported here. In-app warnings remain available.'); return }
    const permission = await Notification.requestPermission()
    setNotificationOptIn(permission === 'granted')
    setNotificationMessage(permission === 'granted' ? 'Browser notifications enabled while AlertBridge is open.' : 'Browser notification permission was not granted. In-app warnings remain available.')
  }

  function checkDestination() {
    const latitude = Number(destinationLatitude); const longitude = Number(destinationLongitude)
    if (!destinationLatitude.trim() || !destinationLongitude.trim() || !validCoordinates(latitude, longitude)) { setDestinationError('Enter a latitude from −90 to 90 and longitude from −180 to 180.'); setDestinationMatches(null); return }
    checkDestinationAt(latitude, longitude)
  }
  function checkDestinationAt(latitude: number, longitude: number) { setDestinationError(''); setDestinationMatches(nearbyAlerts(warningAlerts, { latitude, longitude }, approachDistance)) }

  return <section className="page alerts-page">
    <div className="alerts-heading"><div><span className="mini-label">PUBLIC COMMUNITY ALERTS</span><h1>Community alerts</h1><p>Community warnings and responder-verified alerts. AlertBridge is not connected to emergency services.</p></div><button className="secondary" onClick={() => void loadAlerts()} disabled={loading}><RefreshCw /> Refresh</button></div>
    <div className={`connection-status ${connection}`} role="status"><span aria-hidden="true"></span><b>{connection === 'connected' ? 'Live updates connected' : connection === 'connecting' ? 'Connecting to live updates…' : connection === 'unavailable' ? 'Live updates require connected mode' : 'Live updates disconnected'}</b><small>{lastRefresh ? `Last refreshed ${lastRefresh.toLocaleTimeString()}` : 'No successful refresh yet'}{connection === 'disconnected' ? ' · Current alerts will be fetched after reconnection.' : ''}</small></div>
    <div className="alert-filters" aria-label="Alert filters">
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value as Category | 'All')}>{alertCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Affected area<input value={area} onChange={(event) => setArea(event.target.value)} placeholder="Filter by area name" /></label>
      <button className={location ? 'location-button active' : 'location-button'} onClick={location ? () => { setLocation(null); setLocationMessage('Near me filter removed.') } : useNearMe} disabled={locating}><LocateFixed /> {locating ? 'Finding location…' : location ? 'Clear Near me' : 'Near me'}</button>
      <label className="past-alerts-toggle"><input type="checkbox" checked={showPastAlerts} onChange={(event) => setShowPastAlerts(event.target.checked)} /> Show past alerts</label>
    </div>
    {locationMessage && <p className="privacy-note" role="status"><LocateFixed /> {locationMessage}</p>}
    {error && <p className="submission-error" role="alert"><AlertTriangle /> {error}</p>}
    {loading ? <div className="empty-state"><Megaphone /><h2>Loading alerts…</h2></div> : filtered.length === 0 ? <div className="empty-state"><Megaphone /><h2>No alerts match these filters</h2><p>No active alert is currently available here. This does not mean the area is safe.{!showPastAlerts && ' Select “Show past alerts” to include expired and resolved items.'}</p></div> : <div className="alerts-grid">
      {filtered.map((alert) => {
        const activity = alert.displayStatus === 'Published' && new Date(alert.expiresAt).getTime() > Date.now() ? 'Active' : alert.displayStatus === 'Resolved' ? 'Resolved' : 'Expired'
        return <article className={`alert-card ${activity.toLowerCase()} ${alert.sourceKind}`} key={alert.id}>
        <div className="alert-card-top"><span className="alert-category">{alert.category}</span><span className={`alert-state ${activity.toLowerCase()}`}>{activity}</span></div>
        <span className={alert.verified ? 'source-label verified-source' : 'source-label unverified-source'}>{alert.verified ? 'Responder-verified' : 'Community report — unverified'}</span>
        <h2>{alert.title}</h2><p>{alert.summary}</p>
        <dl><div><dt>Affected area</dt><dd><MapPin /> {alert.affectedArea}</dd></div><div><dt>Guidance</dt><dd>{displayedAlertGuidance(alert)}</dd></div></dl>
        <div className="alert-times"><span>Published {formatAlertDate(alert.publishedAt)}</span><span>Updated {formatAlertDate(alert.updatedAt)}</span><span>Expires {formatAlertDate(alert.expiresAt)}</span></div>
        {alert.sourceKind === 'community_post' && <CommunityPostActions alert={alert} session={session} isResponder={isResponder} refreshed={() => void loadAlerts()} />}
      </article>})}
    </div>}
    <section className="warning-controls" aria-labelledby="nearby-warning-heading">
      <div><span className="mini-label">OPT-IN LOCATION</span><h2 id="nearby-warning-heading">Nearby danger warnings</h2><p>Check active danger zones near you. Your location stays on this device.</p><details className="warning-details"><summary>How nearby warnings work</summary><p>AlertBridge compares your location locally while this page is open. Warnings may be interrupted by lost connectivity. It does not reliably warn you when the app is closed or the phone is locked, and there is no offline or background delivery.</p></details></div>
      <label>Approach distance<select value={approachDistance} onChange={(event) => setApproachDistance(Number(event.target.value))}><option value={0}>Inside zone only</option><option value={0.5}>Within 0.5 km</option><option value={1}>Within 1 km</option><option value={2}>Within 2 km</option><option value={5}>Within 5 km</option></select></label>
      <label className="warning-source"><input type="checkbox" checked={includeCommunityWarnings} onChange={(event) => setIncludeCommunityWarnings(event.target.checked)} /> Include unverified community warnings</label>
      <button className={warningsEnabled ? 'danger-button' : 'primary'} onClick={() => setWarningsEnabled((enabled) => !enabled)}>{warningsEnabled ? <BellOff /> : <Bell />} {warningsEnabled ? 'Disable nearby warnings' : 'Enable nearby warnings'}</button>
      <button className="secondary" onClick={() => void enableNotifications()} disabled={notificationOptIn}><Bell /> {notificationOptIn ? 'Browser notifications on' : 'Enable browser notifications'}</button>
      {notificationMessage && <p className="control-message" role="status">{notificationMessage}</p>}
    </section>
    {warningAnnouncement && <p className="visually-hidden" role="alert">{warningAnnouncement}</p>}
    {warningsEnabled && warningMatches.length > 0 && <section className="nearby-warnings" aria-label="Nearby danger warnings"><h2><AlertTriangle /> Reported danger nearby. Avoid the affected area and review guidance.</h2>{warningMatches.map((match) => <WarningCard key={match.alert.id} match={match} />)}</section>}
    {warningsEnabled && warningLocation && warningMatches.length === 0 && <p className="neutral-message">No matching public danger zones were found at this location. This does not mean the area is safe.</p>}
    <section className="destination-check" aria-labelledby="destination-heading"><div><span className="mini-label">DESTINATION-AREA CHECK</span><h2 id="destination-heading">Check alerts near a destination</h2><p>Choose the place you intend to visit. Your current GPS location is not used as the destination. This checks only the selected destination area; it does not inspect the journey or provide route avoidance.</p></div><PlaceSearch label="Search for a destination" onSelect={(latitude, longitude) => { setDestinationLatitude(latitude.toFixed(6)); setDestinationLongitude(longitude.toFixed(6)); checkDestinationAt(latitude, longitude) }} /><details className="advanced-location"><summary>Advanced: enter destination coordinates manually</summary><div className="destination-fields"><label>Destination latitude<input inputMode="decimal" value={destinationLatitude} onChange={(event) => setDestinationLatitude(event.target.value)} /></label><label>Destination longitude<input inputMode="decimal" value={destinationLongitude} onChange={(event) => setDestinationLongitude(event.target.value)} /></label><button className="secondary" onClick={checkDestination}><Navigation /> Check destination</button></div></details>{destinationError && <p className="submission-error" role="alert"><AlertTriangle /> {destinationError}</p>}{destinationMatches && (destinationMatches.length ? <div className="destination-results">{destinationMatches.map((match) => <WarningCard key={match.alert.id} match={match} />)}</div> : <p className="neutral-message">No matching public danger zones were found near this destination. This does not mean the area is safe.</p>)}</section>
  </section>
}

function CommunityPostActions({ alert, session, isResponder, refreshed }: { alert: CommunityAlert; session: Session | null; isResponder: boolean; refreshed: () => void }) {
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [flagCount, setFlagCount] = useState<number | null>(null)
  useEffect(() => { if (isResponder) void fetchCommunityPostFlagCount(alert.id).then(setFlagCount).catch(() => setFlagCount(null)) }, [alert.id, isResponder])
  async function act(action: 'Report' | 'Verified' | 'Removed') {
    if (!reason.trim()) { setMessage('Enter a non-empty reason.'); return }
    setSaving(true); setMessage('')
    try {
      if (action === 'Report') await reportCommunityPost(alert.id, reason)
      else await moderateCommunityPost(alert.id, action, reason)
      setReason(''); setMessage(action === 'Report' ? 'Post reported for responder review.' : `Post marked ${action.toLowerCase()} with an audit entry.`); refreshed()
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'The action could not be saved.') }
    finally { setSaving(false) }
  }
  if (!session) return <p className="post-action-note">Sign in to report a misleading or abusive community post.</p>
  return <div className="post-actions">{isResponder && <p><b>{flagCount ?? '—'}</b> user report{flagCount === 1 ? '' : 's'} recorded for responder review.</p>}<label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={isResponder ? 'Required moderation reason' : 'Why is this misleading or abusive?'} /></label><div>{!isResponder && <button className="secondary small-button" disabled={saving} onClick={() => void act('Report')}><AlertTriangle /> Report post</button>}{isResponder && <><button className="secondary small-button" disabled={saving || alert.verified} onClick={() => void act('Verified')}><Check /> Verify</button><button className="danger-button small-button" disabled={saving} onClick={() => void act('Removed')}><X /> Remove</button></>}</div>{message && <p role="status">{message}</p>}</div>
}

function WarningCard({ match }: { match: NearbyAlert }) {
  const inside = match.boundaryDistanceKm === 0
  return <article className="warning-card"><div><strong>{match.alert.category}</strong><span>{match.alert.affectedArea}</span></div><span className={match.alert.verified ? 'source-label verified-source' : 'source-label unverified-source'}>{match.alert.verified ? 'Responder-verified' : 'Community report — unverified'}</span><p>{inside ? `Inside the ${match.alert.dangerRadiusKm?.toFixed(1)} km public danger zone` : `${match.boundaryDistanceKm.toFixed(1)} km from the danger-zone boundary`} · centre distance {match.distanceKm.toFixed(1)} km</p><p><b>Guidance:</b> {displayedAlertGuidance(match.alert)}</p><small>Last updated {formatAlertDate(match.alert.updatedAt)}</small></article>
}

function defaultExpiry() {
  const date = new Date(Date.now() + 6 * 60 * 60 * 1000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
function emptyAlertDraft(category: Category): AlertDraft { return { title: '', summary: '', affectedArea: '', category, guidance: '', expiresAt: defaultExpiry(), dangerLatitude: '', dangerLongitude: '', dangerRadiusKm: '' } }
function inputDate(value: string) { const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }

export function AlertPublisher({ report }: { report: Report }) {
  const [alert, setAlert] = useState<CommunityAlert | null>(null)
  const [draft, setDraft] = useState<AlertDraft>(emptyAlertDraft(report.category))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dangerZoneConfirmed, setDangerZoneConfirmed] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const existing = await fetchAlertForReport(report.id)
      setAlert(existing)
      if (existing) { setDraft({ title: existing.title, summary: existing.summary, affectedArea: existing.affectedArea, category: existing.category, guidance: existing.guidance, expiresAt: inputDate(existing.expiresAt), dangerLatitude: existing.dangerLatitude?.toString() ?? '', dangerLongitude: existing.dangerLongitude?.toString() ?? '', dangerRadiusKm: existing.dangerRadiusKm?.toString() ?? '' }); setDangerZoneConfirmed(true) }
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not load the linked alert.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [report.id])
  const update = (field: keyof AlertDraft, value: string) => { setDraft((current) => ({ ...current, [field]: value })); if (field === 'dangerLatitude' || field === 'dangerLongitude' || field === 'dangerRadiusKm') setDangerZoneConfirmed(false); setErrors((current) => ({ ...current, [field]: '', dangerZone: '', dangerConfirmation: '' })) }

  async function save() {
    const nextErrors = validateAlertDraft(draft)
    if ((draft.dangerLatitude.trim() || draft.dangerLongitude.trim() || draft.dangerRadiusKm.trim()) && !dangerZoneConfirmed) nextErrors.dangerConfirmation = 'Confirm that this responder-selected location is appropriate to publish as the danger zone.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setSaving(true); setMessage('')
    try {
      if (alert) await updateAlert(alert.id, draft)
      else await publishAlert(report.id, draft)
      setMessage(alert ? 'Public alert updated and recorded in audit history.' : 'Public alert published and recorded in audit history.')
      await load()
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not save the public alert.') }
    finally { setSaving(false) }
  }
  async function changeStatus(status: 'Resolved' | 'Withdrawn') {
    if (!alert) return
    setSaving(true); setMessage('')
    try {
      await setAlertStatus(alert.id, status)
      setMessage(`Alert ${status.toLowerCase()} and recorded in audit history.`)
      await load()
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : `Could not mark the alert ${status.toLowerCase()}.`) }
    finally { setSaving(false) }
  }
  if (loading) return <section className="publisher-card"><h2>Community alert</h2><p>Loading linked alert…</p></section>
  if (!alert && report.status !== 'Verified') return <section className="publisher-card"><h2>Community alert</h2><p>Verification does not publish a report automatically. This report must be Verified before a responder can write and publish a separate public alert.</p></section>
  return <section className="publisher-card"><div className="publisher-heading"><div><span className="mini-label">RESPONDER-ONLY PUBLISHING</span><h2>{alert ? 'Update public alert' : 'Publish a community alert'}</h2></div>{alert && <span className={`alert-state ${alert.displayStatus.toLowerCase()}`}>{alert.displayStatus}</span>}</div>
    <p>Only the fields below become public. Reporter identity, private location, questionnaire answers and report history remain private.</p>
    <div className="publisher-form">
      <label>Public title <b>*</b><input value={draft.title} maxLength={160} onChange={(event) => update('title', event.target.value)} />{errors.title && <small>{errors.title}</small>}</label>
      <label>Public summary <b>*</b><textarea rows={3} value={draft.summary} maxLength={1000} onChange={(event) => update('summary', event.target.value)} />{errors.summary && <small>{errors.summary}</small>}</label>
      <label>Affected area <b>*</b><input value={draft.affectedArea} maxLength={240} onChange={(event) => update('affectedArea', event.target.value)} />{errors.affectedArea && <small>{errors.affectedArea}</small>}</label>
      <label>Category <b>*</b><select value={draft.category} onChange={(event) => update('category', event.target.value)}>{alertCategories.filter((item) => item !== 'All').map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Public guidance <b>*</b><textarea rows={3} value={draft.guidance} maxLength={2000} onChange={(event) => update('guidance', event.target.value)} />{errors.guidance && <small>{errors.guidance}</small>}</label>
      <label>Expiry time <b>*</b><input type="datetime-local" value={draft.expiresAt} onChange={(event) => update('expiresAt', event.target.value)} />{errors.expiresAt && <small>{errors.expiresAt}</small>}</label>
      <fieldset><legend>Optional public danger zone</legend><p>This is separate from the reporter’s private location. A responder must explicitly select and confirm any coordinates before they become public.</p><button type="button" className="secondary" onClick={() => { setDraft((current) => ({ ...current, dangerLatitude: report.location.latitude.toString(), dangerLongitude: report.location.longitude.toString(), dangerRadiusKm: current.dangerRadiusKm || '1' })); setDangerZoneConfirmed(false) }}><MapPin /> Select private incident location for review</button><div className="danger-grid"><label>Latitude<input inputMode="decimal" value={draft.dangerLatitude} onChange={(event) => update('dangerLatitude', event.target.value)} />{errors.dangerLatitude && <small>{errors.dangerLatitude}</small>}</label><label>Longitude<input inputMode="decimal" value={draft.dangerLongitude} onChange={(event) => update('dangerLongitude', event.target.value)} />{errors.dangerLongitude && <small>{errors.dangerLongitude}</small>}</label><label>Radius (km)<input inputMode="decimal" value={draft.dangerRadiusKm} onChange={(event) => update('dangerRadiusKm', event.target.value)} />{errors.dangerRadiusKm && <small>{errors.dangerRadiusKm}</small>}</label></div>{(draft.dangerLatitude || draft.dangerLongitude || draft.dangerRadiusKm) && <label className="danger-confirm"><input type="checkbox" checked={dangerZoneConfirmed} onChange={(event) => { setDangerZoneConfirmed(event.target.checked); setErrors((current) => ({ ...current, dangerConfirmation: '' })) }} /> I confirm these responder-selected coordinates and radius are appropriate to publish.</label>}{errors.dangerZone && <small>{errors.dangerZone}</small>}{errors.dangerConfirmation && <small>{errors.dangerConfirmation}</small>}</fieldset>
    </div>
    {message && <p className="auth-message" role="status">{message}</p>}
    <div className="publisher-actions"><button className="primary" onClick={() => void save()} disabled={saving}><Check /> {saving ? 'Saving…' : alert ? 'Save public update' : 'Publish alert'}</button>{alert?.displayStatus === 'Published' && <><button className="secondary" onClick={() => void changeStatus('Resolved')} disabled={saving}><Check /> Resolve</button><button className="danger-button" onClick={() => void changeStatus('Withdrawn')} disabled={saving}><X /> Withdraw</button></>}</div>
  </section>
}
