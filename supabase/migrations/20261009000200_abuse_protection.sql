-- Database-enforced submission limits and administrator-managed account suspension.
-- Depends on 20261009000100_separate_public_danger_zone.sql.

create table public.account_suspensions (
  user_id uuid primary key references auth.users(id) on delete restrict,
  suspended boolean not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create table public.account_suspension_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('Suspended', 'Restored')),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index account_suspension_history_user_idx
  on public.account_suspension_history (user_id, changed_at desc);

alter table public.account_suspensions enable row level security;
alter table public.account_suspension_history enable row level security;
revoke all on public.account_suspensions, public.account_suspension_history from public, anon, authenticated;
revoke usage, select on sequence public.account_suspension_history_id_seq from public, anon, authenticated;

create function private.is_account_suspended(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select suspension.suspended
    from public.account_suspensions suspension
    where suspension.user_id = target_user_id
  ), false)
$$;
revoke all on function private.is_account_suspended(uuid) from public, anon, authenticated;

create function private.reject_suspended_writer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and private.is_account_suspended(auth.uid()) then
    raise exception 'Account suspended. New submissions and account write actions are disabled.'
      using errcode = '42501';
  end if;
  return null;
end;
$$;
revoke all on function private.reject_suspended_writer() from public, anon, authenticated;

create trigger reject_suspended_profile_write
before update on public.profiles
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_incident_report_write
before insert or update or delete on public.incident_reports
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_report_status_history_write
before insert or update or delete on public.report_status_history
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_community_alert_write
before insert or update or delete on public.community_alerts
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_community_alert_history_write
before insert or update or delete on public.community_alert_history
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_community_post_write
before insert or update or delete on public.community_posts
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_community_post_history_write
before insert or update or delete on public.community_post_history
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_community_post_flag_write
before insert or update or delete on public.community_post_flags
for each statement execute function private.reject_suspended_writer();
create trigger reject_suspended_assistance_action_write
before insert or update or delete on public.report_assistance_actions
for each statement execute function private.reject_suspended_writer();

create function private.prevent_suspension_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Account suspension history is immutable' using errcode = '42501';
end;
$$;
revoke all on function private.prevent_suspension_history_mutation() from public, anon, authenticated;
create trigger account_suspension_history_immutable
before update or delete on public.account_suspension_history
for each row execute function private.prevent_suspension_history_mutation();

create function public.admin_set_account_suspension(
  target_user_id uuid,
  should_suspend boolean,
  suspension_reason text,
  administrator_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_state boolean;
begin
  if target_user_id is null or administrator_user_id is null then
    raise exception 'Target and administrator user IDs are required' using errcode = '23514';
  end if;
  if char_length(btrim(coalesce(suspension_reason, ''))) = 0 then
    raise exception 'A non-empty suspension reason is required' using errcode = '23514';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Target account not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from auth.users where id = administrator_user_id) then
    raise exception 'Administrator account not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alertbridge-suspension:' || target_user_id::text, 0));
  select suspension.suspended into current_state
  from public.account_suspensions suspension
  where suspension.user_id = target_user_id;
  if found and current_state = should_suspend then
    raise exception 'Account is already %', case when should_suspend then 'suspended' else 'restored' end
      using errcode = '23514';
  end if;

  insert into public.account_suspensions (user_id, suspended, reason, changed_by, changed_at)
  values (target_user_id, should_suspend, btrim(suspension_reason), administrator_user_id, now())
  on conflict (user_id) do update set
    suspended = excluded.suspended,
    reason = excluded.reason,
    changed_by = excluded.changed_by,
    changed_at = excluded.changed_at;

  insert into public.account_suspension_history (user_id, action, reason, changed_by)
  values (
    target_user_id,
    case when should_suspend then 'Suspended' else 'Restored' end,
    btrim(suspension_reason),
    administrator_user_id
  );
end;
$$;
revoke all on function public.admin_set_account_suspension(uuid, boolean, text, uuid)
  from public, anon, authenticated;

-- Direct incident inserts would bypass the shared submission counter. All new reports
-- now enter through submit_reporting_channels, whose receipt is the counting unit.
revoke insert on public.incident_reports from authenticated;

create or replace function public.submit_reporting_channels(
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
  public_latitude double precision default null,
  public_longitude double precision default null,
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
declare recent_count integer;
declare daily_count integer;
declare short_retry_at timestamptz;
declare daily_retry_at timestamptz;
declare retry_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if private.is_account_suspended(auth.uid()) then
    raise exception 'Account suspended. New submissions and account write actions are disabled.' using errcode = '42501';
  end if;
  if reporting_channel not in ('assistance', 'community', 'both') then raise exception 'Invalid reporting channel' using errcode = '23514'; end if;
  if client_request_id is null then raise exception 'A client request ID is required' using errcode = '23514'; end if;

  insert into public.reporting_submission_receipts (user_id, request_id)
  values (auth.uid(), client_request_id)
  on conflict do nothing;
  select result into existing_result from public.reporting_submission_receipts
  where user_id = auth.uid() and request_id = client_request_id for update;
  if existing_result is not null then return existing_result; end if;

  -- Serialize distinct requests per account before counting completed receipts.
  perform pg_advisory_xact_lock(hashtextextended('alertbridge-submit:' || auth.uid()::text, 0));
  select count(*) filter (where created_at > now() - interval '10 minutes'), count(*)
  into recent_count, daily_count
  from public.reporting_submission_receipts
  where user_id = auth.uid() and result is not null and created_at > now() - interval '24 hours';

  if recent_count >= 3 then
    select created_at + interval '10 minutes' into short_retry_at
    from public.reporting_submission_receipts
    where user_id = auth.uid() and result is not null and created_at > now() - interval '10 minutes'
    order by created_at desc offset 2 limit 1;
  end if;
  if daily_count >= 10 then
    select created_at + interval '24 hours' into daily_retry_at
    from public.reporting_submission_receipts
    where user_id = auth.uid() and result is not null and created_at > now() - interval '24 hours'
    order by created_at desc offset 9 limit 1;
  end if;
  retry_at := greatest(short_retry_at, daily_retry_at);
  if retry_at is not null then
    raise exception 'Submission limit reached. Try again after %.', to_char(retry_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      using errcode = 'P0001',
        detail = jsonb_build_object('retry_after', retry_at)::text,
        hint = 'These limits reduce repeated submissions but do not prevent all spam.';
  end if;

  if reporting_channel in ('assistance', 'both') and (
    incident_latitude is null or incident_latitude not between -90 and 90
    or incident_longitude is null or incident_longitude not between -180 and 180
  ) then raise exception 'Invalid private assistance coordinates' using errcode = '23514'; end if;

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
    if public_latitude is null or public_latitude not between -90 and 90 or public_longitude is null or public_longitude not between -180 and 180 then
      raise exception 'Valid public danger-zone coordinates are required' using errcode = '23514';
    end if;
    insert into public.community_posts (
      author_id, linked_report_id, area_name, category, summary, latitude, longitude,
      danger_radius_km, expires_at
    ) values (
      auth.uid(), new_report_id, btrim(public_area_name), report_category, btrim(public_summary),
      public_latitude, public_longitude, public_radius_km, public_expiry
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

revoke all on function public.submit_reporting_channels(uuid, text, public.report_mode, public.incident_category, text, public.question_answer, public.question_answer, text, double precision, double precision, timestamptz, text, text, timestamptz, double precision, double precision, double precision) from public, anon;
grant execute on function public.submit_reporting_channels(uuid, text, public.report_mode, public.incident_category, text, public.question_answer, public.question_answer, text, double precision, double precision, timestamptz, text, text, timestamptz, double precision, double precision, double precision) to authenticated;

comment on table public.account_suspensions is 'Account write suspension, separate from responder membership and managed only through trusted administrator database access.';
comment on table public.account_suspension_history is 'Immutable audit history for administrator account suspension and restoration actions.';
comment on function public.admin_set_account_suspension(uuid, boolean, text, uuid) is 'Trusted-administrator-only suspension function. It is not executable by browser roles or responders.';
comment on function public.submit_reporting_channels(uuid, text, public.report_mode, public.incident_category, text, public.question_answer, public.question_answer, text, double precision, double precision, timestamptz, text, text, timestamptz, double precision, double precision, double precision) is 'Retry-safe transactional submission with per-account limits of 3 in 10 minutes and 10 in 24 hours; Both counts once.';
