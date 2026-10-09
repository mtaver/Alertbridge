import { useState } from 'react'
import { MapPin, Search } from 'lucide-react'

const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN?.trim()

interface SearchResult { id: string; name: string; latitude: number; longitude: number }
interface MapboxFeature { id?: string; geometry?: { coordinates?: unknown }; properties?: { full_address?: string; name?: string; place_formatted?: string } }

export function parseMapboxFeatures(value: unknown): SearchResult[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { features?: unknown }).features)) return []
  return ((value as { features: MapboxFeature[] }).features).flatMap((feature, index) => {
    const coordinates = feature.geometry?.coordinates
    if (!Array.isArray(coordinates) || coordinates.length < 2 || typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') return []
    const name = feature.properties?.full_address ?? [feature.properties?.name, feature.properties?.place_formatted].filter(Boolean).join(', ')
    if (!name) return []
    return [{ id: feature.id ?? `${coordinates[0]}-${coordinates[1]}-${index}`, name, longitude: coordinates[0], latitude: coordinates[1] }]
  })
}

export function PlaceSearch({ label, onSelect }: { label: string; onSelect: (latitude: number, longitude: number, name: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [message, setMessage] = useState('')
  const [searching, setSearching] = useState(false)
  async function search() {
    if (!mapboxToken) { setMessage('Place search is not configured. Use Advanced coordinates below.'); return }
    if (!query.trim()) { setMessage('Enter a place, landmark or address.'); return }
    setSearching(true); setMessage('')
    try {
      const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
      url.searchParams.set('q', query.trim()); url.searchParams.set('limit', '5'); url.searchParams.set('access_token', mapboxToken)
      const response = await fetch(url)
      if (!response.ok) throw new Error('Place search is temporarily unavailable.')
      const next = parseMapboxFeatures(await response.json())
      setResults(next); if (!next.length) setMessage('No matching places were found. Try another search or use Advanced coordinates.')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Place search failed. Use Advanced coordinates or retry.') }
    finally { setSearching(false) }
  }
  if (!mapboxToken) return <div className="place-search"><p role="status">Place search is currently unavailable.</p></div>
  return <div className="place-search"><label>{label}<span>Search text is sent to the place-search provider only after you select Search.</span><div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Place, landmark or address" /><button type="button" className="secondary" onClick={() => void search()} disabled={searching}><Search /> {searching ? 'Searching…' : 'Search'}</button></div></label>{message && <p role="status">{message}</p>}{results.length > 0 && <ul>{results.map((result) => <li key={result.id}><button type="button" onClick={() => { onSelect(result.latitude, result.longitude, result.name); setMessage(`${result.name} selected.`); setResults([]) }}><MapPin /><span>{result.name}</span></button></li>)}</ul>}</div>
}
