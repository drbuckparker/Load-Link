# LoadLink API Documentation

**Base URL:** Your deployed web app URL (e.g., `https://your-app.replit.app`)

All authenticated endpoints require a session cookie or Bearer token in the `Authorization` header. Most endpoints also require the user to have accepted the privacy policy.

---

## 1. AUTHENTICATION

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register a new user (email, password, name, role, phone) |
| POST | `/api/auth/login` | Log in with email + password, returns session |
| GET | `/api/auth/me` | Get current logged-in user's profile |
| GET | `/api/auth/user` | Get current user (alternative) |
| POST | `/api/auth/accept-privacy-policy` | Accept the privacy policy (required before using app) |
| POST | `/api/auth/email-logout` | Log out / destroy session |
| POST | `/api/auth/forgot-password` | Request password reset email |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/set-role` | Set user's role after registration |
| POST | `/api/auth/switch-role` | Switch between roles (for hybrid role users) |

---

## 2. USER PROFILE

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:id` | Get a user's public profile |
| PUT | `/api/users/:id` | Update user profile (name, phone, company, settings, etc.) |

---

## 3. JOBS — Core CRUD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | List jobs with filters (see query params below) |
| GET | `/api/jobs/:id` | Get a single job's full details |
| POST | `/api/jobs` | Create a new job (contractor only) |
| PUT | `/api/jobs/:id` | Update a job's details |
| GET | `/api/jobs/cancelled` | Get cancelled jobs for a contractor (last 30 days) |
| GET | `/api/jobs/nearby` | Get jobs near a GPS location (for Quick Job feature) |
| GET | `/api/jobs/my-committed` | Get jobs driver is committed to via availability |

**GET `/api/jobs` Query Parameters:**
- `status` — Filter by status: `open`, `accepted`, `pending`, `in_progress`, `completed`, `cancelled` (comma-separated for multiple)
- `driverId` — Filter jobs for a specific driver
- `contractorId` — Filter jobs by contractor
- `truckingCompanyId` — Filter for a trucking company's fleet jobs
- `scheduledDate` — Filter by specific date (yyyy-MM-dd format)
- `excludeConflicts` — `true` to exclude jobs conflicting with driver availability
- `forDriverId` — Used with excludeConflicts to specify which driver

---

## 4. JOBS — Actions & Workflow

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs/:id/accept` | Driver accepts a job |
| POST | `/api/jobs/:id/accept-as-fleet` | Trucking company assigns a truck to a job |
| POST | `/api/jobs/:id/approve` | Contractor approves a driver for a job |
| POST | `/api/jobs/:id/reject` | Contractor rejects a driver for a job |
| POST | `/api/jobs/:id/withdraw` | Driver withdraws from a job |
| POST | `/api/jobs/:id/cancel` | Cancel a job (contractor/trucking co/foreman) |
| POST | `/api/jobs/:id/start` | Driver starts a job (begins GPS tracking/timer) |
| POST | `/api/jobs/:id/end` | Driver ends/pauses a job |
| POST | `/api/jobs/:id/complete` | Driver marks job as completed |
| POST | `/api/jobs/:id/complete/contractor` | Contractor marks job as completed |
| POST | `/api/jobs/:id/log-arrival` | Driver logs arrival at pickup/dropoff |
| POST | `/api/jobs/:id/vehicle-problem` | Driver reports a vehicle problem |
| PATCH | `/api/jobs/:id/repost` | Repost an expired job |
| PATCH | `/api/jobs/:id/expire` | Mark a job as expired |

---

## 5. TRUCK ASSIGNMENTS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs/:id/assignments` | Get all truck assignments for a job (driver, truck, company info) |
| POST | `/api/job-assignments/:id/approve` | Approve a specific truck assignment |
| POST | `/api/job-assignments/:id/reject` | Reject a specific truck assignment |

---

## 6. JOB STOPS (Multi-Stop Loads)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs/:id/stops` | Get all stops for a job |
| POST | `/api/jobs/:id/stops` | Add a stop to a job |
| PUT | `/api/jobs/:id/stops/:stopId` | Update a stop (mark completed, etc.) |
| DELETE | `/api/jobs/:id/stops/:stopId` | Remove a stop |

---

## 7. JOB PHOTOS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs/:id/photos` | Get all photos for a job |
| POST | `/api/jobs/:id/photos` | Upload a photo (with GPS metadata) |
| DELETE | `/api/jobs/:id/photos/:photoId` | Delete a photo |

---

## 8. COUNTER-BID / NEGOTIATION

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs/:id/bids` | Get all bids for a job |
| POST | `/api/jobs/:id/bids` | Submit a counter-bid on a job |
| PATCH | `/api/jobs/:id/bids/:bidId/accept` | Contractor accepts a bid |
| PATCH | `/api/jobs/:id/bids/:bidId/reject` | Contractor rejects a bid |
| PATCH | `/api/jobs/:id/bids/:bidId/counter` | Contractor counters a bid |
| PATCH | `/api/jobs/:id/bids/:bidId/withdraw` | Driver withdraws a bid |
| GET | `/api/my-bids` | Get all bids for the current driver |

---

## 9. SMART DISPATCH (AI Driver Suggestions)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs/:id/suggestions` | Get AI-ranked driver suggestions for a job |
| POST | `/api/smart-dispatch/preview` | Preview smart dispatch scoring |
| POST | `/api/jobs/:id/invite/:driverId` | Invite a specific driver to a job |

---

## 10. MESSAGING (In-App Chat)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs/:id/messages` | Get messages for a job |
| POST | `/api/jobs/:id/messages` | Send a message on a job |
| POST | `/api/jobs/:id/messages/read` | Mark messages as read |
| GET | `/api/jobs/:id/messages/unread` | Get unread message count |

**Also uses WebSockets** for real-time message delivery.

---

## 11. DRIVER STATUS & GPS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/me/status` | Get current driver's online status |
| GET | `/api/drivers/:id/status` | Get a specific driver's status |
| POST | `/api/driver/heartbeat` | Send heartbeat to stay "online" |
| POST | `/api/driver/disconnect` | Set driver status to offline |
| PUT | `/api/driver/locations` | Update driver's saved work locations |
| GET | `/api/driver/locations` | Get driver's saved work locations |

**GPS tracking during active jobs uses WebSockets** — driver sends location updates every few seconds.

---

## 12. DRIVER AVAILABILITY / CALENDAR

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/me/availability` | Get current driver's availability calendar |
| POST | `/api/me/availability` | Set availability for a date (available/unavailable/committed) |
| PATCH | `/api/me/availability/:id` | Update an availability entry |
| DELETE | `/api/me/availability/:id` | Remove an availability entry |
| GET | `/api/drivers/:driverId/availability` | View a driver's availability (for fleet managers) |

---

## 13. TRUCKS & FLEET MANAGEMENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/trucks` | List all trucks for the current company |
| GET | `/api/trucks/:id` | Get a specific truck's details |
| POST | `/api/trucks` | Add a new truck to the fleet |
| PUT | `/api/trucks/:id` | Update truck details |
| DELETE | `/api/trucks/:id` | Remove a truck |
| GET | `/api/trucks/busy` | Get trucks that are busy on a specific date |
| POST | `/api/trucks/reorder` | Reorder trucks in the list |
| POST | `/api/trucks/:id/toggle-status` | Toggle truck active/inactive |
| POST | `/api/trucks/:id/assign-driver` | Assign a driver to a truck |

---

## 14. TRUCK CALENDAR (Fleet Scheduling)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/truck-calendar` | Get truck availability calendar for a week |
| PUT | `/api/truck-calendar` | Set truck availability for a date |
| PUT | `/api/truck-calendar/bulk` | Bulk update truck availability |
| DELETE | `/api/truck-calendar` | Remove truck availability entry |
| POST | `/api/truck-calendar/swap` | Swap trucks between jobs |
| GET | `/api/jobs/:id/swap-suggestions` | Get swap suggestions for a job |
| POST | `/api/jobs/:id/accept-with-swap` | Accept job and swap an existing truck |

---

## 15. VEHICLES (Driver's Personal Vehicles)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vehicles` | List driver's vehicles |
| POST | `/api/vehicles` | Add a vehicle |
| PUT | `/api/vehicles/:id` | Update a vehicle |
| DELETE | `/api/vehicles/:id` | Remove a vehicle |
| PUT | `/api/vehicles/:id/primary` | Set a vehicle as primary |
| GET | `/api/me/truck` | Get driver's current/primary truck |
| POST | `/api/me/truck-status` | Update truck status |

---

## 16. DRIVER FAVORITES

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/driver-favorites` | List favorited drivers |
| POST | `/api/driver-favorites` | Favorite a driver |
| DELETE | `/api/driver-favorites/:driverId` | Unfavorite a driver |
| PATCH | `/api/driver-favorites/:driverId` | Update favorite settings (auto-approve) |
| GET | `/api/driver-favorites/check/:driverId` | Check if a driver is favorited |

---

## 17. COMPANY FAVORITES

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/company-favorites` | List favorited trucking companies |
| POST | `/api/company-favorites` | Favorite a company |
| DELETE | `/api/company-favorites/:companyId` | Unfavorite a company |
| GET | `/api/company-favorites/check/:companyId` | Check if a company is favorited |

---

## 18. CONTRACTOR PROJECTS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contractor-projects` | List contractor's projects |
| GET | `/api/contractor-projects/:id` | Get project details |
| POST | `/api/contractor-projects` | Create a new project |
| PUT | `/api/contractor-projects/:id` | Update a project |
| DELETE | `/api/contractor-projects/:id` | Soft-delete a project |
| GET | `/api/contractor-locations` | Get all unique project/job locations |
| GET | `/api/contractor-materials` | Get all materials used by contractor |

---

## 19. DOCUMENTS (Driver Document Wallet)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/documents` | List driver's documents |
| POST | `/api/documents` | Upload a document |
| PUT | `/api/documents/:id` | Update document details |
| DELETE | `/api/documents/:id` | Delete a document |
| POST | `/api/documents/:id/share` | Share a document |

---

## 20. EARNINGS & STATS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/driver/earnings` | Get driver's earnings summary |
| GET | `/api/driver/earnings/jobs` | Get detailed job-by-job earnings |
| GET | `/api/contractor/stats` | Get contractor dashboard statistics |

---

## 21. NOTIFICATIONS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get all notifications |
| GET | `/api/notifications/unread-count` | Get unread notification count |
| PUT | `/api/notifications/:id/read` | Mark a notification as read |
| PUT | `/api/notifications/read-all` | Mark all notifications as read |
| DELETE | `/api/notifications/:id` | Delete a notification |

---

## 22. PUSH NOTIFICATIONS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/push/vapid-public-key` | Get VAPID public key for push subscription |
| POST | `/api/push/subscribe` | Subscribe device for push notifications |
| DELETE | `/api/push/subscribe` | Unsubscribe from push notifications |
| GET | `/api/push/status` | Check push subscription status |
| POST | `/api/push/test` | Send a test push notification |

---

## 23. ROUTE ESTIMATION

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/route-estimate` | Get distance/time estimate between two locations |
| GET | `/api/geocode/reverse` | Reverse geocode coordinates to an address |

---

## 24. ACTIVITY FEED

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/activity` | Get recent activity feed for dashboards |

---

## 25. ADMIN (Admin Dashboard)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/stats` | Platform-wide statistics |
| GET | `/api/admin/financial-stats` | Financial overview |
| GET | `/api/admin/users` | List all users with filters |
| GET | `/api/admin/users/:id` | Get detailed user info |
| PATCH | `/api/admin/users/:id/status` | Change user status |
| POST | `/api/admin/users/:id/suspend` | Suspend a user |
| POST | `/api/admin/users/:id/reactivate` | Reactivate a user |
| GET | `/api/admin/jobs` | List all jobs (admin view) |
| GET | `/api/admin/invoices` | List all invoices |

---

## 26. MISCELLANEOUS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Get app configuration (Google Maps key, etc.) |
| GET | `/api/csrf-token` | Get CSRF token for form submissions |
| POST | `/api/sms/webhook` | Twilio SMS webhook (incoming texts) |
| POST | `/api/contact` | Submit a contact/support request |
| POST | `/api/suggestion` | Submit a feature suggestion |

---

## WEBSOCKET EVENTS

The app uses WebSockets (via `ws` library) for real-time features:

| Event | Direction | Description |
|-------|-----------|-------------|
| `gps_update` | Client → Server | Driver sends GPS coordinates during active job |
| `location_update` | Server → Client | Broadcast driver location to fleet map viewers |
| `new_message` | Server → Client | Real-time chat message delivery |
| `job_update` | Server → Client | Job status change notifications |
| `driver_status` | Both | Driver online/offline status changes |

---

## NOTES FOR MOBILE APP

1. **Authentication**: The web app uses session cookies. For mobile, you'll likely want to use the Bearer token approach — send `Authorization: Bearer <token>` in headers.
2. **CSRF**: Mobile apps typically skip CSRF tokens since they're not vulnerable to CSRF attacks. You may need to exempt mobile requests.
3. **File Uploads**: Photos and documents use multipart form data.
4. **GPS Updates**: During active jobs, the driver sends GPS coordinates via WebSocket every few seconds. The mobile app should use the device's native GPS for better accuracy and battery management.
5. **Push Notifications**: The web app uses Web Push (VAPID). For iOS, you'll want to use Apple Push Notification Service (APNs) instead.
6. **Demo Endpoints**: Endpoints ending in `/demo` are for testing only and are disabled in production. Ignore these for the mobile app.
