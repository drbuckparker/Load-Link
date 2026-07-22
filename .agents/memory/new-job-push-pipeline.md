---
name: New-job push alert pipeline
description: How "job posted near you" alerts work, why they silently fail, and the APNs credential blocker
---

# New-job push alert pipeline

The companion server (not the website) sends "New Job Alert" Expo pushes.
Eligibility: `(role ILIKE '%driver%' OR also_driver = true) AND expo_push_token IS NOT NULL`,
within the user's `search_radius_miles` (default 50) of the job's origin,
measured against primary/secondary/tertiary saved locations + last_known.

**Failure modes found (July 2026):**
1. `users.role` collapsed from `driver_trucking_company_contractor` to
   `trucking_company_contractor` (older role-switch code persisted a company
   view-switch), silently removing the user from the `%driver%` filter.
   Check `users.role` FIRST when someone "gets no job alerts".
2. Website-posted jobs land straight in the shared DB and never hit the
   companion's POST /api/jobs — no push was ever sent for them. Fixed with a
   60s DB-polling job watcher (`startNewJobWatcher` in server/routes.ts) with
   a persisted watermark + dedupe set in `.data/notified_jobs.json`
   (first-ever run seeds silently; restarts catch up via watermark, capped
   12h). POST /api/jobs marks its job id notified to avoid double alerts.
3. **iOS delivery blocker:** Expo push API returns
   `InvalidCredentials: Could not find APNs credentials for app.replit.loadlink`.
   The Expo project has no APNs push key — ALL iOS pushes fail regardless of
   server code. Must be fixed in the Expo/EAS account (upload/generate an
   Apple push key); nothing in this repl can fix it.

**How to test delivery:** send directly to `users.expo_push_token` via
`https://exp.host/--/api/v2/push/send` and read the per-message receipt
status — "ok" vs "error" tells you if credentials/token are valid.

## iOS "push arrives but is silent" rule (July 2026)

**Rule:** every Expo push message must carry an explicit iOS `sound` — an omitted/empty sound field makes APNs deliver quietly (Notification Center only, no chime/banner sound). Server-side payloads are centralized in a builder that falls back to `'default'` and always sets an `interruptionLevel` (`timeSensitive` for new-job horn, `active` otherwise; APNs downgrades timeSensitive when the entitlement is absent, so it's always safe). Validation: `npx tsx scripts/test-push-payload.ts`.

**Also:** iOS PROVISIONAL (quiet) authorization produces the exact same symptom — the client permission request must pass explicit `ios: { allowAlert, allowSound, allowBadge }` and re-request when the existing iOS status is provisional.

**Custom-sound caveat:** `truckhorn.wav` only plays on iOS binaries built AFTER the expo-notifications plugin `sounds` entry existed; on older installed builds an unknown sound name = silent. End-to-end horn verification requires a fresh native build (Expo Launch).

## Job-awarded cash-register alert (July 2026)

Two driver business events map to fixed sound/channel pairs, centralized in the server push-payload builders (senders must use `buildNewJobNearbyPush` / `buildJobAwardedPush`, never hand-rolled payloads): new-job-nearby → `truckhorn.wav` / Android channel `job-alerts`; job awarded (contractor approve route AND auto-approve on accept) → `cashregister.wav` / dedicated channel `job-awarded`. **Why dedicated channel:** Android channel sounds are immutable after creation. Awarded notifications only fire when the assignment UPDATE actually transitions the row (rowCount guard) so retries can't duplicate them. `cashregister.wav` was AI-generated (no pre-existing asset); like the horn, it's bundled via app.json's expo-notifications `sounds` list and only audible on native builds made after bundling. Foreground playback keys off push `data.type` (`new_job` / `job_awarded`) in the root layout. Validation: `npx tsx scripts/test-push-payload.ts`.
