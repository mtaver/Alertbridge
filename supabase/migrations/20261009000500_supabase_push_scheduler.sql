-- Supabase-driven wake-up and recovery scheduling for Vercel Hobby.
-- Apply after 20261009000400_web_push_notifications.sql.
-- Vault secrets required before this migration:
--   alertbridge_push_worker_url    full HTTPS /api/process-push-queue URL
--   alertbridge_push_worker_secret value matching Vercel CRON_SECRET

create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists supabase_vault;

create function private.request_push_worker_wakeup()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  worker_url text;
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret into worker_url
  from vault.decrypted_secrets where name = 'alertbridge_push_worker_url' limit 1;
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets where name = 'alertbridge_push_worker_secret' limit 1;

  -- Missing setup is deliberately a no-op: it must not roll back alert publication.
  if nullif(btrim(worker_url), '') is null or nullif(btrim(worker_secret), '') is null then
    return null;
  end if;

  select net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || worker_secret
    ),
    body := jsonb_build_object('source', 'supabase-push-queue'),
    timeout_milliseconds := 15000
  ) into request_id;
  return request_id;
exception when others then
  -- pg_net enqueue/configuration failures must never block incident or alert writes.
  raise warning 'AlertBridge push worker wake-up was not queued: %', sqlerrm;
  return null;
end
$$;

revoke all on function private.request_push_worker_wakeup() from public, anon, authenticated;

create function private.wake_push_worker_after_queue_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from new_push_deliveries) then
    perform private.request_push_worker_wakeup();
  end if;
  return null;
exception when others then
  -- This final guard keeps the originating report/publication transaction independent.
  raise warning 'AlertBridge push queue trigger could not request delivery: %', sqlerrm;
  return null;
end
$$;

revoke all on function private.wake_push_worker_after_queue_insert() from public, anon, authenticated;

create trigger wake_push_worker_after_queue_insert
after insert on public.push_delivery_queue
referencing new table as new_push_deliveries
for each statement execute function private.wake_push_worker_after_queue_insert();

-- Reapplying in a repaired environment must not create duplicate recovery jobs.
do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'alertbridge-push-queue-recovery';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'alertbridge-push-queue-recovery',
    '* * * * *',
    'select private.request_push_worker_wakeup();'
  );
end
$$;

comment on function private.request_push_worker_wakeup() is
  'Best-effort asynchronous wake-up using Vault and pg_net. Missing secrets or HTTP failures never roll back reporting/publication; the durable queue remains authoritative.';
