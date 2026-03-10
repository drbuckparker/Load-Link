# LoadLink Mobile Companion App

## Overview
The LoadLink Mobile Companion App is designed to extend the functionality of the existing LoadLink logistics web platform to mobile devices. It serves all user roles within the short-haul trucking and construction industries, including truck drivers, contractors, trucking companies, and foremen. The app aims to streamline job management, communication, and financial tracking for all stakeholders, providing a comprehensive mobile solution for logistics operations.

## User Preferences
I want to prioritize a clean, maintainable, and well-structured codebase. I prefer clear and concise explanations for any proposed changes, focusing on the "why" as much as the "what." For development, I prefer an iterative approach, with small, testable changes. Please ask for confirmation before implementing major architectural changes or refactoring large portions of the codebase. When making changes, ensure that all existing features continue to function as expected, especially role-based access and UI elements.

## System Architecture

### Frontend
- **Framework**: React Native with Expo Router for file-based routing.
- **State Management**: React Query for server state synchronization and AuthContext for user authentication state.
- **Authentication**: JWT-based auth. Token stored in AsyncStorage (`loadlink_token`) and sent via `Authorization: Bearer` header on all requests.
- **Styling**: React Native StyleSheet, adhering to a dark "Industrial Modern" theme optimized for outdoor visibility.
- **UI/UX**:
    - **Color Scheme**: Primary Safety Orange (#FF9900) on Deep Asphalt (#161a22) background.
    - **Typography**: Chakra Petch for headings (bold, uppercase) and Inter for body text.
    - **Accessibility**: Minimum 44pt touch targets for gloved hands.
    - **Interactive Elements**: Liquid glass tab bar on iOS 26+ with BlurView fallback.
    - **Role-Aware UI**: Dynamic tab layouts and feature visibility based on user roles (e.g., contractors see job management/invoices; drivers see job browsing/earnings).

### Backend (Direct Database Access)
- **Technology**: Express.js with direct Neon PostgreSQL database access via Drizzle ORM.
- **Architecture**: The Express backend connects directly to the same Neon database used by the companion web app. Both apps read/write to the same tables — no proxy or middleman. This gives the mobile app the fastest possible response times.
- **Key files**:
    - `server/routes.ts` — All API route handlers (~4,800 lines): auth, jobs, messaging, invoices, vehicles, projects, Google Maps/Places, etc.
    - `server/db.ts` — Neon PostgreSQL connection pool and Drizzle ORM instance
    - `server/index.ts` — Express app setup (CORS, body parsing, landing page)
    - `shared/schema.ts` — Drizzle ORM schema (shared database table definitions)
    - `server/companion-proxy.ts` — (legacy, no longer used) proxy utilities from previous architecture
- **Authentication flow**:
    1. Frontend sends `POST /api/auth/login` with `{email, password}`
    2. Express validates credentials directly against the `users` table (bcrypt)
    3. Express generates a random auth token, maps it to userId in memory (`authTokenMap`)
    4. Frontend stores token in AsyncStorage, sends it via `Authorization: Bearer` header
    5. `requireAuth` middleware checks Bearer token → looks up userId from `authTokenMap`
    6. Also supports session-based auth (express-session + connect-pg-simple) as fallback
- **Environment variables**:
    - `DATABASE_URL` — Neon PostgreSQL connection string (shared with companion web app)
    - `GOOGLE_MAPS_API_KEY` — Google Maps/Places API key
    - `RESEND_API_KEY` — Resend email service key (for password resets)
    - `SESSION_SECRET` — Express session secret
- **Google Maps API note**: The Google Geocoding API is not enabled on the project. The `/api/places/geocode` route uses Google's "Find Place from Text" API instead.
- **Database safety**: Never use `drizzle-kit push` (hangs on `contractor_favorite_drivers` table). Add columns via Node.js `pg` driver with ALTER TABLE only.

### Core Features
- **Job Management**: Drivers can browse, accept, clock-in/out, and track earnings. Contractors can post, manage assignments (approve/reject drivers), and view invoices.
- **User Roles**: Supports `driver`, `contractor`, `trucking_company`, `trucking_company_contractor`, `driver_contractor`, `foreman`, `driver_trucking_company` with role-based feature access.
- **Messaging**: Real-time messaging between users related to specific jobs, including auto-messages for job events.
- **Review System**: Allows users to submit and view reviews for completed jobs, impacting user ratings.
- **Vehicle Management**: Users can add, update, and delete their vehicles.
- **Project Management**: Contractors can create, update, and manage projects, linking jobs to specific projects.
- **Weight Ticket System**: Supports uploading weight tickets for job runs, with reminders and viewing capabilities.
- **Location Services**: GPS tracking for clock-in/out, location-based job filtering, and integration with Google Places/Maps.
- **Push Notifications**: Utilizes Expo Push for critical updates.
- **Partial Availability**: Drivers can specify which days they're available for multi-day jobs via `available_days` on job_assignments.

## External Dependencies
- **Companion Web App**: Shares the same Neon database. Both apps read/write independently — no API proxy dependency.
- **Email Service**: Resend (for password reset emails, uses `RESEND_API_KEY`).
- **Mapping/Location Services**:
    - Google Places API (for autocomplete and details).
    - Google Maps JavaScript API (for web map view and directions).
    - React Native Maps (for native map view).
    - Native device map applications (iOS Maps / Android Geo) for external navigation.
- **Push Notification Service**: Expo Push API (exp.host).

## Known Issues
- **Companion API URL**: The companion web app's Replit dev URL is behind an auth shield and not accessible for server-to-server requests. The web app must be **deployed/published** and `COMPANION_API_URL` updated to its `.replit.app` URL for the proxy to work.
- **Database columns added manually**: `expo_push_token`, `loads_hauled`, `updated_at` on job_runs, `assigned_driver_id` on driver_vehicles, `available_days` on job_assignments were added via ALTER TABLE (not migrations) due to drizzle-kit push hanging on interactive prompt.
