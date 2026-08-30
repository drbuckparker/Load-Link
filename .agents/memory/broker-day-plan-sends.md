---
name: Broker instruction-send ownership
description: Durable boundaries for broker instruction state, delayed authorization, phone delivery, and confirmation
---

The website remains authoritative for assignment state and ordinary inbox history. Delayed sends still require the broker's persisted or safely re-acquired user authorization; server-to-server API trust alone cannot act as the broker.

The companion owns driver phone delivery. Every instruction-send mode—send while assigning, single, bulk, and scheduled—must share one durable, assignment-keyed delivery path.

**Why:** website sends alone do not wake the phone, and splitting delivery by UI path lets one mode silently skip the alert. Pending confirmations may also outlive ordinary inbox pagination.

**How to apply:** preserve authoritative website state, retain user-level authorization for deferred work, key push delivery and responses by assignment, collapse retries to that key, and expose pending confirmation independently of inbox limits.

**Notification-navigation rule:** A website-created assignment may be absent from the companion's local assignment mirror when its banner or inbox card is tapped. Until synchronization catches up, the durable push outbox is valid evidence of the assigned driver's job access and pending response.

**Why:** Otherwise the push arrives correctly but its deep link gets a 403, and the job detail omits confirm/decline even though the website has already sent the assignment.

**How to apply:** resolve missing notification job links through both local assignments and the assignment-keyed outbox; use the same two sources for job-detail authorization and pending-confirmation annotation.

**Self-response rule:** The website's driver confirm/decline endpoint rejects a broker responding to their own assigned truck. After exact assignment/driver/owner verification, reconcile current website status and use the website's broker approve/reject action instead; never substitute a local-only status write.

**Why:** New broker assignments can exist only on the website when the response arrives. A local fallback both fails to find them and can diverge from authoritative assignment state.

**How to apply:** serialize self-responses with a durable claim, bound remote request time, recheck authoritative status before every transition, make same-action retries idempotent, and reject opposite-action replays.

**Driver-response compatibility:** Try website `/api/job-assignments/:id/...`, but fall back on an HTML 404 to legacy `/api/assignments/:id/...`; current production exposes only the legacy response path.

**Why:** Current website production has no role-independent broker-owner/driver confirm route: the audited namespace 404s, while legacy routes self-response into contractor-only approval.

**How to apply:** ordinary responses use the live website route. For a verified broker self-assignment only, persist confirmation in the companion response ledger and overlay it in broker/driver reads; decline must delete upstream first.

**Assignment-sheet rule:** An active assignment with no sent timestamp is both “already on this job” and a pending instruction-send target. Its checked row must count toward Send Now/Send Later; sent assignments remain checked for assignment state but are excluded from send counts.

**Why:** Treating selection as only newly chosen drivers produced a checked held truck alongside disabled “(0)” send buttons, trapping brokers who assigned first and sent later.

**Confirmation rule:** After a successful immediate send, close the truck sheet and require an explicit OK on “Your instructions were sent.” After scheduling succeeds, close the scheduler and require OK on a confirmation containing the localized send time.

**Why:** The broker needs an unmistakable acknowledgement that the immediate send or saved schedule actually succeeded; silently returning to the job list leaves the outcome ambiguous.

**Recurring-nightly rule:** A scheduled send is a chain, not a one-shot: every path that ends an occurrence — success, retry-cap failure, crash recovery — must leave a pending successor (or an explicit broker cancellation), and a reconciler must heal chains a crash broke, or one bad night silently ends multi-day reminders. Cancellation must be a durable signal distinct from "row missing", or healing resurrects schedules the broker stopped.

**Why:** the nightly send is the product promise behind "on this job every day until removed"; any single-shot failure mode breaks it invisibly.

**Day semantics:** job scheduled dates stored at midnight are calendar days — never tz-shift them (shifting moved US brokers' jobs a day early). Multi-day jobs are effectively open-ended: treat them active every allowed work day while open, because their stored duration estimate is often 1.0 and meaningless. Nightly sends fire the evening before the work day, so recurrence math must anchor on the fire date and keep the broker's local wall-clock time across DST.

## Nightly recurring chain — verification lessons (Aug 2026)
- Website jobs list reports hold state as `assignmentStats.heldCount` (NOT `held`) — reading the wrong key made every scheduled send resolve 0 jobs. Worker now checks `held ?? heldCount`.
- Worker 401s: session JWTs restored from companion_sessions go stale; processDue now re-acquires via reacquireBrokerJwt and retries once on 401/403.
- The PROD deployment shares the DB and its worker races dev, claiming due rows within seconds — dev almost never wins. To test worker code deterministically, temporarily export processDueBrokerScheduledSends and drive it from a tsx script (arm row + call fn in one process).
- Two-night compression without waiting: fireDayKey = now - tz_offset_min; set the row's tz_offset_min negative (e.g. -720) so fireDayKey rolls to "tomorrow" and the sentDay===fireDayKey suppression no longer skips the reminder.
- BLAST RADIUS: open-ended multi_day jobs are "active" every day forever, so a recurring occurrence serves ALL of a broker's old open multi-day jobs; held assignments on stale jobs would get real sends. Clean up or complete old jobs before firing real occurrences.
