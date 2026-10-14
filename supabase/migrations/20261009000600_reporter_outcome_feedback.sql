-- Private responder-reported assistance outcomes and reporter feedback revisions.
-- Depends on 20261009000500_supabase_push_scheduler.sql.

create type public.assistance_outcome_action_type as enum (
  'Assistance provided',
  'Issue attended to',
  'Follow-up action'
);

create type public.reporter_outcome_confirmation as enum (
  'Assistance received',
  'Partly addressed',
  'Assistance not received',
  'Cannot confirm'
);

create table public.report_assistance_outcomes (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.incident_reports(id) on delete restrict,
  action_type public.assistance_outcome_action_type not null,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create table public.report_outcome_feedback (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.incident_reports(id) on delete restrict,
  reporter_id uuid not null references auth.users(id) on delete restrict,
  revision integer not null check (revision > 0),
  confirmation public.reporter_outcome_confirmation not null,
  comment text check (comment is null or char_length(comment) <= 2000),
  client_request_id uuid not null,
  submitted_at timestamptz not null default now(),
  unique (report_id, revision),
  unique (reporter_id, client_request_id)
);

create table public.report_outcome_events (
  id bigint generated always as identity primary key,
  report_id uuid not null,
  changed_at timestamptz not null default now()
);

create index report_assistance_outcomes_report_idx
  on public.report_assistance_outcomes (report_id, recorded_at);
create index report_outcome_feedback_report_idx
  on public.report_outcome_feedback (report_id, revision);
create index report_outcome_events_report_idx
  on public.report_outcome_events (report_id, changed_at);

alter table public.report_assistance_outcomes enable row level security;
alter table public.report_outcome_feedback enable row level security;
alter table public.report_outcome_events enable row level security;

create policy assistance_outcomes_owner_or_responder_read
on public.report_assistance_outcomes for select to authenticated
using (exists (
  select 1 from public.incident_reports report
  where report.id = report_id
    and (report.reporter_id = (select auth.uid()) or (select private.is_responder()))
));

create policy outcome_feedback_owner_or_responder_read
on public.report_outcome_feedback for select to authenticated
using (exists (
  select 1 from public.incident_reports report
  where report.id = report_id
    and (report.reporter_id = (select auth.uid()) or (select private.is_responder()))
));

create policy outcome_events_owner_or_responder_read
on public.report_outcome_events for select to authenticated
using (exists (
  select 1 from public.incident_reports report
  where report.id = report_id
    and (report.reporter_id = (select auth.uid()) or (select private.is_responder()))
));

revoke all on public.report_assistance_outcomes, public.report_outcome_feedback,
  public.report_outcome_events from public, anon, authenticated;
grant select on public.report_assistance_outcomes, public.report_outcome_feedback,
  public.report_outcome_events to authenticated;
revoke usage, select on sequence public.report_assistance_outcomes_id_seq,
  public.report_outcome_feedback_id_seq, public.report_outcome_events_id_seq
  from public, anon, authenticated;

create trigger reject_suspended_assistance_outcome_write
before insert or update or delete on public.report_assistance_outcomes
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_outcome_feedback_write
before insert or update or delete on public.report_outcome_feedback
for each statement execute function private.reject_suspended_writer();

create function private.prevent_report_outcome_mutation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'Assistance outcome and reporter feedback history is immutable' using errcode = '42501';
end;
$$;
revoke all on function private.prevent_report_outcome_mutation() from public, anon, authenticated;
create trigger assistance_outcomes_immutable before update or delete on public.report_assistance_outcomes
for each row execute function private.prevent_report_outcome_mutation();
create trigger outcome_feedback_immutable before update or delete on public.report_outcome_feedback
for each row execute function private.prevent_report_outcome_mutation();

create function public.record_assistance_outcome_action(
  target_report_id uuid,
  outcome_action public.assistance_outcome_action_type,
  action_note text
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_responder() then
    raise exception 'Responder access required' using errcode = '42501';
  end if;
  if private.is_account_suspended(auth.uid()) then
    raise exception 'Account suspended. Responder write actions are disabled.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(action_note, ''))) = 0 then
    raise exception 'An outcome or follow-up note is required' using errcode = '23514';
  end if;
  if not exists (select 1 from public.incident_reports where id = target_report_id) then
    raise exception 'Report not found' using errcode = 'P0002';
  end if;
  if outcome_action = 'Follow-up action' and not coalesce((
    select feedback.confirmation in ('Partly addressed', 'Assistance not received')
    from public.report_outcome_feedback feedback
    where feedback.report_id = target_report_id
    order by feedback.revision desc limit 1
  ), false) then
    raise exception 'Follow-up actions require partial or negative reporter feedback' using errcode = '23514';
  end if;
  insert into public.report_assistance_outcomes (report_id, action_type, note, recorded_by)
  values (target_report_id, outcome_action, btrim(action_note), auth.uid());
end;
$$;

create function public.submit_reporter_outcome_feedback(
  target_report_id uuid,
  feedback_confirmation public.reporter_outcome_confirmation,
  feedback_comment text,
  feedback_request_id uuid
)
returns table (feedback_id bigint, revision integer)
language plpgsql security definer set search_path = ''
as $$
declare report_owner uuid;
declare next_revision integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if private.is_account_suspended(auth.uid()) then
    raise exception 'Account suspended. Feedback submission is disabled.' using errcode = '42501';
  end if;
  if feedback_request_id is null then raise exception 'A client request ID is required' using errcode = '23514'; end if;
  if char_length(coalesce(feedback_comment, '')) > 2000 then
    raise exception 'Feedback comment must be 2000 characters or fewer' using errcode = '22001';
  end if;

  select feedback.id, feedback.revision into feedback_id, revision
  from public.report_outcome_feedback feedback
  where feedback.reporter_id = auth.uid()
    and feedback.client_request_id = feedback_request_id;
  if found then return next; return; end if;

  perform pg_advisory_xact_lock(hashtextextended('alertbridge-outcome-feedback:' || target_report_id::text, 0));
  select reporter_id into report_owner from public.incident_reports where id = target_report_id;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if report_owner <> auth.uid() then raise exception 'Only the report owner can submit outcome feedback' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.report_assistance_outcomes outcome
    where outcome.report_id = target_report_id
      and outcome.action_type in ('Assistance provided', 'Issue attended to')
  ) then
    raise exception 'Reporter confirmation is not requested until an assistance outcome is recorded' using errcode = '23514';
  end if;

  select coalesce(max(feedback.revision), 0) + 1 into next_revision
  from public.report_outcome_feedback feedback where feedback.report_id = target_report_id;
  insert into public.report_outcome_feedback (
    report_id, reporter_id, revision, confirmation, comment, client_request_id
  ) values (
    target_report_id, auth.uid(), next_revision, feedback_confirmation,
    nullif(btrim(feedback_comment), ''), feedback_request_id
  ) returning id into feedback_id;
  revision := next_revision;
  return next;
end;
$$;

revoke all on function public.record_assistance_outcome_action(uuid, public.assistance_outcome_action_type, text)
  from public, anon;
revoke all on function public.submit_reporter_outcome_feedback(uuid, public.reporter_outcome_confirmation, text, uuid)
  from public, anon;
grant execute on function public.record_assistance_outcome_action(uuid, public.assistance_outcome_action_type, text)
  to authenticated;
grant execute on function public.submit_reporter_outcome_feedback(uuid, public.reporter_outcome_confirmation, text, uuid)
  to authenticated;

create function private.signal_report_outcome_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.report_outcome_events (report_id) values (new.report_id);
  return new;
end;
$$;
revoke all on function private.signal_report_outcome_change() from public, anon, authenticated;
create trigger assistance_outcome_realtime_signal after insert on public.report_assistance_outcomes
for each row execute function private.signal_report_outcome_change();
create trigger outcome_feedback_realtime_signal after insert on public.report_outcome_feedback
for each row execute function private.signal_report_outcome_change();
alter publication supabase_realtime add table public.report_outcome_events;

comment on table public.report_assistance_outcomes is
  'Private immutable responder statements about assistance outcomes and follow-up actions; separate from acknowledgement, handoff, status and reporter feedback.';
comment on table public.report_outcome_feedback is
  'Private immutable reporter-owned outcome confirmations with retry-safe revision history.';
