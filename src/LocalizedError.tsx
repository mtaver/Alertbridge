import { useI18n } from './i18n'

export function technicalMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message
  return error instanceof Error ? error.message : String(error ?? '')
}

export function LocalizedError({ message, technical }: { message: string; technical?: string }) {
  const { t } = useI18n()
  return <div className="error-text" role="alert"><p>{message}</p>{technical && technical !== message && <details><summary>{t('error.technical', 'Technical details')}</summary><code>{technical}</code></details>}</div>
}
