# AlertBridge

AlertBridge is a community safety reporting prototype for security threats and natural hazards. It uses Supabase accounts, private report storage, public community alerts, and database-enforced responder access.

> AlertBridge is not an emergency service, does not notify emergency services, and does not claim an agency partnership or guaranteed rescue response.

## Run locally

Requirements: a current Node.js release and npm or pnpm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

```bash
npm test
npm run check
npm run build
npm run preview
```

## Supabase configuration

Supabase configuration is required. Without both public Supabase variables, the app shows a service-unavailable message instead of offering reporting or account workflows. Community Alerts remain readable without signing in when the service is configured; posting a warning or requesting assistance requires an account.

Earlier releases stored demonstration reports under the browser-local key `alertbridge-demo-reports-v1`. The connected-only app does not read, upload, modify, or delete that existing data.

Copy the example file and fill in the public browser values from **Supabase Dashboard → Project Settings → API**:

```bash
cp .env.example .env.local
```

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

The anon/publishable key is intended for browser clients and is constrained by row-level security. Never put a service-role key, database password, personal access token, or other secret in `.env.example`, a `VITE_` variable, frontend code, or Git.

Restart Vite after changing environment variables.

### Optional place search

Incident and destination place search uses the Mapbox Geocoding v6 REST API directly and adds no map-library dependency. Create a public Mapbox access token, restrict it to the application's allowed URLs in Mapbox, and set:

```dotenv
VITE_MAPBOX_ACCESS_TOKEN=your-public-url-restricted-token
```

Search text is sent to Mapbox only after the user selects **Search**. GPS coordinates are not sent to Mapbox by nearby monitoring. Without this variable, GPS selection and the advanced manual-coordinate fallback continue to work; the interface explains that place search is unavailable.

## Vercel deployment preparation

This repository is a Vite single-page application. Its deployment settings are:

- Framework preset: **Vite**
- Build command: `pnpm run build`
- Output directory: `dist`
- Root directory: repository root

`vercel.json` rewrites application paths to `index.html` so direct links and authentication returns load the SPA. Static build assets continue to be served by Vercel.

Configure these environment-variable names in Vercel Project Settings:

- `VITE_SUPABASE_URL` — required
- `VITE_SUPABASE_ANON_KEY` — required; use only the public browser key, never a service-role key
- `VITE_MAPBOX_ACCESS_TOKEN` — optional; place search remains unavailable when omitted
- `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` — public VAPID key; required only when Web Push is activated

The Web Push delivery function also requires server-only Vercel variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET`. Never prefix the private key, service-role key, or cron secret with `VITE_`; doing so would expose it in browser JavaScript.

Set the required Supabase variables for Production and any Preview environment where AlertBridge should work. Environment-variable changes require a new Vercel build.

### Supabase authentication URLs after the hosted URL is known

The sign-up verification and password-reset code both redirect to `window.location.origin`. After Vercel assigns the production URL, open **Supabase Dashboard → Authentication → URL Configuration** and:

1. Set **Site URL** to the exact production HTTPS origin, for example `https://your-alertbridge-domain.example`.
2. Add that same exact production origin to **Redirect URLs**.
3. Keep the existing local redirect URLs, including `http://localhost:5173` and `http://127.0.0.1:5173`; do not replace them.
4. If authentication must work on Vercel Preview deployments, add a narrowly scoped preview wildcard for the project's Vercel account or team. Keep the production URL exact.
5. Confirm the Supabase email templates use the redirect destination when customized, then test both a new-account verification link and a password-reset link against the deployed origin.

Deployment does not connect AlertBridge to an emergency service or agency. Keep the in-app notice visible: reports stored in AlertBridge do not notify or dispatch emergency responders.

### Import into Vercel

1. In Vercel, choose **Add New → Project** and import the GitHub repository `mtaver/Alertbridge`.
2. Leave the root directory at the repository root and select the **Vite** framework preset.
3. Confirm the build command is `pnpm run build` and the output directory is `dist`.
4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Add `VITE_MAPBOX_ACCESS_TOKEN` only if place search is wanted.
5. Review the settings, but do not deploy until the Supabase production Site URL and Redirect URL plan is ready.
6. After the first deployment supplies the final HTTPS URL, update Supabase URL Configuration as described above and redeploy if any Vercel environment variables changed.

## Supabase project setup

1. Create a Supabase project. No project is created or linked automatically by this repository.
2. Install the Supabase CLI and a supported container runtime if you want to test locally.
3. Apply migrations in filename order:

   1. `supabase/migrations/20261008000100_alertbridge_core.sql`
   2. `supabase/migrations/20261008000200_community_alerts.sql`
   3. `supabase/migrations/20261008000300_community_alert_realtime.sql`
   4. `supabase/migrations/20261008000400_reporting_channels.sql`
   5. `supabase/migrations/20261009000100_separate_public_danger_zone.sql`
   6. `supabase/migrations/20261009000200_abuse_protection.sql`
   7. `supabase/migrations/20261009000300_private_report_messaging.sql`
   8. `supabase/migrations/20261009000400_web_push_notifications.sql`
   9. `supabase/migrations/20261009000500_supabase_push_scheduler.sql`
4. For a local Supabase stack, run `supabase start` followed by `supabase db reset`.
5. For a hosted project, link it and preview before applying:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push --dry-run
   supabase db push
   ```

6. In **Authentication → URL Configuration**, set the Site URL for the deployed app and add every allowed redirect URL. For local development, include `http://localhost:5173` and `http://127.0.0.1:5173`. Add the exact production HTTPS origin before deployment. Sign-up verification and password reset both redirect to the app origin.
7. Keep email confirmation enabled if accounts must verify their address before receiving a session. Configure a production SMTP provider before relying on email delivery in production.

## Web Push activation

Web Push is implemented but is not active until the final migration, area catalog, VAPID keys, server secrets and queue schedule are configured. It uses an explicit browser button, a service worker, account-owned subscriptions, structured area IDs and a durable database queue. Notifications are queued only for active, unexpired responder-published alerts and responder-verified community posts. Removed, withdrawn, resolved and expired records are rechecked and cancelled before delivery. Private assistance reports and messages never enter the push queue.

Production activation order:

1. In **Supabase Dashboard → Database → Extensions**, enable **Vault**, **pg_net** and **pg_cron**. The scheduler migration also uses `create extension if not exists`, but enabling and checking them first makes setup failures explicit.
2. Generate one VAPID key pair locally with `npx web-push generate-vapid-keys`. Do not paste the private key into chat or Git.
3. In Vercel Project Settings, configure `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET`. `VAPID_SUBJECT` should be a monitored `mailto:` address or HTTPS URL. The browser and server public keys must match. The private key, service-role key and cron secret must be server-only.
4. Apply `20261009000400_web_push_notifications.sql` after the already-applied messaging migration.
5. As a trusted administrator, seed stable area codes and names. Codes are identifiers and should not be renamed casually:

   ```sql
   insert into public.notification_areas (code, name)
   values ('lagos-mainland', 'Lagos Mainland'), ('lagos-island', 'Lagos Island');
   ```

   Replace these examples with the actual operational areas. Responders must select one or more of these IDs when publishing an alert or verifying a community post; subscriber matching never uses free-text substrings.
6. Store the full production worker URL and the same invocation secret in Supabase Vault. Replace the placeholders locally; never commit the values:

   ```sql
   select vault.create_secret(
     'https://YOUR-VERCEL-DOMAIN/api/process-push-queue',
     'alertbridge_push_worker_url',
     'AlertBridge Web Push worker URL'
   );
   select vault.create_secret(
     'THE_SAME_VALUE_AS_VERCEL_CRON_SECRET',
     'alertbridge_push_worker_secret',
     'AlertBridge Web Push worker invocation secret'
   );
   ```

7. Apply `20261009000500_supabase_push_scheduler.sql`. It installs one statement-level queue-insert wake-up and one one-minute recovery job named `alertbridge-push-queue-recovery`.
8. Deploy only after reviewing the environment scopes. Test with dedicated accounts and labelled alerts before enabling for real users.

The database trigger asks the Vercel worker to drain the queue promptly after a queue-producing transaction. Supabase Cron invokes the same worker every minute to recover missed wake-ups and process due retries. Both calls use `pg_net`, so they are asynchronous. Missing Vault configuration, HTTP errors and wake-up enqueue failures are deliberately non-fatal and cannot roll back reporting or alert publication. The durable queue remains the source of truth.

The worker claims at most 20 deliveries per batch, processes no more than three batches per invocation, sends at most ten concurrently, uses an eight-second provider timeout and has a 60-second Vercel duration bound. It finishes every batch it claims. If more work remains, it stays queued for another event wake-up or the next one-minute recovery run; stale processing locks are already recoverable by the queue RPC.

To disable only the recurring recovery schedule while retaining event wake-ups:

```sql
select cron.unschedule(jobid)
from cron.job
where jobname = 'alertbridge-push-queue-recovery';
```

To pause all automatic delivery attempts, also disable the trigger through trusted administrative SQL. Do not delete queued rows; they can be processed after the trigger and schedule are restored.

Vercel Hobby cannot run its own every-minute cron, so `vercel.json` intentionally contains no cron entry. Calls originating from Supabase are ordinary Vercel Function invocations. At current published allowances, Vercel Hobby includes up to one million Function invocations, while a one-minute recovery schedule produces about 43,200 calls in a 30-day month before event wake-ups. Supabase currently includes Cron/pg_net as database capabilities, and Supabase Free includes 500,000 Edge Function invocations, although this design does not require an Edge Function. Zero incremental cost is conditional on remaining within all current Vercel and Supabase allowances; limits and pricing can change, and Free services may pause or restrict service. AlertBridge does not promise continuous availability or guaranteed notification delivery.

Web Push requires HTTPS (localhost is permitted for development), browser support, user permission, and an active browser-managed subscription. On iOS/iPadOS it requires a Home Screen web app. Delivery can be delayed or suppressed by the browser, operating system, connectivity, battery settings or user preferences and is never guaranteed. AlertBridge does not perform continuous background GPS checks, offline delivery, emergency-service contact or rescue dispatch.

## Assign the first responder

Users cannot grant themselves responder access. A trusted administrator must run this using the Supabase SQL Editor or another trusted server-side database connection after the user has registered:

```sql
insert into public.authorized_responders (user_id, assigned_by)
values ('RESPONDER_AUTH_USER_UUID', 'ADMIN_AUTH_USER_UUID');
```

For the first assignment, `assigned_by` may be `null` if there is no administrator auth user yet:

```sql
insert into public.authorized_responders (user_id, assigned_by)
values ('RESPONDER_AUTH_USER_UUID', null);
```

Do not expose either statement through the browser client. Remove membership only through trusted administrative database access.

## Abuse protection and account suspension

The database allows each account up to three successful new submissions in a rolling 10-minute window and ten in a rolling 24-hour window. The shared retry receipt counts a community warning, private assistance request, or atomic **Both** request as one submission. A successful retry with the same request ID returns its stored result and does not count again. Per-account transaction locks serialize simultaneous requests before counting. The interface displays the retry time returned by the database when a limit is reached. These limits reduce repeated submissions; they do not prevent all spam.

Suspension is separate from responder membership. It blocks account write actions—including reporting, flagging, profile changes, and responder actions—without removing read access to public alerts or the account's own reports. Responder membership does not grant suspension powers. There is no suspension UI.

Only a trusted administrator using **Supabase SQL Editor** or another privileged database connection can call the suspension function. Supply the target account ID, the intended state, a non-empty reason, and the administrator's own auth user ID:

```sql
select public.admin_set_account_suspension(
  'TARGET_AUTH_USER_UUID'::uuid,
  true,
  'Reason for suspending this account',
  'ADMIN_AUTH_USER_UUID'::uuid
);
```

Restore the account through the same audited function:

```sql
select public.admin_set_account_suspension(
  'TARGET_AUTH_USER_UUID'::uuid,
  false,
  'Reason for restoring this account',
  'ADMIN_AUTH_USER_UUID'::uuid
);
```

The browser roles and authorised responders have no execute permission on this function and no write permission on the suspension tables. Every state change appends an immutable history entry. Administrators can inspect the current state and history with read-only SQL:

```sql
select user_id, suspended, reason, changed_by, changed_at
from public.account_suspensions
where user_id = 'TARGET_AUTH_USER_UUID'::uuid;

select action, reason, changed_by, changed_at
from public.account_suspension_history
where user_id = 'TARGET_AUTH_USER_UUID'::uuid
order by changed_at;
```

## Security model

- Profiles are linked to `auth.users`; users can read their own profile and update only their display name.
- Authenticated users can insert reports only with their own user ID. Database defaults and RLS require the initial status to be **Unverified**.
- Users can read only their own reports and corresponding history.
- Direct client updates and deletes on reports and history are not granted.
- Responder membership has no client insert, update, or delete grant.
- Authorised responders can read reports through RLS.
- Status changes use one transactional, security-definer RPC that checks responder membership, locks the report, validates the transition, updates the report, and inserts immutable history.
- Verification and rejection require a non-whitespace reason in both the interface and database.
- Security-definer functions use an empty `search_path` and schema-qualified object names.
- Submission limits and account suspension are enforced in database write paths rather than relying on interface controls.
- Private report messages are readable only by the report owner and authorised responders. They are immutable and cannot be inserted directly through table grants.

## Implemented application behaviour

- Guided-question and written-report modes with coordinate and required-field validation
- Browser geolocation only after explicit selection, plus manual coordinates
- Review before submission and retry without losing form contents
- Duplicate submissions prevented while a request is in progress
- Confirmation shown only after a successful database response
- Confirmations say **Submitted to AlertBridge**, never that emergency services were notified
- Email/password account creation, sign-in/out, verification messaging, password reset/recovery, and session restoration
- Display-name management
- Own-report dashboard and database-authorised responder controls
- Public Community Alerts feed for signed-in and signed-out visitors
- Category, affected-area and opt-in Near me filtering; visitor coordinates remain in memory on the device
- Responder-authored publication linked to—but stored separately from—a Verified private report
- Explicit public fields, optional public danger zones, expiry handling and active/resolved/expired presentation
- Responder updates, resolution and withdrawal with append-only alert audit history
- Verification never publishes an incident automatically
- Public-alert live refresh through a metadata-only Supabase Realtime signal; reconnects refetch the safe public view
- Opt-in foreground location monitoring with configurable approach distance, duplicate suppression and repeat warnings after material alert updates
- Optional foreground browser notifications and destination-area coordinate checks
- Opt-in background-capable Web Push for selected structured areas, with account-owned subscriptions and a retryable server-side queue
- Reporting choices for a public community warning, a private assistance request, or an atomic linked submission containing both
- Separate coordinates for private assistance and the public danger zone; device coordinates are published only after the reporter explicitly chooses the public-location control
- Primary GPS location actions, optional place search, and advanced manual-coordinate disclosures for incident and destination selection
- Editable, category-specific public-summary templates for guided reports; generation is explicit and never reads private descriptions, additional details or reporter identity
- Authenticated community warnings clearly labelled **Community report — unverified**, with responder verification/removal, abuse reporting and immutable moderation history
- Retry-safe connected submission through a client request ID and transactional database receipt
- Private assistance acknowledgement, coordination notes and documented agency handoffs kept separate from report verification and resolution
- Responder-only private-report Realtime signals that contain IDs only and are unavailable to public subscribers
- Private reporter–responder conversations on assistance reports, with plain-text messages, author roles, timestamps, unread indicators, retry-safe sends and scoped live refresh
- A separate database message limit of 10 successful messages per minute and 100 per 24 hours per account; retrying a completed client request ID does not count again

## Community Alerts privacy model

The public feed reads `public.community_alert_feed`, an explicit-field view. It does not expose `source_report_id`, reporter identity, email, private coordinates, raw questionnaire answers, private description, responder identity, or private report/status history. The underlying alert tables are not readable or writable by anonymous visitors. Public writes are unavailable; responder-only security-definer RPCs enforce publication eligibility and append audit history transactionally.

The optional danger-zone coordinates are responder-authored public data and are separate from the reporter's private incident coordinates. The browser requests visitor geolocation only after **Near me** is selected and keeps it in component memory for local distance calculations.

Community-warning submissions use dedicated public latitude, longitude and radius fields. **Use my location for public danger zone** is a separate explicit action and should be used only when the incident is at the reporter's current location. A **Both** submission never copies the private assistance coordinates into the public post. Responders publishing verified alerts may manually enter a danger zone or select the private incident location for review, but must explicitly confirm the public coordinates and radius before publishing.

Realtime clients subscribe only to `community_alert_events`, which contains an alert ID and change time but no report, reporter, responder, location or alert content. Each event causes the browser to refetch `community_alert_feed`. The app never subscribes to private incident reports or private history.

Authenticated community posts are stored in `community_posts`, separately from `incident_reports` and responder-curated `community_alerts`. The public view exposes only approved warning fields. For a **Both** submission, `linked_report_id` is an internal relationship and is never selected by the public view. User-written summaries are rendered as React text rather than injected HTML.

Private assistance updates use `private_report_events`. RLS permits only authorised responders to read that Realtime signal. Public clients never subscribe to it. An agency handoff can be recorded only after a responder enters the agency, actual handoff time, and a reference or note. Recording that history does not itself contact an agency.

Private conversations are linked only to `incident_reports`, so community-only posts have no conversation. `report_messages` is not referenced by either public-feed view. Its RLS policy permits the report owner and authorised responders, while anonymous visitors and unrelated users receive no rows. Direct inserts, updates and deletes are unavailable to browser roles; sending uses a retry-safe RPC and stored author role. Suspended accounts cannot send.

Realtime subscriptions listen only to metadata rows in `private_message_events`, filtered to the currently open report. Message bodies are fetched separately through RLS. The subscription is removed when the report closes or the component unmounts, and reconnecting refetches current messages. Messages do not provide external SMS/email delivery, attachments, public comments, or evidence that officers or emergency services were dispatched.

## Verification

The current automated suite contains **80 passing tests**. It covers frontend validation, connected-only access boundaries, public-summary generation, alert presentation and proximity boundaries, duplicate warning suppression, inactive-alert exclusion, submission and message-limit contracts, retry counting, concurrency locks, suspension coverage, messaging privacy, Web Push ownership/eligibility/retry/duplicate/unsubscribe contracts, Supabase event wake-up and recovery scheduling, immutable messages, scoped Realtime cleanup, unread behavior, restoration auditing, and unauthorised access, plus static migration security checks for RLS, ownership, least-privilege grants, responder membership, transactional history, reason enforcement, and pinned security-definer search paths.

User-observed checks confirmed that an authenticated account could publish a public community warning, an authorised responder could verify it, and removal caused it to disappear from another account's Community Alerts feed.

GPS proximity warnings have been exercised with controlled coordinates in automated tests, but have **not yet been verified on a physical device**. Web Push also requires live verification on representative Android, desktop and iOS Home Screen installations. Physical-device checks are still required for real GPS accuracy, permission behavior, foreground monitoring, background delivery, unsubscribe propagation and browser/OS delivery behavior.

Live end-to-end Web Push notification delivery is still unverified. A production check must confirm subscription creation, queue insertion, Supabase-triggered worker invocation, provider acceptance and receipt on representative devices without using a real emergency alert.

Without a configured Supabase project, these checks do **not** prove live authentication email delivery, hosted redirect settings, applied RLS behaviour, or remote migration state. After creating a project, apply the migration and perform live tests with at least two ordinary users and one administrator-assigned responder.

The abuse-protection and private-messaging migrations have been applied, but complete live verification is still pending. Abuse-protection live verification must cover suspension, restoration, suspended-account reads and writes, and the 24-hour boundary without changing timestamps or deleting receipts. Messaging live verification must use an ordinary report owner, another ordinary user, an authorised responder and a signed-out client to confirm cross-user/public denial, responder access, retry safety, message-limit boundaries, suspension blocking, unread state and Realtime reconnect behavior.

## Current limitations

- No public incident map, route guidance, SMS fallback, or audio prompts
- Private conversations do not support attachments or external SMS/email delivery
- No offline transmission
- Nearby GPS monitoring remains foreground-only. Opt-in Web Push can deliver selected-area alerts without continuous GPS, but browser/OS delivery is not guaranteed and there is no offline reporting transmission
- Destination checks cover the selected area only, not the journey, and do not provide route avoidance
- Community warnings are unverified unless a responder explicitly verifies them; nearby warnings default to responder-verified information only
- No agency messaging or rescue-dispatch integration exists; a recorded handoff is documentation, not transmission
- No emergency service or agency is connected; AlertBridge does not notify or dispatch emergency responders
- Availability depends on the configured Supabase project and email provider

## Technology

React, TypeScript, Vite, Supabase JavaScript client, PostgreSQL migrations, and Lucide icons.
