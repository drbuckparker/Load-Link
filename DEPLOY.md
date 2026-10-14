# Shipping LoadLink to the App Store

The iOS app on the App Store is **Load Link**, Apple app `6773393098`, on Apple team `DA2568YFHY`. Its bundle id is `app.replit.loadlink`. Android is a different package, `com.loadlink.app`, and this guide does not change that.

GitHub Actions can build the iOS app and send the build to **TestFlight**. A public App Store release is a separate click you make yourself in App Store Connect. This workflow never publishes the app to the public store.

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

## How to ship a TestFlight build

1. Bump the user-facing version in `app.json` (`expo.version`). This project keeps `runtimeVersion` equal to that same version, so bump both together. Apple rejects a build whose version matches one already approved.
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

EAS builds the iOS app in the cloud. The iOS build number is `expo.ios.buildNumber` in `app.json` (`appVersionSource` is `local`). Bump that number by hand before each iOS build so Apple gets a higher build than the last one. Android `versionCode` is not set in `app.json`; a future Android production build no longer continues the remote Play counter. When the build finishes, EAS submits it to App Store Connect. After Apple finishes processing, the build shows up in TestFlight for that app. It is not released to the public.

## Public App Store release

When you want customers to get that build, open App Store Connect, select the Load Link app, and attach the TestFlight build to the App Store version. Submit it for review, then release it after Apple approves. That step is manual. The GitHub workflow does not do it.
