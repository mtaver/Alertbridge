-- AlertBridge core schema. Apply before using connected mode.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.incident_category as enum ('Security threat', 'Flood', 'Landslide', 'Fire', 'Other');
create type public.report_mode as enum ('guided', 'written');
create type public.question_answer as enum ('Yes', 'No', 'Not sure');
create type public.report_status as enum ('Unverified', 'Under review', 'Verified', 'Rejected', 'Resolved');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.authorized_responders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now()
);

create table public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  mode public.report_mode not null,
  category public.incident_category not null,
  description text not null check (char_length(btrim(description)) > 0 and char_length(description) <= 5000),
  happening_now public.question_answer,
  anyone_injured public.question_answer,
  additional_details text check (additional_details is null or char_length(additional_details) <= 5000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  incident_at timestamptz not null,
  status public.report_status not null default 'Unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (mode = 'guided' and happening_now is not null and anyone_injured is not null)
    or (mode = 'written' and happening_now is null and anyone_injured is null)
  )
);

create table public.report_status_history (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.incident_reports(id) on delete cascade,
  old_status public.report_status,
  new_status public.report_status not null,
  reason text check (reason is null or char_length(reason) <= 1000),
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  check (new_status not in ('Verified', 'Rejected') or char_length(btrim(reason)) > 0)
);

create index incident_reports_reporter_created_idx on public.incident_reports (reporter_id, created_at desc);
create index report_status_history_report_idx on public.report_status_history (report_id, changed_at);

create function private.is_responder()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.authorized_responders where user_id = (select auth.uid())) $$;
revoke all on function private.is_responder() from public, anon;
grant execute on function private.is_responder() to authenticated;

create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80));
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create function private.record_initial_report_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.report_status_history (report_id, old_status, new_status, changed_by)
  values (new.id, null, 'Unverified', new.reporter_id);
  return new;
end;
$$;
revoke all on function private.record_initial_report_status() from public, anon, authenticated;
create trigger incident_report_initial_history after insert on public.incident_reports
for each row execute function private.record_initial_report_status();

create function public.change_report_status(
  target_report_id uuid,
  target_status public.report_status,
  change_reason text default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_status public.report_status;
begin
  if auth.uid() is null or not private.is_responder() then
    raise exception 'Responder access required' using errcode = '42501';
  end if;
  if target_status in ('Verified', 'Rejected') and char_length(btrim(coalesce(change_reason, ''))) = 0 then
    raise exception 'A non-empty reason is required for verification or rejection' using errcode = '23514';
  end if;
  select status into current_status from public.incident_reports where id = target_report_id for update;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if not (
    (current_status = 'Unverified' and target_status in ('Under review', 'Verified', 'Rejected')) or
    (current_status = 'Under review' and target_status in ('Verified', 'Rejected')) or
    (current_status = 'Verified' and target_status = 'Resolved')
  ) then
    raise exception 'Status transition from % to % is not permitted', current_status, target_status using errcode = '23514';
  end if;
  update public.incident_reports set status = target_status, updated_at = now() where id = target_report_id;
  insert into public.report_status_history (report_id, old_status, new_status, reason, changed_by)
  values (target_report_id, current_status, target_status, nullif(btrim(change_reason), ''), auth.uid());
end;
$$;
revoke all on function public.change_report_status(uuid, public.report_status, text) from public, anon;
grant execute on function public.change_report_status(uuid, public.report_status, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.authorized_responders enable row level security;
alter table public.incident_reports enable row level security;
alter table public.report_status_history enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy responder_membership_select_own on public.authorized_responders for select to authenticated using ((select auth.uid()) = user_id);
create policy reports_insert_own_unverified on public.incident_reports for insert to authenticated
with check ((select auth.uid()) = reporter_id and status = 'Unverified');
create policy reports_select_own_or_responder on public.incident_reports for select to authenticated
using ((select auth.uid()) = reporter_id or (select private.is_responder()));
create policy history_select_own_or_responder on public.report_status_history for select to authenticated
using (exists (
  select 1 from public.incident_reports report
  where report.id = report_status_history.report_id
    and (report.reporter_id = (select auth.uid()) or (select private.is_responder()))
));

revoke all on public.profiles, public.authorized_responders, public.incident_reports, public.report_status_history from anon;
revoke all on public.profiles, public.authorized_responders, public.incident_reports, public.report_status_history from authenticated;
grant select on public.profiles to authenticated;
grant select on public.authorized_responders to authenticated;
revoke update, delete on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.incident_reports to authenticated;
grant insert (reporter_id, mode, category, description, happening_now, anyone_injured, additional_details, latitude, longitude, incident_at) on public.incident_reports to authenticated;
grant select on public.report_status_history to authenticated;
revoke usage, select on all sequences in schema public from anon, authenticated;

comment on table public.authorized_responders is 'Managed only by trusted administrators using server-side database access.';
comment on function public.change_report_status is 'Narrow authenticated RPC. It performs authorization, locks the report, validates the transition and writes history atomically.';
