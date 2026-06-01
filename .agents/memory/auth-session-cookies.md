---
name: Auth session cookie persistence
description: Why customer login silently dropped on mobile, and the Lucia cookie setting that controls it
---

# Lucia session cookie: `expires` controls persistence

The customer Lucia cookie (`cx_session`, in `server/auth/lucia.ts`) must use
`expires: true` for the "stay signed in for a year" UX to actually hold.

**Why:** With `expires: false`, Lucia emits a *browser-session* cookie (no
`Max-Age`/`Expires`). Mobile browsers and in-app webviews drop that cookie the
moment the tab is backgrounded or closed, so users were silently logged out
within minutes — even though the `auth_sessions` DB row stays valid for 365
days (`sessionExpiresIn`). The symptom was: OTP verify returns 200, `whoami`
true immediately, then `whoami` flips to false a short time later. The DB and
session adapter were never the problem; the cookie just wasn't being sent back.

**How to apply:** If "session won't persist / keeps logging out" is reported,
check `sessionCookie.expires` first — `true` = persistent cookie matching the
session TTL, `false` = dies on browser/app close. Don't go hunting for session
expiry/sweep bugs before confirming the cookie is persistent.

**Staff is intentionally different:** `staffLucia` keeps `expires: false` with a
12h TTL on purpose — staff use shared POS terminals, so dropping auth on browser
close is a security-positive default. Only change it if staff need persistence
on personal devices.
