---
name: Apple Sign-In token verification (companion auth)
description: How /api/auth/social-login must verify Apple identity tokens, and why the naive decode is unsafe
---

# Apple Sign-In must verify the identity token, not just decode it

The companion's `/api/auth/social-login` turns a verified email into a website login (email-only; `X-API-Key` establishes trust). So **whatever email the server accepts becomes the logged-in user** — the email is the entire authorization decision.

**Unsafe pattern (do NOT reintroduce):** base64-decoding the Apple JWT payload, checking only `iss`/`email`, and falling back to a client-supplied `email` from the request body. That lets anyone forge a token + arbitrary email and impersonate any user (account takeover).

**Correct pattern:** verify the Apple identity token cryptographically with `jose`:
- `createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"))` (module-level, caches keys)
- `jwtVerify(token, appleJwks, { issuer: "https://appleid.apple.com", audience: APPLE_BUNDLE_ID })` (jose also checks `exp`)
- `audience` is the iOS bundle id (`com.loadlink.app`); override via `APPLE_BUNDLE_ID` env if it ever changes
- trust `email` from the *verified* payload; never trust the request-body email

**Do NOT require `email_verified === true`.** Apple omits/varies that claim for private-relay addresses, so strict gating wrongly rejected real users (manifested as App Store 2.1 rejection: "Could not verify your identity"). The cryptographic signature already proves the email is Apple-asserted — that is the authorization, `email_verified` is not.

**`email` is only present on the FIRST authorization.** Repeat Sign in with Apple tokens carry only a stable `sub` and no email. To resolve the email on repeats, persist `sub -> email` the first time it's seen and look it up later. This lives in a companion-owned DB table `companion_apple_identities (sub PK, email, updated_at)`, created lazily via `CREATE TABLE IF NOT EXISTS` (same pattern as `sync_queue`). **Why a table, not a JSON file:** `saveJsonMap` trims to the last 200 entries and `.data/*.json` is wiped on redeploy — both silently re-break repeat sign-ins. The shared Neon DB safely hosts companion-only tables (website drizzle doesn't drop them).

**Residual cold-start gap — now CLOSED by an email-link safety net.** An Apple ID that authorized the app BEFORE the sub->email mapping shipped has no stored mapping AND its repeat token has no email, so social-login alone would 401. Fix: when the apple branch verifies the token but finds no email claim and no stored `sub`, it returns `409 {message:"apple_link_required"}`; the app then prompts for the LoadLink email and POSTs to `/api/auth/apple/link {identityToken, email}`. That route re-verifies the Apple token, creates the session via the **same email-only** companion login (a password prompt here is security theater — the website ignores passwords), then binds `sub -> email`.
**Why this is safe and not new attack surface:** it's exactly equivalent to the pre-existing `/api/auth/login`, which already issues a session for any email with no password. The only *incremental* risk is binding poisoning, closed by **first-bind-wins**: `/api/auth/apple/link` refuses to remap a `sub` already bound to a different email (checked via `lookupAppleEmail` BEFORE creating the session, so no token is minted on rejection). The social-login first-auth path may still overwrite the binding because that email comes cryptographically from Apple (e.g. relay-email change) — only the user-supplied link route is locked. A stronger proof (email OTP/magic link) was deemed unnecessary given the email-only baseline; revisit only if `/api/auth/login` itself gains password verification.

**`aud` must be an allowlist that always includes the hardcoded bundle id, not a single env var.** A stale/misconfigured production `APPLE_BUNDLE_ID` once broke sign-in for everyone (`jwtVerify({audience})` threw `unexpected "aud" claim value`, surfaced to Apple review as Guideline 2.1a "Could not verify your identity"). Fix: verify signature+issuer+exp via `jwtVerify` WITHOUT the `audience` option, then check `aud` manually against `APPLE_ALLOWED_AUD` = `["com.loadlink.app", ...env-supplied]`. `aud` can be a string or array — accept if ANY entry matches. Log the actual `aud` on mismatch so a wrong value is diagnosable from prod logs.

**Why the Google branch differs:** Google verifies by calling Google's `tokeninfo`/`userinfo` endpoints; Apple has no such endpoint, so you must verify the signature against Apple's JWKS yourself.

**Gotcha:** a token with no `kid` header makes jose throw "multiple matching keys found in the JSON Web Key Set" — that's expected for forged/garbage tokens (correctly rejected). Real Apple tokens carry `kid`, so a single key is selected. Don't disable kid matching to "fix" this.

**ESM note:** import `jose` at the top of the module — never `require()` it. The prod server is bundled to ESM and dynamic require throws at runtime.
