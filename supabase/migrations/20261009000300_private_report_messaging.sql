-- Private, immutable conversations for assistance reports.
-- Depends on 20261009000200_abuse_protection.sql.

create table public.report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.incident_reports(id) on delete restrict,
  sender_id uuid not null references auth.users(id) on delete restrict,
  sender_role text not null check (sender_role in ('Reporter', 'Responder')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  client_message_id uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_id, client_message_id)
);

create table public.report_conversation_reads (
  report_id uuid not null references public.incident_reports(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  last_read_at timestamptz not null default now(),
  primary key (report_id, user_id)
);

create table public.private_message_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.incident_reports(id) on delete cascade,
  message_id uuid not null references public.report_messages(id) on delete cascade,
  changed_at timestamptz not null default now()
);

create index report_messages_report_created_idx on public.report_messages (report_id, created_at, id);
create index report_messages_sender_created_idx on public.report_messages (sender_id, created_at desc);
create index private_message_events_report_idx on public.private_message_events (report_id, changed_at desc);

create function private.can_access_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.incident_reports report
    where report.id = target_report_id
      and (report.reporter_id = auth.uid() or private.is_responder())
  )
$$;
revoke all on function private.can_access_report(uuid) from public, anon;
grant execute on function private.can_access_report(uuid) to authenticated;

create function private.prevent_report_message_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Report messages are immutable' using errcode = '42501';
end;
$$;
revoke all on function private.prevent_report_message_mutation() from public, anon, authenticated;
create trigger report_messages_immutable
before update or delete on public.report_messages
for each row execute function private.prevent_report_message_mutation();

create trigger reject_suspended_report_message_write
before insert on public.report_messages
for each statement execute function private.reject_suspended_writer();

create function private.signal_private_message_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.private_message_events (report_id, message_id)
  values (new.report_id, new.id);
  return new;
end;
$$;
revoke all on function private.signal_private_message_change() from public, anon, authenticated;
create trigger report_message_realtime_signal
after insert on public.report_messages
for each row execute function private.signal_private_message_change();

create function public.send_report_message(
  target_report_id uuid,
  message_body text,
  client_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare existing_message_id uuid;
declare new_message_id uuid;
declare author_role text;
declare recent_count integer;
declare daily_count integer;
declare short_retry_at timestamptz;
declare daily_retry_at timestamptz;
declare retry_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if client_request_id is null then raise exception 'A client request ID is required' using errcode = '23514'; end if;

  select message.id into existing_message_id
  from public.report_messages message
  where message.sender_id = auth.uid() and message.client_message_id = client_request_id;
  if existing_message_id is not null then return existing_message_id; end if;

  if private.is_account_suspended(auth.uid()) then
    raise exception 'Account suspended. Sending messages is disabled.' using errcode = '42501';
  end if;
  if not private.can_access_report(target_report_id) then
    raise exception 'Report not found or access denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(message_body, ''))) = 0 then
    raise exception 'Enter a message' using errcode = '23514';
  end if;
  if char_length(message_body) > 2000 then
    raise exception 'Messages must be 2000 characters or fewer' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alertbridge-message:' || auth.uid()::text, 0));
  -- Recheck idempotency after waiting behind another request from this sender.
  select message.id into existing_message_id
  from public.report_messages message
  where message.sender_id = auth.uid() and message.client_message_id = client_request_id;
  if existing_message_id is not null then return existing_message_id; end if;

  select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
  into recent_count, daily_count
  from public.report_messages
  where sender_id = auth.uid() and created_at > now() - interval '24 hours';

  if recent_count >= 10 then
    select created_at + interval '1 minute' into short_retry_at
    from public.report_messages
    where sender_id = auth.uid() and created_at > now() - interval '1 minute'
    order by created_at desc offset 9 limit 1;
  end if;
  if daily_count >= 100 then
    select created_at + interval '24 hours' into daily_retry_at
    from public.report_messages
    where sender_id = auth.uid() and created_at > now() - interval '24 hours'
    order by created_at desc offset 99 limit 1;
  end if;
  retry_at := greatest(short_retry_at, daily_retry_at);
  if retry_at is not null then
    raise exception 'Message limit reached. Try again after %.', to_char(retry_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      using errcode = 'P0001', detail = jsonb_build_object('retry_after', retry_at)::text;
  end if;

  select case when report.reporter_id = auth.uid() then 'Reporter' else 'Responder' end
  into author_role
  from public.incident_reports report
  where report.id = target_report_id;

  insert into public.report_messages (report_id, sender_id, sender_role, body, client_message_id)
  values (target_report_id, auth.uid(), author_role, btrim(message_body), client_request_id)
  returning id into new_message_id;
  return new_message_id;
end;
$$;

create function public.mark_report_conversation_read(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.can_access_report(target_report_id) then
    raise exception 'Report not found or access denied' using errcode = '42501';
  end if;
  insert into public.report_conversation_reads (report_id, user_id, last_read_at)
  values (target_report_id, auth.uid(), now())
  on conflict (report_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

create function public.get_report_unread_counts()
returns table (report_id uuid, unread_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select message.report_id, count(*)::bigint
  from public.report_messages message
  left join public.report_conversation_reads read_state
    on read_state.report_id = message.report_id and read_state.user_id = auth.uid()
  where auth.uid() is not null
    and private.can_access_report(message.report_id)
    and message.sender_id <> auth.uid()
    and message.created_at > coalesce(read_state.last_read_at, '-infinity'::timestamptz)
  group by message.report_id
$$;

revoke all on function public.send_report_message(uuid, text, uuid) from public, anon;
revoke all on function public.mark_report_conversation_read(uuid) from public, anon;
revoke all on function public.get_report_unread_counts() from public, anon;
grant execute on function public.send_report_message(uuid, text, uuid) to authenticated;
grant execute on function public.mark_report_conversation_read(uuid) to authenticated;
grant execute on function public.get_report_unread_counts() to authenticated;

alter table public.report_messages enable row level security;
alter table public.report_conversation_reads enable row level security;
alter table public.private_message_events enable row level security;

create policy report_messages_accessible_read on public.report_messages
for select to authenticated using ((select private.can_access_report(report_id)));
create policy conversation_reads_own_read on public.report_conversation_reads
for select to authenticated using (user_id = (select auth.uid()) and (select private.can_access_report(report_id)));
create policy private_message_events_accessible_read on public.private_message_events
for select to authenticated using ((select private.can_access_report(report_id)));

revoke all on public.report_messages, public.report_conversation_reads, public.private_message_events from public, anon, authenticated;
grant select on public.report_messages, public.report_conversation_reads, public.private_message_events to authenticated;
revoke usage, select on sequence public.private_message_events_id_seq from public, anon, authenticated;

alter publication supabase_realtime add table public.private_message_events;

comment on table public.report_messages is 'Immutable private messages visible only to the report owner and authorised responders.';
comment on table public.private_message_events is 'Metadata-only Realtime signal. Message bodies are fetched separately through RLS.';
comment on function public.send_report_message(uuid, text, uuid) is 'Retry-safe private message send with per-account limits of 10 per minute and 100 per 24 hours.';
