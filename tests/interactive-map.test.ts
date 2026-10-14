import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mapUi = readFileSync(new URL('../src/InteractiveMap.tsx', import.meta.url), 'utf8')
const feedUi = readFileSync(new URL('../src/CommunityAlerts.tsx', import.meta.url), 'utf8')
const reportUi = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const selectorUi = readFileSync(new URL('../src/MapLocationSelector.tsx', import.meta.url), 'utf8')
const boundaryUi = readFileSync(new URL('../src/SectionErrorBoundary.tsx', import.meta.url), 'utf8')
const mainUi = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')

test('danger map uses only public alert fields and identifies verification without colour alone', () => {
  assert.match(feedUi, /alerts=\{mappedAlerts\}/)
  assert.match(feedUi, /Responder-verified/)
  assert.match(feedUi, /Community report — unverified/)
  assert.match(mapUi, /alert\.dangerLatitude/)
  assert.match(mapUi, /alert\.dangerRadiusKm/)
  assert.match(mapUi, /radius: alert\.dangerRadiusKm \* 1000/)
  assert.match(mapUi, /alert\.verified \? 'V' : 'U'/)
  assert.doesNotMatch(mapUi, /incident_reports|report_messages|reporter|sourceReportId|private/i)
})

test('maps are lazy loaded and retain non-map fallbacks', () => {
  assert.match(feedUi, /lazy\(\(\) => import\('\.\/InteractiveMap'\)\)/)
  assert.match(selectorUi, /lazy\(\(\) => import\('\.\/InteractiveMap'\)\)/)
  assert.match(feedUi, /SectionErrorBoundary[\s\S]*alert list below is still available/i)
  assert.match(selectorUi, /SectionErrorBoundary[\s\S]*Advanced coordinates instead/i)
  assert.match(boundaryUi, /getDerivedStateFromError[\s\S]*componentDidCatch/)
  assert.match(mainUi, /AlertBridge could not display this page[\s\S]*Reload AlertBridge/)
  assert.match(mapUi, /Interactive map is currently unavailable/)
  assert.match(feedUi, /No alerts match these filters/)
  assert.match(feedUi, /setInterval\(\(\) => setClock\(Date\.now\(\)\), 30000\)/)
})

test('Leaflet uses only explicitly configured Stadia tiles with linked attribution', () => {
  assert.match(mapUi, /VITE_STADIA_TILE_URL/)
  assert.match(mapUi, /stadiamaps\.com\/attribution/)
  assert.match(mapUi, /openstreetmap\.org\/copyright/)
  assert.doesNotMatch(mapUi, /tile\.openstreetmap\.org|Mapbox|mapbox/)
})

test('reporting keeps private and public map selections separate and confirmed', () => {
  assert.match(reportUi, /Pin the private incident location/)
  assert.match(reportUi, /Pin the public danger-zone location/)
  assert.match(selectorUi, /Confirm location/)
  assert.match(selectorUi, /This confirmed danger-zone location will be public/)
  assert.match(selectorUi, /private assistance report/)
})

test('destination selection is a destination-area check rather than route guidance', () => {
  assert.match(feedUi, /Pin a destination/)
  assert.match(feedUi, /does not inspect the journey or provide route avoidance/)
  assert.match(feedUi, /checkDestinationAt\(latitude, longitude\)/)
})
