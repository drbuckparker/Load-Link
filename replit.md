# LoadLink Mobile Companion App

## Overview
Mobile companion app for LoadLink, an existing logistics web platform for short-haul trucking and construction. The app targets truck drivers (owner-operators) and contractors.

## Current State
- Connected to existing LoadLink web app database (Neon PostgreSQL) via `EXTERNAL_DATABASE_URL`
- Real API routes built with Express + Drizzle ORM querying 28 tables
- Authentication via email/password with bcrypt + express-session (sessions stored in DB)
- All screens fetch from real API instead of mock data

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

## Database
- External Neon PostgreSQL (shared with LoadLink web app)
- 28 tables: users, jobs, job_runs, notifications, job_messages, driver_availability, monthly_invoices, driver_vehicles, job_assignments, etc.
- Schema defined in `shared/schema.ts` using Drizzle ORM with snake_case field names
- DB connection in `server/db.ts` using `EXTERNAL_DATABASE_URL`

## API Routes (server/routes.ts)
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/register` - New account registration
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Check session
- `GET /api/jobs` - List jobs (query params: status, truck_type, search, driver_id)
- `GET /api/jobs/:id` - Job detail with contractor info, runs, assignments
- `POST /api/jobs/:id/accept` - Accept a job
- `POST /api/jobs/:id/withdraw` - Withdraw from a job
- `POST /api/jobs/:id/clock-in` - Start a job run
- `POST /api/job-runs/:runId/clock-out` - End a job run (1hr min, 15min increments)
- `GET /api/conversations` - List message conversations
- `GET /api/messages/:jobId` - Get messages for a job
- `POST /api/messages/:jobId` - Send a message
- `GET /api/notifications` - Get user notifications
- `POST /api/notifications/mark-read` - Mark all notifications read
- `GET /api/earnings` - Earnings with period filter (week/month/all)
- `GET /api/availability` - Calendar availability
- `POST /api/availability` - Set availability for a date
- `GET /api/profile` - User profile with vehicles
- `PUT /api/profile` - Update profile
- `PUT /api/profile/status` - Toggle online/offline

## App Screens
- **(auth)**: login, register, forgot-password
- **(tabs)**: jobs (index), calendar, messages, earnings, profile
- **job/[id]**: Job detail with timer, accept/withdraw
- **chat/[jobId]**: Chat messages for a job
- **notifications**: Notification center

## Key Files
- `shared/schema.ts` - Drizzle ORM schema (snake_case field names matching DB)
- `server/routes.ts` - All API routes
- `server/db.ts` - Database connection
- `contexts/AuthContext.tsx` - Auth state with API login/register
- `lib/query-client.ts` - React Query setup with default fetcher
- `lib/mock-data.ts` - TypeScript interfaces and utility functions (mock data removed)
- `constants/colors.ts` - Color system

## Recent Changes (Feb 2026)
- Connected to real LoadLink database via EXTERNAL_DATABASE_URL
- Built complete Drizzle schema matching all 28 DB tables
- Created API routes for auth, jobs, messages, earnings, calendar, profile
- Updated all frontend screens to use React Query + real API
- Removed all mock data arrays, kept interfaces and utility functions
