-- Public, metadata-only change signals for Community Alerts.
-- Clients refetch the explicit-field community_alert_feed view after each signal.
create table public.community_alert_events (
  id bigint generated always as identity primary key,
  alert_id uuid not null,
  changed_at timestamptz not null default now()
);

alter table public.community_alert_events enable row level security;
create policy community_alert_events_public_read
  on public.community_alert_events for select to anon, authenticated
  using (true);

revoke all on public.community_alert_events from public, anon, authenticated;
grant select on public.community_alert_events to anon, authenticated;

create function private.signal_community_alert_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.community_alert_events (alert_id) values (new.id);
  return new;
end;
$$;

revoke all on function private.signal_community_alert_change() from public, anon, authenticated;

create trigger community_alert_realtime_signal
after insert or update on public.community_alerts
for each row execute function private.signal_community_alert_change();

alter publication supabase_realtime add table public.community_alert_events;

comment on table public.community_alert_events is
  'Public change signals containing no report, reporter, responder, location or alert content. Clients refetch the safe public feed.';
