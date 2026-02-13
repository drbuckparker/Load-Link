# LoadLink Data Models / Schema

This document describes every data table in LoadLink, what each field stores, and how tables relate to each other. All IDs are UUIDs (text strings), and all timestamps are in UTC.

---

## 1. USERS

The central table — stores all user types (drivers, contractors, trucking companies, foremen, admins).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID (string) | Unique user ID |
| username | text | Username (unique, optional) |
| password | text | Hashed password (for email/password login) |
| loginProvider | enum | `replit_auth` or `email_password` |
| role | enum | `driver`, `contractor`, `trucking_company`, `trucking_company_contractor`, `driver_contractor`, `driver_trucking_company`, `foreman`, `admin` |
| fullName | text | Display name |
| firstName | text | First name |
| lastName | text | Last name |
| phone | text | Phone number |
| email | text | Email address (unique) |
| profileImageUrl | text | URL to profile photo |
| address, city, state, zipCode | text | Mailing address |
| **Driver Fields** | | |
| truckType | enum | `end_dump`, `side_dump`, or `belly_dump` |
| truckYear, truckMake, truckModel | various | Truck details |
| licensePlate | text | License plate number |
| cdlNumber, cdlState, cdlImageUrl | text | CDL license info |
| insuranceProvider, insurancePolicyNumber | text | Insurance details |
| mcNumber, dotNumber | text | MC and DOT numbers |
| truckingCompanyId | UUID | If driver is employed by a trucking company |
| truckIsActive | boolean | Whether the driver's truck is operational |
| truckIssueNotes | text | Notes about truck problems |
| primaryLocationAddress/Lat/Lng | text/decimal | Driver's main work area |
| secondaryLocationAddress/Lat/Lng | text/decimal | Driver's second work area |
| tertiaryLocationAddress/Lat/Lng | text/decimal | Driver's third work area |
| searchRadiusMiles | integer | How far driver is willing to go (50/100/250) |
| lastKnownLat, lastKnownLng | decimal | Last GPS position |
| lastLocationUpdatedAt | timestamp | When GPS was last updated |
| lastSeenAt | timestamp | Last heartbeat time |
| isConnected | boolean | Currently online |
| **Foreman Fields** | | |
| contractorAffiliationId | UUID | Contractor the foreman works for |
| foremanActivated | boolean | Whether foreman has accepted invitation |
| **Contractor Fields** | | |
| company | text | Company name |
| companyLogo | text | Company logo URL |
| businessType | text | Type of business |
| yearsInBusiness | integer | Years in business |
| website | text | Company website |
| accountingContactName | text | Name for daily reports |
| accountingContactEmail | text | Email for daily reports |
| **Trucking Company Fields** | | |
| fleetSize | integer | Number of trucks |
| dotNumberCompany, mcNumberCompany | text | Company DOT/MC numbers |
| contactPerson | text | Primary contact name |
| **General** | | |
| rating | decimal | User rating (1-5 scale) |
| totalJobs | integer | Completed job count |
| preferredMaterialUnit | text | `tons` or `yards` |
| isAdmin | boolean | Has admin access |
| isSuspended | boolean | Account suspended by admin |
| suspendedAt, suspendReason, suspendedBy | various | Suspension details |
| privacyPolicyVersionAccepted | text | Privacy policy version |
| privacyPolicyAcceptedAt | timestamp | When they accepted it |
| createdAt, updatedAt | timestamp | Record timestamps |

---

## 2. JOBS

The core business table — every load, full-day job, and multi-day job.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique job ID |
| contractorId | UUID | Who posted the job (references users) |
| driverId | UUID | Assigned driver (null if multi-truck or unassigned) |
| projectId | UUID | Which project this job belongs to (references contractor_projects) |
| invoiceId | UUID | Linked invoice |
| vehicleId | UUID | Assigned vehicle |
| jobType | text | `single_load`, `full_day`, or `multi_day` |
| material | text | What's being hauled (e.g., "Fill", "Gravel", "Concrete") |
| originAddress | text | Pickup location (address or "Dropped Pin (lat, lng)") |
| originLat, originLng | decimal | Pickup GPS coordinates |
| destinationAddress | text | Dropoff location |
| destinationLat, destinationLng | decimal | Dropoff GPS coordinates |
| distance | decimal | Distance in miles |
| estimatedDurationMinutes | integer | Estimated one-way trip time |
| loadTimeMinutes | integer | Time to load (default 15 min) |
| unloadTimeMinutes | integer | Time to unload (default 10 min) |
| adjustedTripMinutes | integer | Adjusted round-trip time |
| estimatedTotalMinutes | integer | Total estimated work time |
| estimatedDays | decimal | How many days the job spans |
| estimatedTrips | integer | Number of round trips |
| estimatedCost | decimal | Estimated total payout |
| listedDays | decimal | Days the job is listed for |
| rate | decimal | Pay rate |
| rateType | text | `flat_rate`, `per_hour`, `per_ton`, `per_load` |
| originalRate, originalRateType | various | Preserved when counter-bid changes the rate |
| truckType | enum | Required truck type: `end_dump`, `side_dump`, `belly_dump` |
| capacityNeeded | text | Required truck capacity (e.g., "13.5 ton") |
| totalTonsNeeded | decimal | Total material amount needed |
| totalAmountUnit | text | `tons`, `yards`, or `hours` |
| trucksNeeded | integer | How many trucks needed for this job |
| status | enum | `open` → `accepted`/`pending` → `in_progress` → `completed` or `cancelled` |
| urgent | boolean | Flagged as urgent |
| includesWeekends | boolean | Whether job runs on weekends |
| requiresWeightTickets | boolean | Driver must upload weight tickets |
| requiresTarp | boolean | Truck must have a tarp |
| scheduledDate | timestamp | When the job is scheduled |
| pickupTime | text | Time to show up (e.g., "07:00") |
| arrivalTime | timestamp | When driver actually arrived |
| completedDate | timestamp | When job was completed |
| cancelledAt | timestamp | When job was cancelled |
| createdAt, updatedAt | timestamp | Record timestamps |

**Status Flow:** `open` → `accepted` (single driver) or `pending` (multi-truck, awaiting contractor approval) → `in_progress` → `completed`

---

## 3. JOB ASSIGNMENTS

Tracks multiple trucks/drivers assigned to a single job (for multi-truck jobs).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Assignment ID |
| jobId | UUID | Which job (references jobs) |
| driverId | UUID | Which driver (references users) |
| vehicleId | UUID | Driver's vehicle (references driver_vehicles) |
| fleetTruckId | UUID | Fleet truck assigned (references trucks) |
| status | enum | `pending`, `approved`, `rejected`, `withdrawn` |
| acceptedAt | timestamp | When driver accepted |
| approvedAt | timestamp | When contractor approved |

---

## 4. JOB RUNS

Tracks each work session — when a driver starts and stops the clock.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Run ID |
| jobId | UUID | Which job |
| driverId | UUID | Which driver |
| status | enum | `active`, `completed`, `cancelled` |
| startedAt | timestamp | Clock-in time |
| endedAt | timestamp | Clock-out time |
| startLat, startLng | decimal | GPS at clock-in |
| endLat, endLng | decimal | GPS at clock-out |
| actualDurationMinutes | integer | Real work time |
| billedDurationMinutes | integer | Billable time |
| totalMiles | decimal | Distance covered |

---

## 5. DRIVER LOCATION UPDATES

GPS breadcrumb trail during active jobs (real-time tracking data).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Update ID |
| jobRunId | UUID | Which run this belongs to |
| driverId | UUID | Which driver |
| lat, lng | decimal | GPS coordinates |
| speed | decimal | Speed in mph |
| heading | decimal | Direction (0-360 degrees) |
| accuracy | decimal | GPS accuracy in meters |
| recordedAt | timestamp | When this point was recorded |

---

## 6. CONTRACTOR PROJECTS

Groups of jobs under a project/contract.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Project ID |
| contractorId | UUID | Who owns this project |
| name | text | Project name |
| jobNumber | text | Reference number |
| siteAddress | text | Job site location |
| siteLat, siteLng | decimal | Job site GPS coordinates |
| siteAddressType | enum | `pickup` or `dropoff` |
| awardedAmount | decimal | Total project budget |
| status | enum | `active`, `completed`, `cancelled` |
| notes | text | Project notes |
| deletedAt | timestamp | Soft delete timestamp |

---

## 7. MONTHLY INVOICES

Monthly billing between contractor-driver pairs.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Invoice ID |
| invoiceNumber | text | Human-readable invoice number (unique) |
| contractorId | UUID | Who's paying |
| driverId | UUID | Who's being paid |
| periodMonth | timestamp | First day of billing month |
| periodLabel | text | Display label (e.g., "February 2026") |
| totalAmount | decimal | Invoice total |
| jobCount | integer | Number of jobs on this invoice |
| status | enum | `open` → `issued` → `payment_sent` → `payment_received` (or `void`) |
| issuedAt, dueDate, paidAt | timestamp | Key dates |
| contractorSnapshot, driverSnapshot | JSON | Frozen profile data at time of invoice |
| notes | text | Invoice notes |

---

## 8. TRUCKS (Fleet Vehicles)

Trucks owned by trucking companies.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Truck ID |
| truckingCompanyId | UUID | Owning company |
| assignedDriverId | UUID | Default driver |
| truckNumber | text | Fleet number (e.g., "T-001") |
| truckType | enum | `end_dump`, `side_dump`, `belly_dump` |
| make, model, year | various | Vehicle details |
| licensePlate | text | License plate |
| vinNumber | text | VIN |
| isActive | boolean | Operational status |
| issueNotes | text | Problem description if not active |
| hasTarp | boolean | Has a tarp installed |
| color, capacity | text | Additional details |
| insurancePolicy | text | Insurance info |
| lastMaintenanceDate | timestamp | Last service date |
| sortOrder | integer | Display order |

---

## 9. TRUCK AVAILABILITY

Daily availability calendar for fleet trucks.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Entry ID |
| truckId | UUID | Which truck |
| truckingCompanyId | UUID | Owning company |
| date | timestamp | Which day |
| status | enum | `available`, `unavailable`, `committed`, `pending` |
| jobId | UUID | If committed, which job |
| notes | text | Notes |

---

## 10. DRIVER VEHICLES

Personal vehicles owned by independent drivers (owner-operators).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Vehicle ID |
| driverId | UUID | Owner |
| truckNumber, truckType | various | Vehicle details |
| make, model, year, licensePlate, vinNumber | various | Vehicle info |
| maxCapacityTons | decimal | Max load capacity |
| isActive | boolean | Operational status |
| issueNotes | text | Problem notes |
| isPrimary | boolean | Default vehicle |

---

## 11. DRIVER AVAILABILITY

Driver scheduling calendar (available/unavailable/committed days).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Entry ID |
| driverId | UUID | Which driver |
| date | timestamp | Which day |
| startTime, endTime | text | Shift times |
| recurrence | enum | `none` or `weekly` |
| dayOfWeek | integer | For recurring entries |
| isAvailable | boolean | Available or blocked |
| notes | text | Notes |
| jobId | UUID | If committed to a job |
| commitmentType | text | "committed" if job-locked |
| commitmentCompanyName | text | Who they're committed to |

---

## 12. JOB MESSAGES

In-app chat messages between drivers and contractors on active jobs.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Message ID |
| jobId | UUID | Which job |
| senderId | UUID | Who sent it |
| body | text | Message text |
| read | boolean | Has recipient read it |
| createdAt | timestamp | When sent |

---

## 13. JOB BIDS (Counter-Bids)

Driver counter-offers on job pricing.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Bid ID |
| jobId | UUID | Which job |
| driverId | UUID | Who's bidding |
| proposedRate | decimal | Proposed price |
| proposedRateType | text | `per_hour` or `flat_rate` |
| message | text | Driver's explanation |
| status | enum | `pending`, `accepted`, `rejected`, `withdrawn`, `expired` |
| responseMessage | text | Contractor's reply |
| respondedAt | timestamp | When contractor responded |
| vehicleId | UUID | Which vehicle driver would use |

---

## 14. JOB PHOTOS

Photos uploaded by drivers during jobs (weight tickets, confirmations, etc.).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Photo ID |
| jobId | UUID | Which job |
| driverId | UUID | Who uploaded it |
| jobRunId | UUID | Which work session |
| photoType | enum | `weigh_receipt`, `delivery_confirmation`, `pickup_confirmation`, `damage_report`, `other` |
| photoUrl | text | URL to the image file |
| notes | text | Photo description |
| lat, lng | decimal | GPS where photo was taken |

---

## 15. JOB STOPS

Additional stops added to in-progress jobs (multi-stop loads).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Stop ID |
| jobId | UUID | Which job |
| addedByUserId | UUID | Who added it |
| sequence | integer | Order of stops |
| address | text | Stop location |
| lat, lng | decimal | GPS coordinates |
| notes | text | Instructions |
| status | enum | `pending`, `en_route`, `completed`, `skipped` |
| completedAt | timestamp | When driver completed this stop |

---

## 16. NOTIFICATIONS

In-app notification feed.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Notification ID |
| userId | UUID | Who it's for |
| type | enum | `new_load`, `load_accepted`, `load_approved`, `load_rejected`, `load_completed`, `message`, `general`, `foreman_invitation`, `job_expired`, `job_date_changed` |
| title | text | Notification title |
| message | text | Notification body |
| jobId | UUID | Related job (if any) |
| isRead | boolean | Has been read |

---

## 17. PUSH SUBSCRIPTIONS

Web push notification subscriptions (for mobile, replace with APNs).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Subscription ID |
| userId | UUID | Which user |
| endpoint | text | Push endpoint URL |
| p256dh, auth | text | Encryption keys |

---

## 18. DRIVER INVITATIONS

Invitations from trucking companies to drivers, or from contractors to foremen.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Invitation ID |
| truckingCompanyId | UUID | Inviting company |
| contractorId | UUID | Inviting contractor (for foreman invites) |
| driverEmail, driverName, driverPhone | text | Who's being invited |
| driverId | UUID | Matched user (if they have an account) |
| invitationType | enum | `driver` or `foreman` |
| status | enum | `pending`, `accepted`, `declined`, `expired` |
| message | text | Invitation message |
| assignedTruckId | UUID | Pre-assigned truck |

---

## 19. FOREMAN REQUESTS

Foremen requesting to join a company (reverse of invitations).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Request ID |
| foremanId | UUID | Who's requesting |
| targetCompanyId | UUID | Which company |
| targetCompanyType | text | `contractor` or `trucking_company` |
| status | enum | `pending`, `accepted`, `declined`, `expired` |
| message | text | Request message |

---

## 20. DRIVER FAVORITES

Contractors/companies bookmark preferred drivers.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Favorite ID |
| favoriterId | UUID | Who favorited |
| driverId | UUID | Favorited driver |
| autoApprove | boolean | Automatically approve this driver's job acceptances |

---

## 21. COMPANY FAVORITES

Drivers bookmark preferred companies.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Favorite ID |
| driverId | UUID | Who favorited |
| companyId | UUID | Favorited company |

---

## 22. DRIVER DOCUMENTS

Driver's document wallet (CDL, insurance, etc.).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Document ID |
| driverId | UUID | Owner |
| documentType | enum | `cdl_license`, `medical_card`, `insurance_certificate`, `truck_registration`, `dot_inspection`, `other` |
| documentName | text | Display name |
| documentNumber | text | Document number |
| fileUrl | text | URL to uploaded file |
| expirationDate | timestamp | When it expires |
| issuedDate | timestamp | When it was issued |
| notes | text | Notes |

---

## 23. DOCUMENT SHARES

Tracks which contractors can view which driver documents.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Share ID |
| documentId | UUID | Which document |
| contractorId | UUID | Who can view it |
| sharedAt | timestamp | When shared |

---

## 24. CONTRACTOR MATERIALS

Saved materials list for quick job creation.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Material ID |
| contractorId | UUID | Which contractor |
| name | text | Material name (e.g., "Fill", "Gravel") |
| normalizedName | text | Lowercase for deduplication |
| usageCount | integer | Times used |
| lastUsedAt | timestamp | Last time used |

---

## 25. PASSWORD RESET TOKENS

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Token ID |
| userId | UUID | Which user |
| tokenHash | text | Hashed reset token |
| expiresAt | timestamp | When token expires |
| usedAt | timestamp | When it was used (null if unused) |

---

## 26. SCHEDULED NOTIFICATIONS

Delayed push notifications (e.g., reminders before job start).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Notification ID |
| jobId | UUID | Related job |
| driverId | UUID | Who gets notified |
| title, body | text | Notification content |
| scheduledFor | timestamp | When to send |
| status | enum | `pending`, `sent`, `failed` |

---

## 27. STILL WORKING CHECKS

Prompts sent to drivers to confirm they're still working (prevents forgotten clock-outs).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Check ID |
| jobRunId | UUID | Which run |
| driverId | UUID | Which driver |
| jobId | UUID | Which job |
| sentAt | timestamp | When prompt was sent |
| respondedAt | timestamp | When driver responded |
| expiresAt | timestamp | Auto clock-out deadline |
| status | enum | `pending`, `confirmed`, `auto_clocked_out`, `expired` |

---

## KEY RELATIONSHIPS

```
Users ──────────┬── Jobs (as contractor: posts jobs)
                ├── Jobs (as driver: works jobs)
                ├── Trucks (as trucking company: owns trucks)
                ├── Driver Vehicles (as driver: owns vehicles)
                ├── Job Assignments (as driver: assigned to multi-truck jobs)
                ├── Driver Availability (schedule)
                ├── Driver Documents (document wallet)
                ├── Notifications (inbox)
                ├── Push Subscriptions (devices)
                ├── Monthly Invoices (as contractor or driver)
                ├── Driver Favorites (bookmarks)
                └── Company Favorites (bookmarks)

Jobs ───────────┬── Job Assignments (multiple trucks per job)
                ├── Job Runs (work sessions)
                ├── Job Messages (chat)
                ├── Job Bids (counter-offers)
                ├── Job Photos (uploaded images)
                ├── Job Stops (multi-stop routes)
                └── Contractor Projects (grouped under)

Trucks ─────────┬── Truck Availability (daily calendar)
                └── Job Assignments (assigned to jobs)
```
