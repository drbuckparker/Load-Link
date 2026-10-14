# Shipping LoadLink to the App Store

The iOS app on the App Store is **Load Link**, Apple app `6773393098`, on Apple team `DA2568YFHY`. Its bundle id is `app.replit.loadlink`. Android is package `com.loadlink.app`.

GitHub Actions can build the iOS app and send it to **TestFlight**, and build the Android app and upload it as a **draft on the Play internal testing track**. A public App Store or Play Store release is a separate click you make yourself. These workflows do not publish the app to the public, and the Android workflow does not touch the production or open testing tracks or the store listing.

## One-time setup

Do this once before the first tagged build.

1. **Expo token.** Create an access token for the Expo account that owns the `load-link` / `loadlink` project (Expo website → Account settings → Access tokens). The token must be allowed to run builds and submissions for this project.

2. **GitHub secret.** In this GitHub repository, open Settings → Secrets and variables → Actions. Add a secret named `EXPO_TOKEN` and paste that token. The TestFlight workflow reads it as `secrets.EXPO_TOKEN`.

3. **iOS signing credentials.** On your own machine, log in to EAS with an account on Apple team `DA2568YFHY`, then run:

   ```bash
   npx eas-cli credentials -p ios
   ```

   Use the production profile and bundle id `app.replit.loadlink`. Create or choose a distribution certificate and a provisioning profile for that bundle id. Also create or choose an **Apple Push Notifications (APNs) key** and let EAS store it. The app sends job alerts with push, so the key has to be there before a store build. EAS keeps these credentials and reuses them on later builds. This step is interactive. Do not try to invent the certificate inside GitHub Actions.

4. **App Store Connect API key.** In App Store Connect, open Users and Access → Integrations → App Store Connect API, and create a key that can submit builds. Then upload it to EAS (same `eas credentials -p ios` command, App Store Connect API key). EAS needs the key id, the issuer id, and the `.p8` file so a non-interactive submit can sign in. The production submit profile already targets App Store Connect app `6773393098` and team `DA2568YFHY`.

5. **Google Play service account.** In Play Console, create a service account that can upload releases. Then run `npx eas-cli credentials -p android` and assign that JSON key to package `com.loadlink.app` for Play submissions. Uploading the key to the Expo account is not enough: a non-interactive submit fails until the key is assigned to this app. Leave the Firebase admin key on its own assignment. The production submit profile sends the app to the **internal** track as a **draft**, and it tells Play not to send listing changes for review. The key stays on EAS. Do not commit it to the repo.

## How to ship a TestFlight build

1. Bump the user-facing version in `app.json` (`expo.version`). This project keeps `runtimeVersion` equal to that same version, so bump both together. Apple rejects a build whose version matches one already approved. On every release, also bump `expo.ios.buildNumber` and `expo.android.versionCode` to numbers higher than the last build Apple or Play already accepted. Those two counters are independent. Reusing either one makes the store reject the upload.
2. Commit that change and push it to GitHub.
3. Push a git tag that starts with `v`:

   ```bash
   git tag v1.0.8
   git push origin v1.0.8
   ```

   Use the version you actually put in `app.json`. Any tag matching `v*` starts the workflow. You can also open the Actions tab and run **iOS TestFlight** by hand (`workflow_dispatch`).

The workflow checks out the tag, installs dependencies with `npm ci` on Node 22, then runs:

```bash
eas build -p ios --profile production --non-interactive --no-wait --auto-submit
```

EAS builds the iOS app in the cloud. The iOS build number is `expo.ios.buildNumber` in `app.json` (`appVersionSource` is `local`). When the build finishes, EAS submits it to App Store Connect. After Apple finishes processing, the build shows up in TestFlight for that app. It is not released to the public.

## How to ship an Android internal build

1. Use the same version bump as iOS, including a new `expo.android.versionCode` higher than Play’s current highest. Play’s highest version code before this release was 17, so 1.0.8 uses 18.
2. Commit and push.
3. Push a git tag that starts with `android-v`:

   ```bash
   git tag android-v1.0.8
   git push origin android-v1.0.8
   ```

   A tag matching `android-v*` starts the Android workflow. A tag matching `v*` starts the iOS workflow. You can also run **Android Play internal** by hand from the Actions tab.

The workflow checks out the tag, installs dependencies with `npm ci` on Node 22, then runs:

```bash
eas build -p android --profile production --non-interactive --no-wait --auto-submit
```

EAS builds the Android app bundle and uploads it to the Play **internal** track as a **draft**. It does not roll the build out, and it does not send store-listing changes for review. Promoting that draft, or moving it to open testing or production, is a manual step in Play Console.

## Public store release

When you want customers to get an iOS build, open App Store Connect, select the Load Link app, and attach the TestFlight build to the App Store version. Submit it for review, then release it after Apple approves.

When you want customers to get an Android build, open Play Console and promote the internal draft yourself. Do not use these workflows for the production or open testing tracks.

Those steps are manual. The GitHub workflows do not do them.
