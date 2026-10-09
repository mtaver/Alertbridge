import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const feed = readFileSync(new URL('../src/CommunityAlerts.tsx', import.meta.url), 'utf8')
const placeSearch = readFileSync(new URL('../src/PlaceSearch.tsx', import.meta.url), 'utf8')

test('reporting makes GPS primary and keeps manual coordinates advanced', () => {
  assert.match(app, /Use my current location/)
  assert.match(app, /Use this if the incident is happening where you are/)
  assert.match(app, /Incident is somewhere else/)
  assert.match(app, /Advanced: enter coordinates manually/)
  assert.match(app, /Advanced: enter public coordinates manually/)
})

test('place search is optional, explicit, and does not receive device coordinates', () => {
  assert.match(placeSearch, /VITE_MAPBOX_ACCESS_TOKEN/)
  assert.match(placeSearch, /api\.mapbox\.com\/search\/geocode\/v6\/forward/)
  assert.match(placeSearch, /only after you select Search/)
  assert.match(placeSearch, /Place search is currently unavailable\./)
  assert.doesNotMatch(placeSearch, /provider-note|requires a public, URL-restricted/)
  assert.doesNotMatch(placeSearch, /geolocation|watchPosition|getCurrentPosition/)
})

test('nearby warnings use one explicit location control and destination does not use current GPS', () => {
  assert.match(feed, /Enable nearby warnings/)
  assert.match(feed, /Your current GPS location is not used as the destination/)
  assert.match(feed, /Search for a destination/)
  assert.match(feed, /Advanced: enter destination coordinates manually/)
})
