---
name: Persistent authenticated navigation
description: Product decision for bottom navigation on authenticated deep screens.
---

Keep the five primary quick actions available on authenticated deep screens, not only on the five main tab screens. Never show a duplicate dock when the tab navigator already supplies one, and do not show it on authentication screens.

**Why:** Posting, assigning, and job-management flows can become several screens deep. The user wants Home and the other primary destinations to remain one tap away rather than requiring repeated back navigation.

**How to apply:** New authenticated root-level detail or workflow routes should inherit the shared navigation shell automatically. Reserve layout space for the dock instead of overlaying content, preserve role-specific Jobs/Invoices behavior, and hide it while the software keyboard is open so forms remain usable.