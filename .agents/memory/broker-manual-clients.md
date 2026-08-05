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

## Job→client links are companion-side too
The website strips clientName/clientEmail off broker jobs entirely (upstream job payload only has clientInvoiceId), so job→client ties live in companion table `broker_job_clients` (job_id PK, broker_id, client_key = `manual-<id>` or upstream clientUserId). Written on broker POST /api/jobs after upstream success; merged back by the pre-wildcard GET /api/broker/jobs; /api/broker/clients derives activeJobsCount from it. If a broker job "isn't tied to a client", the link row is missing — never look upstream for it.

## Broker projects unified into the generic project surface (Aug 2026)
Broker-created projects live in `broker_client_projects` (companion-local, narrower columns: NO status/updated_at/site_address_type; status is derived from deleted_at). Any query resolving a job's project name must LEFT JOIN BOTH `contractor_projects` and `broker_client_projects` and COALESCE the names — and note `jobs.project_id` is varchar while `broker_client_projects.id` is uuid, so the join needs `bcp.id::text` or Postgres throws "operator does not exist: character varying = uuid" (which /api/jobs masks as an empty list). /api/projects and PUT/DELETE/restore /api/projects/:id all have broker-table fallbacks; broker rows need no website push.
