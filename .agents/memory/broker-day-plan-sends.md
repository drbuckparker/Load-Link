---
name: Broker instruction-send ownership
description: Durable boundaries for broker instruction state, delayed authorization, phone delivery, and confirmation
---

The website remains authoritative for assignment state and ordinary inbox history. Delayed sends still require the broker's persisted or safely re-acquired user authorization; server-to-server API trust alone cannot act as the broker.

The companion owns driver phone delivery. Every instruction-send mode—send while assigning, single, bulk, and scheduled—must share one durable, assignment-keyed delivery path.

**Why:** website sends alone do not wake the phone, and splitting delivery by UI path lets one mode silently skip the alert. Pending confirmations may also outlive ordinary inbox pagination.

**How to apply:** preserve authoritative website state, retain user-level authorization for deferred work, key push delivery and responses by assignment, collapse retries to that key, and expose pending confirmation independently of inbox limits.

**Assignment-sheet rule:** An active assignment with no sent timestamp is both “already on this job” and a pending instruction-send target. Its checked row must count toward Send Now/Send Later; sent assignments remain checked for assignment state but are excluded from send counts.

**Why:** Treating selection as only newly chosen drivers produced a checked held truck alongside disabled “(0)” send buttons, trapping brokers who assigned first and sent later.
