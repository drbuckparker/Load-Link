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
