# LoadLink Mobile Companion App

## Overview
Mobile companion app for LoadLink, an existing logistics web platform for short-haul trucking and construction. The app supports all user roles: truck drivers (owner-operators), contractors, trucking companies, and foremen.

## Current State
- Connected to existing LoadLink web app database (Neon PostgreSQL) via `EXTERNAL_DATABASE_URL`
- Real API routes built with Express + Drizzle ORM querying 28 tables
- Authentication via email/password with bcrypt + express-session (sessions stored in DB)
- All screens fetch from real API instead of mock data
- Role-aware UI: contractors see job management/invoices, drivers see job browsing/earnings

## Tech Stack
- **Frontend**: Expo Router (file-based routing), React Native, TypeScript
- **Backend**: Express + Drizzle ORM + PostgreSQL (Neon)
- **State**: React Query (@tanstack/react-query) for server state, AuthContext for user state
- **Styling**: React Native StyleSheet, dark "Industrial Modern" theme

## Design System
- **Theme**: Dark only - optimized for outdoor/sunlight use
- **Primary**: Safety Orange (#FF9900) on Deep Asphalt (#161a22)
- **Fonts**: Chakra Petch (headings, bold, uppercase) + Inter (body)
- **Touch targets**: 44pt minimum for gloved hands
- **Tab bar**: Liquid glass on iOS 26+, BlurView fallback

## User Roles
- **driver**: Browse jobs, accept/clock-in/out, track earnings, manage vehicles
- **contractor**: Post jobs, manage driver assignments (approve/reject), view invoices
- **trucking_company**, **trucking_company_contractor**, **driver_contractor**, **foreman**, **driver_trucking_company**: Compound roles
- Role detection: `isContractorRole(role)` checks if role includes 'contractor'
- Tab layout changes based on role (contractors see "My Jobs"/"Invoices" tabs, drivers see "Jobs"/"Earnings")

## Database
- External Neon PostgreSQL (shared with LoadLink web app)
- 28 tables: users, jobs, job_runs, notifications, job_messages, driver_availability, monthly_invoices, driver_vehicles, job_assignments, etc.
- Schema defined in `shared/schema.ts` using Drizzle ORM with snake_case field names
- DB connection in `server/db.ts` using `EXTERNAL_DATABASE_URL`

## API Routes (server/routes.ts)

### Auth
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/register` - New account registration
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Check session
- `POST /api/auth/forgot-password` - Sends 6-char reset code via Resend email
- `POST /api/auth/reset-password` - Verifies code and updates password
- `POST /api/auth/set-password` - Sets password for accounts that used Replit auth on web

### Calendar
- `GET /api/calendar/jobs` - Driver's assigned jobs with truck info by month (query params: month, year)

### Jobs (Driver)
- `GET /api/jobs` - List jobs (query params: status, truck_type, search, driver_id)
- `GET /api/jobs/:id` - Job detail with contractor info, runs, assignments
- `POST /api/jobs/:id/accept` - Accept a job
- `POST /api/jobs/:id/withdraw` - Withdraw from a job
- `POST /api/jobs/:id/clock-in` - Start a job run
- `POST /api/job-runs/:runId/clock-out` - End a job run (1hr min, 15min increments)

### Jobs (Contractor)
- `GET /api/contractor/jobs` - List contractor's posted jobs with application counts (query params: status, search, date, project_id)
- `POST /api/contractor/jobs` - Create a new job posting
- `DELETE /api/jobs/:id` - Cancel/delete a job
- `GET /api/jobs/:id/assignments` - Get driver applications for a job
- `POST /api/jobs/:id/assignments/:assignmentId/approve` - Approve a driver
- `POST /api/jobs/:id/assignments/:assignmentId/reject` - Reject a driver

### Projects (Contractor)
- `GET /api/projects` - List contractor's projects with job counts
- `POST /api/projects` - Create a new project (name, job_number, site_address, notes)
- `PUT /api/projects/:id` - Update a project (name, job_number, site_address, notes, awarded_amount, status)
- `DELETE /api/projects/:id` - Soft-delete a project (sets deleted_at, cancels associated jobs)
- `POST /api/projects/:id/restore` - Restore a soft-deleted project

### Vehicles
- `GET /api/vehicles` - List user's vehicles
- `POST /api/vehicles` - Add a vehicle
- `PUT /api/vehicles/:id` - Update a vehicle
- `DELETE /api/vehicles/:id` - Delete a vehicle

### Invoices
- `GET /api/invoices` - List invoices (query params: status)
- `GET /api/invoices/stats` - Invoice stats (outstanding, paid totals)

### Messages
- `GET /api/conversations` - List message conversations
- `GET /api/messages/:jobId` - Get messages for a job
- `POST /api/messages/:jobId` - Send a message

### Reviews
- `POST /api/reviews` - Submit a review (jobId, revieweeId, rating 1-5, comment)
- `GET /api/reviews/pending` - Get jobs where current user hasn't reviewed the other party yet
- `GET /api/reviews/:userId` - Get all reviews for a user (with reviewer info, average rating)

### Other
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/mark-read` - Mark all notifications read
- `GET /api/earnings` - Earnings with period filter (week/month/all)
- `GET /api/availability` - Calendar availability
- `POST /api/availability` - Set availability for a date
- `GET /api/profile` - User profile with vehicles
- `PUT /api/profile` - Update profile
- `PUT /api/profile/status` - Toggle online/offline
- `PUT /api/profile/role` - Switch user role

## App Screens
- **(auth)**: login, register, forgot-password
- **(tabs)**: jobs (index), calendar, messages, my-jobs/invoices, profile
- **job/[id]**: Job detail with timer (drivers), driver assignments (contractors)
- **chat/[jobId]**: Chat messages for a job
- **notifications**: Notification center
- **create-job**: Contractor job creation form
- **vehicles**: Vehicle management (add/edit/delete)
- **invoice/[id]**: Invoice detail with amount, contractor/driver info, and linked jobs
- **review**: Review submission screen (star rating + comment)

## Key Files
- `shared/schema.ts` - Drizzle ORM schema (snake_case field names matching DB)
- `server/routes.ts` - All API routes
- `server/db.ts` - Database connection
- `contexts/AuthContext.tsx` - Auth state with API login/register
- `lib/query-client.ts` - React Query setup with default fetcher
- `lib/mock-data.ts` - TypeScript interfaces, role helpers, utility functions
- `constants/colors.ts` - Color system

## Email
- Uses Resend (RESEND_API_KEY secret) with loadlinklive.com domain
- Sends password reset codes styled in LoadLink dark theme branding

## Recent Changes (Feb 2026)
- Rebuilt profile screen as full Settings page matching web app with 5 tabs: Profile, Role, Help, Account, Billing
- Added role-switching: users can change between driver, contractor, trucking company, foreman roles
- Help tab: Contact LoadLink, Tutorials, App Suggestions
- Account tab: Security Settings, Connected Accounts (Coming Soon)
- Billing tab: Current Plan, Payment Methods (Coming Soon)
- Made app role-aware: contractors and drivers see different tab layouts
- Added contractor job creation screen with full form (material, locations, rates, schedule)
- Built contractor job management: view posted jobs with application counts
- Added driver assignment management in job detail (approve/reject with haptic feedback)
- Built vehicle management screen with add/edit/delete and primary vehicle support
- Created invoicing tab with Outstanding/Paid stats and filter chips
- Added cancel job functionality for contractors
- Connected to real LoadLink database via EXTERNAL_DATABASE_URL
- Built complete Drizzle schema matching all 28 DB tables
- Created API routes for auth, jobs, messages, earnings, calendar, profile
- Updated all frontend screens to use React Query + real API
- Removed all mock data arrays, kept interfaces and utility functions
- Added password reset flow via Resend email (6-char code, 30min expiry)
- Added set-password flow for web accounts using Replit auth
- Added Google Places Autocomplete for pickup/dropoff location inputs with suggestions dropdown
- Added route duration estimator card (per trip time with 1.4x dump truck speed adjustment, distance, estimated work days)
- API endpoints: `/api/places/autocomplete`, `/api/places/details`, `/api/directions`
- Calendar date picker for scheduled date (Month Day, Year format)
- Materials autocomplete dropdown from past jobs
- Built review system: reviews table, POST/GET API endpoints, star rating + comment UI
- Review notifications auto-sent to both driver and contractor on job clock-out
- Tapping "load_completed" notification opens review screen for that job
- Pending reviews banner shown at top of Messages tab
- Submitted reviews update user's average rating in users table
- Moved Earnings from tab bar to Profile screen (as Earnings sub-tab)
- Replaced Earnings tab with Jobs tab showing driver's assigned jobs with vehicle assignment
- Added truck availability validation on job accept: drivers can't accept more jobs than qualifying trucks per date
- Cleanup endpoint `/api/cleanup-duplicate-assignments` removes excess assignments when driver has more jobs than trucks on a date (keeps earliest accepted)
- Calendar auto-detects conflicting assignments and triggers cleanup on load
- Fixed withdraw endpoint to also delete job_assignments (not just reset job status)
- Calendar "X TRUCKS BOOKED" label changed to "X JOBS BOOKED" for accuracy
- Dashboard shows role-aware job info: drivers see contractor name + assignment status, contractors see truck counts
- Fixed react-native-maps web compatibility: split into platform-specific files (RouteMapView.native.tsx / RouteMapView.web.tsx)
- Web map view uses Google Maps JavaScript API via /api/map-embed iframe with dark theme, route directions, and markers
- Native map view uses react-native-maps with MapView, Marker, and Polyline components
- Calendar day popup: direct "Mark Available" / "Mark Unavailable" toggle buttons (no more long-press-only modal)
- Bulk availability actions: "All Weekdays Available" and "All Weekends Available" buttons in day popup
- Individual day overrides: tap any day after bulk action to toggle that specific day's availability
- Driver calendar availability controls mirrored from contractor view (inline Mark Available/Unavailable + bulk actions)
- Jobs/Projects toggle on contractor My Jobs screen: switch between job list and project list
- Create Project modal with name, job number, site address, notes
- Project cards show job count, site address, awarded amount, status
- Tapping a project filters jobs view to show only that project's jobs
- FAB context-aware: creates project on Projects tab, creates job on Jobs tab (pre-fills project when inside project view)
- create-job.tsx accepts projectId URL param to pre-fill project selection
- Weight ticket upload system: weight_tickets table, photo upload via expo-image-picker (camera or library)
- After clock-out on weight-ticket-required jobs, driver gets prompt to upload tickets
- 30-minute timer: if no tickets uploaded within 30 min of clock-out, notifications sent to driver, contractor, and fleet manager
- Weight ticket API: POST `/api/job-runs/:runId/weight-tickets`, GET `/api/jobs/:jobId/weight-tickets`
- Contractors can view uploaded weight ticket photos on job detail screen
