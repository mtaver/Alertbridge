import { useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronRight, ClipboardList,
  FileText, Flame, HelpCircle, Home as HomeIcon, LocateFixed, MapPin,
  Menu, Mountain, ShieldAlert, Waves, X, XCircle,
} from 'lucide-react'
import { loadReports, saveReports } from './storage'
import type { Answer, Category, Draft, Mode, Report, Status } from './types'
import { requiresStatusReason, validateDraft as getDraftErrors } from './validation'

type Screen = 'home' | 'report' | 'review' | 'confirmation' | 'dashboard' | 'detail'

const categories: { name: Category; icon: typeof ShieldAlert; note: string }[] = [
  { name: 'Security threat', icon: ShieldAlert, note: 'Violence, danger or suspicious activity' },
  { name: 'Flood', icon: Waves, note: 'Rising water or flooded areas' },
  { name: 'Landslide', icon: Mountain, note: 'Moving earth, rock or mud' },
  { name: 'Fire', icon: Flame, note: 'Fire, smoke or burning' },
  { name: 'Other', icon: HelpCircle, note: 'Another community hazard' },
]
const answers: Answer[] = ['Yes', 'No', 'Not sure']
const blankDraft: Draft = { mode: '', category: '', description: '', happeningNow: '', anyoneInjured: '', additionalDetails: '', latitude: '', longitude: '' }

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function shortLocation(report: Report) {
  return `${report.location.latitude.toFixed(4)}, ${report.location.longitude.toFixed(4)}`
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [reports, setReports] = useState<Report[]>(loadReports)
  const [selectedId, setSelectedId] = useState<string>('')
  const [submittedId, setSubmittedId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [geoMessage, setGeoMessage] = useState('')
  const [locating, setLocating] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const selectedReport = reports.find((report) => report.id === selectedId)
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
    setDraft(blankDraft)
    setErrors({})
    setGeoMessage('')
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

  function submitReport() {
    if (!draft.mode || !draft.category) return
    const now = new Date().toISOString()
    const id = `AB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const report: Report = {
      id, createdAt: now, mode: draft.mode, category: draft.category,
      description: draft.description.trim(),
      ...(draft.mode === 'guided' ? { happeningNow: draft.happeningNow as Answer, anyoneInjured: draft.anyoneInjured as Answer } : {}),
      additionalDetails: draft.additionalDetails.trim() || undefined,
      location: { latitude: Number(draft.latitude), longitude: Number(draft.longitude) },
      status: 'Unverified', history: [{ status: 'Unverified', at: now }],
    }
    const next = [report, ...reports]
    setReports(next)
    saveReports(next)
    setSubmittedId(id)
    navigate('confirmation')
  }

  function changeStatus(id: string, status: Status, reason: string) {
    const next = reports.map((report) => report.id === id ? {
      ...report, status, history: [...report.history, { status, at: new Date().toISOString(), reason: reason.trim() || undefined }],
    } : report)
    setReports(next)
    saveReports(next)
  }

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
          <button onClick={startReport}><AlertTriangle size={18} /> Report incident</button>
          <button className={screen === 'dashboard' || screen === 'detail' ? 'active' : ''} onClick={() => navigate('dashboard')}><ClipboardList size={18} /> Responder demo</button>
        </nav>
      </header>

      <main>
        {screen === 'home' && <Home startReport={startReport} openDashboard={() => navigate('dashboard')} reportCount={reports.length} />}
        {screen === 'report' && <ReportForm draft={draft} errors={errors} update={updateDraft} useLocation={useLocation} locating={locating} geoMessage={geoMessage} cancel={() => navigate('home')} review={() => validateDraft() && navigate('review')} />}
        {screen === 'review' && <Review draft={draft as Draft & { mode: Mode; category: Category }} edit={() => navigate('report')} submit={submitReport} />}
        {screen === 'confirmation' && <Confirmation id={submittedId} another={startReport} dashboard={() => navigate('dashboard')} />}
        {screen === 'dashboard' && <Dashboard reports={reports} open={(id) => { setSelectedId(id); navigate('detail') }} />}
        {screen === 'detail' && selectedReport && <ReportDetail report={selectedReport} back={() => navigate('dashboard')} updateStatus={changeStatus} />}
      </main>
      <footer><span className="footer-brand"><ShieldAlert size={18} /> AlertBridge</span><span>Demonstration prototype · Local browser storage only</span></footer>
    </div>
  )
}

function Home({ startReport, openDashboard, reportCount }: { startReport: () => void; openDashboard: () => void; reportCount: number }) {
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
    <section className="demo-notice" role="note"><AlertTriangle size={25} /><div><b>Demonstration prototype</b><span>Reports are not sent to emergency services.</span></div></section>
    <section className="how-section">
      <div><div className="eyebrow"><span></span> SIMPLE BY DESIGN</div><h2>Share what you know.<br />We’ll guide the rest.</h2></div>
      <div className="steps">
        <article><span className="step-number">01</span><FileText /><h3>Tell us what happened</h3><p>Answer simple questions or write it in your own words.</p></article>
        <article><span className="step-number">02</span><MapPin /><h3>Add the location</h3><p>Use your location only when the incident is where you are, or enter coordinates.</p></article>
        <article><span className="step-number">03</span><CheckCircle2 /><h3>Review and save</h3><p>Check every detail. Demo reports remain in this browser.</p></article>
      </div>
    </section>
    <section className="responder-callout"><div><span className="mini-label">SIMULATED RESPONDER VIEW</span><h2>See how reports are reviewed</h2><p>This demonstration has no real access control and does not connect to an agency.</p></div><button className="secondary" onClick={openDashboard}><ClipboardList /> Open dashboard {reportCount > 0 && <span className="count">{reportCount}</span>}</button></section>
  </>
}

function ReportForm({ draft, errors, update, useLocation, locating, geoMessage, cancel, review }: { draft: Draft; errors: Record<string, string>; update: (f: keyof Draft, v: string) => void; useLocation: () => void; locating: boolean; geoMessage: string; cancel: () => void; review: () => void }) {
  return <section className="page narrow">
    <button className="back-link" onClick={cancel}><ArrowLeft /> Back to home</button>
    <DemoBanner />
    <div className="page-heading"><span className="mini-label">NEW INCIDENT REPORT</span><h1>What would you like to report?</h1><p>Choose the way that feels easiest. Required fields are marked <b>*</b>.</p></div>
    <div className="form-card">
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
        <div className="location-section">
          <div className="location-title"><span className="icon-box"><MapPin /></span><div><h2>Where is the incident? <b>*</b></h2><p>Location is required for every report.</p></div></div>
          <div className="location-warning"><AlertTriangle /><span><b>Only use “Use my location” if the incident is where you are now.</b> Otherwise, enter the incident coordinates manually.</span></div>
          <button type="button" className="location-button" onClick={useLocation} disabled={locating}><LocateFixed /> {locating ? 'Finding your location…' : 'Use my location'}</button>
          {geoMessage && <p className="geo-message" role="status">{geoMessage}</p>}
          <div className="coordinate-grid">
            <label>Latitude <b>*</b><input inputMode="decimal" value={draft.latitude} onChange={(e) => update('latitude', e.target.value)} placeholder="e.g. 6.5244" aria-invalid={!!errors.latitude} />{errors.latitude && <ErrorText text={errors.latitude} />}</label>
            <label>Longitude <b>*</b><input inputMode="decimal" value={draft.longitude} onChange={(e) => update('longitude', e.target.value)} placeholder="e.g. 3.3792" aria-invalid={!!errors.longitude} />{errors.longitude && <ErrorText text={errors.longitude} />}</label>
          </div>
        </div>
        {draft.mode === 'guided' && <div className="field-section"><label htmlFor="details">Additional details <span>(optional)</span></label><textarea id="details" rows={3} value={draft.additionalDetails} onChange={(e) => update('additionalDetails', e.target.value)} placeholder="Anything else that may help…" /></div>}
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

function Review({ draft, edit, submit }: { draft: Draft & { mode: Mode; category: Category }; edit: () => void; submit: () => void }) {
  return <section className="page narrow"><button className="back-link" onClick={edit}><ArrowLeft /> Edit report</button><div className="page-heading"><span className="mini-label">FINAL CHECK</span><h1>Review your report</h1><p>Make sure these details are correct before saving this demo report.</p></div>
    <div className="review-card"><div className="review-header"><span className="category-icon">{draft.category}</span><span className="status-pill unverified">Unverified</span></div>
      <ReviewRow label="Reporting method" value={draft.mode === 'guided' ? 'Guided questions' : 'Written report'} />
      <ReviewRow label="What is happening" value={draft.description} />
      {draft.mode === 'guided' && <><ReviewRow label="Happening now" value={draft.happeningNow} /><ReviewRow label="Anyone injured" value={draft.anyoneInjured} /></>}
      {draft.additionalDetails && <ReviewRow label="Additional details" value={draft.additionalDetails} />}
      <ReviewRow label="Incident location" value={`${Number(draft.latitude).toFixed(6)}, ${Number(draft.longitude).toFixed(6)}`} />
    </div>
    <div className="demo-notice compact" role="note"><AlertTriangle /><div><b>This saves only to your browser</b><span>It will not be sent to emergency services or an agency.</span></div></div>
    <div className="form-actions"><button className="secondary" onClick={edit}>Edit details</button><button className="primary" onClick={submit}><Check /> Save demo report</button></div>
  </section>
}
function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="review-row"><span>{label}</span><p>{value}</p></div> }

function Confirmation({ id, another, dashboard }: { id: string; another: () => void; dashboard: () => void }) {
  return <section className="page confirmation"><div className="success-icon"><Check /></div><span className="mini-label">SAVED IN THIS DEMO</span><h1>Your report has been saved.</h1><p className="lead">It is stored only in this browser and has not been delivered to an emergency service.</p><div className="id-card"><span>REPORT ID</span><strong>{id}</strong><small>New reports begin as <b>Unverified</b>.</small></div><div className="confirmation-actions"><button className="primary" onClick={another}><AlertTriangle /> Report another incident</button><button className="secondary" onClick={dashboard}><ClipboardList /> View responder demo</button></div></section>
}

function Dashboard({ reports, open }: { reports: Report[]; open: (id: string) => void }) {
  const counts = useMemo(() => ({ all: reports.length, unverified: reports.filter((r) => r.status === 'Unverified').length, active: reports.filter((r) => ['Under review', 'Verified'].includes(r.status)).length }), [reports])
  return <section className="page dashboard-page"><div className="dashboard-banner"><ShieldAlert /><div><b>Simulated responder dashboard</b><span>This demo has no real access control and is not connected to any agency.</span></div></div>
    <div className="dashboard-heading"><div><span className="mini-label">REPORT OVERVIEW</span><h1>Community reports</h1><p>Demo reports saved in this browser.</p></div><button className="primary" onClick={() => window.location.reload()}><ClipboardList /> Refresh list</button></div>
    <div className="metrics"><div><span>All reports</span><strong>{counts.all}</strong></div><div><span>Needs review</span><strong>{counts.unverified}</strong></div><div><span>Active review</span><strong>{counts.active}</strong></div></div>
    {reports.length === 0 ? <div className="empty-state"><ClipboardList /><h2>No demo reports yet</h2><p>Reports saved through this prototype will appear here.</p></div> : <div className="report-list" role="list">
      {reports.map((report) => <button key={report.id} className="report-item" onClick={() => open(report.id)} role="listitem"><span className="report-category-icon"><CategoryIcon category={report.category} /></span><span className="report-main"><b>{report.category}</b><small>{formatDate(report.createdAt)}</small><span><MapPin /> {shortLocation(report)}</span></span><span className={`status-pill ${report.status.toLowerCase().replace(' ', '-')}`}>{report.status}</span><ChevronRight className="chevron" /></button>)}
    </div>}
    <p className="privacy-note"><ShieldAlert /> Precise locations are shown only in this simulated responder view, never in a public feed.</p>
  </section>
}

function ReportDetail({ report, back, updateStatus }: { report: Report; back: () => void; updateStatus: (id: string, s: Status, r: string) => void }) {
  const [pending, setPending] = useState<Status | ''>('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const statuses: Status[] = ['Under review', 'Verified', 'Rejected', 'Resolved']
  function apply() {
    if (!pending) return
    if (requiresStatusReason(pending, reason)) { setError(`A reason is required to mark this report ${pending.toLowerCase()}.`); return }
    updateStatus(report.id, pending, reason); setPending(''); setReason(''); setError('')
  }
  return <section className="page detail-page"><button className="back-link" onClick={back}><ArrowLeft /> All reports</button><DemoBanner /><div className="detail-heading"><div><span className="mini-label">REPORT {report.id}</span><h1>{report.category}</h1><p>Received {formatDate(report.createdAt)}</p></div><span className={`status-pill large ${report.status.toLowerCase().replace(' ', '-')}`}>{report.status}</span></div>
    <div className="detail-layout"><div className="detail-card"><h2>Incident details</h2><ReviewRow label="Description" value={report.description} />{report.happeningNow && <ReviewRow label="Happening now" value={report.happeningNow} />}{report.anyoneInjured && <ReviewRow label="Anyone injured" value={report.anyoneInjured} />}{report.additionalDetails && <ReviewRow label="Additional details" value={report.additionalDetails} />}<ReviewRow label="Precise incident location" value={shortLocation(report)} /><div className="privacy-inline"><ShieldAlert /> Keep precise location information inside authorized responder tools.</div></div>
      <aside className="status-card"><h2>Update status</h2><p>This changes only the locally saved demo.</p><div className="status-actions">{statuses.map((status) => <button key={status} className={pending === status ? 'selected' : ''} onClick={() => { setPending(status); setError('') }} aria-pressed={pending === status}>{status === 'Rejected' ? <X /> : <Check />} {status}</button>)}</div>{pending && <><label htmlFor="reason">Reason {(pending === 'Verified' || pending === 'Rejected') && <b>*</b>}</label><textarea id="reason" rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError('') }} placeholder={`Reason for ${pending.toLowerCase()}…`} />{error && <ErrorText text={error} />}<button className="primary full" onClick={apply}>Save status change</button></>}</aside>
    </div>
    <div className="history-card"><h2>Status history</h2><ol>{[...report.history].reverse().map((event, index) => <li key={`${event.at}-${index}`}><span className="timeline-dot"></span><div><b>{event.status}</b><time>{formatDate(event.at)}</time>{event.reason && <p>Reason: {event.reason}</p>}</div></li>)}</ol></div>
  </section>
}

function CategoryIcon({ category }: { category: Category }) { const Icon = categories.find((item) => item.name === category)?.icon ?? HelpCircle; return <Icon /> }

function DemoBanner() {
  return <div className="dashboard-banner compact-banner" role="note"><AlertTriangle /><div><b>Demonstration prototype</b><span>Nothing entered here is sent to emergency services or an agency.</span></div></div>
}

export default App
