import { supabase } from './supabase'
import type { AssistanceAction, AssistanceOutcomeAction, AssistanceOutcomeActionType, Draft, OutcomeConfirmation, OutcomeFeedback } from './types'

function client() { if (!supabase) throw new Error('AlertBridge service is unavailable.'); return supabase }

export interface ChannelSubmissionResult { reportId?: string; postId?: string; channel: Draft['reportingChannel'] }

export async function submitReportingChannels(draft: Draft, requestId: string): Promise<ChannelSubmissionResult> {
  const { data, error } = await client().rpc('submit_reporting_channels', {
    client_request_id: requestId,
    reporting_channel: draft.reportingChannel,
    report_mode: draft.mode,
    report_category: draft.category,
    private_description: draft.description.trim(),
    report_happening_now: draft.mode === 'guided' ? draft.happeningNow : null,
    report_anyone_injured: draft.mode === 'guided' ? draft.anyoneInjured : null,
    private_additional_details: draft.additionalDetails.trim(),
    incident_latitude: draft.reportingChannel === 'community' ? null : Number(draft.latitude),
    incident_longitude: draft.reportingChannel === 'community' ? null : Number(draft.longitude),
    incident_time: new Date().toISOString(),
    public_area_name: draft.reportingChannel === 'assistance' ? null : draft.publicArea.trim(),
    public_summary: draft.reportingChannel === 'assistance' ? null : draft.publicSummary.trim(),
    public_expiry: draft.reportingChannel === 'assistance' ? null : new Date(draft.publicExpiry).toISOString(),
    public_latitude: draft.reportingChannel === 'assistance' ? null : Number(draft.publicLatitude),
    public_longitude: draft.reportingChannel === 'assistance' ? null : Number(draft.publicLongitude),
    public_radius_km: draft.reportingChannel === 'assistance' ? null : Number(draft.publicRadiusKm),
  })
  if (error) throw error
  const result = data as { report_id: string | null; post_id: string | null; channel: Draft['reportingChannel'] }
  return { reportId: result.report_id ?? undefined, postId: result.post_id ?? undefined, channel: result.channel }
}

export async function reportCommunityPost(postId: string, reason: string) {
  const { error } = await client().rpc('report_community_post', { target_post_id: postId, flag_reason: reason.trim() })
  if (error) throw error
}

export async function moderateCommunityPost(postId: string, action: 'Verified' | 'Removed', reason: string) {
  const { error } = await client().rpc('moderate_community_post', { target_post_id: postId, moderation_action: action, moderation_reason: reason.trim() })
  if (error) throw error
}

export async function fetchCommunityPostFlagCount(postId: string) {
  const { count, error } = await client().from('community_post_flags').select('id', { count: 'exact', head: true }).eq('post_id', postId)
  if (error) throw error
  return count ?? 0
}

interface AssistanceRow { id: string; action_type: AssistanceAction['actionType']; note: string | null; agency: string | null; agency_reference: string | null; handed_off_at: string | null; recorded_at: string }
export async function fetchAssistanceActions(reportId: string): Promise<AssistanceAction[]> {
  const { data, error } = await client().from('report_assistance_actions').select('id, action_type, note, agency, agency_reference, handed_off_at, recorded_at').eq('report_id', reportId).order('recorded_at')
  if (error) throw error
  return (data as AssistanceRow[]).map((row) => ({ id: row.id, actionType: row.action_type, note: row.note ?? undefined, agency: row.agency ?? undefined, agencyReference: row.agency_reference ?? undefined, handedOffAt: row.handed_off_at ?? undefined, recordedAt: row.recorded_at }))
}

export async function recordAssistanceAction(reportId: string, action: AssistanceAction['actionType'], note: string, agency: string, handoffTime: string, reference: string) {
  const { error } = await client().rpc('record_assistance_action', {
    target_report_id: reportId, assistance_action: action, action_note: note.trim() || null,
    agency_name: action === 'Forwarded to agency' ? agency.trim() : null,
    agency_handoff_time: action === 'Forwarded to agency' && handoffTime ? new Date(handoffTime).toISOString() : null,
    agency_handoff_reference: action === 'Forwarded to agency' ? reference.trim() || null : null,
  })
  if (error) throw error
}

interface OutcomeActionRow { id: string; action_type: AssistanceOutcomeActionType; note: string; recorded_at: string }
interface OutcomeFeedbackRow { id: string; revision: number; confirmation: OutcomeConfirmation; comment: string | null; submitted_at: string }

export async function fetchOutcomeHistory(reportId: string): Promise<{ actions: AssistanceOutcomeAction[]; feedback: OutcomeFeedback[] }> {
  const [actionResult, feedbackResult] = await Promise.all([
    client().from('report_assistance_outcomes').select('id, action_type, note, recorded_at').eq('report_id', reportId).order('recorded_at'),
    client().from('report_outcome_feedback').select('id, revision, confirmation, comment, submitted_at').eq('report_id', reportId).order('revision'),
  ])
  if (actionResult.error) throw actionResult.error
  if (feedbackResult.error) throw feedbackResult.error
  return {
    actions: (actionResult.data as OutcomeActionRow[]).map((row) => ({ id: row.id, actionType: row.action_type, note: row.note, recordedAt: row.recorded_at })),
    feedback: (feedbackResult.data as OutcomeFeedbackRow[]).map((row) => ({ id: row.id, revision: row.revision, confirmation: row.confirmation, comment: row.comment ?? undefined, submittedAt: row.submitted_at })),
  }
}

export async function recordAssistanceOutcomeAction(reportId: string, action: AssistanceOutcomeActionType, note: string) {
  const { error } = await client().rpc('record_assistance_outcome_action', { target_report_id: reportId, outcome_action: action, action_note: note.trim() })
  if (error) throw error
}

export async function submitOutcomeFeedback(reportId: string, confirmation: OutcomeConfirmation, comment: string, requestId: string) {
  const { error } = await client().rpc('submit_reporter_outcome_feedback', {
    target_report_id: reportId,
    feedback_confirmation: confirmation,
    feedback_comment: comment.trim() || null,
    feedback_request_id: requestId,
  })
  if (error) throw error
}
