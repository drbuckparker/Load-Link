---
name: EAS Android build off-Replit
description: How LoadLink's Android app is built (EAS Build, not Replit) and the gotchas — lockfile firewall URLs, remote versionCode, OTA reachability.
---

# EAS Android build (off-Replit)

LoadLink's Android app is NOT built on Replit. Pipeline: code edited in Replit → pushed to GitHub → pulled to a local machine → `eas build --platform android` → Expo cloud compiles the `.aab` → manually uploaded to Google Play Console. Expo project `@load-link/loadlink`, Android package `com.loadlink.app`. Keystore lives on EAS.

## Lockfile firewall gotcha (durable)
Replit's `package-lock.json` pins dependency URLs to `http://package-firewall.replit.local/...`. Expo's EAS build servers cannot reach that internal mirror, so EAS install/build fails.
**Fix:** on the build machine, delete `package-lock.json` + `node_modules`, run `npm install` against the public npm registry to regenerate a clean lockfile, then build.
**Why:** applies any time the build leaves Replit (EAS, external CI). The Replit-mirror lockfile is not portable.

## Versioning (durable)
EAS manages the Android `versionCode` REMOTELY — a build from a commit whose app.json had no `android.versionCode` still produced a higher versionCode. Do NOT hardcode `android.versionCode` in app.json; it is ignored by this pipeline and only misleads. `version` (versionName) is still read from app.json.

## OTA reachability (durable)
expo-updates is configured (runtimeVersion policy "fingerprint"). An OTA (EAS Update) can ONLY reach an installed app that was built WITH the expo-updates config already embedded. Store binaries built before OTA was added cannot receive OTA and require a fresh native build. Google Play approval never recompiles — it publishes the exact uploaded `.aab`, so a fix only reaches the store via a newly built+uploaded binary.
