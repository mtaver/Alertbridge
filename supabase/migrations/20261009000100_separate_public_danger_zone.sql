-- Separate public community-warning coordinates from private assistance coordinates.
-- This replaces only the submission RPC; existing tables, rows, RLS and audit history are preserved.
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
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if reporting_channel not in ('assistance', 'community', 'both') then raise exception 'Invalid reporting channel' using errcode = '23514'; end if;
  if client_request_id is null then raise exception 'A client request ID is required' using errcode = '23514'; end if;

  insert into public.reporting_submission_receipts (user_id, request_id)
  values (auth.uid(), client_request_id)
  on conflict do nothing;
  select result into existing_result from public.reporting_submission_receipts
  where user_id = auth.uid() and request_id = client_request_id for update;
  if existing_result is not null then return existing_result; end if;

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

revoke all on function public.submit_reporting_channels(uuid, text, public.report_mode, public.incident_category, text, public.question_answer, public.question_answer, text, double precision, double precision, timestamptz, text, text, timestamptz, double precision) from public, anon, authenticated;
drop function public.submit_reporting_channels(uuid, text, public.report_mode, public.incident_category, text, public.question_answer, public.question_answer, text, double precision, double precision, timestamptz, text, text, timestamptz, double precision);

comment on function public.submit_reporting_channels(uuid, text, public.report_mode, public.incident_category, text, public.question_answer, public.question_answer, text, double precision, double precision, timestamptz, text, text, timestamptz, double precision, double precision, double precision)
is 'Retry-safe transactional submission with separate private assistance and explicitly public danger-zone coordinates.';
