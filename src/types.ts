export type Category = 'Security threat' | 'Flood' | 'Landslide' | 'Fire' | 'Other'
export type Answer = 'Yes' | 'No' | 'Not sure'
export type Status = 'Unverified' | 'Under review' | 'Verified' | 'Rejected' | 'Resolved'
export type Mode = 'guided' | 'written'

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
  mode: Mode | ''
  category: Category | ''
  description: string
  happeningNow: Answer | ''
  anyoneInjured: Answer | ''
  additionalDetails: string
  latitude: string
  longitude: string
}
