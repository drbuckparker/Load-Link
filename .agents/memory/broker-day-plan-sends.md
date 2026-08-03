---
name: Broker day-plan scheduled sends
description: How the broker "send instructions at X time" feature works and its session-JWT dependency
---

Broker Day Plan tab stages held (sent_at NULL) assignments, then sends all held instructions for a date either immediately (client loops POST /api/broker/jobs/:id/send-all) or at a scheduled time via the companion-local `broker_scheduled_sends` table (one pending row per broker/date; tz_offset_min stored for day-bucketing timestamped job dates).

**Why:** actual sending happens upstream on the website and requires the broker's *user* JWT — the server-to-server X-API-Key alone is not enough. The 60s worker (`processDueBrokerScheduledSends`) pulls the broker's latest non-dev JWT from the persisted `tokenToJwt` session map.

**How to apply:**
- If the broker has no persisted real login session when the timer fires, the schedule is marked `failed` ("No active login session at send time"). Any feature that acts later on a user's behalf has this same constraint.
- Worker claims rows atomically (`pending`→`processing` with FOR UPDATE SKIP LOCKED); partial per-job failures re-queue as `pending` up to 5 attempts, then `failed`.
- Companion-only table in the shared website DB (per companion-db-topology); schema changes must be hand-applied there.
