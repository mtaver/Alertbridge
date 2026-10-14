import { useEffect, useRef, useState } from 'react'
import L, { type Circle, type LayerGroup, type Map as LeafletMap, type Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CommunityAlert } from './types'

const stadiaTileUrl = import.meta.env.VITE_STADIA_TILE_URL?.trim()
const tileAttribution = '&copy; <a href="https://stadiamaps.com/attribution/" target="_blank" rel="noreferrer">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

type Point = { latitude: number; longitude: number }

interface DangerMapProps {
  alerts?: CommunityAlert[]
  selectedAlertId?: string | null
  onSelectAlert?: (alertId: string) => void
  selection?: Point | null
  onSelectLocation?: (point: Point) => void
  ariaLabel: string
}

function initialCenter(alerts: CommunityAlert[], selection?: Point | null): [number, number] {
  if (selection) return [selection.latitude, selection.longitude]
  const alert = alerts.find((item) => item.dangerLatitude !== undefined && item.dangerLongitude !== undefined)
  return alert?.dangerLatitude !== undefined && alert.dangerLongitude !== undefined
    ? [alert.dangerLatitude, alert.dangerLongitude]
    : [9.082, 8.6753]
}

export default function InteractiveMap({ alerts = [], selectedAlertId, onSelectAlert, selection, onSelectLocation, ariaLabel }: DangerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const zonesRef = useRef<LayerGroup | null>(null)
  const selectionMarker = useRef<Marker | null>(null)
  const selectAlertRef = useRef(onSelectAlert)
  const selectLocationRef = useRef(onSelectLocation)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { selectAlertRef.current = onSelectAlert }, [onSelectAlert])
  useEffect(() => { selectLocationRef.current = onSelectLocation }, [onSelectLocation])

  useEffect(() => {
    if (!stadiaTileUrl || !containerRef.current || mapRef.current) return
    try {
      const center = initialCenter(alerts, selection)
      const map = L.map(containerRef.current, { attributionControl: true, zoomControl: true }).setView(center, center[0] === 9.082 && center[1] === 8.6753 ? 5 : 11)
      mapRef.current = map
      zonesRef.current = L.layerGroup().addTo(map)
      const tiles = L.tileLayer(stadiaTileUrl, { maxZoom: 20, attribution: tileAttribution })
      tiles.on('tileerror', () => setMessage('Map tiles could not be loaded. Use the alert list or Advanced coordinates instead.'))
      tiles.addTo(map)
      map.on('click', (event) => selectLocationRef.current?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }))
      setReady(true)
      return () => { map.remove(); mapRef.current = null; zonesRef.current = null }
    } catch {
      setMessage('The interactive map could not be loaded. Use the alert list or Advanced coordinates instead.')
    }
  }, [])

  useEffect(() => {
    if (!ready || !zonesRef.current) return
    zonesRef.current.clearLayers()
    alerts.forEach((alert) => {
      if (alert.dangerLatitude === undefined || alert.dangerLongitude === undefined || alert.dangerRadiusKm === undefined) return
      const selected = alert.id === selectedAlertId
      const circle: Circle = L.circle([alert.dangerLatitude, alert.dangerLongitude], {
        radius: alert.dangerRadiusKm * 1000,
        color: alert.verified ? '#075544' : '#8c3d18',
        fillColor: alert.verified ? '#0b6b55' : '#b65c29',
        fillOpacity: 0.22,
        weight: selected ? 5 : 3,
        dashArray: alert.verified ? undefined : '8 7',
        bubblingMouseEvents: false,
      })
      circle.bindTooltip(`${alert.verified ? 'Responder-verified' : 'Community report — unverified'}: ${alert.category} in ${alert.affectedArea}`)
      circle.on('click', () => selectAlertRef.current?.(alert.id))
      const marker = L.marker([alert.dangerLatitude, alert.dangerLongitude], {
        keyboard: true,
        title: `${alert.verified ? 'Responder-verified' : 'Community report — unverified'}: ${alert.category} in ${alert.affectedArea}`,
        icon: L.divIcon({ className: '', html: `<span class="danger-map-marker ${alert.verified ? 'verified' : 'unverified'}" aria-hidden="true">${alert.verified ? 'V' : 'U'}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] }),
      })
      marker.on('click', () => selectAlertRef.current?.(alert.id))
      zonesRef.current?.addLayer(circle).addLayer(marker)
    })
  }, [alerts, selectedAlertId, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    selectionMarker.current?.remove(); selectionMarker.current = null
    if (!selection) return
    selectionMarker.current = L.marker([selection.latitude, selection.longitude], {
      keyboard: false,
      interactive: false,
      icon: L.divIcon({ className: '', html: '<span class="location-map-pin" aria-hidden="true"></span>', iconSize: [25, 25], iconAnchor: [7, 22] }),
    }).addTo(map)
    map.setView([selection.latitude, selection.longitude], Math.max(map.getZoom(), 12))
  }, [selection, ready])

  if (!stadiaTileUrl) return <p className="map-unavailable" role="status">Interactive map is currently unavailable. Use GPS or Advanced coordinates instead.</p>
  return <div className="interactive-map-shell"><div ref={containerRef} className="interactive-map" role="region" aria-label={ariaLabel}></div>{message && <p className="map-unavailable" role="alert">{message}</p>}<p className="map-provider-note">Map tiles are requested from Stadia Maps and reveal the viewed map area and ordinary connection information to that provider. Pin coordinates stay in AlertBridge until you confirm them. Do not use the map as proof that an area is safe.</p></div>
}
