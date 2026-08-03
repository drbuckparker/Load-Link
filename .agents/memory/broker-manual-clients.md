---
name: Broker manual clients
description: Companion-local clients brokers add without inviting them to LoadLink
---
Brokers can add clients without a LoadLink invite. These live in the companion-only table `broker_manual_clients` (hand-added to the shared website DB; the website never syncs/clobbers it because it's companion-only).

**Rules:**
- Merged into the client list by a companion-local `GET /api/broker/clients` registered BEFORE the `/api/broker/.*` proxy wildcard; manual entries get ids prefixed `manual-` and `isManual: true`.
- Manual clients have no LoadLink account: `client-projects` returns `[]` for `manual-` ids, and jobs for them carry only clientName/clientEmail (email optional).
- Any companion-local `/api/broker/*` handler registered before the wildcard MUST enforce the broker role itself (`users.role = 'broker'` check) — the wildcard relies on upstream enforcement, so local handlers bypass it. This gap was caught in review once already.

**Why:** brokers take clients by phone ("I need four trucks") and must post jobs immediately; forcing an invite/accept loop blocked the flow.
