interface DatabaseErrorLike { code?: unknown; message?: unknown; details?: unknown }

export function reportingErrorMessage(error: unknown): string {
  const databaseError = error as DatabaseErrorLike
  if (databaseError?.code === 'P0001' && String(databaseError.message).startsWith('Submission limit reached.')) {
    try {
      const details = JSON.parse(String(databaseError.details)) as { retry_after?: unknown }
      const retryAt = new Date(String(details.retry_after))
      if (!Number.isNaN(retryAt.getTime())) return `Submission limit reached. Try again after ${retryAt.toLocaleString()}.`
    } catch { /* Fall through to the database message. */ }
  }
  if (typeof databaseError?.message === 'string' && databaseError.message.trim()) return databaseError.message
  return 'The report could not be submitted. Your entries are still here; please retry.'
}

export function messageErrorText(error: unknown): string {
  const databaseError = error as DatabaseErrorLike
  if (databaseError?.code === 'P0001' && String(databaseError.message).startsWith('Message limit reached.')) {
    try {
      const details = JSON.parse(String(databaseError.details)) as { retry_after?: unknown }
      const retryAt = new Date(String(details.retry_after))
      if (!Number.isNaN(retryAt.getTime())) return `Message limit reached. Try again after ${retryAt.toLocaleString()}.`
    } catch { /* Use the database message below. */ }
  }
  return typeof databaseError?.message === 'string' && databaseError.message.trim() ? databaseError.message : 'Message could not be sent. Your draft is still here.'
}
