---
name: Expo Launch iOS signing
description: How to interpret iOS Launch failures that stop during build-configuration resolution.
---

If an Expo Launch iOS build stops during “Resolve build configuration” with “Distribution Certificate is not validated for non-interactive builds” and “Credentials are not set up,” it is an Expo/Apple signing-credential failure, not a source compilation failure.

**Why:** Git-triggered Expo Launch builds are non-interactive. They can consume valid remote credentials, but they cannot create, repair, or validate a missing/revoked distribution certificate during the build.

**How to apply:** First verify the project locally with Expo Doctor and an iOS export. Then use Expo’s interactive iOS credential setup to generate/select a valid distribution certificate and provisioning profile before retrying Launch.