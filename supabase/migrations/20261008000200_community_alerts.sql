-- Community Alerts are public safety notices curated by authorised responders.
-- Private incident reports remain private and are never selected by the public feed.
create type public.community_alert_status as enum ('Published', 'Resolved', 'Withdrawn');

create table public.community_alerts (
  id uuid primary key default gen_random_uuid(),
  source_report_id uuid not null unique references public.incident_reports(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  summary text not null check (char_length(btrim(summary)) between 1 and 1000),
  affected_area text not null check (char_length(btrim(affected_area)) between 1 and 240),
  category public.incident_category not null,
  guidance text not null check (char_length(btrim(guidance)) between 1 and 2000),
  expires_at timestamptz not null,
  danger_latitude double precision check (danger_latitude between -90 and 90),
  danger_longitude double precision check (danger_longitude between -180 and 180),
  danger_radius_km double precision check (danger_radius_km > 0 and danger_radius_km <= 500),
  status public.community_alert_status not null default 'Published',
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (
    (danger_latitude is null and danger_longitude is null and danger_radius_km is null)
    or (danger_latitude is not null and danger_longitude is not null and danger_radius_km is not null)
  )
);

create table public.community_alert_history (
  id bigint generated always as identity primary key,
  alert_id uuid not null references public.community_alerts(id) on delete restrict,
  action text not null check (action in ('Published', 'Updated', 'Resolved', 'Withdrawn')),
  old_status public.community_alert_status,
  new_status public.community_alert_status not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  public_snapshot jsonb not null
);

create index community_alerts_status_expiry_idx on public.community_alerts (status, expires_at);
create index community_alerts_area_idx on public.community_alerts (affected_area);
create index community_alert_history_alert_idx on public.community_alert_history (alert_id, changed_at);

create function private.community_alert_snapshot(alert_row public.community_alerts)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'title', alert_row.title,
    'summary', alert_row.summary,
    'affected_area', alert_row.affected_area,
    'category', alert_row.category,
    'guidance', alert_row.guidance,
    'expires_at', alert_row.expires_at,
    'danger_latitude', alert_row.danger_latitude,
    'danger_longitude', alert_row.danger_longitude,
    'danger_radius_km', alert_row.danger_radius_km,
    'status', alert_row.status,
    'published_at', alert_row.published_at,
    'updated_at', alert_row.updated_at
  )
$$;
revoke all on function private.community_alert_snapshot(public.community_alerts) from public, anon, authenticated;

create function public.publish_community_alert(
  verified_report_id uuid,
  public_title text,
  public_summary text,
  public_affected_area text,
  public_category public.incident_category,
  public_guidance text,
  public_expires_at timestamptz,
  public_danger_latitude double precision default null,
  public_danger_longitude double precision default null,
  public_danger_radius_km double precision default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare report_status public.report_status;
declare new_alert public.community_alerts;
begin
  if auth.uid() is null or not private.is_responder() then
    raise exception 'Responder access required' using errcode = '42501';
  end if;
  select status into report_status from public.incident_reports where id = verified_report_id for update;
  if not found then raise exception 'Report not found' using errcode = 'P0002'; end if;
  if report_status <> 'Verified' then
    raise exception 'Only a Verified report can be published' using errcode = '23514';
  end if;
  if public_expires_at <= now() then
    raise exception 'Alert expiry must be in the future' using errcode = '23514';
  end if;
  insert into public.community_alerts (
    source_report_id, title, summary, affected_area, category, guidance, expires_at,
    danger_latitude, danger_longitude, danger_radius_km, published_by, updated_by
  ) values (
    verified_report_id, btrim(public_title), btrim(public_summary), btrim(public_affected_area), public_category,
    btrim(public_guidance), public_expires_at, public_danger_latitude, public_danger_longitude,
    public_danger_radius_km, auth.uid(), auth.uid()
  ) returning * into new_alert;
  insert into public.community_alert_history (alert_id, action, old_status, new_status, changed_by, public_snapshot)
  values (new_alert.id, 'Published', null, new_alert.status, auth.uid(), private.community_alert_snapshot(new_alert));
  return new_alert.id;
end;
$$;

create function public.update_community_alert(
  target_alert_id uuid,
  public_title text,
  public_summary text,
  public_affected_area text,
  public_category public.incident_category,
  public_guidance text,
  public_expires_at timestamptz,
  public_danger_latitude double precision default null,
  public_danger_longitude double precision default null,
  public_danger_radius_km double precision default null
)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_alert public.community_alerts;
declare updated_alert public.community_alerts;
begin
  if auth.uid() is null or not private.is_responder() then
    raise exception 'Responder access required' using errcode = '42501';
  end if;
  select * into current_alert from public.community_alerts where id = target_alert_id for update;
  if not found then raise exception 'Alert not found' using errcode = 'P0002'; end if;
  if current_alert.status = 'Withdrawn' then
    raise exception 'A withdrawn alert cannot be updated' using errcode = '23514';
  end if;
  if public_expires_at <= now() then
    raise exception 'Alert expiry must be in the future' using errcode = '23514';
  end if;
  update public.community_alerts set
    title = btrim(public_title), summary = btrim(public_summary), affected_area = btrim(public_affected_area),
    category = public_category, guidance = btrim(public_guidance), expires_at = public_expires_at,
    danger_latitude = public_danger_latitude, danger_longitude = public_danger_longitude,
    danger_radius_km = public_danger_radius_km, updated_by = auth.uid(), updated_at = now()
  where id = target_alert_id returning * into updated_alert;
  insert into public.community_alert_history (alert_id, action, old_status, new_status, changed_by, public_snapshot)
  values (updated_alert.id, 'Updated', current_alert.status, updated_alert.status, auth.uid(), private.community_alert_snapshot(updated_alert));
end;
$$;

create function public.set_community_alert_status(target_alert_id uuid, target_status public.community_alert_status)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_alert public.community_alerts;
declare updated_alert public.community_alerts;
begin
  if auth.uid() is null or not private.is_responder() then
    raise exception 'Responder access required' using errcode = '42501';
  end if;
  if target_status not in ('Resolved', 'Withdrawn') then
    raise exception 'Status must be Resolved or Withdrawn' using errcode = '23514';
  end if;
  select * into current_alert from public.community_alerts where id = target_alert_id for update;
  if not found then raise exception 'Alert not found' using errcode = 'P0002'; end if;
  if current_alert.status <> 'Published' then
    raise exception 'Only a Published alert can be resolved or withdrawn' using errcode = '23514';
  end if;
  update public.community_alerts set status = target_status, updated_by = auth.uid(), updated_at = now()
  where id = target_alert_id returning * into updated_alert;
  insert into public.community_alert_history (alert_id, action, old_status, new_status, changed_by, public_snapshot)
  values (updated_alert.id, target_status::text, current_alert.status, updated_alert.status, auth.uid(), private.community_alert_snapshot(updated_alert));
end;
$$;

revoke all on function public.publish_community_alert(uuid, text, text, text, public.incident_category, text, timestamptz, double precision, double precision, double precision) from public, anon;
revoke all on function public.update_community_alert(uuid, text, text, text, public.incident_category, text, timestamptz, double precision, double precision, double precision) from public, anon;
revoke all on function public.set_community_alert_status(uuid, public.community_alert_status) from public, anon;
grant execute on function public.publish_community_alert(uuid, text, text, text, public.incident_category, text, timestamptz, double precision, double precision, double precision) to authenticated;
grant execute on function public.update_community_alert(uuid, text, text, text, public.incident_category, text, timestamptz, double precision, double precision, double precision) to authenticated;
grant execute on function public.set_community_alert_status(uuid, public.community_alert_status) to authenticated;

alter table public.community_alerts enable row level security;
alter table public.community_alert_history enable row level security;
create policy community_alerts_responder_read on public.community_alerts for select to authenticated using ((select private.is_responder()));
create policy community_alert_history_responder_read on public.community_alert_history for select to authenticated using ((select private.is_responder()));

revoke all on public.community_alerts, public.community_alert_history from anon, authenticated;
grant select on public.community_alerts, public.community_alert_history to authenticated;

create view public.community_alert_feed
with (security_barrier = true)
as
select
  id, title, summary, affected_area, category, guidance, expires_at,
  danger_latitude, danger_longitude, danger_radius_km,
  case when status = 'Published' and expires_at <= now() then 'Expired' else status::text end as display_status,
  published_at, updated_at
from public.community_alerts
where status <> 'Withdrawn';

revoke all on public.community_alert_feed from public;
grant select on public.community_alert_feed to anon, authenticated;

comment on view public.community_alert_feed is 'Explicit public fields only. It excludes source reports, responder identities and withdrawn alerts.';
comment on table public.community_alerts is 'Responder-curated alerts stored separately from private incident reports.';
