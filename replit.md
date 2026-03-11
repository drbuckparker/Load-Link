# LoadLink Mobile App (Companion to LoadLink Website)

## Overview
The LoadLink Mobile App is the companion to the main LoadLink website (`loadlink.replit.app`). It extends the functionality of the existing LoadLink logistics web platform to mobile devices. It serves all user roles within the short-haul trucking and construction industries, including truck drivers, contractors, trucking companies, and foremen. The app aims to streamline job management, communication, and financial tracking for all stakeholders, providing a comprehensive mobile solution for logistics operations.

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

### Backend (Website API Proxy)
- **Technology**: Express.js acting as a thin proxy layer to the main LoadLink website API at `loadlink.replit.app`.
- **Architecture**: The Express backend has **NO direct database access**. All reads and writes go through the website's REST API. The backend handles auth token mapping, Google Maps/Places proxying, and constructs some derived endpoints (dashboard, calendar, earnings) from website API data.
- **Key files**:
    - `server/routes.ts` — Proxy route handlers: auth, website API forwarding, Google Maps/Places, derived endpoints
    - `server/index.ts` — Express app setup (CORS, body parsing, landing page)
    - `server/db.ts` — (legacy, no longer imported by routes)
    - `shared/schema.ts` — (legacy) Drizzle ORM schema definitions
    - `server/routes.ts.bak` — Backup of the old direct-DB routes file
- **Authentication flow**:
    1. Frontend sends `POST /api/auth/login` with `{email, password}`
    2. Express forwards email to `POST https://loadlink.replit.app/api/companion/auth/login` with `X-API-Key` header (password not sent — API key establishes trust)
    3. Website returns a JWT + user object
    4. Express generates a local token, maps it to the website JWT
    5. Frontend stores local token in AsyncStorage, sends via `Authorization: Bearer` header
    6. `requireAuth` middleware checks local token → looks up website JWT
    7. All subsequent API calls forward to website with `Authorization: Bearer <JWT>` + `X-API-Key`
- **Endpoint categories**:
    - **Proxied to website**: jobs, job actions (accept/withdraw/clock-in/clock-out), conversations, messages, notifications, invoices, vehicles, reviews, favorites
    - **Built locally from website data**: dashboard, profile, calendar/jobs, contractor/jobs, driver/jobs, earnings, projects, materials, saved-locations, availability, messages/unread-count
    - **Handled locally**: Google Maps/Places autocomplete/details/geocode/directions/polyline/embed
- **Response format**: All JSON responses include both camelCase and snake_case keys via `addDualKeys()` utility, ensuring backward compatibility with frontend code that uses either format.
- **Environment variables**:
    - `COMPANION_API_KEY` — API key for authenticating with the LoadLink website
    - `COMPANION_API_URL` — Base URL of the LoadLink website (default: `https://loadlink.replit.app`)
    - `GOOGLE_MAPS_API_KEY` — Google Maps/Places API key
- **Google Maps API note**: The Google Geocoding API is not enabled on the project. The `/api/places/geocode` route uses Google's "Find Place from Text" API instead.

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
- **LoadLink Website** (`loadlink.replit.app`): The original project and single source of truth for all data. This mobile app reads/writes via the website's API. Auth uses `X-API-Key` + JWT from the website's companion auth endpoint.
- **Mapping/Location Services**:
    - Google Places API (for autocomplete and details).
    - Google Maps JavaScript API (for web map view and directions).
    - React Native Maps (for native map view).
    - Native device map applications (iOS Maps / Android Geo) for external navigation.
- **Push Notification Service**: Expo Push API (exp.host).

## Website API Endpoints
The LoadLink website at `loadlink.replit.app` provides these working endpoints for the mobile companion app:
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
- `/api/calendar/jobs` → `/api/jobs` (filtered client-side by date)
- `/api/contractor/calendar-capacity` → `/api/truck-calendar`

All endpoints now proxy to the website — no locally constructed responses remain.
