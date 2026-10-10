-- Opt-in Web Push subscriptions and a durable, retryable delivery queue.
-- Apply after 20261009000300_private_report_messaging.sql.

create table public.notification_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 4096),
  p256dh text not null check (char_length(p256dh) between 20 and 512),
  auth_secret text not null check (char_length(auth_secret) between 8 and 512),
  user_agent text check (char_length(user_agent) <= 500),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  invalidated_at timestamptz
);

create table public.push_subscription_areas (
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  area_id uuid not null references public.notification_areas(id) on delete restrict,
  primary key (subscription_id, area_id)
);

create table public.alert_notification_areas (
  source_kind text not null check (source_kind in ('responder_alert', 'community_post')),
  alert_id uuid not null,
  area_id uuid not null references public.notification_areas(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (source_kind, alert_id, area_id)
);

create table public.push_delivery_queue (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  source_kind text not null check (source_kind in ('responder_alert', 'community_post')),
  alert_id uuid not null,
  alert_version timestamptz not null,
  state text not null default 'Pending' check (state in ('Pending', 'Processing', 'Retry', 'Sent', 'Cancelled', 'Invalid subscription', 'Failed')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (subscription_id, source_kind, alert_id, alert_version)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id, enabled);
create index push_delivery_ready_idx on public.push_delivery_queue (state, next_attempt_at);
create index alert_notification_areas_alert_idx on public.alert_notification_areas (source_kind, alert_id);

alter table public.notification_areas enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_subscription_areas enable row level security;
alter table public.alert_notification_areas enable row level security;
alter table public.push_delivery_queue enable row level security;

revoke all on public.notification_areas, public.push_subscriptions, public.push_subscription_areas,
  public.alert_notification_areas, public.push_delivery_queue from public, anon, authenticated;
revoke usage, select on sequence public.push_delivery_queue_id_seq from public, anon, authenticated;

create function public.list_notification_areas()
returns table (id uuid, code text, name text)
language sql stable security definer set search_path = ''
as $$ select area.id, area.code, area.name from public.notification_areas area where area.active order by area.name $$;

create function public.get_push_notification_settings()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is null then '{}'::jsonb else jsonb_build_object(
    'enabled', exists (select 1 from public.push_subscriptions subscription where subscription.user_id = auth.uid() and subscription.enabled),
    'area_ids', coalesce((select jsonb_agg(distinct followed.area_id) from public.push_subscription_areas followed
      join public.push_subscriptions subscription on subscription.id = followed.subscription_id
      where subscription.user_id = auth.uid() and subscription.enabled), '[]'::jsonb)
  ) end
$$;

create function private.validate_push_areas(followed_area_ids uuid[])
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(cardinality(followed_area_ids), 0) = 0 then raise exception 'Select at least one notification area' using errcode = '23514'; end if;
  if exists (select 1 from unnest(followed_area_ids) requested(id) left join public.notification_areas area on area.id = requested.id and area.active where area.id is null)
    then raise exception 'An unknown or inactive notification area was selected' using errcode = '23514'; end if;
end $$;

create function public.save_push_subscription(subscription_endpoint text, subscription_p256dh text, subscription_auth text, followed_area_ids uuid[], browser_user_agent text default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare new_subscription_id uuid;
declare existing_owner uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if private.is_account_suspended(auth.uid()) then raise exception 'Account suspended. Notification settings cannot be changed.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(subscription_endpoint, ''))) not between 20 and 4096
    or char_length(btrim(coalesce(subscription_p256dh, ''))) not between 20 and 512
    or char_length(btrim(coalesce(subscription_auth, ''))) not between 8 and 512 then
    raise exception 'Invalid push subscription' using errcode = '23514';
  end if;
  perform private.validate_push_areas(followed_area_ids);
  select user_id into existing_owner from public.push_subscriptions where endpoint = btrim(subscription_endpoint) for update;
  if existing_owner is not null and existing_owner <> auth.uid() then raise exception 'Subscription belongs to another account' using errcode = '42501'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret, user_agent)
  values (auth.uid(), btrim(subscription_endpoint), btrim(subscription_p256dh), btrim(subscription_auth), nullif(left(browser_user_agent, 500), ''))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth_secret = excluded.auth_secret,
    user_agent = excluded.user_agent, enabled = true, invalidated_at = null, updated_at = now()
    where public.push_subscriptions.user_id = auth.uid()
  returning id into new_subscription_id;
  if new_subscription_id is null then raise exception 'Subscription belongs to another account' using errcode = '42501'; end if;
  delete from public.push_subscription_areas where push_subscription_areas.subscription_id = new_subscription_id;
  insert into public.push_subscription_areas (subscription_id, area_id) select new_subscription_id, id from unnest(followed_area_ids) ids(id) on conflict do nothing;
  return new_subscription_id;
end $$;

create function public.update_push_followed_areas(followed_area_ids uuid[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if private.is_account_suspended(auth.uid()) then raise exception 'Account suspended. Notification settings cannot be changed.' using errcode = '42501'; end if;
  perform private.validate_push_areas(followed_area_ids);
  if not exists (select 1 from public.push_subscriptions where user_id = auth.uid() and enabled) then raise exception 'No enabled subscription found' using errcode = 'P0002'; end if;
  delete from public.push_subscription_areas areas using public.push_subscriptions subscriptions
    where areas.subscription_id = subscriptions.id and subscriptions.user_id = auth.uid();
  insert into public.push_subscription_areas (subscription_id, area_id)
    select subscription.id, requested.id from public.push_subscriptions subscription cross join unnest(followed_area_ids) requested(id)
    where subscription.user_id = auth.uid() and subscription.enabled on conflict do nothing;
end $$;

create function public.disable_push_notifications(subscription_endpoint text)
returns void language plpgsql security definer set search_path = ''
as $$
declare target_subscription_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.push_subscriptions set enabled = false, updated_at = now()
    where user_id = auth.uid() and endpoint = subscription_endpoint returning id into target_subscription_id;
  if target_subscription_id is not null then update public.push_delivery_queue set state = 'Cancelled', locked_at = null
    where subscription_id = target_subscription_id and state in ('Pending', 'Retry', 'Processing'); end if;
end $$;

create function public.set_alert_notification_areas(target_source_kind text, target_alert_id uuid, target_area_ids uuid[])
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_responder() then raise exception 'Responder access required' using errcode = '42501'; end if;
  if private.is_account_suspended(auth.uid()) then raise exception 'Account suspended. Responder actions are disabled.' using errcode = '42501'; end if;
  if target_source_kind not in ('responder_alert', 'community_post') then raise exception 'Invalid alert source' using errcode = '23514'; end if;
  perform private.validate_push_areas(target_area_ids);
  if target_source_kind = 'responder_alert' and not exists (select 1 from public.community_alerts where id = target_alert_id) then raise exception 'Alert not found' using errcode = 'P0002'; end if;
  if target_source_kind = 'community_post' and not exists (select 1 from public.community_posts where id = target_alert_id) then raise exception 'Post not found' using errcode = 'P0002'; end if;
  delete from public.alert_notification_areas where source_kind = target_source_kind and alert_id = target_alert_id;
  insert into public.alert_notification_areas (source_kind, alert_id, area_id, assigned_by)
    select target_source_kind, target_alert_id, id, auth.uid() from unnest(target_area_ids) ids(id);
end $$;

create function public.get_alert_notification_areas(target_source_kind text, target_alert_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_responder() then raise exception 'Responder access required' using errcode = '42501'; end if;
  return coalesce((select array_agg(area_id order by area_id) from public.alert_notification_areas where source_kind = target_source_kind and alert_id = target_alert_id), '{}'::uuid[]);
end $$;

create function private.queue_verified_alert(target_source_kind text, target_alert_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare version_time timestamptz;
begin
  if target_source_kind = 'responder_alert' then
    select updated_at into version_time from public.community_alerts where id = target_alert_id and status = 'Published' and expires_at > now();
  else
    select updated_at into version_time from public.community_posts where id = target_alert_id and status = 'Verified' and expires_at > now();
  end if;
  if version_time is null then return; end if;
  insert into public.push_delivery_queue (subscription_id, source_kind, alert_id, alert_version)
  select distinct subscription.id, target_source_kind, target_alert_id, version_time
  from public.alert_notification_areas alert_area
  join public.push_subscription_areas followed on followed.area_id = alert_area.area_id
  join public.push_subscriptions subscription on subscription.id = followed.subscription_id and subscription.enabled
  where alert_area.source_kind = target_source_kind and alert_area.alert_id = target_alert_id
  on conflict do nothing;
end $$;

create function private.queue_responder_alert_change() returns trigger language plpgsql security definer set search_path = ''
as $$ begin perform private.queue_verified_alert('responder_alert', new.id); return new; end $$;
create function private.queue_community_post_change() returns trigger language plpgsql security definer set search_path = ''
as $$ begin perform private.queue_verified_alert('community_post', new.id); return new; end $$;
create function private.queue_alert_area_change() returns trigger language plpgsql security definer set search_path = ''
as $$ begin perform private.queue_verified_alert(new.source_kind, new.alert_id); return new; end $$;
create trigger queue_responder_alert_push after insert or update on public.community_alerts for each row execute function private.queue_responder_alert_change();
create trigger queue_community_post_push after insert or update on public.community_posts for each row execute function private.queue_community_post_change();
create trigger queue_alert_area_push after insert on public.alert_notification_areas for each row execute function private.queue_alert_area_change();

create function public.claim_push_deliveries(batch_size integer default 50)
returns table (delivery_id bigint, endpoint text, p256dh text, auth_secret text, alert_id uuid, source_kind text, alert_version timestamptz, title text, body text)
language plpgsql security definer set search_path = ''
as $$
begin
  return query with candidates as (
    select queue.id from public.push_delivery_queue queue join public.push_subscriptions subscription on subscription.id = queue.subscription_id
    where (queue.state in ('Pending', 'Retry') and queue.next_attempt_at <= now() or queue.state = 'Processing' and queue.locked_at < now() - interval '5 minutes') and subscription.enabled
      and ((queue.source_kind = 'responder_alert' and exists (select 1 from public.community_alerts alert where alert.id = queue.alert_id and alert.status = 'Published' and alert.expires_at > now()))
        or (queue.source_kind = 'community_post' and exists (select 1 from public.community_posts post where post.id = queue.alert_id and post.status = 'Verified' and post.expires_at > now())))
    order by queue.next_attempt_at for update skip locked limit least(greatest(batch_size, 1), 100)
  ), claimed as (
    update public.push_delivery_queue queue set state = 'Processing', attempts = attempts + 1, locked_at = now()
    from candidates where queue.id = candidates.id returning queue.*
  )
  select claimed.id, subscription.endpoint, subscription.p256dh, subscription.auth_secret, claimed.alert_id, claimed.source_kind, claimed.alert_version,
    case when claimed.source_kind = 'responder_alert' then (select alert.title from public.community_alerts alert where alert.id = claimed.alert_id) else 'Verified community alert' end,
    case when claimed.source_kind = 'responder_alert' then (select alert.category::text || ' · ' || alert.affected_area from public.community_alerts alert where alert.id = claimed.alert_id)
      else (select post.category::text || ' · ' || post.area_name from public.community_posts post where post.id = claimed.alert_id) end
  from claimed join public.push_subscriptions subscription on subscription.id = claimed.subscription_id;
  update public.push_delivery_queue queue set state = 'Cancelled', locked_at = null
  where queue.state in ('Pending', 'Retry') and ((queue.source_kind = 'responder_alert' and not exists (select 1 from public.community_alerts alert where alert.id = queue.alert_id and alert.status = 'Published' and alert.expires_at > now()))
    or (queue.source_kind = 'community_post' and not exists (select 1 from public.community_posts post where post.id = queue.alert_id and post.status = 'Verified' and post.expires_at > now())));
end $$;

create function public.complete_push_delivery(target_delivery_id bigint, outcome text, failure_message text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare delivery public.push_delivery_queue;
begin
  select * into delivery from public.push_delivery_queue where id = target_delivery_id for update;
  if not found or delivery.state <> 'Processing' then return; end if;
  if outcome = 'sent' then
    update public.push_delivery_queue set state = 'Sent', sent_at = now(), locked_at = null, last_error = null where id = target_delivery_id;
    update public.push_subscriptions set last_success_at = now() where id = delivery.subscription_id;
  elsif outcome = 'invalid' then
    update public.push_delivery_queue set state = 'Invalid subscription', locked_at = null, last_error = left(failure_message, 1000) where id = target_delivery_id;
    update public.push_subscriptions set enabled = false, invalidated_at = now(), updated_at = now() where id = delivery.subscription_id;
    update public.push_delivery_queue set state = 'Cancelled', locked_at = null where subscription_id = delivery.subscription_id and state in ('Pending', 'Retry');
  else
    update public.push_delivery_queue set state = case when attempts >= 8 then 'Failed' else 'Retry' end,
      next_attempt_at = now() + make_interval(secs => least(3600, 30 * power(2, greatest(attempts - 1, 0)))::integer),
      locked_at = null, last_error = left(failure_message, 1000) where id = target_delivery_id;
  end if;
end $$;

revoke all on function private.validate_push_areas(uuid[]), private.queue_verified_alert(text, uuid), private.queue_responder_alert_change(), private.queue_community_post_change(), private.queue_alert_area_change() from public, anon, authenticated;
revoke all on function public.list_notification_areas(), public.get_push_notification_settings(), public.save_push_subscription(text, text, text, uuid[], text), public.update_push_followed_areas(uuid[]), public.disable_push_notifications(text), public.set_alert_notification_areas(text, uuid, uuid[]), public.get_alert_notification_areas(text, uuid), public.claim_push_deliveries(integer), public.complete_push_delivery(bigint, text, text) from public, anon, authenticated;
grant execute on function public.list_notification_areas() to anon, authenticated;
grant execute on function public.get_push_notification_settings(), public.save_push_subscription(text, text, text, uuid[], text), public.update_push_followed_areas(uuid[]), public.disable_push_notifications(text), public.set_alert_notification_areas(text, uuid, uuid[]), public.get_alert_notification_areas(text, uuid) to authenticated;
grant execute on function public.claim_push_deliveries(integer), public.complete_push_delivery(bigint, text, text) to service_role;

comment on table public.push_subscriptions is 'Sensitive Web Push endpoints and keys. Browser roles have no direct table access; owner-scoped RPCs expose settings without endpoint data.';
comment on table public.push_delivery_queue is 'Durable idempotent queue. One delivery exists per subscription, alert source and material alert version.';
