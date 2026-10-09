import type { CommunityAlert } from './types'

export interface Coordinates { latitude: number; longitude: number }
export interface NearbyAlert { alert: CommunityAlert; distanceKm: number; boundaryDistanceKm: number }

export function distanceKm(first: Coordinates, second: Coordinates) {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(second.latitude - first.latitude)
  const longitudeDelta = radians(second.longitude - first.longitude)
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
}

export function isActiveAlert(alert: CommunityAlert, now = Date.now()) {
  return alert.displayStatus === 'Published' && new Date(alert.expiresAt).getTime() > now
}

export function nearbyAlerts(alerts: CommunityAlert[], location: Coordinates, approachDistanceKm: number, now = Date.now()): NearbyAlert[] {
  return alerts.flatMap((alert) => {
    if (!isActiveAlert(alert, now) || alert.dangerLatitude === undefined || alert.dangerLongitude === undefined || alert.dangerRadiusKm === undefined) return []
    const distance = distanceKm(location, { latitude: alert.dangerLatitude, longitude: alert.dangerLongitude })
    const boundaryDistance = Math.max(0, distance - alert.dangerRadiusKm)
    return boundaryDistance <= approachDistanceKm ? [{ alert, distanceKm: distance, boundaryDistanceKm: boundaryDistance }] : []
  }).sort((first, second) => first.boundaryDistanceKm - second.boundaryDistanceKm)
}

export function newWarningMatches(matches: NearbyAlert[], warnedVersions: ReadonlyMap<string, string>) {
  return matches.filter(({ alert }) => warnedVersions.get(alert.id) !== alert.updatedAt)
}

export function validCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
}
