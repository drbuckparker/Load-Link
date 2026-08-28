---
name: Broker client job overviews
description: Rules for reliable and responsive broker client-detail job lists.
---

The broker client overview must treat a broker project's client ownership as an authoritative fallback when a job's direct client link is absent or stale. Client-only job lists should not fetch assignment details.

**Why:** Canceling one sibling job exposed divergent relationships: the project view could still find the surviving active job, while the client overview appeared empty. Authoritative per-job assignment enrichment also made the overview take tens of seconds and display a misleading empty state while loading.

**How to apply:** For broker client-detail screens, merge project-derived client identity into job attribution, explicitly distinguish loading from empty, and use a lightweight jobs response. Reserve authoritative assignment enrichment for assignment-management screens.