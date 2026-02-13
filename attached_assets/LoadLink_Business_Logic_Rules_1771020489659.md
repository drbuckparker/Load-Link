# LoadLink Business Logic Rules

This document defines how LoadLink works under the hood — every rule, workflow, and decision the system makes. Essential for rebuilding this logic in a mobile app.

---

## 1. USER ROLES & PERMISSIONS

### Roles
| Role | Description |
|------|-------------|
| `driver` | Employee driver — limited access (sees only assigned jobs, no pricing) |
| `owner_operator` | Independent driver — full access (browses jobs, sees pricing, manages own vehicles) |
| `trucking_company` | Fleet manager — manages trucks, drivers, and accepts jobs on behalf of fleet |
| `contractor` | Posts jobs, manages projects, approves drivers, handles invoicing |
| `foreman` | Works under a contractor — can post/manage jobs on the contractor's behalf |
| `trucking_company_contractor` | Hybrid — has both contractor and trucking company capabilities |
| `driver_contractor` | Hybrid — can drive and post jobs |
| `driver_trucking_company` | Hybrid — can drive and manage a fleet |
| `admin` | Platform administrator — full system access |

### Role Capability Helpers
- **Has contractor role**: `contractor`, `driver_contractor`, `trucking_company_contractor`
- **Has trucking company role**: `trucking_company`, `trucking_company_contractor`, `driver_trucking_company`
- **Has driver role**: `driver`, `owner_operator`, `driver_contractor`, `driver_trucking_company`

### Employee Driver Restrictions (role = "driver")
- Can ONLY see jobs assigned to them
- Cannot browse open jobs
- Cannot see job pricing/rates
- Cannot accept jobs on their own — trucking company does it for them

### Foreman Rules
- Must be invited by a contractor (`driverInvitations` with `invitationType = "foreman"`)
- Must accept the invitation (`foremanActivated = true`)
- Must have `contractorAffiliationId` set to the contractor's ID
- Can then post/edit/cancel jobs on behalf of that contractor
- Authorization check: `user.role === "foreman" && user.foremanActivated && user.contractorAffiliationId === job.contractorId`

### Admin Access
- `isAdmin = true` flag can be layered on top of ANY role
- Grants access to admin dashboard and user management
- Admin can suspend/unsuspend users

---

## 2. AUTHENTICATION FLOW

### Registration
1. User provides email, password, and full name
2. Password hashed with bcrypt (12 rounds)
3. User record created with `loginProvider = "email_password"`
4. Session created automatically after registration

### Login
1. User provides email and password
2. System finds user by email
3. bcrypt compares password hash
4. Session created with `userId` and `loginProvider`
5. Returns user profile

### Session Management
- Sessions stored in PostgreSQL (`sessions` table)
- Session cookie: `loadlink.sid`
- Rolling sessions enabled (extends on activity)
- Cookie flags: `httpOnly`, `secure` (in production), `sameSite: lax`

### Privacy Policy Consent
- **Mandatory** — enforced by `requirePrivacyConsent` middleware on nearly all endpoints
- User must call `POST /api/auth/accept-privacy-policy` before accessing any features
- Version-tracked: `privacyPolicyVersionAccepted` stored on user record
- If version changes, user must re-accept

### Password Reset Flow
1. `POST /api/auth/forgot-password` — generates token, sends email via Resend
2. Token is hashed and stored in `passwordResetTokens` table
3. Token expires after set time
4. `POST /api/auth/reset-password` — validates token, updates password hash
5. Token marked as used (`usedAt` set)

---

## 3. JOB LIFECYCLE

### Job Types
| Type | Description |
|------|-------------|
| `single_load` | One trip from A to B — shortest job type |
| `full_day` | Full workday — driver stays on site |
| `multi_day` | Spans multiple days — creates availability commitments for each day |

### Display Rule
- A `multi_day` job with `estimatedDays <= 1` displays as "Full Day Job" (not "Multi-Day Job")

### Status Flow
```
open → accepted/pending → in_progress → completed
                                      → cancelled (at any point before completion)
```

- **open**: Job is posted and visible to drivers
- **pending**: Driver has applied, awaiting contractor approval (multi-truck jobs)
- **accepted**: Contractor has approved the driver/truck
- **in_progress**: Driver has started the clock
- **completed**: Driver has ended the clock
- **cancelled**: Job was cancelled by contractor/foreman

### Rate Types
| Type | Description |
|------|-------------|
| `flat_rate` | Fixed price for the job |
| `per_hour` | Hourly rate |
| `per_ton` | Rate per ton of material |
| `per_load` | Rate per load/trip |

---

## 4. JOB ACCEPTANCE RULES

### Who Can Accept
- Owner-operators accept for themselves
- Trucking companies accept on behalf of their fleet drivers
- Employee drivers CANNOT accept — their trucking company does it

### Pre-Acceptance Checks
1. **Job must be open** — not fully staffed or cancelled
2. **Driver availability** — system checks `driverAvailability` table for the scheduled date(s)
   - If no entries exist for the date, driver is assumed available
   - If entries exist, at least one must have `isAvailable = true`
3. **Scheduling conflicts** — prevents double-booking:
   - Full-day/multi-day jobs: Cannot overlap with another full-day/multi-day job
   - Single-load jobs: Cannot exceed 12 hours of combined work on same day
4. **Truck eligibility** (for trucking companies):
   - Fleet must have trucks matching the job's `truckType`
   - Trucks must be `isActive = true`
   - If job `requiresTarp = true`, truck must have `hasTarp = true`

### Application Limits (Multi-Truck Jobs)
- Maximum applications = `trucksNeeded × 3`
- Once reached, no more drivers can apply until contractor reviews

### Auto-Approval
- If the contractor has favorited the driver with `autoApprove = true`, the job assignment is automatically approved — no manual review needed
- Check: `driverFavorites` table where `favoriterId = contractorId` and `driverId = driverId` and `autoApprove = true`

### Single-Truck vs Multi-Truck
- **Single-truck job** (`trucksNeeded = 1`): Job goes directly to `accepted` or `pending` status. Driver is set on the `jobs.driverId` field.
- **Multi-truck job** (`trucksNeeded > 1`): Each driver gets a `jobAssignments` record. Job moves to `pending` when all slots are filled. Contractor reviews and approves/rejects each truck individually.

### Post-Acceptance: Availability Commitments
After accepting a job, the system automatically creates `driverAvailability` entries:
- **Single-load**: One entry on the job date
- **Full-day**: One entry on the job date
- **Multi-day**: One entry per day for `estimatedDays` days
  - Skips weekends unless `includesWeekends = true`
  - Each entry has `commitmentType = "committed"` and `commitmentCompanyName` = contractor's company name

---

## 5. JOB EXECUTION (CLOCK IN / CLOCK OUT)

### Starting a Job (Clock In)
1. Driver sends GPS coordinates with start request
2. **5-mile proximity check**: System calculates distance from driver to job's `originLat/originLng`
   - Uses Haversine formula for distance calculation
   - If more than 5 miles away: request is rejected with error showing actual distance
3. A new `jobRuns` record is created with `status = "active"` and start location
4. Job status moves to `in_progress`
5. Driver's last known location is updated

### During a Job
- GPS location updates sent periodically → stored in `driverLocationUpdates`
- Each update records: lat, lng, speed, heading, accuracy, timestamp
- These breadcrumbs enable route visualization and mileage calculation

### Still Working Checks
- System periodically prompts drivers to confirm they're still working
- Creates a `stillWorkingChecks` record with an expiration time
- Driver must confirm before expiry via `POST /api/driver/still-working/:checkId`
- If check expires: driver is auto-clocked out

### Ending a Job (Clock Out)
1. Driver sends GPS coordinates with end request
2. System calculates billing:
   - **Actual duration**: Real elapsed time from start to end
   - **Billed duration**: Minimum 1 hour, then rounded up to nearest 15-minute increment
   - Example: 1 hour 22 minutes → billed as 1 hour 30 minutes
   - Example: 47 minutes → billed as 1 hour (minimum)
3. Job run updated with end location, actual duration, billed duration
4. Job status optionally moves to `completed`

### Billing Duration Formula
```
if (actualMinutes <= 60) {
  billedMinutes = 60;  // 1-hour minimum
} else {
  billedMinutes = 60 + Math.ceil((actualMinutes - 60) / 15) * 15;
}
```

---

## 6. COUNTER-BID SYSTEM

### Who Can Bid
- Trucking companies and fleet managers (NOT individual drivers)
- Job must be in `open` status

### Bid Workflow
```
Driver/Company submits bid → pending
  → Contractor accepts → bid accepted, job rate updated, driver assigned
  → Contractor rejects → bid rejected, notification sent
  → Contractor counters → new counter-offer sent back
  → Driver withdraws → bid withdrawn
```

### Rate Preservation
- When the first counter-bid is accepted, the job's **original rate** is saved:
  - `originalRate` = job's previous rate
  - `originalRateType` = job's previous rate type
- Job's `rate` and `rateType` are updated to the bid's proposed values
- If driver later withdraws, the original rate is restored

### Bid Acceptance Side Effects
1. Job's rate updated to the bid amount
2. Job's `driverId` set to the bidding driver
3. Job status updated to `accepted`
4. All other pending bids on the same job are automatically rejected
5. Rejected bidders receive notifications

---

## 7. JOB CANCELLATION

### Who Can Cancel
- Contractors (who posted the job)
- Foremen (affiliated with the contractor who posted the job)
- Trucking companies (for withdrawing their assigned trucks)

### Cancellable Statuses
- `open`, `accepted`, `pending` — can be cancelled
- `in_progress`, `completed` — CANNOT be cancelled

### Cancellation Side Effects
1. Job status → `cancelled`, `cancelledAt` set
2. Driver availability commitments deleted (entries with `jobId` matching the cancelled job)
3. Truck availability records cleared
4. Assigned drivers/trucking companies notified via in-app notification
5. If a counter-bid had changed the rate, the **original rate is restored**

### Driver Withdrawal (Not Full Cancellation)
- When a driver withdraws from a job:
  - Their `jobAssignment` status → `withdrawn`
  - Their availability commitments are removed
  - For single-truck jobs: job reopens to `open` status
  - For multi-truck jobs: only their slot opens up
  - Nearby drivers are re-notified about the reopened job (excluding the withdrawing driver)
  - Original rate restored if bid had changed it

---

## 8. NOTIFICATION SYSTEM

### Location-Based Job Notifications
When a new job is posted or reopened, `notifyNearbyDrivers` runs:

1. Get all drivers from database
2. For each driver:
   a. Skip if in exclude list (e.g., withdrawing driver)
   b. Check availability on job's scheduled date
   c. Check proximity — up to **4 locations** tested:
      - Current GPS (only if updated within last 24 hours)
      - Primary work location
      - Secondary work location
      - Tertiary work location
   d. For each location: calculate distance to job's origin
   e. If distance ≤ driver's `searchRadiusMiles` (default 50): driver is notified

### Search Radius Options
- 50 miles (default)
- 100 miles
- 250 miles

### Push Notification Priority
- **Favorited drivers**: Receive push notification immediately
- **Other drivers**: Push notification delayed by 5 minutes (gives favorites a head start)

### Notification Types
| Type | Trigger |
|------|---------|
| `new_load` | New job posted within driver's radius |
| `load_accepted` | Driver's job application accepted |
| `load_approved` | Truck assignment approved by contractor |
| `load_rejected` | Driver's application rejected |
| `load_completed` | Job completed |
| `message` | New in-app message |
| `general` | General system notification |
| `foreman_invitation` | Foreman invitation received |
| `job_expired` | Posted job expired without being filled |
| `job_date_changed` | Job's scheduled date was changed |

---

## 9. SMART DISPATCH (AI Driver Suggestions)

When a contractor wants to find the best driver for a job, the system scores all available drivers.

### Scoring Weights
| Criteria | Weight |
|----------|--------|
| **Truck Type Match** | 35% |
| **Distance** | 30% |
| **Availability** | 20% |
| **Favorite Status** | 10% |
| **Driver Rating** | 5% |

### Scoring Details
- **Truck Match** (35%): 100 if driver's truck type matches job's required type, 0 if not
- **Distance** (30%): Linear scale from 100 (at job site) to 0 (at 100+ miles away)
  - Formula: `100 × (1 - distanceMiles / 100)`, capped at 0
- **Availability** (20%): 100 if available on scheduled date, 0 if not
- **Favorite** (10%): 100 if favorited by this contractor, 0 if not
- **Rating** (5%): Normalized from 0-5 scale to 0-100
  - No rating defaults to 50 (neutral)
  - Formula: `(rating / 5) × 100`

### Final Score
```
totalScore = (truckMatch × 35 + distance × 30 + availability × 20 + favorite × 10 + rating × 5) / 100
```

---

## 10. INVOICING & EARNINGS

### Invoice Structure
- One invoice per contractor-driver pair per month
- Invoice number format: human-readable unique string
- Period: first day of the month

### Invoice Status Flow
```
open → issued → payment_sent → payment_received
                             → void (cancel invoice)
```

- **open**: Accumulating jobs (current month)
- **issued**: Month ended, invoice sent to contractor
- **payment_sent**: Contractor marked as paid
- **payment_received**: Driver confirmed receipt

### Earnings Calculation
Earnings are based on **billed duration** (not actual duration):
- 1-hour minimum per job run
- 15-minute increments after the first hour
- Rate × billed hours = earnings per run

### Invoice Recalculation
- Invoices can be recalculated if job data changes
- `POST /api/invoices/:id/recalculate` sums all job run earnings for the period

### Snapshots
- When an invoice is issued, the contractor and driver profiles are frozen as JSON snapshots
- This preserves billing information even if profiles change later

---

## 11. DRIVER AVAILABILITY & SCHEDULING

### Calendar System
- Drivers set availability per day with start/end times
- Options: Day shift, Night shift, or custom hours
- Can mark days as available or unavailable
- Recurring weekly patterns supported

### Committed Days
When a driver accepts a job, the system creates committed availability entries:
- `isAvailable = true` (they are "available" but committed)
- `commitmentType = "committed"`
- `commitmentCompanyName` = the contractor's company name
- `jobId` = the accepted job's ID

### 5-Day Work Week Default
- Jobs default to Monday-Friday
- Multi-day job availability commitments skip Saturday and Sunday
- Unless `includesWeekends = true` on the job

### Conflict Prevention
- Full-day and multi-day jobs: Only one per day per driver
- Single-load jobs: Maximum 12 hours of combined work per day
- System checks both `driverAvailability` and existing `jobAssignments`

---

## 12. FLEET MANAGEMENT

### Trucking Company → Trucks
- Company creates trucks with type, make, model, year, etc.
- Each truck can be assigned a default driver (`assignedDriverId`)
- Trucks have active/inactive status with notes for issues

### Truck Calendar
- `truckAvailability` table tracks daily status per truck
- Statuses: `available`, `unavailable`, `committed`, `pending`
- When a trucking company accepts a job for a truck, availability is set to `committed` or `pending`

### Driver Invitations
- Trucking company invites drivers via email
- Creates `driverInvitations` record
- If invited driver has an account, `driverId` is linked
- When accepted: driver's `truckingCompanyId` is set to the company's ID
- Invited driver can be pre-assigned to a specific truck (`assignedTruckId`)

---

## 13. DRIVER STATUS & HEARTBEAT

### Connection States
| Status | Condition |
|--------|-----------|
| **Online** | `lastSeenAt` within last 2 minutes AND `isConnected = true` |
| **Unavailable** | Manually set by driver (triggers SMS auto-replies) |
| **Offline** | `lastSeenAt` older than 2 minutes OR `isConnected = false` |

### Heartbeat
- Frontend sends periodic heartbeat to server
- Updates `lastSeenAt` timestamp
- WebSocket connection status tracked via `isConnected`

### SMS Auto-Replies (Twilio)
- When a driver is set to "Unavailable" status
- Incoming SMS to their number gets an automatic reply
- Managed through Twilio integration

---

## 14. FAVORITING SYSTEM

### Driver Favorites (Contractor → Driver)
- Contractor bookmarks a preferred driver
- Can enable `autoApprove` for automatic job assignment approval
- Favorited drivers get priority push notifications (immediate vs 5-min delay)

### Company Favorites (Driver → Company)
- Drivers can bookmark preferred contractors or trucking companies
- Used for quick access, no auto-approval effect

### Favorited Trucking Company Auto-Assignment
- If a contractor favorites a trucking company, that company can assign drivers from their fleet to the contractor's jobs

---

## 15. DOCUMENT WALLET

### Driver Documents
- Drivers upload documents: CDL, medical card, insurance, DOT inspection, etc.
- Each document has type, name, number, file URL, expiration date
- System tracks expiration for compliance reminders

### Document Sharing
- Drivers share specific documents with specific contractors
- Creates `documentShares` record linking document to contractor
- Contractors can only see documents shared with them

---

## 16. MULTI-STOP LOADS

### Adding Stops
- Contractors or foremen can add stops to in-progress jobs
- Each stop has a sequence number, address, GPS coordinates, and notes

### Stop Status Flow
```
pending → en_route → completed
                   → skipped
```

- Drivers mark stops as completed or skipped as they progress through the route

---

## 17. JOB PHOTOS

### Photo Types
| Type | Use Case |
|------|----------|
| `weigh_receipt` | Weight ticket from the pit |
| `delivery_confirmation` | Proof of delivery |
| `pickup_confirmation` | Proof of pickup |
| `damage_report` | Documenting damage |
| `other` | General job photos |

### Photo Metadata
- GPS coordinates captured at time of photo
- Linked to job and optionally to a specific job run
- Stored via cloud storage (URL saved in `photoUrl`)

---

## 18. PROJECT MANAGEMENT

### Contractor Projects
- Group related jobs under a project
- Track project budget (`awardedAmount`)
- Project site address can be designated as `pickup` or `dropoff` for associated jobs

### Soft Delete
- Projects are soft-deleted (`deletedAt` set instead of actual deletion)
- Kept for 90 days before permanent deletion
- Jobs under a deleted project remain accessible

---

## 19. SECURITY RULES

### Authentication
- User ID ALWAYS derived from session (`getAuthUserId(req)`) — NEVER from request body/query
- This prevents impersonation attacks

### CSRF Protection
- Strict token validation for all state-changing operations (POST, PUT, PATCH, DELETE)

### Rate Limiting
Applied to sensitive endpoints:
- Authentication (login, register)
- Password reset requests
- Job acceptance
- Messaging
- Invoice operations

### Authorization Patterns
- **Job ownership**: Only contractor who posted the job (or affiliated foreman) can modify/cancel
- **Driver assignment**: Only assigned driver can start/end a job
- **Fleet access**: Default-deny — trucking companies can only access their own trucks/drivers
- **Admin**: `isAdmin` flag checked via `requireAdmin` middleware

### Input Validation
- All request bodies validated with Zod schemas
- File uploads validated for type and size
- GPS coordinates validated as finite numbers

### Demo Mode
- Demo endpoints exist for testing
- **Disabled in production** via environment check

---

## 20. DISTANCE CALCULATION

### Haversine Formula
Used for all proximity calculations (notifications, GPS validation):
```
R = 3959 miles (Earth's radius)
a = sin²(ΔLat/2) + cos(lat1) × cos(lat2) × sin²(ΔLng/2)
c = 2 × atan2(√a, √(1-a))
distance = R × c
```

### Usage
- **Job notifications**: Is driver within `searchRadiusMiles` of job?
- **Job start validation**: Is driver within 5 miles of pickup?
- **Smart dispatch**: How close is driver to the job site?

---

## 21. SAVED MATERIALS

### Contractor Materials
- When a contractor creates a job, the material name is saved to `contractorMaterials`
- Deduplication via `normalizedName` (lowercase)
- `usageCount` incremented each time
- Sorted by usage count for quick selection in job creation form

---

## 22. REAL-TIME FEATURES (WebSocket)

### GPS Tracking
- Active job runs: driver location broadcast via WebSocket
- 30-second polling fallback if WebSocket disconnects
- Fleet Map: contractors see live driver locations on map

### Messaging
- In-app job messages delivered in real-time via WebSocket
- Read receipts tracked per message

### Driver Status
- Online/offline status broadcast to relevant parties
- Heartbeat keeps connection alive

---

## 23. SCHEDULED NOTIFICATIONS

### Job Reminders
- Push notifications can be scheduled for future delivery
- Stored in `scheduledNotifications` table
- Cron job processes pending notifications and sends them at `scheduledFor` time
- Status: `pending` → `sent` or `failed`

### Job Expiration
- Cron job checks for expired jobs (past scheduled date, still open)
- Sends `job_expired` notification to the contractor

---

## 24. MULTI-LANGUAGE SUPPORT

### Supported Languages
- English (default)
- Spanish

### How It Works
- Language preference stored in `localStorage` key: `loadlink_language`
- Browser language detection as fallback
- `LanguageProvider` context wraps the entire app
- `useLanguage()` hook provides:
  - `t` — translation object
  - `language` — current language code
  - `setLanguage` — function to change language
- All UI text uses translation keys (never hardcoded English strings)
- Language selector available in Settings page

### For Mobile App
- Store language preference in device storage
- Use the same translation key structure from `client/src/i18n/translations.ts`
- All API responses use English — translation happens on the client only
