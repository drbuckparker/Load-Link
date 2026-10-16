# Testing the LoadLink Android app

Maestro is a free program that taps through the app the way a person would. The tap scripts live in the `.maestro` folder. GitHub runs them on every pull request.

These tests do not send the app to the Play Store or the App Store. They do not use EAS, so they do not spend EAS build minutes.

## What each test does

The password is never written in these files. Each flow reads it from the environment. One failure does not skip the other flows.

The flows use the four demo accounts only. They do not accept a load, assign a truck, clock in, send a chat, open mail, or open the route map. Opening the route map would call Google directions. Tapping Accept would change a real load.

For each role the separate flows are:

1. **Sign in.** Fresh launch, sign in, check the role name on the profile.
2. **Home.** Dashboard, the Find Loads / Find Jobs / My Jobs button, and the Calendar tab.
3. **Loads or jobs.** The jobs list and, when a card is on screen, its detail: route (pickup, dropoff, View Map), Accept or Assign when that button is on screen, and Clock in when that button is on screen. The job chat composer is opened and not sent.
4. **Messages.** The Messages tab and the notifications list.
5. **Money.** Invoices for contractor and trucking company. My Jobs for driver and foreman. Earnings in Settings.
6. **Settings.** Profile, Switch Role, Help (Contact and Tutorials, not opened), Account (security and the delete button, not tapped), Billing, then sign out.

Show and hide password still runs first. It types the driver password, taps the eye, and does not sign in.

There is no privacy-consent screen in the app. The Account tab is the screen those flows open instead. The API check records whether the login payload includes privacy fields.

## Companion API check

The same workflow runs `scripts/companion-api-smoke.mjs` against `https://loadlinkmobile.replit.app`. It signs in as each demo account and calls the read endpoints the app uses. A 4xx or 5xx fails that check.

The only write is a project named `E2E-TEST-<timestamp>`. The script deletes that project, and any older `E2E-TEST-` project still on the account, before it finishes. It does not post a job, send email or SMS, clock in, accept a load, or call Google.

## Secrets to add

Add these in GitHub: open the repository, then **Settings → Secrets and variables → Actions → New repository secret**.

Create one secret for each name below. Put the email or password in the value box. Do not put the values in the git repo, in `TESTING.md`, or in the Maestro files.

| Secret name | What to put in it |
| --- | --- |
| `MAESTRO_DRIVER_EMAIL` | Email for a demo account whose role is driver |
| `MAESTRO_DRIVER_PASSWORD` | Password for that driver account |
| `MAESTRO_CONTRACTOR_EMAIL` | Email for a demo account whose role is contractor |
| `MAESTRO_CONTRACTOR_PASSWORD` | Password for that contractor account |
| `MAESTRO_TRUCKING_COMPANY_EMAIL` | Email for a demo account whose role is trucking company |
| `MAESTRO_TRUCKING_COMPANY_PASSWORD` | Password for that trucking company account |
| `MAESTRO_FOREMAN_EMAIL` | Email for a demo account whose role is foreman |
| `MAESTRO_FOREMAN_PASSWORD` | Password for that foreman account |

Use four different accounts. One shared login that can switch roles will not pass, because each test checks the role name on the profile.

The accounts have to exist on the server the app already uses (`loadlinkmobile.replit.app`).

Each account also needs a little data, or the taps have nothing to open:

- **Driver and foreman:** an open load on Find Loads, so the detail screen has something to open. The test does not accept it.
- **Trucking company:** an open job on Find Jobs. The test does not accept it.
- **Contractor:** a job on My Jobs. Invoices can be empty.

An empty list does not fail the loads flow. The screen still has to open. Use demo accounts, not a customer's login.

## How GitHub runs the tests

The file is `.github/workflows/maestro-android.yml`. It starts on every pull request. You can also run it by hand from the Actions tab (the workflow is named **Maestro Android**).

On the GitHub runner it:

1. Checks that the eight secrets above are set. If one is missing, the job stops and prints the missing name.
2. Installs the project.
3. Turns off over-the-air updates for this test build only, so the phone runs the code from the pull request. The file `app.json` in git is not changed, and store builds are not changed.
4. Builds a release-style Android APK on the runner. The APK is for the emulator (x86_64) and is signed with the debug key. It is not a Play Store upload.
5. Starts an Android emulator, installs that APK, and runs `maestro test .maestro`.
6. In parallel, signs in to the production companion API with the same demo accounts and checks the endpoints above.

The check on the pull request turns green when every Maestro flow passes and the companion API check has no 4xx or 5xx. If it is red, open the job log. Maestro names the flow that failed. The API log lists each path and status.

A pull request from a fork cannot read these secrets, so that check will fail the secret step. That is expected.

## How to run the tests on your computer

You need Android Studio (so you have an emulator) and Maestro.

1. Install Maestro. The install command is on [maestro.dev](https://maestro.dev). After it installs, open a new terminal window.
2. Start an Android emulator from Android Studio.
3. In this project, install dependencies and build an APK:

   ```bash
   npm ci
   npx expo prebuild --platform android --no-install
   cd android
   ./gradlew assembleRelease
   adb install -r app/build/outputs/apk/release/app-release.apk
   cd ..
   ```

4. In the same terminal, set the eight secrets. Use your own demo emails and passwords. This example only shows the names:

   ```bash
   export MAESTRO_DRIVER_EMAIL="the-driver-email"
   export MAESTRO_DRIVER_PASSWORD="the-driver-password"
   export MAESTRO_CONTRACTOR_EMAIL="the-contractor-email"
   export MAESTRO_CONTRACTOR_PASSWORD="the-contractor-password"
   export MAESTRO_TRUCKING_COMPANY_EMAIL="the-trucking-company-email"
   export MAESTRO_TRUCKING_COMPANY_PASSWORD="the-trucking-company-password"
   export MAESTRO_FOREMAN_EMAIL="the-foreman-email"
   export MAESTRO_FOREMAN_PASSWORD="the-foreman-password"
   ```

5. Run the tests:

   ```bash
   npm run e2e
   ```

   That command is `maestro test .maestro`. To run one role only:

   ```bash
   maestro test .maestro/driver.yaml
   ```

The Android package these flows look for is `com.loadlink.app`.

E2E run 2026-10-15

Rerun after the demo accounts were re-seeded with DEMO_PASSWORD.

Rerun after the demo accounts were seeded into the shared database.
