-- Initial structured notification area for the Makurdi pilot.
-- This catalog entry is an opt-in matching identifier only. It does not define
-- neighbourhood boundaries, emergency-service coverage, or a safety guarantee.
-- Apply only after 20261009000400_web_push_notifications.sql.

insert into public.notification_areas (code, name, active)
values ('ng-benue-makurdi', 'Makurdi', true)
on conflict (code) do nothing;
