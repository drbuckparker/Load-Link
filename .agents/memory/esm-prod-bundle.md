---
name: ESM production bundle vs dynamic require
description: Why server code works in dev (tsx) but 500s in production (esbuild ESM bundle)
---

# Dynamic require breaks in the production server bundle

The Express server runs two different ways:
- **Dev**: `tsx server/index.ts` — supports CommonJS `require(...)` at runtime.
- **Prod**: esbuild bundles to ESM (`--format=esm`) → `node server_dist/index.js`. In an ESM bundle, `require(...)` is NOT defined and any `require("x")` call throws `Dynamic require of "x" is not supported` at the moment it executes.

**Symptom:** a route works perfectly in dev but returns 500 only in the deployed app. The handler's catch block masks it with a generic message (e.g. "Authentication service unavailable"); the real cause is only visible in deployment logs as `Dynamic require of "<module>" is not supported`.

**Rule:** never use `require(...)` in `server/` code. Always use top-level ESM `import`. This bit auth specifically — `require("crypto").randomBytes/​randomUUID` in login/register/social-login handlers meant the published app could never log anyone in, while dev was fine.

**How to verify before publishing:** after `npm run server:build`, grep the bundle: `rg 'require\(' server_dist/index.js` should return nothing. Also remember the bundle has no typecheck step (esbuild strips types), so `tsc` errors won't block a deploy and runtime-only issues like this won't surface until production.
