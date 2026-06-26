---
name: Contractor app-notification on driver apply
description: Why a contractor "new application" alert needs a DB notification row (not just a push), and which enum value to use.
---

# Contractor notification when a driver applies to a job

A push notification alone does NOT populate the in-app notifications inbox or the home-screen bell badge. Both read from the `notifications` table (`GET /api/notifications`). Any "alert the user" feature must INSERT a notification row in addition to (or instead of) sending a push.

**Why:** the bell badge (`app/(tabs)/index.tsx`) and the notifications screen derive unread state from the `/api/notifications` query, which selects from the `notifications` table. `sendPushNotification` only hits Expo Push — it writes nothing to the DB. The driver-apply path historically sent a push but created no row, so contractors saw no bubble/inbox entry.

**Enum gotcha:** `notifications.type` is a USER-DEFINED enum `notification_type`, **owned by and shared with the website** (companion shares the website's Neon prod DB). Its values: new_load, load_accepted, load_approved, load_rejected, load_completed, message, general, foreman_invitation, job_expired, job_date_changed. There is NO `job_application` value — inserting it throws (the insert is wrapped in try/catch so it fails silently). Do NOT `ALTER TYPE ... ADD VALUE` on this shared enum unilaterally; reuse an existing value. The driver-apply notification reuses `new_load` (renders a briefcase icon + orange highlight, taps through to the job's applicants).

**Truck-horn sound:** keyed off the PUSH payload's free-form `data.type === 'job_application'` (NOT the DB enum), checked in the foreground `addNotificationReceivedListener` in `app/_layout.tsx`. The in-app sound listener is iOS-only by existing design. A custom lock-screen/background push sound additionally needs the sound bundled via the `expo-notifications` app.json plugin (`sounds: [...]`) AND a native rebuild — it does NOT work in Expo Go.

**How to apply:** for any new "notify a user" event, insert a `notifications` row with a valid `notification_type` enum value; only add a push on top if a device alert is wanted. Pass any custom routing/sound hints through the push payload `data`, not the DB type.
