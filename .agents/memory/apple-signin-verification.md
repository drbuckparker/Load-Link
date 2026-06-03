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
- require `email` + `email_verified` from the *verified* payload; never trust the request-body email

**Why the Google branch differs:** Google verifies by calling Google's `tokeninfo`/`userinfo` endpoints; Apple has no such endpoint, so you must verify the signature against Apple's JWKS yourself.

**Gotcha:** a token with no `kid` header makes jose throw "multiple matching keys found in the JSON Web Key Set" — that's expected for forged/garbage tokens (correctly rejected). Real Apple tokens carry `kid`, so a single key is selected. Don't disable kid matching to "fix" this.

**ESM note:** import `jose` at the top of the module — never `require()` it. The prod server is bundled to ESM and dynamic require throws at runtime.
