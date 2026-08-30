---
name: Prod companion session restore
description: Deployed companion loads sessions from DB only at startup; also RN Web Pressable test gotcha.
---
The deployed companion server persists sessions to the shared-DB `companion_sessions` table but restores them to memory **only at startup** (a capped subset). A session row inserted directly into the DB is not seen by an already-running prod instance, and updating an existing row's entry doesn't refresh the in-memory copy.

**Why:** observed while minting a verification session — a token inserted before a cold start authenticated (200), one inserted after stayed 401 for many minutes; an entry UPDATE (adding originalRole) never took effect.

**How to apply:** to impersonate/verify against prod, insert the FULL session entry (`jwt`, `userId`, `user`, `originalRole`) and expect it to work only after the next prod cold start/restart. Broker-gated routes require `originalRole` in the entry, not just `user.role`.

Testing gotcha: React Native Web Pressables ignore synthetic DOM `element.click()`; Playwright must use real pointer clicks at coordinates or the press silently no-ops (looks like a broken button).
