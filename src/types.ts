export type Category = 'Security threat' | 'Flood' | 'Landslide' | 'Fire' | 'Other'
export type Answer = 'Yes' | 'No' | 'Not sure'
export type Status = 'Unverified' | 'Under review' | 'Verified' | 'Rejected' | 'Resolved'
export type Mode = 'guided' | 'written'
export type ReportingChannel = 'assistance' | 'community' | 'both'

export interface StatusEvent {
  status: Status
  at: string
  reason?: string
}

export interface Report {
  id: string
  createdAt: string
  mode: Mode
  category: Category
  description: string
  happeningNow?: Answer
  anyoneInjured?: Answer
  additionalDetails?: string
  location: { latitude: number; longitude: number }
  status: Status
  history: StatusEvent[]
}

export interface Draft {
  reportingChannel: ReportingChannel
  mode: Mode | ''
  category: Category | ''
  description: string
  happeningNow: Answer | ''
  anyoneInjured: Answer | ''
  additionalDetails: string
  latitude: string
  longitude: string
  publicArea: string
  publicSummary: string
  publicExpiry: string
  publicLatitude: string
  publicLongitude: string
  publicRadiusKm: string
}

export type AlertStatus = 'Published' | 'Resolved' | 'Withdrawn'
export type AlertDisplayStatus = AlertStatus | 'Expired'

export interface CommunityAlert {
  id: string
  title: string
  summary: string
  affectedArea: string
  category: Category
  guidance: string
  expiresAt: string
  dangerLatitude?: number
  dangerLongitude?: number
  dangerRadiusKm?: number
  displayStatus: AlertDisplayStatus
  publishedAt: string
  updatedAt: string
  sourceKind: 'responder_alert' | 'community_post'
  verified: boolean
}

export interface AssistanceAction {
  id: string
  actionType: 'Acknowledged' | 'Coordination note' | 'Forwarded to agency'
  note?: string
  agency?: string
  agencyReference?: string
  handedOffAt?: string
  recordedAt: string
}

export interface ReportMessage {
  id: string
  reportId: string
  senderId: string
  authorRole: 'Reporter' | 'Responder'
  body: string
  createdAt: string
}

export interface AlertDraft {
  title: string
  summary: string
  affectedArea: string
  category: Category
  guidance: string
  expiresAt: string
  dangerLatitude: string
  dangerLongitude: string
  dangerRadiusKm: string
}
