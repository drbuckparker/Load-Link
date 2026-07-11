---
name: Billing company roll-up
description: How contractor-side billing groups drivers under trucking companies and where per-job vs invoice math can diverge
---

## Rule
Contractor-facing billing views roll drivers up under their trucking company using the key `driver_parent_company_id || driver_id` (parent = `users.trucking_company_id`). The Invoices tab, the invoices-by-party screen, and the job-detail billing card links must all use this SAME key or taps land on empty screens.

**Why:** Contractors pay trucking companies, not individual employed drivers; one company on four jobs must show one combined total. Independent drivers (no parent) stand alone as their own group.

**How to apply:** Any new screen or endpoint that groups money by "who I owe" must compute the same key server- or client-side. `GET /api/invoices` (list + detail) exposes `driver_parent_company_id/name` + parent contact fields for this.

## Per-job breakdown vs invoice math
`GET /api/jobs/:id/billing` (owner-only) prices each driver's OWN runs (per_hour = their minutes, per_load = their loads); flat-rate jobs split the rate evenly among drivers with runs. The website's `recomputeInvoice` instead attributes the WHOLE job's earnings to each invoice context — on multi-driver flat-rate jobs the per-driver invoices can sum to more than the job breakdown total. Known divergence, acceptable; don't "fix" one side without the other.

## Demo quirk
Demo drivers' parent company IS the demo account itself, so the demo contractor sees "LoadLink Demo Co" (their own company) as the group — correct behavior, just looks odd.
