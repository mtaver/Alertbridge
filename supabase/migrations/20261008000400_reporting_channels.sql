-- Authenticated community reports and private assistance coordination.
-- Depends on the three preceding AlertBridge migrations.
create type public.community_post_status as enum ('Published', 'Verified', 'Withdrawn', 'Removed');
create type public.assistance_action_type as enum ('Acknowledged', 'Coordination note', 'Forwarded to agency');

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete restrict,
  linked_report_id uuid references public.incident_reports(id) on delete restrict,
  area_name text not null check (char_length(btrim(area_name)) between 1 and 240),
  category public.incident_category not null,
  summary text not null check (char_length(btrim(summary)) between 1 and 1000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  danger_radius_km double precision not null default 1 check (danger_radius_km > 0 and danger_radius_km <= 50),
  expires_at timestamptz not null,
  status public.community_post_status not null default 'Published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_post_history (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.community_posts(id) on delete restrict,
  action text not null check (action in ('Submitted', 'Verified', 'Withdrawn', 'Removed')),
  old_status public.community_post_status,
  new_status public.community_post_status not null,
  reason text check (reason is null or char_length(reason) <= 1000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  check (action not in ('Verified', 'Removed') or char_length(btrim(reason)) > 0)
);

create table public.community_post_flags (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.community_posts(id) on delete restrict,
  reporter_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create table public.reporting_submission_receipts (
  user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

create table public.report_assistance_actions (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.incident_reports(id) on delete restrict,
  action_type public.assistance_action_type not null,
  note text check (note is null or char_length(note) <= 2000),
  agency text check (agency is null or char_length(agency) <= 240),
  agency_reference text check (agency_reference is null or char_length(agency_reference) <= 500),
  handed_off_at timestamptz,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  check (
    (action_type = 'Forwarded to agency' and char_length(btrim(agency)) > 0 and handed_off_at is not null and handed_off_at <= recorded_at and char_length(btrim(coalesce(agency_reference, note, ''))) > 0)
    or (action_type = 'Acknowledged' and agency is null and agency_reference is null and handed_off_at is null)
    or (action_type = 'Coordination note' and char_length(btrim(note)) > 0 and agency is null and agency_reference is null and handed_off_at is null)
  )
);

create table public.private_report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null,
  changed_at timestamptz not null default now()
);

create index community_posts_status_expiry_idx on public.community_posts (status, expires_at);
create index community_posts_author_idx on public.community_posts (author_id, created_at desc);
create index community_post_history_post_idx on public.community_post_history (post_id, changed_at);
create index report_assistance_actions_report_idx on public.report_assistance_actions (report_id, recorded_at);

create function public.submit_reporting_channels(
  client_request_id uuid,
  reporting_channel text,
  report_mode public.report_mode,
  report_category public.incident_category,
  private_description text,
  report_happening_now public.question_answer,
  report_anyone_injured public.question_answer,
  private_additional_details text,
  incident_latitude double precision,
  incident_longitude double precision,
  incident_time timestamptz,
  public_area_name text default null,
  public_summary text default null,
  public_expiry timestamptz default null,
  public_radius_km double precision default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare existing_result jsonb;
declare new_report_id uuid;
declare new_post public.community_posts;
declare final_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if reporting_channel not in ('assistance', 'community', 'both') then raise exception 'Invalid reporting channel' using errcode = '23514'; end if;
  if client_request_id is null then raise exception 'A client request ID is required' using errcode = '23514'; end if;
  if incident_latitude not between -90 and 90 or incident_longitude not between -180 and 180 then raise exception 'Invalid coordinates' using errcode = '23514'; end if;

  insert into public.reporting_submission_receipts (user_id, request_id)
  values (auth.uid(), client_request_id)
  on conflict do nothing;
  select result into existing_result from public.reporting_submission_receipts
  where user_id = auth.uid() and request_id = client_request_id for update;
  if existing_result is not null then return existing_result; end if;

  if reporting_channel in ('assistance', 'both') then
    if char_length(btrim(coalesce(private_description, ''))) = 0 then raise exception 'Private description is required' using errcode = '23514'; end if;
    insert into public.incident_reports (
      reporter_id, mode, category, description, happening_now, anyone_injured,
      additional_details, latitude, longitude, incident_at
    ) values (
      auth.uid(), report_mode, report_category, btrim(private_description),
      case when report_mode = 'guided' then report_happening_now else null end,
      case when report_mode = 'guided' then report_anyone_injured else null end,
      nullif(btrim(private_additional_details), ''), incident_latitude, incident_longitude, incident_time
    ) returning id into new_report_id;
  end if;

  if reporting_channel in ('community', 'both') then
    if char_length(btrim(coalesce(public_area_name, ''))) = 0 or char_length(btrim(coalesce(public_summary, ''))) = 0 then
      raise exception 'Public area and summary are required' using errcode = '23514';
    end if;
    if public_expiry is null or public_expiry <= now() then raise exception 'Public expiry must be in the future' using errcode = '23514'; end if;
    insert into public.community_posts (
      author_id, linked_report_id, area_name, category, summary, latitude, longitude,
      danger_radius_km, expires_at
    ) values (
      auth.uid(), new_report_id, btrim(public_area_name), report_category, btrim(public_summary),
      incident_latitude, incident_longitude, public_radius_km, public_expiry
    ) returning * into new_post;
    insert into public.community_post_history (post_id, action, old_status, new_status, actor_id)
    values (new_post.id, 'Submitted', null, new_post.status, auth.uid());
  end if;

  final_result := jsonb_build_object('report_id', new_report_id, 'post_id', new_post.id, 'channel', reporting_channel);
  update public.reporting_submission_receipts set result = final_result
  where user_id = auth.uid() and request_id = client_request_id;
  return final_result;
end;
$$;

create function public.report_community_post(target_post_id uuid, flag_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(flag_reason, ''))) = 0 then raise exception 'A reason is required' using errcode = '23514'; end if;
  if not exists (select 1 from public.community_posts where id = target_post_id and status in ('Published', 'Verified')) then raise exception 'Post not found' using errcode = 'P0002'; end if;
  insert into public.community_post_flags (post_id, reporter_id, reason)
  values (target_post_id, auth.uid(), btrim(flag_reason));
end;
$$;

create function public.moderate_community_post(target_post_id uuid, moderation_action text, moderation_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare old_post public.community_posts;
declare next_status public.community_post_status;
begin
  if auth.uid() is null or not private.is_responder() then raise exception 'Responder access required' using errcode = '42501'; end if;
  if moderation_action not in ('Verified', 'Removed') then raise exception 'Invalid moderation action' using errcode = '23514'; end if;
  if char_length(btrim(coalesce(moderation_reason, ''))) = 0 then raise exception 'A moderation reason is required' using errcode = '23514'; end if;
  select * into old_post from public.community_posts where id = target_post_id for update;
  if not found then raise exception 'Post not found' using errcode = 'P0002'; end if;
  if old_post.status not in ('Published', 'Verified') then raise exception 'Post cannot be moderated in its current state' using errcode = '23514'; end if;
  next_status := moderation_action::public.community_post_status;
  update public.community_posts set status = next_status, updated_at = now() where id = target_post_id;
  insert into public.community_post_history (post_id, action, old_status, new_status, reason, actor_id)
  values (target_post_id, moderation_action, old_post.status, next_status, btrim(moderation_reason), auth.uid());
end;
$$;

create function public.withdraw_community_post(target_post_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare old_post public.community_posts;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into old_post from public.community_posts where id = target_post_id and author_id = auth.uid() for update;
  if not found then raise exception 'Post not found' using errcode = 'P0002'; end if;
  if old_post.status not in ('Published', 'Verified') then raise exception 'Post cannot be withdrawn' using errcode = '23514'; end if;
  update public.community_posts set status = 'Withdrawn', updated_at = now() where id = target_post_id;
  insert into public.community_post_history (post_id, action, old_status, new_status, actor_id)
  values (target_post_id, 'Withdrawn', old_post.status, 'Withdrawn', auth.uid());
end;
$$;

create function public.record_assistance_action(
  target_report_id uuid,
  assistance_action public.assistance_action_type,
  action_note text default null,
  agency_name text default null,
  agency_handoff_time timestamptz default null,
  agency_handoff_reference text default null
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_responder() then raise exception 'Responder access required' using errcode = '42501'; end if;
  if not exists (select 1 from public.incident_reports where id = target_report_id) then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if assistance_action = 'Forwarded to agency' and (
    char_length(btrim(coalesce(agency_name, ''))) = 0 or agency_handoff_time is null or agency_handoff_time > now()
    or char_length(btrim(coalesce(agency_handoff_reference, action_note, ''))) = 0
  ) then raise exception 'Agency, past or current handoff time, and reference or note are required' using errcode = '23514'; end if;
  if assistance_action = 'Coordination note' and char_length(btrim(coalesce(action_note, ''))) = 0 then
    raise exception 'A coordination note is required' using errcode = '23514';
  end if;
  insert into public.report_assistance_actions (report_id, action_type, note, agency, agency_reference, handed_off_at, recorded_by)
  values (
    target_report_id, assistance_action, nullif(btrim(action_note), ''),
    case when assistance_action = 'Forwarded to agency' then btrim(agency_name) else null end,
    case when assistance_action = 'Forwarded to agency' then nullif(btrim(agency_handoff_reference), '') else null end,
    case when assistance_action = 'Forwarded to agency' then agency_handoff_time else null end,
    auth.uid()
  );
end;
$$;

create function private.signal_public_community_post_change()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin insert into public.community_alert_events (alert_id) values (new.id); return new; end; $$;
create trigger community_post_realtime_signal after insert or update on public.community_posts
for each row execute function private.signal_public_community_post_change();

create function private.signal_private_report_change()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin insert into public.private_report_events (report_id) values (new.id); return new; end; $$;
create trigger private_report_realtime_signal after insert or update on public.incident_reports
for each row execute function private.signal_private_report_change();

drop view public.community_alert_feed;
create view public.community_alert_feed with (security_barrier = true) as
select id, title, summary, affected_area, category, guidance, expires_at,
  danger_latitude, danger_longitude, danger_radius_km,
  case when status = 'Published' and expires_at <= now() then 'Expired' else status::text end as display_status,
  published_at, updated_at, 'responder_alert'::text as source_kind, true as verified
from public.community_alerts where status <> 'Withdrawn'
union all
select id, 'Community warning'::text as title, summary, area_name as affected_area, category,
  'Community report — unverified. Review official guidance and use caution.'::text as guidance,
  expires_at, latitude as danger_latitude, longitude as danger_longitude, danger_radius_km,
  case when expires_at <= now() then 'Expired' when status = 'Verified' then 'Published' else status::text end as display_status,
  created_at as published_at, updated_at, 'community_post'::text as source_kind, status = 'Verified' as verified
from public.community_posts where status not in ('Withdrawn', 'Removed');
revoke all on public.community_alert_feed from public;
grant select on public.community_alert_feed to anon, authenticated;

alter table public.community_posts enable row level security;
alter table public.community_post_history enable row level security;
alter table public.community_post_flags enable row level security;
alter table public.reporting_submission_receipts enable row level security;
alter table public.report_assistance_actions enable row level security;
alter table public.private_report_events enable row level security;

create policy community_posts_owner_or_responder_read on public.community_posts for select to authenticated
using (author_id = (select auth.uid()) or (select private.is_responder()));
create policy community_post_history_owner_or_responder_read on public.community_post_history for select to authenticated
using (exists (select 1 from public.community_posts post where post.id = post_id and (post.author_id = (select auth.uid()) or (select private.is_responder()))));
create policy community_post_flags_responder_read on public.community_post_flags for select to authenticated using ((select private.is_responder()));
create policy receipts_owner_read on public.reporting_submission_receipts for select to authenticated using (user_id = (select auth.uid()));
create policy assistance_actions_owner_or_responder_read on public.report_assistance_actions for select to authenticated
using (exists (select 1 from public.incident_reports report where report.id = report_id and (report.reporter_id = (select auth.uid()) or (select private.is_responder()))));
create policy private_report_events_responder_read on public.private_report_events for select to authenticated using ((select private.is_responder()));

revoke all on public.community_posts, public.community_post_history, public.community_post_flags,
  public.reporting_submission_receipts, public.report_assistance_actions, public.private_report_events from anon, authenticated;
grant select on public.community_posts, public.community_post_history, public.reporting_submission_receipts,
  public.report_assistance_actions, public.private_report_events to authenticated;
grant select on public.community_post_flags to authenticated;

revoke all on function public.submit_reporting_channels(uuid, text, public.report_mode, public.incident_category, text, public.question_answer, public.question_answer, text, double precision, double precision, timestamptz, text, text, timestamptz, double precision) from public, anon;
revoke all on function public.report_community_post(uuid, text) from public, anon;
revoke all on function public.moderate_community_post(uuid, text, text) from public, anon;
revoke all on function public.withdraw_community_post(uuid) from public, anon;
revoke all on function public.record_assistance_action(uuid, public.assistance_action_type, text, text, timestamptz, text) from public, anon;
grant execute on function public.submit_reporting_channels(uuid, text, public.report_mode, public.incident_category, text, public.question_answer, public.question_answer, text, double precision, double precision, timestamptz, text, text, timestamptz, double precision) to authenticated;
grant execute on function public.report_community_post(uuid, text) to authenticated;
grant execute on function public.moderate_community_post(uuid, text, text) to authenticated;
grant execute on function public.withdraw_community_post(uuid) to authenticated;
grant execute on function public.record_assistance_action(uuid, public.assistance_action_type, text, text, timestamptz, text) to authenticated;

revoke all on function private.signal_public_community_post_change() from public, anon, authenticated;
revoke all on function private.signal_private_report_change() from public, anon, authenticated;
alter publication supabase_realtime add table public.private_report_events;

comment on view public.community_alert_feed is 'Safe public union of responder-approved alerts and authenticated community warnings. No author or private report relationship is exposed.';
comment on function public.submit_reporting_channels is 'Retry-safe, transactional submission for private assistance, public community warning, or both.';
comment on table public.report_assistance_actions is 'Recorded responder coordination. A Forwarded to agency entry documents an actual handoff; inserting it does not contact an agency.';
