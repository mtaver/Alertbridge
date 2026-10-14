import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SectionErrorBoundary } from './SectionErrorBoundary'
import { I18nProvider } from './i18n'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider><SectionErrorBoundary fallback={<main className="page narrow"><section className="auth-card" role="alert"><h1>AlertBridge could not display this page.</h1><p>Your information has not been submitted. Reload the page and try again. If the problem continues, use the non-map controls or return later.</p><button className="primary" onClick={() => window.location.reload()}>Reload AlertBridge</button></section></main>}><App /></SectionErrorBoundary></I18nProvider>
  </StrictMode>,
)
