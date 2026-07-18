---
name: Invoice side scoping for compound accounts
description: Invoice views must filter to the active role's side of the ledger, not just server party scoping
---

GET /api/invoices returns every invoice where the user is EITHER party
(`contractor_id = me OR driver_id = me`). For a compound account
(driver + trucking company + contractor) that mixes payables and
receivables in one list.

**Rule:** each client view filters to its own side — contractor view
keeps only `contractor_id === user.id`; driver/company (receivable)
view keeps only `driver_id === user.id`. Applied in the invoices tab
and the invoices-by-party screen.

**Why:** contractor mode otherwise exposes everything the user's
trucking-company side is billing other contractors (user explicitly
asked that contractor mode only show invoices addressed to them).

**How to apply:** any new invoice-listing UI must apply the same
side filter based on the *active switched role* (isContractorRole),
not rely on the server scoping alone. Self-invoices (both ids = me)
legitimately appear in both views. Compare ids as strings.
