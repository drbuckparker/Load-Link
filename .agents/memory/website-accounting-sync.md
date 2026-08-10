---
name: Website accounting sync (QuickBooks/Xero)
description: Website-side invoice accounting sync that changes invoice status server-side; rules the companion must respect.
---

As of Aug 2026 the website pushes issued invoices to the payee's connected QuickBooks Online or Xero account and a 15-min poller flips `monthly_invoices.status` to `payment_received` automatically when paid there.

Rules for the companion:
- **Never assume invoice status only changes through in-app actions.** Always render the server/DB's current status; don't cache or infer transitions client-side. (DB is shared, so companion reads are already live.)
- New columns on `monthly_invoices`: `qbo_*` and `xero_*` (sync status, remote invoice id, last sync error, synced-at). New website tables: `quickbooks_connections`, `quickbooks_customer_map`, `xero_connections`, `xero_contact_map`.
- Sync details are payee-only. Implemented Aug 2026: companion's local `monthly_invoices` got the qbo_*/xero_* columns hand-added (companion DB does NOT automatically get website schema changes — despite earlier "shared DB" notes, this DB lacked them; website API is the source, syncInvoices upsert populates them via camelToSnake). Server strips all 8 fields from invoice responses unless viewer === driver_id (payee/issuer side, matches ensureMonthlyInvoices creation); invoice detail screen shows a read-only synced/failed/pending badge.
- Mobile must NOT implement OAuth connect flows; connect happens on web Settings → Billing.
- All invoice math still goes through the website's `getInvoiceLineItems`; invoices lock at issue, late additions create supplemental invoices — never recompute totals client-side.
- Support contact: website forms now email support@loadlinklive.com; if the app ever adds a contact form, POST to website `/api/contact` (authenticated) via the companion proxy instead of hardcoding addresses. Current app mailto links already point at support@loadlinklive.com.

**Why:** website memo Aug 2026; companion has a history of SQL referencing stale columns and failing silently — re-verify invoice queries against the live DB after website schema changes.
