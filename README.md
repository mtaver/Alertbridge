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
4. For a local Supabase stack, run `supabase start` followed by `supabase db reset`.
5. For a hosted project, link it and preview before applying:

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push --dry-run
   supabase db push
   ```

6. In **Authentication → URL Configuration**, set the Site URL for the deployed app and add every allowed redirect URL. For local development, include `http://localhost:5173` and `http://127.0.0.1:5173`. Add the exact production HTTPS origin before deployment. Sign-up verification and password reset both redirect to the app origin.
7. Keep email confirmation enabled if accounts must verify their address before receiving a session. Configure a production SMTP provider before relying on email delivery in production.

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
- Reporting choices for a public community warning, a private assistance request, or an atomic linked submission containing both
- Separate coordinates for private assistance and the public danger zone; device coordinates are published only after the reporter explicitly chooses the public-location control
- Primary GPS location actions, optional place search, and advanced manual-coordinate disclosures for incident and destination selection
- Editable, category-specific public-summary templates for guided reports; generation is explicit and never reads private descriptions, additional details or reporter identity
- Authenticated community warnings clearly labelled **Community report — unverified**, with responder verification/removal, abuse reporting and immutable moderation history
- Retry-safe connected submission through a client request ID and transactional database receipt
- Private assistance acknowledgement, coordination notes and documented agency handoffs kept separate from report verification and resolution
- Responder-only private-report Realtime signals that contain IDs only and are unavailable to public subscribers

## Community Alerts privacy model

The public feed reads `public.community_alert_feed`, an explicit-field view. It does not expose `source_report_id`, reporter identity, email, private coordinates, raw questionnaire answers, private description, responder identity, or private report/status history. The underlying alert tables are not readable or writable by anonymous visitors. Public writes are unavailable; responder-only security-definer RPCs enforce publication eligibility and append audit history transactionally.

The optional danger-zone coordinates are responder-authored public data and are separate from the reporter's private incident coordinates. The browser requests visitor geolocation only after **Near me** is selected and keeps it in component memory for local distance calculations.

Community-warning submissions use dedicated public latitude, longitude and radius fields. **Use my location for public danger zone** is a separate explicit action and should be used only when the incident is at the reporter's current location. A **Both** submission never copies the private assistance coordinates into the public post. Responders publishing verified alerts may manually enter a danger zone or select the private incident location for review, but must explicitly confirm the public coordinates and radius before publishing.

Realtime clients subscribe only to `community_alert_events`, which contains an alert ID and change time but no report, reporter, responder, location or alert content. Each event causes the browser to refetch `community_alert_feed`. The app never subscribes to private incident reports or private history.

Authenticated community posts are stored in `community_posts`, separately from `incident_reports` and responder-curated `community_alerts`. The public view exposes only approved warning fields. For a **Both** submission, `linked_report_id` is an internal relationship and is never selected by the public view. User-written summaries are rendered as React text rather than injected HTML.

Private assistance updates use `private_report_events`. RLS permits only authorised responders to read that Realtime signal. Public clients never subscribe to it. An agency handoff can be recorded only after a responder enters the agency, actual handoff time, and a reference or note. Recording that history does not itself contact an agency.

## Verification

The current automated suite contains **52 passing tests**. `npm test` covers frontend validation, connected-only access boundaries, public-summary generation, alert presentation and proximity boundaries, duplicate warning suppression, inactive-alert exclusion, plus static migration security checks for RLS, ownership, least-privilege grants, responder membership, transactional history, reason enforcement, and pinned security-definer search paths.

User-observed checks confirmed that an authenticated account could publish a public community warning, an authorised responder could verify it, and removal caused it to disappear from another account's Community Alerts feed.

GPS proximity warnings have been exercised with controlled coordinates in automated tests, but have **not yet been verified on a physical device**. Physical-device checks are still required for real GPS accuracy, permission behavior, foreground monitoring and browser notification behavior.

Without a configured Supabase project, these checks do **not** prove live authentication email delivery, hosted redirect settings, applied RLS behaviour, or remote migration state. After creating a project, apply the migration and perform live tests with at least two ordinary users and one administrator-assigned responder.

## Current limitations

- No public incident map, route guidance, SMS fallback, or audio prompts
- No offline transmission
- Nearby monitoring and browser notifications are foreground-only and work only while the application is open; there is no Web Push, dependable background delivery or offline warning delivery yet
- Destination checks cover the selected area only, not the journey, and do not provide route avoidance
- Community warnings are unverified unless a responder explicitly verifies them; nearby warnings default to responder-verified information only
- No agency messaging or rescue-dispatch integration exists; a recorded handoff is documentation, not transmission
- No emergency service or agency is connected; AlertBridge does not notify or dispatch emergency responders
- Availability depends on the configured Supabase project and email provider

## Technology

React, TypeScript, Vite, Supabase JavaScript client, PostgreSQL migrations, and Lucide icons.
