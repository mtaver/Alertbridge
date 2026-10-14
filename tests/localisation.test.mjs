import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const i18n = readFileSync(new URL('../src/i18n.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const summary = readFileSync(new URL('../src/publicSummary.ts', import.meta.url), 'utf8')
const localisedError = readFileSync(new URL('../src/LocalizedError.tsx', import.meta.url), 'utf8')

test('language selection persists, updates document language and retains English fallback', () => {
  assert.match(i18n, /localStorage\.getItem\(STORAGE_KEY\)/)
  assert.match(i18n, /localStorage\.setItem\(STORAGE_KEY, language\)/)
  assert.match(i18n, /document\.documentElement\.lang = language/)
  assert.match(i18n, /ha\[key\] \?\? fallback/)
  assert.match(i18n, /Hausa — draft/)
  assert.match(i18n, /fluent-speaker review is pending/)
})

test('language switching does not reset report state or silently overwrite summaries', () => {
  assert.match(app, /<LanguageSelector/)
  assert.doesNotMatch(i18n, /setDraft|publicSummary/)
  assert.match(app, /generatePublicSummary\([^;]+, language\)/)
})

test('Hausa generated summaries use explicit answers and complete templates', () => {
  assert.match(summary, /language === 'ha'/)
  assert.match(summary, /An kai rahoton ambaliya/)
  assert.match(summary, /Ba a san ko wani ya ji rauni ba/)
})

test('stable validation messages have Hausa drafts and raw provider errors are secondary details', () => {
  assert.match(i18n, /'Choose how you want to report\.': 'Zaɓi yadda kake son kai rahoto\.'/)
  assert.match(i18n, /'Latitude must be between −90 and 90\.':/)
  assert.match(i18n, /'Messages must be 2000 characters or fewer\.':/)
  assert.match(localisedError, /Technical details/)
  assert.match(localisedError, /technical && technical !== message/)
  assert.match(localisedError, /<code>\{technical\}<\/code>/)
})
