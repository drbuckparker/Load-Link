# LoadLink Mobile App — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** February 13, 2026  
**Platform:** iOS (primary), Android (future)  
**Backend:** Existing LoadLink web API (Express + PostgreSQL)

---

## 1. EXECUTIVE SUMMARY

LoadLink is a broker platform that connects short-haul truckers (owner-operators and fleet drivers) with excavation and construction companies. The web app is fully built and live. This PRD defines the requirements for building a native mobile app that connects to the same backend API.

The mobile app should deliver the **same core functionality** as the web app, optimized for mobile use in the field — job sites, truck cabs, and outdoor conditions. Drivers are the primary mobile users, but contractors and trucking company managers also need mobile access.

---

## 2. GOALS & SUCCESS METRICS

### Goals
1. Give drivers a fast, reliable mobile experience for accepting and executing jobs
2. Enable real-time GPS tracking during active jobs
3. Deliver push notifications for new jobs, messages, and status updates
4. Allow contractors to post and manage jobs on the go
5. Support offline-resilient patterns for areas with poor cell coverage

### Success Metrics
- Driver job acceptance rate increases
- Time from job post to acceptance decreases
- GPS tracking reliability > 95% during active jobs
- Push notification delivery rate > 90%
- App store rating ≥ 4.5 stars

---

## 3. TARGET USERS

### Primary: Drivers (Owner-Operators)
- Independent truckers who own their truck
- Browse and accept jobs, navigate to sites, clock in/out
- Upload weight tickets and job photos
- Manage availability calendar
- Age range: 25-60, varying technical comfort
- Often wearing gloves, in bright sunlight, or driving

### Secondary: Trucking Company Managers
- Manage fleet of trucks and drivers
- Accept jobs on behalf of their fleet
- View fleet map and truck calendar
- Monitor driver status and earnings

### Tertiary: Contractors
- Post jobs and manage projects
- Review and approve driver applications
- Communicate with drivers via in-app messaging
- Track active jobs and invoicing

### Limited Access: Employee Drivers (role = "driver")
- Can ONLY see jobs assigned to them by their trucking company
- Cannot browse jobs, see pricing, or accept jobs independently
- Simplified interface focused on job execution only

---

## 4. USER ROLES

| Role | Mobile Priority | Key Actions |
|------|----------------|-------------|
| `owner_operator` | **HIGH** | Browse jobs, accept, navigate, clock in/out, photos, earnings |
| `driver` | **HIGH** | View assigned jobs, navigate, clock in/out, photos (limited access) |
| `trucking_company` | **MEDIUM** | Fleet map, assign drivers to jobs, truck calendar, manage fleet |
| `contractor` | **MEDIUM** | Post jobs, approve drivers, messaging, invoicing |
| `foreman` | **MEDIUM** | Post/manage jobs on behalf of contractor |
| `trucking_company_contractor` | **LOW** | Hybrid — both contractor and fleet features |
| `driver_contractor` | **LOW** | Hybrid — both driver and contractor features |
| `admin` | **LOW** | Admin dashboard (web-only is acceptable for v1) |

---

## 5. FEATURE REQUIREMENTS

### 5.1 Authentication (P0 — Must Have)

| Feature | Description |
|---------|-------------|
| Email/Password Login | Standard login with email and password |
| Session Management | Store session token securely (iOS Keychain / Android Keystore) |
| Auto-Login | Persist session across app launches |
| Password Reset | Forgot password flow via email |
| Privacy Policy Consent | Mandatory acceptance before using any features |
| Role Selection | First-time users select their role after registration |
| Role Switching | Hybrid role users can switch between roles |
| Biometric Login | Face ID / Touch ID for quick re-authentication (nice to have for v1) |

**API Reference:** See `LoadLink_API_Documentation.md` — Authentication section

### 5.2 Job Browsing & Search (P0 — Must Have)

| Feature | Description |
|---------|-------------|
| Job List | Scrollable list of open jobs with filters |
| Search & Filter | Filter by status, truck type, date range, distance |
| Job Detail View | Full job info: material, locations, rate, truck requirements, map |
| Map View | See jobs plotted on a map near driver's location |
| Distance Display | Show distance from driver to job pickup |
| Quick Job | One-tap acceptance for nearby jobs matching driver's truck |
| Pull-to-Refresh | Standard refresh gesture |

**Filters Available:**
- Job status (open, accepted, in_progress, completed)
- Truck type (end_dump, side_dump, belly_dump)
- Job type (single_load, full_day, multi_day)
- Distance from current location
- Date range
- Urgency flag

**Note:** Employee drivers (`role = "driver"`) do NOT see this screen. They only see assigned jobs.

### 5.3 Job Acceptance (P0 — Must Have)

| Feature | Description |
|---------|-------------|
| Accept Job | Driver accepts a job (creates assignment, checks conflicts) |
| Vehicle Selection | Driver selects which vehicle to use (if multiple) |
| Conflict Warning | Show warning if scheduling conflict exists |
| Auto-Approval | Instant acceptance if driver is favorited with auto-approve |
| Multi-Truck Jobs | Show truck count needed and current applications |
| Application Limit | Show when a job has reached its application limit |

**Business Rules:** See `LoadLink_Business_Logic_Rules.md` — Section 4 (Job Acceptance Rules)

### 5.4 Job Execution (P0 — Must Have)

| Feature | Description |
|---------|-------------|
| Navigate to Job | Open directions in Apple Maps / Google Maps |
| Log Arrival | Mark arrival at pickup location |
| Clock In (Start Job) | Start the timer — requires GPS within 5 miles of pickup |
| Active Job Timer | Show elapsed time, current location, job details |
| Clock Out (End Job) | Stop the timer — records billing duration |
| GPS Tracking | Background location updates during active job |
| Upload Photos | Camera access for weight tickets, delivery confirmations |
| Multi-Stop Tracking | View and complete additional stops added during job |
| Still Working Check | Respond to "Are you still working?" prompts |

**Critical Rule:** Driver must be within **5 miles** of the pickup location to start a job. App should show current distance and guide driver if too far.

**Billing Duration:**
- 1-hour minimum per job run
- 15-minute increments after the first hour
- Display both actual and billed duration to driver

### 5.5 GPS & Location (P0 — Must Have)

| Feature | Description |
|---------|-------------|
| Current Location | Always-available current GPS position |
| Background Tracking | Continue GPS updates when app is backgrounded during active job |
| Location Updates | Send lat/lng/speed/heading to server every ~10-30 seconds |
| Work Locations | Set up to 3 preferred work locations in profile |
| Search Radius | Set search radius: 50, 100, or 250 miles |
| Last Known Location | Persist last GPS position for job notifications |

**iOS Specifics:**
- Request "Always" location permission for background tracking during active jobs
- Request "When In Use" for general browsing
- Handle location permission denial gracefully

### 5.6 Notifications (P0 — Must Have)

| Feature | Description |
|---------|-------------|
| Push Notifications | APNs for iOS, FCM for Android |
| New Job Alerts | Jobs within driver's search radius |
| Job Status Updates | Accepted, approved, rejected, completed |
| Messages | New in-app message notifications |
| Job Date Changes | Alert when a job's date is modified |
| In-App Notification Feed | Scrollable list of all notifications |
| Badge Count | Unread notification count on app icon |
| Notification Preferences | Toggle notification types on/off |

**Note:** The web app uses VAPID web push. The mobile app needs native push (APNs/FCM) — this requires a new server endpoint to register device tokens.

### 5.7 Messaging (P1 — Should Have)

| Feature | Description |
|---------|-------------|
| Job Chat | Real-time messaging between driver and contractor per job |
| Message List | List of all active job conversations |
| Unread Indicators | Show unread message count per conversation |
| Real-Time Delivery | WebSocket or polling for instant message delivery |
| Read Receipts | Mark messages as read when viewed |

### 5.8 Availability Calendar (P1 — Should Have)

| Feature | Description |
|---------|-------------|
| Calendar View | Monthly calendar showing availability |
| Set Availability | Mark days as available/unavailable |
| Shift Selection | Day shift / Night shift / Custom hours |
| Recurring Patterns | Set weekly recurring availability |
| Committed Days | Show days committed to accepted jobs (read-only) |
| Conflict Display | Visual indicator when multiple commitments overlap |

### 5.9 Counter-Bidding (P1 — Should Have)

| Feature | Description |
|---------|-------------|
| Submit Bid | Propose a different rate for a job |
| Bid Status | Track bid status (pending, accepted, rejected) |
| Contractor Response | View contractor's counter-offer or rejection message |
| Withdraw Bid | Cancel a pending bid |

**Business Rules:** See `LoadLink_Business_Logic_Rules.md` — Section 6 (Counter-Bid System)

### 5.10 Earnings & Invoices (P1 — Should Have)

| Feature | Description |
|---------|-------------|
| Earnings Summary | Total earnings, awaiting payment, current period |
| Invoice List | Monthly invoices with status |
| Invoice Detail | Line-item breakdown of jobs per invoice |
| Invoice Status | Track: open → issued → payment_sent → payment_received |

### 5.11 Profile & Settings (P1 — Should Have)

| Feature | Description |
|---------|-------------|
| Edit Profile | Name, phone, address, company info |
| Truck Details | Truck type, make, model, year, license plate |
| Vehicle Management | Add/edit/remove vehicles (owner-operators) |
| Profile Photo | Upload/change profile picture |
| Work Locations | Set primary/secondary/tertiary work locations |
| Search Radius | Set notification radius |
| Language | English / Spanish toggle |
| Driver Status | Online / Unavailable toggle |
| Privacy Policy | View and manage consent |
| Logout | End session |

### 5.12 Fleet Management — Trucking Companies (P2 — Nice to Have)

| Feature | Description |
|---------|-------------|
| Fleet List | View all trucks with status |
| Truck Calendar | Daily truck availability overview |
| Driver Management | View fleet drivers and their status |
| Fleet Map | Live map showing driver locations |
| Assign Drivers | Accept jobs and assign trucks/drivers |
| Invite Drivers | Send invitations to new drivers |

### 5.13 Contractor Features (P2 — Nice to Have)

| Feature | Description |
|---------|-------------|
| Post Job | Create new single load, full day, or multi-day job |
| Manage Jobs | Edit, cancel, repost jobs |
| Approve Drivers | Review and approve/reject driver applications |
| Projects | Create and manage projects |
| Smart Dispatch | AI-powered driver suggestions |
| Driver Favorites | Bookmark preferred drivers with auto-approve |

### 5.14 Document Wallet (P2 — Nice to Have)

| Feature | Description |
|---------|-------------|
| Upload Documents | CDL, insurance, medical card, etc. |
| Document List | View all uploaded documents |
| Expiration Alerts | Notification when documents expire |
| Share Documents | Share specific documents with contractors |

---

## 6. TECHNICAL ARCHITECTURE

### 6.1 API Communication

- **Base URL:** `https://<deployed-app>.replit.app` (or custom domain)
- **Protocol:** HTTPS only
- **Authentication:** Bearer token in `Authorization` header
- **Content Type:** `application/json`
- **File Uploads:** `multipart/form-data`
- **Real-Time:** WebSocket connection for GPS, messaging, and status updates (with HTTP polling fallback)

**Full API Documentation:** See `LoadLink_API_Documentation.md`

### 6.2 Authentication Flow (Mobile)

```
1. POST /api/auth/login { email, password }
   → Response: { user, sessionToken }

2. Store sessionToken in iOS Keychain / Android Keystore

3. All subsequent requests include:
   Authorization: Bearer <sessionToken>

4. On app launch: GET /api/auth/me
   → If 401: Show login screen
   → If 200: Show main app
```

### 6.3 Push Notifications

The web app uses VAPID web push. The mobile app needs:

**iOS:** Apple Push Notification service (APNs)
- Register for remote notifications on app launch
- Send device token to server: `POST /api/push/register-device`
- Handle notification tap → deep link to relevant screen

**Android:** Firebase Cloud Messaging (FCM)
- Same flow as iOS but with FCM token

**New Server Endpoint Needed:**
```
POST /api/push/register-device
{
  "platform": "ios" | "android",
  "deviceToken": "<apns_or_fcm_token>"
}
```

### 6.4 Background GPS Tracking

During active jobs, the app must:
1. Request "Always" location permission (iOS) or foreground service (Android)
2. Track location every 10-30 seconds
3. Send updates to server: `POST /api/driver/location`
4. Continue tracking when app is backgrounded
5. Stop tracking when job ends or app is terminated
6. Show persistent notification indicating tracking is active

### 6.5 Offline Handling

The mobile app should handle poor connectivity gracefully:
- Cache job list and details for offline viewing
- Queue location updates and send when connection resumes
- Queue photo uploads and send when connection resumes
- Show clear "No Connection" indicator
- Allow driver to clock in/out offline and sync when reconnected

### 6.6 Data Models

**Full Schema:** See `LoadLink_Data_Models.md`

Key models the mobile app interacts with:
- Users (profile, settings, locations)
- Jobs (browsing, accepting, executing)
- Job Assignments (multi-truck job tracking)
- Job Runs (clock in/out, timing, GPS)
- Driver Location Updates (GPS breadcrumbs)
- Notifications (push + in-app feed)
- Job Messages (in-app chat)
- Monthly Invoices (earnings tracking)
- Driver Vehicles (vehicle management)
- Driver Availability (calendar)
- Job Photos (camera uploads)

---

## 7. DESIGN SPECIFICATIONS

**Full Style Guide:** See `LoadLink_Design_Assets.md`

### Key Design Principles
- **Dark theme only** — optimized for outdoor/sunlight use
- **High contrast** — Safety Orange (#FF9900) on Deep Asphalt (#161a22)
- **Large touch targets** — 44pt minimum (drivers may wear gloves)
- **Minimal text entry** — use taps, toggles, and selections where possible
- **Fast navigation** — bottom tab bar for primary sections, max 2 taps to any feature

### Typography
- **Headings:** Chakra Petch (bold, uppercase, tight tracking)
- **Body:** Inter (regular weight, standard spacing)

### Color Palette
| Element | Color |
|---------|-------|
| Background | `#161a22` (Deep Asphalt) |
| Cards | `#1e2330` (Lighter Asphalt) |
| Primary/Accent | `#FF9900` (Safety Orange) |
| Text | `#f0f1f3` (Concrete White) |
| Muted Text | `#a6aab2` |
| Success | `#22c55e` (Green) |
| Warning | `#f59e0b` (Amber) |
| Error | `#ef4444` (Red) |
| Info | `#3b82f6` (Blue) |

---

## 8. SCREEN MAP

### Driver Screens (Owner-Operator)
```
Login
  ├── Register
  ├── Forgot Password
  └── Privacy Policy Consent

Main App (Bottom Tab Navigation)
  ├── Jobs Tab
  │   ├── Job List (filterable, searchable)
  │   ├── Job Detail
  │   │   ├── Accept Job
  │   │   ├── Submit Counter-Bid
  │   │   └── Navigate to Job
  │   ├── Quick Job (nearby one-tap acceptance)
  │   └── Active Job View
  │       ├── Clock In
  │       ├── Timer + GPS Tracking
  │       ├── Upload Photo
  │       ├── View Stops
  │       ├── Still Working Check
  │       └── Clock Out
  │
  ├── Calendar Tab
  │   ├── Monthly Calendar
  │   └── Set Availability
  │
  ├── Messages Tab
  │   ├── Conversation List
  │   └── Chat View
  │
  ├── Earnings Tab
  │   ├── Earnings Summary
  │   ├── Invoice List
  │   └── Invoice Detail
  │
  └── Profile Tab
      ├── Edit Profile
      ├── Vehicle Management
      ├── Work Locations
      ├── Document Wallet
      ├── Settings (language, notifications, status)
      └── Logout
```

### Employee Driver Screens (Limited)
```
Main App
  ├── My Jobs Tab (assigned jobs only)
  │   ├── Job Detail
  │   └── Active Job View (same as above)
  │
  ├── Messages Tab
  │
  └── Profile Tab (simplified)
```

### Contractor Screens
```
Main App
  ├── Dashboard Tab
  │   ├── Active Jobs Overview
  │   └── Quick Stats
  │
  ├── Jobs Tab
  │   ├── Job List (my posted jobs)
  │   ├── Post New Job
  │   ├── Job Detail
  │   │   ├── Approve/Reject Drivers
  │   │   ├── Smart Dispatch
  │   │   └── Cancel Job
  │   └── Job Edit
  │
  ├── Messages Tab
  │
  ├── Invoices Tab
  │
  └── Profile Tab
```

---

## 9. PRIORITY & PHASING

### Phase 1 — MVP (8-12 weeks)
**Focus: Driver experience**
- Authentication (login, register, password reset)
- Job browsing, search, and filtering
- Job acceptance with conflict checking
- Job execution (clock in/out, GPS tracking, 5-mile check)
- Photo upload (weight tickets)
- Push notifications (new jobs, status updates)
- Basic profile management
- Driver status (online/unavailable)
- English language support

### Phase 2 — Enhanced Driver (4-6 weeks)
- Messaging
- Availability calendar
- Counter-bidding
- Earnings and invoices
- Document wallet
- Quick Job feature
- Multi-stop load tracking
- Spanish language support

### Phase 3 — Contractor & Fleet (6-8 weeks)
- Contractor job posting
- Driver approval workflow
- Smart dispatch
- Trucking company fleet management
- Fleet map
- Truck calendar

### Phase 4 — Polish (2-4 weeks)
- Biometric login
- Offline support
- Performance optimization
- Accessibility improvements
- App Store / Play Store submission

---

## 10. REFERENCE DOCUMENTS

All companion documents are in the project root:

| Document | Contents |
|----------|----------|
| `LoadLink_API_Documentation.md` | Every API endpoint with methods, parameters, and responses |
| `LoadLink_Data_Models.md` | All 27 database tables with fields and relationships |
| `LoadLink_Business_Logic_Rules.md` | 24 sections of business rules, workflows, and formulas |
| `LoadLink_Design_Assets.md` | Colors, fonts, spacing, component styles, and mobile design notes |

---

## 11. OPEN QUESTIONS & DECISIONS

| # | Question | Notes |
|---|----------|-------|
| 1 | iOS only first, or iOS + Android simultaneously? | Recommend iOS first based on user base |
| 2 | Native (Swift/Kotlin) or cross-platform (React Native/Flutter)? | Cross-platform could share code with web |
| 3 | Should admin features be mobile-accessible? | Recommend web-only for admin in v1 |
| 4 | Offline clock-in/out — how to handle time disputes? | Need policy for offline time recording |
| 5 | App Store review — any content concerns? | Payment features may require in-app purchase review |
| 6 | Push notification infrastructure — APNs direct or via service (OneSignal, Firebase)? | Firebase recommended for cross-platform |
| 7 | Deep linking strategy for notifications? | Define URL scheme for all notification types |

---

## 12. ACCEPTANCE CRITERIA

The mobile app is considered ready for release when:

1. A driver can register, log in, and set up their profile
2. A driver can browse open jobs filtered by location, truck type, and date
3. A driver can accept a job and see it in their active jobs
4. A driver can navigate to a job site and clock in (with 5-mile GPS validation)
5. GPS tracking works reliably in the background during active jobs
6. A driver can clock out and see correct billing duration
7. A driver can upload photos during a job
8. Push notifications arrive within 30 seconds for new jobs and messages
9. The app matches the LoadLink web design (dark theme, Safety Orange accents)
10. The app works smoothly on iPhone 12 and newer (iOS 16+)
11. No crashes or data loss during normal usage
12. Session persists across app launches without requiring re-login
