import type { Report } from './types'
import { parseStoredReports } from './validation'

const STORAGE_KEY = 'alertbridge-demo-reports-v1'

export function loadReports(): Report[] {
  try { return parseStoredReports(localStorage.getItem(STORAGE_KEY)) }
  catch { return [] }
}

export function saveReports(reports: Report[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports))
}
