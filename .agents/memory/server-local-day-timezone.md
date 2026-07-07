---
name: Server "today" must use the user's timezone
description: Day-based views computed on the server roll over early because Replit runs in UTC
---

# Server-computed "today" is a day ahead in the user's evening

Replit servers run in **UTC**. Any endpoint that computes "today" / day[0] with
`new Date()` server-side rolls over to the next calendar day during the user's
evening (e.g. 8:30 PM Mountain = ~2:30 AM UTC next day), so day-based widgets
(dashboard upcoming-days, "N jobs today") show tomorrow as the first day.

**Fix pattern:** the client sends its timezone via the `X-TZ-Offset` header
(`String(new Date().getTimezoneOffset())` — minutes, positive for zones behind
UTC) on every request (added in `lib/query-client.ts` getHeaders; must be in the
CORS `Access-Control-Allow-Headers` allowlist for the web preview). Server reads
`Number(req.header('X-TZ-Offset'))`, defaults to 0 if not finite, then
`new Date(Date.now() - tzOffsetMin*60000)` + `setHours(0,0,0,0)` — because the
server is UTC this lands on the user's local midnight. Build date strings from
local getters (`getFullYear/Month/Date`), NEVER `toISOString()` (that re-UTCs).

**Why:** user reported the dashboard "switched too early" — first day was
Tuesday at 8:30 PM Monday. Root cause was UTC `new Date()` on `/api/dashboard`.

**How to apply:** the calendar tab is NOT affected (it sends explicit
month/year from client-local state). But any NEW server-side "today"/date-window
default must consume `X-TZ-Offset` the same way, and any client date-key must be
built from local parts, not `toISOString()`.
