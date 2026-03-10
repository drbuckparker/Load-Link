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

### Backend (Companion API Proxy + Local Google APIs)
- **Technology**: Express.js acting as a **thin proxy** to the LoadLink companion web app's REST API, with some routes handled locally.
- **Architecture**: Most `/api/*` requests are forwarded to the companion web app API. However, Google Maps/Places API routes are handled directly by the Express backend (not proxied) because the companion web app's SPA catch-all blocks direct API access for these routes.
- **Local routes** (handled by Express, NOT proxied):
    - `POST /api/auth/login` — authenticates via companion app, caches session cookie
    - `GET /api/places/autocomplete` — Google Places Autocomplete API
    - `GET /api/places/details` — Google Places Details API
    - `GET /api/places/geocode` — Google Places Find Place from Text API (used instead of Geocoding API which is not enabled)
    - `GET /api/directions` — Google Directions API
    - `GET /api/directions/polyline` — Google Directions API (polyline extraction)
    - `GET /api/map-embed` — HTML map embed using Google Maps JS API
- **Proxied routes**: All other `/api/*` requests → companion web app
- **Key files**:
    - `server/companion-proxy.ts` — proxy utilities (`companionFetch`, `proxyRequest`, `companionLogin`)
    - `server/routes.ts` — Express route registration (local routes + catch-all proxy)
    - `server/index.ts` — Express app setup (CORS, body parsing, landing page)
- **Authentication flow**:
    1. Frontend sends `POST /api/auth/login` with `{email, password}` to Express backend
    2. Express calls companion API login, receives session token
    3. Express caches the signed session cookie mapped to the raw token
    4. Frontend stores raw token in AsyncStorage, sends it via `Authorization: Bearer` header
    5. Express proxy converts Bearer token back to session cookie for companion API requests
- **Environment variables**:
    - `COMPANION_API_KEY` — API key for authenticating with the companion web app (secret)
    - `COMPANION_API_URL` — Base URL of the deployed companion web app
    - `GOOGLE_MAPS_API_KEY` — Google Maps/Places API key (used by local routes)
- **Legacy files** (no longer imported by routes, kept for reference):
    - `server/db.ts` — direct Neon PostgreSQL connection (was used before proxy migration)
    - `server/storage.ts` — storage interface (was used before proxy migration)
    - `shared/schema.ts` — Drizzle ORM schema (still used by db.ts but not by routes)

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
- **Companion Web App**: The primary data source. All API calls proxy through to it.
- **Email Service**: Resend (for password reset emails, uses `RESEND_API_KEY`) — handled by companion API.
- **Mapping/Location Services**:
    - Google Places API (for autocomplete and details).
    - Google Maps JavaScript API (for web map view and directions).
    - React Native Maps (for native map view).
    - Native device map applications (iOS Maps / Android Geo) for external navigation.
- **Push Notification Service**: Expo Push API (exp.host).

## Known Issues
- **Companion API URL**: The companion web app's Replit dev URL is behind an auth shield and not accessible for server-to-server requests. The web app must be **deployed/published** and `COMPANION_API_URL` updated to its `.replit.app` URL for the proxy to work.
- **Database columns added manually**: `expo_push_token`, `loads_hauled`, `updated_at` on job_runs, `assigned_driver_id` on driver_vehicles, `available_days` on job_assignments were added via ALTER TABLE (not migrations) due to drizzle-kit push hanging on interactive prompt.
