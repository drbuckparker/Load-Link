# LoadLink Mobile Companion App

## Overview
The LoadLink Mobile App is the **companion** to the main LoadLink website (`loadlink.replit.app` / `loadlinklive.com`). It extends the website's functionality to iOS/Android for all user roles in the short-haul trucking and construction industries: truck drivers, contractors, trucking companies, and foremen. The companion shares the website's Neon PostgreSQL database directly; an Express backend reads/writes that DB and proxies authentication to the website API.

## Demo Account
A self-contained demo login for showing the app to prospects: **demo@loadlink.com / demo1234**. The account carries the compound role `driver_trucking_company_contractor`, so the same login can switch between driver / contractor / trucking_company views (via the profile role switcher) and see fully-populated data in each (jobs, schedules, invoices/earnings, fleet, projects, messages, reviews, notifications).
- Re-runnable seed: `npx tsx scripts/seed-demo.ts` — idempotent (all ids prefixed `demo-`), transactional/fail-fast, dates relative to "today" so the demo stays current, asserts row counts after committing. Re-run after a DB reset/checkpoint rollback.
- Role switching for this account is session-scoped and does NOT overwrite `users.role` (see role-switch note below), so the compound entitlement survives re-login.

## User Preferences
I want to prioritize a clean, maintainable, and well-structured codebase. I prefer clear and concise explanations for any proposed changes, focusing on the "why" as much as the "what." For development, I prefer an iterative approach, with small, testable changes. Please ask for confirmation before implementing major architectural changes or refactoring large portions of the codebase. When making changes, ensure that all existing features continue to function as expected, especially role-based access and UI elements.

## Terminology
- **Website / Main App**: The LoadLink website at `loadlinklive.com` (deployed as `loadlink.replit.app`). The original, authoritative platform.
- **Mobile App / Companion App**: This Expo/React Native app.
- **Website API**: The REST API served by the website. Endpoints prefixed with `/api/companion/` are designed for this mobile app.
- **Backend / Express Proxy**: The Express server in this project (`server/routes.ts`).

## System Architecture

### Frontend
- **Framework**: React Native with Expo Router (file-based routing).
- **State**: React Query for server state; AuthContext for auth state.
- **Authentication**: JWT-based. Token stored in AsyncStorage (`loadlink_token`), sent via `Authorization: Bearer`. Credentials stored for silent re-login after server restarts.
- **Styling**: React Native StyleSheet, dark "Industrial Modern" theme optimized for outdoor visibility.
- **UI/UX**:
    - **Colors**: Primary Safety Orange (#FF9900) on Deep Asphalt (#161a22).
    - **Typography**: Chakra Petch for headings (bold, uppercase), Inter for body.
    - **Accessibility**: Minimum 44pt touch targets for gloved hands.
    - **Interactive**: Liquid glass tab bar on iOS 26+ with BlurView fallback.
    - **Role-Aware UI**: Dynamic tab layouts and feature visibility by role (contractors see job management/invoices; drivers see job browsing/earnings).

### Backend
- **Technology**: Express.js reading/writing the shared Neon PostgreSQL DB, with background sync against the website API.
- **Key files**: `server/routes.ts` (route handlers), `server/sync.ts` (sync engine), `server/db.ts` (drizzle pool), `server/index.ts` (app setup, CORS, landing page), `shared/schema.ts` (drizzle schema).
- **Sync engine** (`server/sync.ts`): `fullSync(auth)` on login; `startPeriodicSync()` every 60s for recently active users; `recordUserActivity()` tracks activity for smart periodic sync.
- **pushToWebsite**: A fire-and-forget hook for triggering website-side side-effects the companion can't replicate directly — audit logs, WebSocket broadcasts, radius/driver notifications. It is NOT a data-persistence path (the shared DB write already persists). Kept only on routes with real side-effects: POST/PUT/DELETE jobs, job start/end/cancel/accept/bids, job-assignment approve/reject/cancel/vehicle/withdraw, invoice status, job messages, availability.
- **Authentication flow**:
    1. Frontend sends `POST /api/auth/login` with `{email, password}`.
    2. Express forwards email to `POST https://loadlinklive.com/api/companion/auth/login` with `X-API-Key` (password not sent — the API key establishes trust).
    3. Website returns a JWT + user object.
    4. Express mints a local token mapped to the website JWT in `tokenToJwt` (persisted to `.data/sessions.json`).
    5. Frontend stores the local token, sends it via `Authorization: Bearer`.
    6. `requireAuth` resolves local token → website JWT; upstream calls forward `Authorization: Bearer <JWT>` + `X-API-Key`.
    7. On 401/403 from the website, Express refreshes the JWT via re-login.
- **Silent re-login**: If a stored session token becomes invalid (deploy/restart), the app re-authenticates using stored credentials without showing a login screen.
- **Role switching & entitlement**: `PUT /api/profile/role` permits (a) the account's own entitlement views from `allowedRolesForUser(originalRole)` and (b) — for a self-serve company account — any of the three self-serve company roles (`trucking_company`, `contractor`, `trucking_company_contractor`), so a user who picked the wrong role at sign-up can correct it. `driver`/`foreman` are **never** valid switch targets (invite-only, linked to a parent). Persistence rule: a **genuine account-type change** (self-serve company role change) **is persisted** to `users.role` and updates in-session `originalRole`; a **compound account's view-switch** (target is one of its own component roles) is **session-only, never persisted** — persisting a single component would collapse a compound entitlement (e.g. `driver_trucking_company_contractor`) and trap the account. Dev-local sessions are never persisted. The frontend `selectableRoleKeys(user)` (in `profile.tsx`) mirrors this permission set so only valid role cards are shown. `GET /api/profile` and `GET /api/auth/me` return the in-memory session user, so switches stick.
- **Response format**: JSON responses include both camelCase and snake_case keys via `addDualKeys()` (skips Date objects and arrays of primitives to prevent corruption).
- **Database enums**: `job_status` (open, accepted, pending, in_progress, completed, cancelled), `invoice_status` (open, issued, payment_sent, payment_received, void), `job_assignment_status` (pending, approved, rejected, withdrawn). Use valid enum values in SQL — e.g. `status::text IN ('open','issued')` for unpaid invoices, `status::text = 'payment_received'` for paid (NOT 'paid'/'pending').
- **Environment variables**: `WEBSITE_API_KEY` (website API auth), `WEBSITE_API_URL` (default `https://loadlinklive.com`), `GOOGLE_MAPS_API_KEY` (Maps/Places).
- **Google Maps note**: The Geocoding API is not enabled; `/api/places/geocode` uses Google's "Find Place from Text" API instead.

### Core Features
- **Job Management**: Drivers browse, accept, clock-in/out, and track earnings. Contractors post jobs, manage assignments (approve/reject with conflict re-check + fleet truck assignment), and view invoices. **Double-booking is enforced server-side** for both trucks and drivers: neither can be `approved` on two active jobs whose working days overlap (day-level, not time-of-day). Guards run where an entity becomes approved (job accept / assignment approve / vehicle change) and return HTTP 409 with a user-facing message. Only `approved` assignments block; `pending` applications are checked at approval time. Known gap: check-then-write is not transactional, so a true simultaneous double-approval isn't prevented (acceptable for the single-contractor workflow). Jobs and vehicles use soft-delete (`archived_at`) and can be restored.
- **Clock-in geofence**: Clock-in requires the driver to be within 15 miles of pickup, dropoff, or the route between them. Driver coordinates must be real — a failed/denied GPS read resolves to "no location" (not `(0,0)`), and both client and server reject `(0,0)` so it never produces a false ~6000-mile distance.
- **User Roles**: `driver`, `contractor`, `trucking_company`, `trucking_company_contractor`, `driver_contractor`, `foreman`, `driver_trucking_company`. All non-driver roles can post jobs.
- **Messaging**: Real-time messaging tied to specific jobs, including auto-messages for job events.
- **Review System**: Reviews for completed jobs, impacting user ratings.
- **Vehicle Management**: Add/update/archive/restore vehicles (soft-delete via `archived_at`).
- **Project Management**: Contractors create/manage projects and link jobs to them.
- **Weight / Load Tickets**: Drivers can upload tickets for job runs. After ending any job the app asks whether there are load tickets to upload; jobs that require weight tickets show an urgent variant.
- **Location Services**: GPS for clock-in/out, location-based job filtering, Google Places/Maps integration.
- **Push Notifications**: Expo Push for critical updates. When a driver applies to a job, the contractor gets BOTH a push (custom `truckhorn.wav` sound) AND an in-app notification row (a push alone does not populate the inbox/bell badge). The DB row reuses the `new_load` enum value because the shared `notification_type` enum has no `job_application` value; the truck-horn trigger keys off the push payload's `data.type: 'job_application'`. The in-app truck horn (`lib/sounds.ts`) is iOS-only; the custom lock-screen sound needs a native build (Expo Launch) and doesn't work in Expo Go.
- **Partial Availability**: Drivers can specify available days for multi-day jobs via `available_days` on job_assignments.
- **Invitations**: Users can invite a driver/foreman by email (`/api/driver-invitations`).

## External Dependencies
- **LoadLink Website** (`loadlinklive.com` / `loadlink.replit.app`): Original project and source of truth. Auth uses `X-API-Key` + JWT from `/api/companion/auth/login`.
- **Mapping/Location**: Google Places API, Google Maps JavaScript API (web map/directions), React Native Maps (native), native device map apps for external navigation.
- **Push**: Expo Push API (exp.host).

## Website API Endpoints
Website endpoints the companion uses:
- **Auth**: `POST /api/companion/auth/login` (email-only; API key establishes trust)
- **Jobs**: `GET/POST /api/jobs`, `GET/PUT/DELETE /api/jobs/:id`, job actions (`/accept`, `/withdraw`, etc.)
- **Other**: `GET /api/notifications`, `GET /api/conversations`, `GET /api/invoices`, `GET /api/vehicles` (driver only)

Endpoint mappings (mobile path → website path):
- `/api/profile` → `/api/auth/me`
- `/api/earnings` → `/api/driver/earnings`
- `/api/availability` → `/api/me/availability`
- `/api/projects` → `/api/contractor-projects`
- `/api/materials` → `/api/contractor-materials`
- `/api/push/register` → `/api/push/subscribe`
- `/api/messages/unread-count` → `/api/notifications/unread-count`
- `/api/calendar/jobs` and `/api/contractor/calendar-capacity` → built locally from `fetchAllJobsCached()` (filtered by driver/contractor + month/year + active status; multi-day expansion via `getJobDateRange()`, which skips weekends unless `includesWeekends` is true)
