import { lazy, Suspense, useEffect, useState } from 'react'
import { Check, MapPin } from 'lucide-react'
import { PlaceSearch } from './PlaceSearch'
import { SectionErrorBoundary } from './SectionErrorBoundary'

const InteractiveMap = lazy(() => import('./InteractiveMap'))

interface Point { latitude: number; longitude: number }

function usablePoint(point?: Point | null): Point | null {
  return point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180 ? point : null
}

export function MapLocationSelector({ label, initial, publicLocation = false, onConfirm }: { label: string; initial?: Point | null; publicLocation?: boolean; onConfirm: (latitude: number, longitude: number, name?: string) => void }) {
  const [candidate, setCandidate] = useState<Point | null>(usablePoint(initial))
  const [candidateName, setCandidateName] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { setCandidate(usablePoint(initial)) }, [initial?.latitude, initial?.longitude])
  return <div className="map-location-selector">
    <PlaceSearch />
    <SectionErrorBoundary fallback={<p className="submission-error" role="alert">The interactive map could not be loaded. Use Advanced coordinates instead.</p>}>
      <Suspense fallback={<p className="map-loading" role="status">Loading map…</p>}><InteractiveMap ariaLabel={`${label} map`} selection={candidate} onSelectLocation={(point) => { setCandidate(point); setCandidateName('Map pin'); setMessage('Review the map pin, then confirm it.') }} /></Suspense>
    </SectionErrorBoundary>
    {candidate && <div className="location-review" role="status"><MapPin /><div><b>{candidateName || 'Selected location'}</b><span>{candidate.latitude.toFixed(6)}, {candidate.longitude.toFixed(6)}</span><small>{publicLocation ? 'This confirmed danger-zone location will be public.' : 'This confirmed location stays with the private assistance report.'}</small></div><button type="button" className="secondary" onClick={() => { onConfirm(candidate.latitude, candidate.longitude, candidateName); setMessage('Selected location confirmed.') }}><Check /> Confirm location</button></div>}
    {message && <p className="geo-message" role="status">{message}</p>}
  </div>
}
