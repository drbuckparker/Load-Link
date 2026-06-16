---
name: companion DB topology (dev URL == live shared prod DB)
description: The companion's dev DATABASE_URL points at the real shared Neon prod DB; Replit's managed "production" replica is empty/unused. Affects how to safely make prod data changes.
---

# Companion DB topology

The companion's `DATABASE_URL` (in dev) points at the **website's live shared Neon database** — the same DB the deployed companion app AND the live website both read/write. So `executeSql({ environment: "development" })` (and the Express `pool`) operate on REAL production data.

Replit's managed **"production" replica is NOT the app's data**: `executeSql({ environment: "production" })` returns an empty/unused managed Postgres (a real website user found in dev returned zero rows in the prod replica). Don't reason about prod data through that replica — it's a red herring here.

**Implications:**
- A write via the development target / Express pool IS a live production data change affecting the website too. Treat it with production caution (confirm scope, prefer least privilege, it's reversible but visible to the live site).
- You CANNOT use `environment: "production"` to verify or back up the real data — query the development target (the shared Neon DB) instead.
- A server CODE change still requires a republish/deploy to take effect in the deployed companion; only DATA changes (shared DB) are instant in production.

**Why:** the companion is a thin client over the website's Neon DB (see the May 2026 pushToWebsite audit in replit.md), and the in-code comment in `/api/auth/login` claiming "dev uses its own database separate from the website's" is stale/inaccurate.
