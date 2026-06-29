---
name: expo-location DOM-global trap
description: Why expo-location calls can silently fail at runtime while passing TypeScript, and how it manifested in clock-in geofencing
---

# `Location.*` used without importing `expo-location`

A React Native file can call `Location.requestForegroundPermissionsAsync()` /
`Location.getCurrentPositionAsync()` / `Location.Accuracy.High` **without** an
`import * as Location from 'expo-location'` and still pass `tsc`.

**Why:** TypeScript's DOM lib declares a global `Location` (the browser
`window.Location` type/value), so the identifier resolves at compile time. At
runtime in Hermes/React Native there is no such global, so the call throws
`Location is undefined`.

**How it manifested:** in `app/job/[id].tsx` the clock-in helper
`getDriverLocation()` wrapped the call in a try/catch. The thrown error was
swallowed and the helper returned its failure path every time — `(0,0)` on the
old client build (→ server geofence reported "~6000 miles away") and `null` on
the newer build (→ "Location is required to clock in"). The bug looked like a
device/permission problem but was a missing import; no device setting could fix it.

**How to apply:**
- When location features "never work" but the code looks right, grep the file for
  `import * as Location from 'expo-location'` before blaming permissions/GPS.
- A swallowed try/catch around a native call hides missing-import ReferenceErrors —
  log the caught error during diagnosis.
- iOS permission string and Android `ACCESS_FINE/COARSE_LOCATION` are best declared
  via the `expo-location` config plugin (`locationWhenInUsePermission`) in app.json,
  not a manual `ios.infoPlist` entry, so both platforms get correct native manifests.
  Manifest/permission changes require a **new native build**; a JS-only import fix
  can ship via OTA.
