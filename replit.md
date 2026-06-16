# LoadLink Mobile Companion App

## Overview
The LoadLink Mobile App is the **companion** to the main LoadLink website (`loadlink.replit.app` / `loadlinklive.com`). The app uses a **local-first architecture**: a PostgreSQL database stores all data locally for fast reads, with background sync to/from the website API. On login, a full sync pulls all user data from the website. Periodic sync (every 60s) keeps data fresh. Writes go to the local DB first for instant response, then are pushed to the website asynchronously. The mobile app extends the website's functionality to iOS/Android devices, serving all user roles within the short-haul trucking and construction industries: truck drivers, contractors, trucking companies, and foremen.

## Demo Account
A self-contained demo login exists for showing the app to prospects: **demo@loadlink.com / demo1234**. The account carries the compound role `driver_trucking_company_contractor`, so the same login can switch between driver / contractor / trucking_company views (via the profile role switcher) and see fully-populated data in each (jobs, schedules, invoices/earnings, fleet, projects, messages, reviews, notifications).
- Re-runnable seed: `npx tsx scripts/seed-demo.ts` — idempotent (all ids prefixed `demo-`), transactional/fail-fast, dates are relative to "today" so the demo stays current, and it asserts row counts after committing. Re-run it after a DB reset/checkpoint rollback to restore the demo.
- Role switching for this account is session-scoped and does NOT overwrite `users.role` (see role-switch note below), so the compound entitlement survives re-login.

## User Preferences
I want to prioritize a clean, maintainable, and well-structured codebase. I prefer clear and concise explanations for any proposed changes, focusing on the "why" as much as the "what." For development, I prefer an iterative approach, with small, testable changes. Please ask for confirmation before implementing major architectural changes or refactoring large portions of the codebase. When making changes, ensure that all existing features continue to function as expected, especially role-based access and UI elements.

## Terminology
- **Website / Main App**: The LoadLink website at `loadlinklive.com` (deployed as `loadlink.replit.app`). This is the original, authoritative platform.
- **Mobile App / Companion App**: This Expo/React Native app. It is the companion to the website.
- **Website API**: The REST API served by the website that this mobile app calls into. Endpoints prefixed with `/api/companion/` are specifically designed for this mobile app to use.
- **Backend / Express Proxy**: The Express server in this project (`server/routes.ts`). It acts as a thin proxy between the mobile frontend and the website API.

## System Architecture

### Frontend
- **Framework**: React Native with Expo Router for file-based routing.
- **State Management**: React Query for server state synchronization and AuthContext for user authentication state.
- **Authentication**: JWT-based auth. Token stored in AsyncStorage (`loadlink_token`) and sent via `Authorization: Bearer` header on all requests. Credentials stored for silent re-login after server restarts.
- **Styling**: React Native StyleSheet, adhering to a dark "Industrial Modern" theme optimized for outdoor visibility.
- **UI/UX**:
    - **Color Scheme**: Primary Safety Orange (#FF9900) on Deep Asphalt (#161a22) background.
    - **Typography**: Chakra Petch for headings (bold, uppercase) and Inter for body text.
    - **Accessibility**: Minimum 44pt touch targets for gloved hands.
    - **Interactive Elements**: Liquid glass tab bar on iOS 26+ with BlurView fallback.
    - **Role-Aware UI**: Dynamic tab layouts and feature visibility based on user roles (e.g., contractors see job management/invoices; drivers see job browsing/earnings).
- **Social Sign-In**: Google (via `expo-auth-session` with in-app browser sheet) and Apple (via `expo-apple-authentication`, iOS native only). Both use the Expo auth proxy in development and native redirects in production builds.

### Backend (Local DB + Website Sync)
- **Technology**: Express.js with local PostgreSQL database and background sync to the LoadLink website API.
- **Architecture**: The Express backend uses a **local PostgreSQL database as the sole data source** for all reads and writes. NO API calls are made to the website for data — all reads come from the local DB and all writes go to the local DB first with async push to the website. The only website API calls are for authentication (login/register/password reset).
- **Sync Engine** (`server/sync.ts`):
    - `fullSync(auth)` — Called on login; syncs jobs, projects, assignments, vehicles, availability, invoices, notifications from website → local DB
    - `startPeriodicSync()` — Runs every 60s for recently active users (active in last 5 min)
    - `pushToWebsite()` — Async write-through to website API after local DB writes
    - `recordUserActivity()` — Tracks last activity time per user for smart periodic sync
- **Key files**:
    - `server/routes.ts` — Route handlers reading/writing exclusively to local PostgreSQL DB
    - `server/sync.ts` — Background sync engine for pulling data from website → local DB and pushing writes back
    - `server/db.ts` — PostgreSQL connection pool (drizzle ORM)
    - `server/index.ts` — Express app setup (CORS, body parsing, landing page)
    - `shared/schema.ts` — Drizzle schema definitions for all tables
- **Authentication flow**:
    1. Frontend sends `POST /api/auth/login` with `{email, password}`
    2. Express forwards email to `POST https://loadlinklive.com/api/companion/auth/login` with `X-API-Key` header (password not sent — API key establishes trust)
    3. Website returns a JWT + user object
    4. Express generates a local token, maps it to the website JWT in `tokenToJwt` Map (persisted to `.data/sessions.json`)
    5. Frontend stores local token in AsyncStorage, sends via `Authorization: Bearer` header
    6. `requireAuth` middleware checks local token → looks up website JWT
    7. All subsequent API calls forward to website with `Authorization: Bearer <website JWT>` + `X-API-Key`
    8. On 401/403 from website, Express automatically refreshes the JWT via re-login
- **Silent re-login**: If a stored session token becomes invalid (e.g., after a deploy/restart), the mobile app automatically re-authenticates using stored credentials (email/password in AsyncStorage) without showing a login screen.
- **Role switching & entitlement**: `PUT /api/profile/role` is gated by `allowedRolesForUser(originalRole)`, where `originalRole` is captured at login. The switched role is **never persisted to `users.role` for a compound-entitled account** (or any dev-local session); the active view lives only in the in-memory session (`auth.user.role`) + `sessions.json`. Because the companion shares the website's DB and both derive allowed roles from `users.role` at every login, persisting the single active view would collapse a compound entitlement (e.g. `driver_trucking_company_contractor`, used by the demo account and `drbuckparker@gmail.com`) down to one role and trap the account on next login. A genuine single-role account can't switch anyway, so the historical website-backed persist path is preserved only for that no-op case. `GET /api/profile` and `GET /api/auth/me` return the in-memory session user, so in-session view switches stick.
- **Endpoint categories**:
    - **Auth (website API calls)**: login, register, forgot-password, reset-password, set-password — these are the ONLY endpoints that call the website API directly
    - **Local DB reads**: ALL data endpoints — jobs, dashboard, conversations, messages, notifications, invoices, vehicles, reviews, favorites, earnings, projects, materials, availability, calendar
    - **Local DB writes + async push**: job actions (accept/withdraw/clock-in/clock-out), messages, vehicles, availability, reviews, favorites, push registration
    - **Handled locally**: Google Maps/Places autocomplete/details/geocode/directions/polyline/embed
- **Response format**: All JSON responses include both camelCase and snake_case keys via `addDualKeys()` utility, ensuring backward compatibility with frontend code that uses either format. `addDualKeys` skips Date objects and arrays of primitives to prevent corruption.
- **Database enums**: The local PostgreSQL DB uses custom enums: `job_status` (open, accepted, pending, in_progress, completed, cancelled), `invoice_status` (open, issued, payment_sent, payment_received, void), `job_assignment_status` (pending, approved, rejected, withdrawn). SQL queries must use valid enum values — e.g., use `status::text IN ('open', 'issued')` for unpaid invoices (NOT 'pending'), and `status::text = 'payment_received'` for paid invoices (NOT 'paid').
- **Environment variables**:
    - `WEBSITE_API_KEY` — API key for authenticating with the LoadLink website API
    - `WEBSITE_API_URL` — Base URL of the LoadLink website (default: `https://loadlinklive.com`)
    - `GOOGLE_MAPS_API_KEY` — Google Maps/Places API key
    - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — Google OAuth Client ID for social sign-in
- **Google Maps API note**: The Google Geocoding API is not enabled on the project. The `/api/places/geocode` route uses Google's "Find Place from Text" API instead.

### Core Features
- **Job Management**: Drivers can browse, accept, clock-in/out, and track earnings. Contractors can post, manage assignments (approve/reject drivers with conflict re-check and fleet truck assignment), and view invoices. Jobs and vehicles use soft-delete (archive) instead of hard delete — `archived_at` timestamp column on both `jobs` and `trucks` tables. Archived items can be restored.
- **User Roles**: Supports `driver`, `contractor`, `trucking_company`, `trucking_company_contractor`, `driver_contractor`, `foreman`, `driver_trucking_company` with role-based feature access. All non-driver roles can post jobs.
- **Messaging**: Real-time messaging between users related to specific jobs, including auto-messages for job events.
- **Review System**: Allows users to submit and view reviews for completed jobs, impacting user ratings.
- **Vehicle Management**: Users can add, update, and archive/restore their vehicles. Archived vehicles are soft-deleted (archived_at timestamp) and can be restored.
- **Project Management**: Contractors can create, update, and manage projects, linking jobs to specific projects.
- **Weight Ticket System**: Supports uploading weight tickets for job runs, with reminders and viewing capabilities.
- **Location Services**: GPS tracking for clock-in/out, location-based job filtering, and integration with Google Places/Maps.
- **Push Notifications**: Utilizes Expo Push for critical updates.
- **Partial Availability**: Drivers can specify which days they're available for multi-day jobs via `available_days` on job_assignments.

## External Dependencies
- **LoadLink Website** (`loadlinklive.com` / `loadlink.replit.app`): The original project and single source of truth for all data. This mobile app reads/writes via the website's API. Auth uses `X-API-Key` + JWT from the website's `/api/companion/auth/login` endpoint.
- **Mapping/Location Services**:
    - Google Places API (for autocomplete and details).
    - Google Maps JavaScript API (for web map view and directions).
    - React Native Maps (for native map view).
    - Native device map applications (iOS Maps / Android Geo) for external navigation.
- **Push Notification Service**: Expo Push API (exp.host).

## Website API Endpoints
The LoadLink website provides these endpoints for the mobile companion app:
- **Auth**: `POST /api/companion/auth/login` (email-only, API key establishes trust)
- **Jobs**: `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs`, `PUT /api/jobs/:id`, `DELETE /api/jobs/:id`
- **Job actions**: `/api/jobs/:id/accept`, `/api/jobs/:id/withdraw`, etc.
- **Notifications**: `GET /api/notifications`
- **Conversations**: `GET /api/conversations`
- **Invoices**: `GET /api/invoices`
- **Vehicles**: `GET /api/vehicles` (driver role only)

Endpoint mappings (mobile app path → website path):
- `/api/profile` → `/api/auth/me`
- `/api/earnings` → `/api/driver/earnings`
- `/api/availability` → `/api/me/availability`
- `/api/projects` → `/api/contractor-projects`
- `/api/materials` → `/api/contractor-materials`
- `/api/push/register` → `/api/push/subscribe`
- `/api/messages/unread-count` → `/api/notifications/unread-count`
- `/api/calendar/jobs` → built locally from `fetchAllJobsCached()` (filtered by driver, month/year, active status; multi-day expansion uses `getJobDateRange()` which skips weekends unless `includesWeekends` is true)
- `/api/contractor/calendar-capacity` → built locally from `fetchAllJobsCached()` (filtered by contractor, month/year, active status; computes dailyCapacity/dailyJobs/fleetSize; multi-day expansion uses same weekend-aware `getJobDateRange()`)

## pushToWebsite Audit (May 2026)
After joint audit with the website agent, the companion shares the website's Neon DB directly (not a local DB). pushToWebsite is a fire-and-forget hook for triggering server-side side-effects (audit logs, broadcast WebSockets, radius notifications) — NOT for data persistence. Trimmed from 31 → 22 callers:

**Path/method fixes applied:**
- `/api/jobs/:id/counter-bid` → `/api/jobs/:id/bids`
- `/api/jobs/:id/withdraw` → `/api/job-assignments/:aid/withdraw` (loops over driver's assignments)
- `/api/jobs/:id/clock-in` → `/api/jobs/:id/start`
- `/api/job-runs/:runId/clock-out` → `/api/jobs/:jobId/end` (looks up jobId from job_runs, sends runId in body)
- `/api/jobs/:id/assignments/:aid` (DELETE) → `/api/job-assignments/:aid/cancel` (POST)
- `/api/jobs/:id/assignments/:aid/{approve,reject}` → `/api/job-assignments/:aid/{approve,reject}`
- `/api/assignments/:aid/vehicle` → `/api/job-assignments/:aid/vehicle`
- `/api/invoices/:id/status` method PUT → POST
- `PUT /api/jobs/:id` push gated behind `dateChanged` (only when `scheduledDate` actually moves)

**Removed (pure CRUD double-writes — local DB write is sufficient):**
- push/register, vehicle CRUD (POST/PUT/DELETE/archive/unarchive), profile/status/role updates, contractor-projects POST/PUT/DELETE, notifications mark-read, favorites, reviews, job archive/unarchive, DELETE /api/jobs/:id sub-pushes

**Kept (have side-effects on website that companion can't replicate):**
POST /api/jobs (radius fanout + driver notifications), POST /api/jobs/:id/cancel, POST /api/jobs/:id/accept (audit log + availability), assignment approve/reject/withdraw/cancel/vehicle, job start/end (WebSocket broadcasts), counter-bid, invoice status, conversations archive/unarchive/delete, message send, availability POST, job-run patch/delete/weight-tickets.

**Queue cleanup (post-audit):** drained 15 stale entries (deleted 9 pure-CRUD + 4 backfill leftovers; rewrote 1 DELETE assignment → POST cancel; reset 5 accept retries). Stubbed `backfillUserEntities` in `server/sync.ts` — it was generating dead `POST /api/projects` and `POST /api/vehicles` entries on every login/retry for entity types whose pushes we deleted. Final state: succeeded=34, pending=0, dead=6 (5 accept + 1 cancel, all hitting website CSRF middleware — see open issue below).

**Round 2 (May 2026):** trimmed further from 22 → 14 callers per agent's spot-check verdicts + post-key-rotation probes:
- DROPPED: `POST /api/conversations/:jobId/{archive,unarchive,delete}` (no website route — `conversations` table doesn't exist in shared DB), `PATCH /api/job-runs/:runId`, `DELETE /api/job-runs/:runId`, `POST /api/job-runs/:runId/weight-tickets` (no website routes — silent 404s), `POST /api/job-assignments/:id/withdraw` (line 1048, was `/cancel-job` cascade), `POST /api/job-assignments/:id/cancel` (line 1065, driver-bid withdrawal). The latter two were confirmed dead by direct probe — both routes return 200 SPA shell on the website. Only `/api/job-assignments/:id/reject` exists for assignment status changes.
- PATH FIX: `POST /api/messages/:jobId` → `POST /api/jobs/:jobId/messages` (real route on website)
- KEPT: `POST /api/me/availability` (real cascade), `POST /api/jobs/:id/messages` (WS broadcast), POST/DELETE/PUT /api/jobs, jobs/:id/start, /end, /cancel, /accept, /bids, job-assignments/:id/{approve,reject,cancel,vehicle,withdraw} (the route at line ~960 — distinct from the dropped ones), invoices/:id/status, me/availability ×2.
- Final count: 14 pushToWebsite call sites, 13 unique paths.

**Resolved (May 2026) — API key rotation:** the website's `COMPANION_API_KEY` was rotated; companion's `WEBSITE_API_KEY` updated to match. Verified by re-probe: CSRF bypass now fires correctly (POST routes that have a real handler return 401 on auth failure, no longer 403 CSRF). 

**JWT staleness note:** Joey's session JWT (`.data/sessions.json`, userId 50758407) was issued before today's website redeploy and is rejected with `HTTP 401 {"message":"Unauthorized"}` on every POST route. Companion has no refresh-token mechanism in `server/sync.ts` — when 401 fires, the queue increments attempts but doesn't auto-reauth. Joey re-authenticates via email/password (`POST /api/auth/login` → `socialLogin` for `google` is also wired but he doesn't use it). Next time he opens the mobile app and signs in, companion's `/api/auth/login` handler calls the website's `/api/companion/auth/login` and stores the fresh JWT in his session.

**Final queue state:** succeeded=34, pending=0, dead=0. All 6 originally-dead entries cleared:
- id=17 (POST /api/jobs/.../accept) — dropped, job was `cancelled` on website (accept would 409)
- id=231 (POST /api/job-assignments/.../cancel) — dropped, route doesn't exist on website
- ids 216, 217, 226, 237 (4× POST /api/jobs/.../accept for `open` jobs) — dropped per agent decision; jobs are stale (weeks/months old) and Joey doesn't remember accepting them.

**Role-switch propagation fix (May 2026):** Joey reported that toggling Dashboard from Fleet Manager → Construction Co left two pieces of trucking-side UI behind:
1. UPCOMING JOBS calendar still showed "trucks available" because `GET /api/dashboard` always built `upcomingDays` from the user's trucks, regardless of role. Fixed in `server/routes.ts` — added `isContractorOnly = role.includes('contractor') && role !== 'trucking_company'`. When true, the widget queries jobs the contractor has POSTED in the next 7 days and emits per-day entries with `trucks: [], jobs: [{trucksNeeded, assigned, applied, status}]`. Frontend's existing `contractor` branch (`app/(tabs)/index.tsx` lines 595-601) renders these as "X/Y trucks · Z applied".
2. Job Details "CLOCK IN FOR MAY 5" button still showed in contractor mode for self-apply jobs (Parker Trucking posted, Joey Parker also approved as driver). Fixed in `app/job/[id].tsx` line 449 — added `&& !isContractor` to `canStart`. Clock-in is a driver/fleet action and never appears while user is in contractor hat, even when they happen to also be the approved driver.
Verified by API probe: `PUT /api/profile/role {role:"contractor"}` then `GET /api/dashboard` returns `upcomingDays[0] = {status:"jobs", trucksTotal:0, jobs:[{material:"3/4 crush", trucksNeeded:1, assigned:1, applied:1, status:"open"}]}`. Switching back to `trucking_company` returns the original `{trucksTotal:4, trucksBooked:1, trucksAvailable:3}` shape.
