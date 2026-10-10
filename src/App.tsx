import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, ClipboardList,
  FileText, Flame, HelpCircle, Home as HomeIcon, LocateFixed, MapPin,
  LogIn, LogOut, Megaphone, Menu, MessageCircle, Mountain, RefreshCw, ShieldAlert, UserRound, Waves, X, XCircle,
} from 'lucide-react'
import type { Answer, Category, Draft, Mode, Report, Status } from './types'
import { requiresStatusReason, validateDraft as getDraftErrors } from './validation'
import { AccountPanel, AuthPanel } from './AuthPanel'
import { changeConnectedStatus, fetchConnectedReports, fetchResponderMembership, updateDisplayName } from './connected'
import { isSupabaseConfigured, supabase } from './supabase'
import { AlertPublisher, CommunityAlertsFeed } from './CommunityAlerts'
import { submitReportingChannels } from './reportingChannels'
import { reportingErrorMessage } from './reportingErrors'
import { AssistancePanel } from './AssistancePanel'
import { removePublicAlertSubscription, subscribeToPrivateReportChanges } from './alertRealtime'
import { PlaceSearch } from './PlaceSearch'
import { generatePublicSummary } from './publicSummary'
import { ReportConversation } from './ReportConversation'
import { fetchUnreadMessageCounts } from './reportMessages'

type Screen = 'home' | 'alerts' | 'report' | 'review' | 'confirmation' | 'dashboard' | 'detail' | 'auth' | 'account'

const categories: { name: Category; icon: typeof ShieldAlert; note: string }[] = [
  { name: 'Security threat', icon: ShieldAlert, note: 'Violence, danger or suspicious activity' },
  { name: 'Flood', icon: Waves, note: 'Rising water or flooded areas' },
  { name: 'Landslide', icon: Mountain, note: 'Moving earth, rock or mud' },
  { name: 'Fire', icon: Flame, note: 'Fire, smoke or burning' },
  { name: 'Other', icon: HelpCircle, note: 'Another community hazard' },
]
const answers: Answer[] = ['Yes', 'No', 'Not sure']
function defaultPublicExpiry() { const date = new Date(Date.now() + 6 * 60 * 60 * 1000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16) }
function blankDraft(): Draft { return { reportingChannel: 'assistance', mode: '', category: '', description: '', happeningNow: '', anyoneInjured: '', additionalDetails: '', latitude: '', longitude: '', publicArea: '', publicSummary: '', publicExpiry: defaultPublicExpiry(), publicLatitude: '', publicLongitude: '', publicRadiusKm: '1' } }

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function shortLocation(report: Report) {
  return `${report.location.latitude.toFixed(4)}, ${report.location.longitude.toFixed(4)}`
}

function App() {
  const [screen, setScreen] = useState<Screen>(() => new URLSearchParams(window.location.search).get('screen') === 'alerts' ? 'alerts' : 'home')
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [submissionRequestId, setSubmissionRequestId] = useState(() => crypto.randomUUID())
  const [selectedId, setSelectedId] = useState<string>('')
  const [submittedId, setSubmittedId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [geoMessage, setGeoMessage] = useState('')
  const [locating, setLocating] = useState(false)
  const [publicLocating, setPublicLocating] = useState(false)
  const [publicGeoMessage, setPublicGeoMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [isResponder, setIsResponder] = useState(false)
  const [connectedReports, setConnectedReports] = useState<Report[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})

  const selectedReport = connectedReports.find((report) => report.id === selectedId)

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') { setPasswordRecovery(true); setScreen('auth') }
      else if (event === 'SIGNED_IN') { setPasswordRecovery(false); setScreen('home') }
      else if (event === 'SIGNED_OUT') { setScreen('home') }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setConnectedReports([]); setUnreadCounts({}); setIsResponder(false); return }
    void refreshConnectedData(session.user.id)
  }, [session])

  useEffect(() => {
    if (!session || !isResponder) return
    const channel = subscribeToPrivateReportChanges(() => {
      void fetchConnectedReports().then(setConnectedReports).catch(() => setDataError('Private report live refresh failed. Use Refresh to retry.'))
    })
    return () => { void removePublicAlertSubscription(channel) }
  }, [session, isResponder])

  useEffect(() => {
    if (!session || screen !== 'dashboard') return
    void fetchUnreadMessageCounts().then(setUnreadCounts).catch(() => setDataError('Could not load unread message counts. Use Refresh to retry.'))
  }, [screen, session])

  async function refreshConnectedData(userId = session?.user.id) {
    if (!userId) return
    setDataLoading(true); setDataError('')
    try {
      const [nextReports, responder] = await Promise.all([fetchConnectedReports(), fetchResponderMembership(userId)])
      setConnectedReports(nextReports); setIsResponder(responder)
    } catch (caught) { setDataError(caught instanceof Error ? caught.message : 'Could not load connected reports.') }
    finally { setDataLoading(false) }
  }
  const updateDraft = (field: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
  }

  function navigate(next: Screen) {
    setScreen(next)
    setMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startReport() {
    if (!session) { navigate('auth'); return }
    setDraft(blankDraft())
    setSubmissionRequestId(crypto.randomUUID())
    setErrors({})
    setGeoMessage('')
    setPublicGeoMessage('')
    setSubmitError('')
    navigate('report')
  }

  function validateDraft() {
    const next = getDraftErrors(draft)
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function useLocation() {
    setGeoMessage('')
    if (!navigator.geolocation) {
      setGeoMessage('Location is unavailable in this browser. Enter the coordinates manually.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDraft((current) => ({ ...current, latitude: coords.latitude.toFixed(6), longitude: coords.longitude.toFixed(6) }))
        setErrors((current) => ({ ...current, latitude: '', longitude: '' }))
        setGeoMessage('Location added. Check that these coordinates match the incident location.')
        setLocating(false)
      },
      (error) => {
        const messages: Record<number, string> = {
          1: 'Location permission was denied. You can enter the coordinates manually.',
          2: 'Your location is unavailable. Try again or enter the coordinates manually.',
          3: 'Finding your location took too long. Try again or enter it manually.',
        }
        setGeoMessage(messages[error.code] ?? 'We could not find your location. Enter it manually.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  function usePublicLocation() {
    setPublicGeoMessage('')
    if (!navigator.geolocation) { setPublicGeoMessage('Location is unavailable. Enter the public danger-zone coordinates manually.'); return }
    setPublicLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setDraft((current) => ({ ...current, publicLatitude: coords.latitude.toFixed(6), publicLongitude: coords.longitude.toFixed(6) })); setErrors((current) => ({ ...current, publicLatitude: '', publicLongitude: '' })); setPublicGeoMessage('Public danger-zone location added. Confirm it represents the incident area before submitting.'); setPublicLocating(false) },
      (error) => { setPublicGeoMessage(error.code === error.PERMISSION_DENIED ? 'Location permission was denied. Enter the public danger-zone coordinates manually.' : 'The public danger-zone location could not be found. Enter it manually.'); setPublicLocating(false) },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  }

  async function submitReport() {
    if (submitting) return
    if (!draft.mode || !draft.category) return
    if (!session) { navigate('auth'); return }
    setSubmitting(true); setSubmitError('')
    try {
      const result = await submitReportingChannels(draft, submissionRequestId)
      await refreshConnectedData(session.user.id)
      setSubmittedId([result.reportId, result.postId].filter(Boolean).join(' / '))
      navigate('confirmation')
    } catch (caught) {
      setSubmitError(reportingErrorMessage(caught))
    } finally { setSubmitting(false) }
  }

  async function changeStatusConnected(id: string, status: Status, reason: string) {
    await changeConnectedStatus(id, status, reason)
    await refreshConnectedData()
  }

  if (!isSupabaseConfigured) return <ServiceUnavailable />

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => navigate('home')} aria-label="AlertBridge home">
          <span className="brand-mark"><ShieldAlert size={25} /></span>
          <span>AlertBridge</span>
        </button>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Open navigation"><Menu /></button>
        <nav className={menuOpen ? 'nav open' : 'nav'} aria-label="Main navigation">
          <button className={screen === 'home' ? 'active' : ''} onClick={() => navigate('home')}><HomeIcon size={18} /> Home</button>
          <button className={screen === 'alerts' ? 'active' : ''} onClick={() => navigate('alerts')}><Megaphone size={18} /> Community alerts</button>
          <button onClick={startReport}><AlertTriangle size={18} /> Report incident</button>
          <button className={screen === 'dashboard' || screen === 'detail' ? 'active' : ''} onClick={() => !session ? navigate('auth') : navigate('dashboard')}><ClipboardList size={18} /> {isResponder ? 'Responder dashboard' : 'My reports'}</button>
          {!authLoading && (session
            ? <><button onClick={() => navigate('account')}><UserRound size={18} /> Account</button><button onClick={() => void supabase?.auth.signOut()}><LogOut size={18} /> Sign out</button></>
            : <button onClick={() => navigate('auth')}><LogIn size={18} /> Sign in</button>)}
        </nav>
      </header>

      <main>
        {screen === 'home' && <Home startReport={startReport} openDashboard={() => session ? navigate('dashboard') : navigate('auth')} reportCount={connectedReports.length} signedIn={Boolean(session)} />}
        {screen === 'alerts' && <CommunityAlertsFeed session={session} isResponder={isResponder} />}
        {screen === 'auth' && <AuthPanel back={() => navigate('home')} recovery={passwordRecovery} />}
        {screen === 'account' && session && <AccountPanel session={session} back={() => navigate('home')} onSaved={(name) => updateDisplayName(session.user.id, name)} />}
        {screen === 'report' && <ReportForm draft={draft} errors={errors} update={updateDraft} useLocation={useLocation} locating={locating} geoMessage={geoMessage} usePublicLocation={usePublicLocation} publicLocating={publicLocating} publicGeoMessage={publicGeoMessage} cancel={() => navigate('home')} review={() => validateDraft() && navigate('review')} />}
        {screen === 'review' && <Review submitting={submitting} submitError={submitError} draft={draft as Draft & { mode: Mode; category: Category }} edit={() => navigate('report')} submit={submitReport} />}
        {screen === 'confirmation' && <Confirmation id={submittedId} another={startReport} dashboard={() => navigate('dashboard')} />}
        {screen === 'dashboard' && session && <Dashboard responder={isResponder} loading={dataLoading} error={dataError} reports={connectedReports} unreadCounts={unreadCounts} open={(id) => { setSelectedId(id); navigate('detail') }} refresh={() => { void refreshConnectedData(); void fetchUnreadMessageCounts().then(setUnreadCounts) }} openAlerts={() => navigate('alerts')} />}
        {screen === 'detail' && session && selectedReport && <ReportDetail canUpdate={isResponder} currentUserId={session.user.id} report={selectedReport} back={() => navigate('dashboard')} updateStatus={changeStatusConnected} conversationRead={() => setUnreadCounts((current) => ({ ...current, [selectedReport.id]: 0 }))} />}
      </main>
      <footer><span className="footer-brand"><ShieldAlert size={18} /> AlertBridge</span><span>Reports are stored in AlertBridge · Emergency services are not connected</span></footer>
    </div>
  )
}

function ServiceUnavailable() {
  return <div className="app-shell"><header className="site-header"><div className="brand"><span className="brand-mark"><ShieldAlert size={25} /></span><span>AlertBridge</span></div></header><main><section className="page narrow"><div className="auth-card"><span className="mini-label">SERVICE UNAVAILABLE</span><h1>AlertBridge cannot connect.</h1><p>The required service configuration is missing. Reporting, accounts and community alerts are unavailable until the service is configured.</p><div className="submission-notice" role="note"><AlertTriangle /><span>Emergency services are not connected. Do not rely on AlertBridge to contact or dispatch help.</span></div></div></section></main></div>
}

function Home({ startReport, openDashboard, reportCount, signedIn }: { startReport: () => void; openDashboard: () => void; reportCount: number; signedIn: boolean }) {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span></span> COMMUNITY SAFETY, TOGETHER</div>
        <h1>Help starts with<br /><em>being heard.</em></h1>
        <p>AlertBridge helps communities share security threats and natural hazards—clearly, quickly and with the right location.</p>
        <button className="primary hero-button" onClick={startReport}><AlertTriangle size={24} /> Report an incident <ChevronRight size={22} /></button>
        <p className="support-text">Large steps. Plain language. You can review before saving.</p>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="map-line line-one"></div><div className="map-line line-two"></div>
        <div className="signal signal-one"><span></span></div><div className="signal signal-two"><span></span></div>
        <div className="pin-card"><MapPin size={35} /><div><b>Community report</b><span>Location included</span></div></div>
        <div className="bridge-word">BRIDGE</div>
      </div>
    </section>
    <section className="how-section">
      <div><div className="eyebrow"><span></span> SIMPLE BY DESIGN</div><h2>Share what you know.<br />We’ll guide the rest.</h2></div>
      <div className="steps">
        <article><span className="step-number">01</span><FileText /><h3>Tell us what happened</h3><p>Answer simple questions or write it in your own words.</p></article>
        <article><span className="step-number">02</span><MapPin /><h3>Add the location</h3><p>Use your location only when the incident is where you are, or enter coordinates.</p></article>
        <article><span className="step-number">03</span><CheckCircle2 /><h3>Review and submit</h3><p>Check every detail before submitting it to AlertBridge.</p></article>
      </div>
    </section>
    <section className="responder-callout"><div><span className="mini-label">{signedIn ? 'YOUR ALERTBRIDGE REPORTS' : 'ACCOUNT REQUIRED'}</span><h2>{signedIn ? 'Review your submitted reports' : 'Sign in to submit reports'}</h2><p>{signedIn ? 'You see only your own reports unless an administrator has authorised responder access.' : 'Community Alerts remain public, but posting warnings and requesting assistance require an account.'}</p></div><button className="secondary" onClick={openDashboard}><ClipboardList /> {signedIn ? 'Open reports' : 'Sign in'} {reportCount > 0 && <span className="count">{reportCount}</span>}</button></section>
  </>
}

function ReportForm({ draft, errors, update, useLocation, locating, geoMessage, usePublicLocation, publicLocating, publicGeoMessage, cancel, review }: { draft: Draft; errors: Record<string, string>; update: (f: keyof Draft, v: string) => void; useLocation: () => void; locating: boolean; geoMessage: string; usePublicLocation: () => void; publicLocating: boolean; publicGeoMessage: string; cancel: () => void; review: () => void }) {
  const [privateElsewhere, setPrivateElsewhere] = useState(false)
  const [publicElsewhere, setPublicElsewhere] = useState(false)
  const [summaryMessage, setSummaryMessage] = useState('')
  return <section className="page narrow">
    <button className="back-link" onClick={cancel}><ArrowLeft /> Back to home</button>
    <div className="page-heading"><span className="mini-label">NEW INCIDENT REPORT</span><h1>What would you like to report?</h1><p>Choose the way that feels easiest. Required fields are marked <b>*</b>.</p></div>
    <div className="form-card">
      <fieldset><legend>Who should receive this information? <b>*</b></legend><div className="choice-grid channels">
        <Choice selected={draft.reportingChannel === 'community'} onClick={() => update('reportingChannel', 'community')} icon={Megaphone} title="Warn the community" note="Publish an unverified warning for public viewing" />
        <Choice selected={draft.reportingChannel === 'assistance'} onClick={() => update('reportingChannel', 'assistance')} icon={ShieldAlert} title="Request emergency assistance" note="Send a private request to authorised responders" />
        <Choice selected={draft.reportingChannel === 'both'} onClick={() => update('reportingChannel', 'both')} icon={AlertTriangle} title="Both" note="Create linked public and private records safely" />
      </div></fieldset>
      <fieldset className={errors.mode ? 'has-error' : ''}><legend>How do you want to report? <b>*</b></legend><div className="choice-grid two">
        <Choice selected={draft.mode === 'guided'} onClick={() => update('mode', 'guided')} icon={ClipboardList} title="Guided questions" note="We’ll ask one clear question at a time" />
        <Choice selected={draft.mode === 'written'} onClick={() => update('mode', 'written')} icon={FileText} title="Write a report" note="Describe the incident in your own words" />
      </div>{errors.mode && <ErrorText text={errors.mode} />}</fieldset>

      {draft.mode && <>
        <fieldset className={errors.category ? 'has-error' : ''}><legend>Incident category <b>*</b></legend><div className="choice-grid categories">
          {categories.map(({ name, icon, note }) => <Choice key={name} selected={draft.category === name} onClick={() => update('category', name)} icon={icon} title={name} note={note} />)}
        </div>{errors.category && <ErrorText text={errors.category} />}</fieldset>
        <div className="field-section">
          <label htmlFor="description">{draft.mode === 'guided' ? 'What is happening?' : 'Describe the incident'} <b>*</b></label>
          <p className="field-help">Include the most important details. Do not put yourself in danger to gather information.</p>
          <textarea id="description" rows={5} value={draft.description} onChange={(e) => update('description', e.target.value)} aria-invalid={!!errors.description} placeholder={draft.mode === 'guided' ? 'For example: Water is rising across the main road…' : 'Write what happened, when, and anything else responders should know…'} />
          {errors.description && <ErrorText text={errors.description} />}
        </div>
        {draft.mode === 'guided' && <div className="question-row">
          <AnswerField title="Is it happening now?" value={draft.happeningNow} error={errors.happeningNow} onChange={(v) => update('happeningNow', v)} />
          <AnswerField title="Is anyone injured?" value={draft.anyoneInjured} error={errors.anyoneInjured} onChange={(v) => update('anyoneInjured', v)} />
        </div>}
        {draft.reportingChannel !== 'community' && <div className="location-section">
          <div className="location-title"><span className="icon-box"><MapPin /></span><div><h2>Private assistance location <b>*</b></h2><p>This location is stored with the private assistance report and is not automatically copied to the public warning.</p></div></div>
          <p className="location-explanation"><b>Use this if the incident is happening where you are.</b> Your browser will ask for location permission.</p>
          <button type="button" className="primary location-primary" onClick={useLocation} disabled={locating}><LocateFixed /> {locating ? 'Finding your location…' : draft.latitude && draft.longitude ? 'Use my current location again' : 'Use my current location'}</button>
          {geoMessage && <p className="geo-message" role="status">{geoMessage}</p>}
          <button type="button" className="secondary elsewhere-button" onClick={() => setPrivateElsewhere((shown) => !shown)} aria-expanded={privateElsewhere}><MapPin /> Incident is somewhere else</button>
          {privateElsewhere && <PlaceSearch label="Find the private incident location" onSelect={(latitude, longitude) => { update('latitude', latitude.toFixed(6)); update('longitude', longitude.toFixed(6)) }} />}
          {(errors.latitude || errors.longitude) && <ErrorText text="Choose the current location, search for the incident place, or use Advanced coordinates." />}
          <details className="advanced-location"><summary>Advanced: enter coordinates manually</summary><div className="coordinate-grid"><label>Latitude <b>*</b><input inputMode="decimal" value={draft.latitude} onChange={(e) => update('latitude', e.target.value)} placeholder="e.g. 6.5244" aria-invalid={!!errors.latitude} />{errors.latitude && <ErrorText text={errors.latitude} />}</label><label>Longitude <b>*</b><input inputMode="decimal" value={draft.longitude} onChange={(e) => update('longitude', e.target.value)} placeholder="e.g. 3.3792" aria-invalid={!!errors.longitude} />{errors.longitude && <ErrorText text={errors.longitude} />}</label></div></details>
        </div>}
        {draft.mode === 'guided' && <div className="field-section"><label htmlFor="details">Additional details <span>(optional)</span></label><textarea id="details" rows={3} value={draft.additionalDetails} onChange={(e) => update('additionalDetails', e.target.value)} placeholder="Anything else that may help…" /></div>}
        {draft.reportingChannel !== 'assistance' && <section className="public-fields" aria-labelledby="public-fields-title"><h2 id="public-fields-title"><Megaphone /> Public community warning</h2><p><b>These fields will be public:</b> area name, category, public summary, incident coordinates, radius and expiry. Your email, private description, questionnaire answers and additional details will not be published automatically.</p>
          <div className="coordinate-grid"><label>Affected area name <b>*</b><input value={draft.publicArea} onChange={(event) => update('publicArea', event.target.value)} aria-invalid={!!errors.publicArea} />{errors.publicArea && <ErrorText text={errors.publicArea} />}</label><label>Expiry time <b>*</b><input type="datetime-local" value={draft.publicExpiry} onChange={(event) => update('publicExpiry', event.target.value)} aria-invalid={!!errors.publicExpiry} />{errors.publicExpiry && <ErrorText text={errors.publicExpiry} />}</label></div>
          <div className="field-section"><label htmlFor="public-summary">Public summary <b>*</b></label>{draft.mode === 'guided' ? <><p className="field-help">Generate plain-language wording from the category, affected area and selected Yes/No/Not sure answers. Private descriptions and additional details are never included. You can edit the result; later answer changes will not overwrite your edits.</p><button type="button" className="secondary summary-generator" onClick={() => { const generated = generatePublicSummary({ category: draft.category, affectedArea: draft.publicArea, happeningNow: draft.happeningNow, anyoneInjured: draft.anyoneInjured }); update('publicSummary', generated); setSummaryMessage(draft.publicSummary ? 'Summary regenerated from the current selected answers. Your previous summary was replaced because you selected Regenerate.' : 'Summary generated. Review and edit it before submission.') }}><FileText /> {draft.publicSummary ? 'Regenerate from current answers' : 'Generate from selected answers'}</button>{summaryMessage && <p className="geo-message" role="status">{summaryMessage}</p>}</> : <p className="field-help">Write a short public summary directly. Include only information you want everyone to see.</p>}<textarea id="public-summary" rows={4} value={draft.publicSummary} onChange={(event) => { update('publicSummary', event.target.value); setSummaryMessage('Public summary edited. It will not be changed unless you select Regenerate.') }} aria-invalid={!!errors.publicSummary} placeholder={draft.mode === 'guided' ? 'Generate a summary, then review or edit it here.' : 'Write only information that is appropriate to share publicly.'} />{errors.publicSummary && <ErrorText text={errors.publicSummary} />}</div>
          <div className="location-warning"><AlertTriangle /><span><b>The selected incident location and danger radius will be public.</b> AlertBridge never copies the private assistance location automatically.</span></div>
          <p className="location-explanation"><b>Use this if the incident is happening where you are.</b> Your browser will ask for location permission.</p>
          <button type="button" className="primary location-primary" onClick={usePublicLocation} disabled={publicLocating}><LocateFixed /> {publicLocating ? 'Finding public danger-zone location…' : draft.publicLatitude && draft.publicLongitude ? 'Use my current location again' : 'Use my current location'}</button>
          {publicGeoMessage && <p className="geo-message" role="status">{publicGeoMessage}</p>}
          <button type="button" className="secondary elsewhere-button" onClick={() => setPublicElsewhere((shown) => !shown)} aria-expanded={publicElsewhere}><MapPin /> Incident is somewhere else</button>
          {publicElsewhere && <PlaceSearch label="Find the public incident location" onSelect={(latitude, longitude) => { update('publicLatitude', latitude.toFixed(6)); update('publicLongitude', longitude.toFixed(6)) }} />}
          {(errors.publicLatitude || errors.publicLongitude) && <ErrorText text="Choose the current location, search for the public incident place, or use Advanced coordinates." />}
          <label className="radius-field">Public danger-zone radius (km) <b>*</b><input inputMode="decimal" value={draft.publicRadiusKm} onChange={(event) => update('publicRadiusKm', event.target.value)} aria-invalid={!!errors.publicRadiusKm} />{errors.publicRadiusKm && <ErrorText text={errors.publicRadiusKm} />}</label>
          <details className="advanced-location"><summary>Advanced: enter public coordinates manually</summary><div className="coordinate-grid"><label>Public latitude <b>*</b><input inputMode="decimal" value={draft.publicLatitude} onChange={(event) => update('publicLatitude', event.target.value)} aria-invalid={!!errors.publicLatitude} />{errors.publicLatitude && <ErrorText text={errors.publicLatitude} />}</label><label>Public longitude <b>*</b><input inputMode="decimal" value={draft.publicLongitude} onChange={(event) => update('publicLongitude', event.target.value)} aria-invalid={!!errors.publicLongitude} />{errors.publicLongitude && <ErrorText text={errors.publicLongitude} />}</label></div></details>
        </section>}
      </>}
    </div>
    <div className="form-actions"><button className="text-button" onClick={cancel}>Cancel</button><button className="primary" onClick={review}>Review report <ChevronRight /></button></div>
  </section>
}

function Choice({ selected, onClick, icon: Icon, title, note }: { selected: boolean; onClick: () => void; icon: typeof MapPin; title: string; note: string }) {
  return <button type="button" className={`choice ${selected ? 'selected' : ''}`} onClick={onClick} aria-pressed={selected}><span className="choice-icon"><Icon /></span><span><b>{title}</b><small>{note}</small></span>{selected && <Check className="choice-check" />}</button>
}
function ErrorText({ text }: { text: string }) { return <p className="error-text" role="alert"><XCircle /> {text}</p> }
function AnswerField({ title, value, error, onChange }: { title: string; value: string; error?: string; onChange: (v: Answer) => void }) {
  return <fieldset className={error ? 'answer-field has-error' : 'answer-field'}><legend>{title} <b>*</b></legend><div className="answer-buttons">{answers.map((answer) => <button type="button" key={answer} className={value === answer ? 'selected' : ''} onClick={() => onChange(answer)} aria-pressed={value === answer}>{answer}</button>)}</div>{error && <ErrorText text={error} />}</fieldset>
}

function Review({ submitting, submitError, draft, edit, submit }: { submitting: boolean; submitError: string; draft: Draft & { mode: Mode; category: Category }; edit: () => void; submit: () => void | Promise<void> }) {
  return <section className="page narrow"><button className="back-link" onClick={edit}><ArrowLeft /> Edit report</button><div className="page-heading"><span className="mini-label">FINAL CHECK</span><h1>Review your report</h1><p>Make sure these details are correct before submission.</p></div>
    <div className="review-card"><div className="review-header"><span className="category-icon">{draft.category}</span><span className="status-pill unverified">Unverified</span></div>
      <ReviewRow label="Reporting channel" value={draft.reportingChannel === 'both' ? 'Public community warning and private assistance request' : draft.reportingChannel === 'community' ? 'Public community warning' : 'Private emergency assistance request'} />
      <ReviewRow label="Reporting method" value={draft.mode === 'guided' ? 'Guided questions' : 'Written report'} />
      <ReviewRow label="What is happening" value={draft.description} />
      {draft.mode === 'guided' && <><ReviewRow label="Happening now" value={draft.happeningNow} /><ReviewRow label="Anyone injured" value={draft.anyoneInjured} /></>}
      {draft.additionalDetails && <ReviewRow label="Additional details" value={draft.additionalDetails} />}
      {draft.reportingChannel !== 'community' && <ReviewRow label="Private assistance location" value={`${Number(draft.latitude).toFixed(6)}, ${Number(draft.longitude).toFixed(6)}`} />}
      {draft.reportingChannel !== 'assistance' && <><ReviewRow label="Public affected area" value={draft.publicArea} /><ReviewRow label="Public summary" value={draft.publicSummary} /><ReviewRow label="Public danger-zone location" value={`${Number(draft.publicLatitude).toFixed(6)}, ${Number(draft.publicLongitude).toFixed(6)}`} /><ReviewRow label="Public expiry" value={formatDate(new Date(draft.publicExpiry).toISOString())} /><ReviewRow label="Public radius" value={`${draft.publicRadiusKm} km`} /></>}
    </div>
    <div className="submission-notice" role="note"><AlertTriangle /><span>{draft.reportingChannel === 'community' ? 'This warning will be public and labelled “Community report — unverified”. It is not sent to emergency services.' : draft.reportingChannel === 'both' ? 'The public warning and private assistance request will be created together. Emergency services are not automatically contacted.' : 'This is a private assistance request stored in AlertBridge. Emergency services are not automatically contacted.'}</span></div>
    {submitError && <p className="submission-error" role="alert"><XCircle /> {submitError} Your entries have been preserved.</p>}
    <div className="form-actions"><button className="secondary" onClick={edit} disabled={submitting}>Edit details</button><button className="primary" onClick={submit} disabled={submitting}><Check /> {submitting ? 'Submitting…' : 'Submit to AlertBridge'}</button></div>
  </section>
}
function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="review-row"><span>{label}</span><p>{value}</p></div> }

function Confirmation({ id, another, dashboard }: { id: string; another: () => void; dashboard: () => void }) {
  return <section className="page confirmation"><div className="success-icon"><Check /></div><span className="mini-label">SUBMITTED TO ALERTBRIDGE</span><h1>Your report has been submitted.</h1><p className="lead">AlertBridge storage accepted the report. Emergency services have not been notified.</p><div className="id-card"><span>REPORT ID</span><strong>{id}</strong><small>New reports begin as <b>Unverified</b>.</small></div><div className="confirmation-actions"><button className="primary" onClick={another}><AlertTriangle /> Report another incident</button><button className="secondary" onClick={dashboard}><ClipboardList /> View my reports</button></div></section>
}

function Dashboard({ responder, loading, error, reports, unreadCounts, open, refresh, openAlerts }: { responder: boolean; loading: boolean; error: string; reports: Report[]; unreadCounts: Record<string, number>; open: (id: string) => void; refresh: () => void; openAlerts: () => void }) {
  const counts = useMemo(() => ({ all: reports.length, unverified: reports.filter((r) => r.status === 'Unverified').length, active: reports.filter((r) => ['Under review', 'Verified'].includes(r.status)).length }), [reports])
  return <section className="page dashboard-page"><div className="dashboard-banner"><ShieldAlert /><div><b>{responder ? 'Authorised responder dashboard' : 'Your reports'}</b><span>{responder ? 'Access is enforced by database membership and row-level security. No emergency agency connection is claimed.' : 'Only reports submitted by your account are visible. This is not an emergency service.'}</span></div></div>
    <div className="dashboard-heading"><div><span className="mini-label">REPORT OVERVIEW</span><h1>{responder ? 'Incident reports' : 'Community reports'}</h1><p>{responder ? 'Authorised reports loaded from AlertBridge storage for responder review.' : 'Reports submitted by your account and loaded from AlertBridge storage.'}</p></div><button className="primary" onClick={refresh}><RefreshCw /> Refresh list</button></div>
    {responder && <div className="responder-public-tools"><div><b>Public community-post moderation</b><span>Open Community Alerts to find community posts, review their public content, and use responder-only verification or removal actions.</span></div><button className="secondary" onClick={openAlerts}><Megaphone /> Review public posts</button></div>}
    <div className="metrics"><div><span>All reports</span><strong>{counts.all}</strong></div><div><span>Needs review</span><strong>{counts.unverified}</strong></div><div><span>Active review</span><strong>{counts.active}</strong></div></div>
    {error && <p className="submission-error" role="alert"><XCircle /> {error}</p>}
    {loading ? <div className="empty-state"><ClipboardList /><h2>Loading reports…</h2></div> : reports.length === 0 ? <div className="empty-state"><ClipboardList /><h2>No reports yet</h2><p>Reports submitted through AlertBridge will appear here.</p></div> : <div className="report-list" role="list">
      {reports.map((report) => <button key={report.id} className="report-item" onClick={() => open(report.id)} role="listitem"><span className="report-category-icon"><CategoryIcon category={report.category} /></span><span className="report-main"><b>{report.category}</b><small>{formatDate(report.createdAt)}</small><span><MapPin /> {shortLocation(report)}</span>{Boolean(unreadCounts[report.id]) && <span className="unread-badge"><MessageCircle /> {unreadCounts[report.id]} unread</span>}</span><span className={`status-pill ${report.status.toLowerCase().replace(' ', '-')}`}>{report.status}</span><ChevronRight className="chevron" /></button>)}
    </div>}
    <p className="privacy-note"><ShieldAlert /> {responder ? 'Precise incident locations are restricted to authorised responder tools and are never exposed in the public feed.' : 'Your precise incident locations remain private and are never exposed in the public feed.'}</p>
  </section>
}

function ReportDetail({ canUpdate, currentUserId, report, back, updateStatus, conversationRead }: { canUpdate: boolean; currentUserId: string; report: Report; back: () => void; updateStatus: (id: string, s: Status, r: string) => void | Promise<void>; conversationRead: () => void }) {
  const [pending, setPending] = useState<Status | ''>('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const statuses: Status[] = ['Under review', 'Verified', 'Rejected', 'Resolved']
  async function apply() {
    if (!pending) return
    if (requiresStatusReason(pending, reason)) { setError(`A reason is required to mark this report ${pending.toLowerCase()}.`); return }
    setSaving(true)
    try { await updateStatus(report.id, pending, reason); setPending(''); setReason(''); setError('') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the status change.') }
    finally { setSaving(false) }
  }
  return <section className="page detail-page"><button className="back-link" onClick={back}><ArrowLeft /> All reports</button><div className="detail-heading"><div><span className="mini-label">REPORT {report.id}</span><h1>{report.category}</h1><p>Received {formatDate(report.createdAt)}</p></div><span className={`status-pill large ${report.status.toLowerCase().replace(' ', '-')}`}>{report.status}</span></div>
    <div className="detail-layout"><div className="detail-card"><h2>Incident details</h2><ReviewRow label="Description" value={report.description} />{report.happeningNow && <ReviewRow label="Happening now" value={report.happeningNow} />}{report.anyoneInjured && <ReviewRow label="Anyone injured" value={report.anyoneInjured} />}{report.additionalDetails && <ReviewRow label="Additional details" value={report.additionalDetails} />}<ReviewRow label="Precise incident location" value={shortLocation(report)} /><div className="privacy-inline"><ShieldAlert /> Keep precise location information inside authorized responder tools.</div></div>
      {canUpdate ? <aside className="status-card"><h2>Update status</h2><p>Changes use a transactional database function and are recorded in history.</p><div className="status-actions">{statuses.map((status) => <button key={status} className={pending === status ? 'selected' : ''} onClick={() => { setPending(status); setError('') }} aria-pressed={pending === status}>{status === 'Rejected' ? <X /> : <Check />} {status}</button>)}</div>{pending && <><label htmlFor="reason">Reason {(pending === 'Verified' || pending === 'Rejected') && <b>*</b>}</label><textarea id="reason" rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError('') }} placeholder={`Reason for ${pending.toLowerCase()}…`} />{error && <ErrorText text={error} />}<button className="primary full" onClick={apply} disabled={saving}>{saving ? 'Saving…' : 'Save status change'}</button></>}</aside> : <aside className="status-card"><h2>Status is read-only</h2><p>Your account can view this report and its history, but only authorised responders can change verification status.</p></aside>}
    </div>
    <div className="history-card"><h2>Status history</h2><ol>{[...report.history].reverse().map((event, index) => <li key={`${event.at}-${index}`}><span className="timeline-dot"></span><div><b>{event.status}</b><time>{formatDate(event.at)}</time>{event.reason && <p>Reason: {event.reason}</p>}</div></li>)}</ol></div>
    <AssistancePanel reportId={report.id} canRecord={canUpdate} />
    <ReportConversation reportId={report.id} currentUserId={currentUserId} onRead={conversationRead} />
    {canUpdate && <AlertPublisher report={report} />}
  </section>
}

function CategoryIcon({ category }: { category: Category }) { const Icon = categories.find((item) => item.name === category)?.icon ?? HelpCircle; return <Icon /> }

export default App
