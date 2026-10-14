import { useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, KeyRound, LogIn, Mail, UserPlus } from 'lucide-react'
import { supabase } from './supabase'
import { useI18n } from './i18n'
import { LocalizedError, technicalMessage } from './LocalizedError'

type AuthView = 'signin' | 'signup' | 'forgot' | 'recovery'

export function AuthPanel({ back, recovery = false }: { back: () => void; recovery?: boolean }) {
  const { t } = useI18n()
  const [view, setView] = useState<AuthView>(recovery ? 'recovery' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [technicalError, setTechnicalError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setLoading(true); setError(''); setTechnicalError(''); setMessage('')
    try {
      if (view === 'signin') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError) throw authError
      } else if (view === 'signup') {
        if (!displayName.trim()) throw new Error('Enter a display name.')
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: displayName.trim() }, emailRedirectTo: window.location.origin },
        })
        if (authError) throw authError
        setMessage(data.session ? 'Account created and signed in.' : 'Check your email to verify your account, then sign in.')
      } else if (view === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
        if (resetError) throw resetError
        setMessage('If an account exists for that address, a password-reset email has been sent.')
      } else {
        if (password.length < 8) throw new Error('Use at least 8 characters for the new password.')
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        setMessage('Password updated. You can continue using AlertBridge.')
        setView('signin')
      }
    } catch (caught) {
      setError(t('error.authTechnical', 'We could not complete the account request. Check your details and try again.'))
      setTechnicalError(technicalMessage(caught))
    } finally { setLoading(false) }
  }

  return <section className="page auth-page">
    <button className="back-link" onClick={back}><ArrowLeft /> Back</button>
    <div className="auth-card">
      <span className="mini-label">ALERTBRIDGE ACCOUNT</span>
      <h1>{view === 'signin' ? t('auth.signIn', 'Sign in') : view === 'signup' ? t('auth.create', 'Create an account') : view === 'forgot' ? t('auth.reset', 'Reset your password') : t('auth.newPassword', 'Choose a new password')}</h1>
      <p>{t('auth.notice', 'Your account stores reports in AlertBridge. This does not notify emergency services.')}</p>
      <form onSubmit={submit}>
        {view === 'signup' && <label>{t('auth.name', 'Display name')} <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={80} autoComplete="name" /></label>}
        {view !== 'recovery' && <label>{t('auth.email', 'Email address')} <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>}
        {view !== 'forgot' && <label>{view === 'recovery' ? t('auth.newPassword', 'New password') : t('auth.password', 'Password')} <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={view === 'signin' ? 'current-password' : 'new-password'} /></label>}
        {error && <LocalizedError message={error} technical={technicalError} />}
        {message && <p className="auth-message" role="status">{message}</p>}
        <button className="primary full" disabled={loading}>{loading ? t('auth.wait', 'Please wait…') : view === 'signin' ? <><LogIn /> {t('auth.signIn', 'Sign in')}</> : view === 'signup' ? <><UserPlus /> {t('auth.create', 'Create account')}</> : view === 'forgot' ? <><Mail /> {t('auth.sendReset', 'Send reset email')}</> : <><KeyRound /> {t('auth.updatePassword', 'Update password')}</>}</button>
      </form>
      {!recovery && <div className="auth-links">
        {view !== 'signin' && <button onClick={() => { setView('signin'); setError(''); setMessage('') }}>{t('auth.existing', 'I already have an account')}</button>}
        {view !== 'signup' && <button onClick={() => { setView('signup'); setError(''); setMessage('') }}>{t('auth.create', 'Create an account')}</button>}
        {view !== 'forgot' && <button onClick={() => { setView('forgot'); setError(''); setMessage('') }}>{t('auth.forgot', 'Forgot password?')}</button>}
      </div>}
    </div>
  </section>
}

export function AccountPanel({ session, back, onSaved }: { session: Session; back: () => void; onSaved: (name: string) => Promise<void> }) {
  const { t } = useI18n()
  const [name, setName] = useState(String(session.user.user_metadata.display_name ?? ''))
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [technicalError, setTechnicalError] = useState('')
  return <section className="page auth-page"><button className="back-link" onClick={back}><ArrowLeft /> {t('common.back', 'Back')}</button><div className="auth-card">
    <span className="mini-label">ALERTBRIDGE</span><h1>{t('nav.account', 'Your account')}</h1><p>{session.user.email}</p>
    <form onSubmit={async (event) => { event.preventDefault(); setLoading(true); setError(''); setTechnicalError(''); try { await onSaved(name); setMessage(t('auth.nameUpdated', 'Display name updated.')) } catch (caught) { setError(t('error.authTechnical', 'We could not complete the account request. Check your details and try again.')); setTechnicalError(technicalMessage(caught)) } finally { setLoading(false) } }}>
      <label>{t('auth.name', 'Display name')} <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>
      {error && <LocalizedError message={error} technical={technicalError} />}{message && <p className="auth-message" role="status">{message}</p>}
      <button className="primary full" disabled={loading}>{loading ? t('common.saving', 'Saving…') : t('auth.saveName', 'Save display name')}</button>
    </form>
  </div></section>
}
