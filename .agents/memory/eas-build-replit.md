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

## runtimeVersion: appVersion, NOT fingerprint (durable)
runtimeVersion policy is **appVersion** (reads `version` from app.json, e.g. "1.0.1"). It was "fingerprint" but that is INCOMPATIBLE with a gitignored lockfile: `@expo/fingerprint` hashes the lockfile, so the local build machine (which has a regenerated `package-lock.json`) computes a different fingerprint than the EAS servers (which build from git, where the lockfile is gitignored/absent) → build fails with "Runtime version calculated on local machine not equal to runtime version calculated during build." appVersion is computed identically both sides (no lockfile dependency), so it coexists with the gitignored-lockfile setup. **Consequence:** OTA updates are now keyed to the `version` string — bump `version` in app.json whenever native deps change so an OTA JS bundle is never served to an incompatible native build. Do NOT switch back to fingerprint unless the clean lockfile is committed to git.

## Android Google Maps key required in app.json (durable)
The app uses `react-native-maps`, and on Android that ALWAYS renders Google Maps (even PROVIDER_DEFAULT) → the native SDK needs a Maps API key in `AndroidManifest.xml` or it throws `IllegalStateException: API key not found` and the app crashes the moment a map screen mounts (e.g. right after sign-in). Expo only writes that manifest meta-data from `app.json` → `expo.android.config.googleMaps.apiKey`. Static app.json can't read env vars (app.config.js is forbidden here), so the key lives literally in app.json (committed to the public GitHub repo). That's accepted practice: Android Maps keys are extractable from any APK, so the security boundary is GCP restriction (package `com.loadlink.app` + Play app-signing SHA‑1) + "Maps SDK for Android" enabled, NOT secrecy. iOS uses Apple Maps (PROVIDER_DEFAULT) and needs no key.

## OTA reachability (durable)
An OTA (EAS Update) can ONLY reach an installed app that was built WITH the expo-updates config already embedded. Store binaries built before OTA was added cannot receive OTA and require a fresh native build. Google Play approval never recompiles — it publishes the exact uploaded `.aab`, so a fix only reaches the store via a newly built+uploaded binary.

## Play version codes must be globally unique (durable)
Google Play rejects an uploaded `.aab` if its version code was already used on ANY track (Internal/Open/Production), error "Version code N has already been used." To put the SAME build on another track, use "Add from library" (promote), not re-upload. For a NEW build, the version code must increment. Enabled `autoIncrement: true` + `appVersionSource: "remote"` on the production profile in eas.json so every production build bumps the remote counter automatically — prevents this recurring. Fixing the LIVE public link requires releasing to the Production track (testing tracks don't update the public listing).

## Replit Git UI fails on merge conflicts — resolve in Shell (durable)
The Replit Git pane's conflict resolver is unreliable for this repo's GitHub sync: marking files resolved doesn't actually stage them, "Complete merge and commit" stays greyed, and it throws "Unknown Error / INVALID_STATE", often aborting the merge.
**Fix:** do the merge in the Shell tab instead (pull --no-rebase, resolve conflicts, add, commit, then push — the UI Push works once the merge is committed).
**Why:** the agent's destructive-git block prevents the agent from running these, but the user's interactive Shell is not subject to it, so the user must run the merge. The GitHub remote name is session-local (changes per workspace) — look it up with `git remote -v`, don't assume a fixed name.
