---
name: Broker job→client links
description: How a broker job stays associated with a client; website strips client fields off jobs.
---
The website accepts `clientName`/`clientEmail` on job POST but never echoes them back on any jobs read (list or detail). The per-client jobs filter in the app can therefore never match on job fields alone.

**Why:** verified live — POST with client fields succeeds, GET /api/broker/jobs and /api/jobs/:id return no client keys; query-param filters (clientId/clientEmail) are ignored upstream.

**How to apply:** the association lives companion-side in the shared-DB table `broker_job_clients` (job_id PK, broker_id, client_key NOT NULL, client_name, client_email). `client_key` matches the clients feed's `clientUserId` (e.g. `manual-<uuid>`). Any code writing broker jobs for a client must insert here; any per-client jobs view must merge/join from here. Don't recreate the table with a different shape — it already exists with data.

Also: the website has NO delete endpoint for broker client invites (`DELETE /api/broker/clients/:id`, `/api/invitations/:id` → 404), and `DELETE /api/jobs/:id` 500s — cancel jobs via `PUT /api/jobs/:id {status:'cancelled'}` instead.
