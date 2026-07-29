---
name: Broker role rules
description: Invariants for the broker role in the companion app (bill rate secrecy, held assignments, project-less jobs)
---
# Broker role rules

- **Bill rate is broker/client-only.** Never include billRate/billRateType/clientName in any driver-facing response or UI. Server-side, driver job endpoints must not pass these through.
- **Held assignments (sent_at IS NULL on a broker-posted job) are invisible to the driver until sent.** Enforcement lives in three places: the job visibility predicate (private-jobs mode), an explicit filter in job detail, and an explicit filter in /api/driver/jobs. The jobs-list needsConfirmation annotation only matches `sent_at IS NOT NULL`, so flag-off mode leaks nothing (a public job listing is not a leak). Driver-created applications also have sent_at NULL — held checks must verify the job poster's role is 'broker'.
- **Broker jobs have no project.** create-job must skip project validation and omit projectId for brokers; don't auto-create a project.
- **/api/broker/* is a pure proxy** to the website API (JWT + X-API-Key); dev-local sessions get 400 by design — broker flows can't be tested with the demo account.

**Why:** bill rate exposure would reveal broker margin to drivers; held assignments are the broker's "stage then send" workflow.
