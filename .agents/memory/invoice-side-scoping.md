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

## Monthly billing rule (July 2026)

A job bills under the month of its **first working day**
(`scheduled_date`, fallback `created_at`) — a June 30→July job goes
on the June invoice. The open-invoice recompute sweep is month-
filtered, and the companion auto-creates a missing open invoice per
(contractor, driver, month) on GET /api/invoices, serialized with a
pg advisory lock (shared table has NO unique key on pair+month).

**Deliberate trade-offs (do not "fix" without care):**
- Creation is skipped if an invoice of ANY status exists for the
  pair+month. Loosening this to open-only would double-bill: the
  website does NOT set jobs.invoice_id when issuing/paying, so a
  closed month's completed jobs still look "un-invoiced" and would
  be swept into a fresh open invoice.
- trucking_company view intentionally uses the contractor/payer side
  (isContractorRole includes it); the owner's receivables via their
  drivers never come back from the server for the owner anyway.
