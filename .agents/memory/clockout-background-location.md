---
name: Clock-out reminder background location
description: How the "forgot to clock out" geofence reminder tracks location in the background without the Always permission.
---

# Clock-out reminder — background location

The "Did you forget to clock out?" reminder watches a clocked-in driver and fires
one local notification (two action buttons: "Still working" no-op / "Clock out"
opens the job with `?action=clockout`) when they get >15 mi from pickup/dropoff/route.

**Decision:** use `Location.watchPositionAsync` (a JS subscription) started at
clock-in and stopped at clock-out — NOT `startLocationUpdatesAsync` / geofencing.
- **Why:** watchPositionAsync works with the lighter iOS **"While Using"**
  permission; `startLocationUpdatesAsync` + region monitoring require **"Always"**,
  which the user explicitly did not want. The tradeoff (accepted): if iOS fully
  terminates the app, tracking pauses until relaunch — that's why the monitor
  persists its session to AsyncStorage and `resumeClockOutMonitor()` re-arms it on
  app launch. No `expo-task-manager` needed.
- **How to apply:** background continuation needs `isIosBackgroundLocationEnabled: true`
  on the expo-location config plugin in app.json (adds UIBackgroundModes location +
  the blue status-bar pill). This is a native change → only works on a published
  Expo Launch build, never in Expo Go or web.

**Staleness guards (learned from review):** before firing, verify a `loadlink_token`
exists AND the job still has an open run (`apiRequest GET /api/jobs/:id`) so a
logout or a clock-out on another device doesn't produce a false reminder; on a
network error, still remind (missing a real one is worse). Stop the monitor only
*after* clock-out is confirmed, not before the request — otherwise a failed
clock-out silently disables the safeguard.
