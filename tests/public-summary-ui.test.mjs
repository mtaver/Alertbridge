import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const generator = readFileSync(new URL('../src/publicSummary.ts', import.meta.url), 'utf8')

test('guided public summaries are visible, editable and regenerated only by an explicit action', () => {
  assert.match(app, /Generate from selected answers/)
  assert.match(app, /Regenerate from current answers/)
  assert.match(app, /later answer changes will not overwrite your edits/)
  assert.match(app, /<textarea id="public-summary"[\s\S]*value=\{draft\.publicSummary\}/)
  assert.doesNotMatch(app, /useEffect\([\s\S]{0,300}generatePublicSummary/)
})

test('template generator has no private-field vocabulary or AI dependency', () => {
  assert.doesNotMatch(generator, /description|additionalDetails|email|reporter_id|supabase|fetch\(|OpenAI|AI service/i)
  assert.match(generator, /categorySentences/)
})
