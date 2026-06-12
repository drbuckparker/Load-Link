---
name: Social sign-in removed (App Store 4.8)
description: Why Google + Apple sign-in were stripped from the app and the constraint on re-adding them
---

# Social sign-in removed for App Store approval

Google AND Apple sign-in were removed entirely from the companion app; only
email/password auth remains.

**Why:** Offering a third-party social login (Google) triggers Apple App Store
Guideline 4.8, which then *obligates* the app to also offer Sign in with Apple.
Removing Google alone is not enough — keeping Apple-only added native-build
surface (expo-apple-authentication) and complexity. Removing both was the
cleanest path to approval. This was the explicit blocker the user hit.

**How to apply:** If anyone asks to re-add Google (or any third-party social
login), warn that Sign in with Apple becomes mandatory again under 4.8 for iOS
App Store. Re-adding requires: the `expo-apple-authentication` plugin in
app.json, server token-verification + session-minting endpoints (previously
`/api/auth/social-login` and `/api/auth/apple/register`), and the social UI in
`app/(auth)/login.tsx` + AuthContext methods. The packages
(expo-apple-authentication, expo-auth-session) are still installed but unused.
`deleteAccount` was intentionally KEPT (Apple requires in-app account deletion).
