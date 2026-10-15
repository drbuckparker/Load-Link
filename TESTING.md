# Testing the LoadLink Android app

Maestro is a free program that taps through the app the way a person would. The tap scripts live in the `.maestro` folder. GitHub runs them on every pull request.

These tests do not send the app to the Play Store or the App Store. They do not use EAS, so they do not spend EAS build minutes.

## What each test does

1. **Show and hide password.** On the login screen, type the driver account's password, tap the eye button, and check that the password is shown and then hidden again. It does not sign in.
2. **Driver.** Sign in as the driver demo account. Check the role says DRIVER. Open Messages. Open Find Loads, open the first open load, and accept it with a truck. Send a chat message on that job. Check that the Invoices tab is not there. Open notifications (that is the activity list) and the Billing tab. Sign out.
3. **Contractor.** Sign in as the contractor demo account. Check the role says CONTRACTOR. Open Messages. Open My Jobs and open the first open job. Send a chat message. Open the Invoices tab (that is the document list). Open notifications and Billing. Sign out. A contractor does not accept a load.
4. **Trucking company.** Sign in as the trucking company demo account. Check the role says TRUCKING COMPANY. Open Messages. Open Find Jobs, open the first open job, and accept it with a truck. Send a chat message. Open Invoices, notifications, and Billing. Sign out.
5. **Foreman.** Sign in as the foreman demo account. Check the role says FOREMAN. Open Messages. Open Find Loads and open the first open load. Send a chat message. Check that Invoices is not there. Open notifications and Billing. Sign out. A foreman does not accept a load.

The password is never written in these files. Each flow reads it from the environment.

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

- **Driver:** at least one open load they can accept (not their own posting, and not one they already took). The first load in the Open list is the one the test opens. They also need a truck that is allowed on that load.
- **Trucking company:** the same as the driver. One open load they can accept, and a truck that can take it.
- **Contractor:** at least one open job on My Jobs, so the test can open it. Invoices can be empty.
- **Foreman:** at least one open load to open. The test does not accept it.

Accepting a load and sending a chat message really happen on that server. Use demo accounts, not a customer's login.

## How GitHub runs the tests

The file is `.github/workflows/maestro-android.yml`. It starts on every pull request. You can also run it by hand from the Actions tab (the workflow is named **Maestro Android**).

On the GitHub runner it:

1. Checks that the eight secrets above are set. If one is missing, the job stops and prints the missing name.
2. Installs the project.
3. Turns off over-the-air updates for this test build only, so the phone runs the code from the pull request. The file `app.json` in git is not changed, and store builds are not changed.
4. Builds a release-style Android APK on the runner. The APK is for the emulator (x86_64) and is signed with the debug key. It is not a Play Store upload.
5. Starts an Android emulator, installs that APK, and runs `maestro test .maestro`.

The check on the pull request turns green when every flow passes. If it is red, open the job log. The log names the flow that failed (driver, contractor, trucking company, foreman, or show/hide password).

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
