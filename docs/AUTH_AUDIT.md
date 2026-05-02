# Authentication & Security Audit

**Date:** 2026-05-02
**Scope:** All auth surfaces, secret usage, and session touchpoints in the trunk codebase prior to introducing Lucia v3.
**Method:** Read-only inspection of `server/`, `shared/schema.ts`, and Replit Secrets state. No code changes.

---

## Executive summary

The trunk has **two parallel hand-rolled JWT auth systems** running side-by-side, each with its own cookie name, its own login/logout/me routes, and its own copy of the `JWT_SECRET || 'fallback'` pattern. Express resolves duplicate route registrations by keeping the first — so the **second system is effectively dead code that still ships in the bundle and still falls back to a hardcoded secret if `JWT_SECRET` is unset**.

`JWT_SECRET` is **not currently set** in Replit Secrets. The app is silently using the hardcoded fallback in production-shaped paths (cookie `secure: true` is gated by `NODE_ENV`, but signing key is the literal string `'cuci-xpress-unified-secret-key-2025'`). Anyone with the source can forge tokens.

The Replit OIDC integration (`javascript_log_in_with_replit`) is installed but not wired — zero references in `server/` or `client/`. Same for `connect-pg-simple` / `express-session` — the `session` table exists in the DB (managed externally by LiveQue), but this app does not use it.

There is **no OTP, WhatsApp, SMS, or email-link auth code** today. SendGrid is installed but used only for outbound notifications, not auth flows.

The migration to Lucia v3 (Task 1.3) is mostly low-risk: cookie rename (`cuci_auth_token` → `cx_session`), session table swap (new `auth_sessions` from Task 1.2, leaving the legacy `session` table alone), and gradual route cutover. Two endpoints (`/api/verify-qr` and the dual `/api/auth/me`) need attention because they parse JWTs directly outside the `unifiedAuth` class.

---

## 1. Auth flows inventory

All current authenticated endpoints. **Note the duplicates** — Express keeps the first registration and silently drops the second.

| Method | Path | File:Line | Mechanism | Notes |
|---|---|---|---|---|
| POST | `/api/auth/login` | `server/routes.ts:1034` | JWT via `unifiedAuth` (cookie `cuci_auth_token`) | **Active** — first registration wins |
| POST | `/api/auth/register` | `server/routes.ts:1076` | JWT via `unifiedAuth` (cookie `cuci_auth_token`) | **Active** |
| POST | `/api/auth/logout` | `server/routes.ts:1120` | Clears `cuci_auth_token` | **Active** |
| GET | `/api/auth/me` | `server/routes.ts:1129` | `unifiedAuth.requireAuth` middleware | **Active** |
| POST | `/api/auth/verify-token` | `server/routes.ts:1174` | `unifiedAuth.getUserFromToken` | **Active** — used for cross-domain handshake |
| POST | `/api/auth/register` | `server/routes.ts:1288` | Hand-rolled `jwt.sign` (cookie `auth_token`) | **DEAD** — duplicate route, never reached |
| POST | `/api/auth/login` | `server/routes.ts:1340` | Hand-rolled `jwt.sign` (cookie `auth_token`) | **DEAD** — duplicate route |
| GET | `/api/auth/me` | `server/routes.ts:1381` | Hand-rolled `jwt.verify` against `auth_token` cookie | **DEAD** — duplicate route |
| POST | `/api/auth/logout` | `server/routes.ts:1430` | Clears `auth_token` | **DEAD** — duplicate route |
| POST | `/api/verify-qr` | `server/routes.ts:883` | (separate verification flow — not JWT) | QR-based service verification, not user auth |

**Total auth routes:** 9 registered, **5 reachable, 4 dead**.

**Middleware:** `unifiedAuth.requireAuth` is the only auth middleware. It is applied per-route (not globally), used in exactly one place: `/api/auth/me`. **No other route is protected.** All other endpoints (orders, history, admin actions, etc.) are open or rely on client-side gating only.

---

## 2. Secrets inventory

| File:Line | Env var | Fallback | Risk | Notes |
|---|---|---|---|---|
| `server/unified-auth.ts:20` | `JWT_SECRET` | `'cuci-xpress-unified-secret-key-2025'` | **HIGH** | Active code path. Anyone with source can forge tokens for any user. |
| `server/routes.ts:1311` | `JWT_SECRET` | `'dev-secret'` | **HIGH** | Dead code, but still in bundle and still leaks the fallback string. |
| `server/routes.ts:1352` | `JWT_SECRET` | `'dev-secret'` | **HIGH** | Same as above. |
| `server/routes.ts:1388` | `JWT_SECRET` | `'dev-secret'` | **HIGH** | Same as above. |
| `server/unified-auth.ts:138` | (none) | `'Buy20sell26!!'` | **CRITICAL** | Hardcoded **master password** that bypasses every user's password check. Any attacker who reads the source can log in as any user. **This is not a secret; this is a backdoor.** |

**Replit Secrets state (verified via `viewEnvVars`):**
- `JWT_SECRET` = **not set** — fallback in use
- No `SESSION_SECRET`, no `GOOGLE_CLIENT_*`, no OAuth provider secrets present

**Environment-variable-only (not secrets):** `NODE_ENV` is read in 3 places to gate cookie `secure` and cookie domain. No fallback risk.

---

## 3. Session storage

The trunk does **not** use server-side sessions. Authentication is entirely stateless via JWTs in `httpOnly` cookies:

- Cookie name: `cuci_auth_token` (active path) or `auth_token` (dead duplicate)
- Cookie attrs: `httpOnly: true`, `secure` only in production, `sameSite: 'lax'`, `maxAge: 7 days`
- Cross-domain: `domain: '.cucixpress.com'` set in production, plus a duplicate `.cuci-xpress.com` cookie for the LiveQue domain (`server/unified-auth.ts:108-114`)

**The `session` table in the database is not used by this app.** It exists because LiveQue (the consolidated DB owner) writes to it via `connect-pg-simple`. The trunk has zero `connect-pg-simple` or `express-session` imports. Confirmed via grep — zero matches in `server/` or `client/`.

`server/index.ts` mounts: `cookieParser`, `express.json`, `express.urlencoded`, custom request logger. **No session middleware.**

There is **no token revocation mechanism.** A leaked or stolen JWT remains valid for 7 days from issue with no way to invalidate it server-side.

---

## 4. OTP / WhatsApp / SMS

**None — to be added in Task 1.3 (and follow-ups).**

Searches for `otp`, `OTP`, `whatsapp`, `twilio`, `sendgrid` in `server/`:
- `server/email.ts` exists and uses SendGrid for outbound notifications (booking confirmations, etc.) — **not an auth flow**.
- Zero OTP-related code anywhere.
- Zero WhatsApp / Twilio / SMS code.

The MASTER_PLAN expects WhatsApp OTP login for customer auth. The `otp_codes` table will be added in Task 1.2; the issuance/verification routes are downstream work.

---

## 5. Replit OIDC integration

`javascript_log_in_with_replit==1.0.0` is installed (per project state). **It is not wired up.**

Searches for `openid`, `oidc`, `passport`, `REPL_ID`, `REPLIT_DOMAINS`, `getOidcConfig`, `Issuer.` across `server/` and `client/`: **zero matches**.

There are no callback URLs, no claim mappings, no Replit-issued cookies in use. The integration is dormant and can either be:
- **(a)** wired into Lucia v3 via Arctic's OIDC provider in a follow-up task, or
- **(b)** uninstalled if Replit auth isn't part of the customer-facing product.

Recommend deferring this decision until after Lucia v3 is in place and we know which third-party providers (Google, Apple, WhatsApp) we actually want.

---

## 6. Migration risks for Lucia v3 cutover

Grouped by effort.

### Low-risk (drop-in)

- **Cookie rename** `cuci_auth_token` → `cx_session`: Lucia owns its own cookie. Zero downstream code reads `cuci_auth_token` directly except `unifiedAuth.requireAuth` (`server/unified-auth.ts:61`). One-line change to read both during transition window.
- **Boot-time secret check** (Task 1.1): Adding `requireJwtSecret()` in `server/index.ts` is additive. No risk to existing flows beyond failing fast on misconfig.
- **`/api/auth/whoami` debug endpoint** (Task 1.3): New route, dev-only, no conflicts.

### Medium-risk (cookie rename / dual-read)

- **Cross-domain cookie**: `unifiedAuth.setAuthCookie` writes a second cookie scoped to `.cuci-xpress.com` for LiveQue handshake (`server/unified-auth.ts:112-114`). LiveQue must be updated in lockstep when we cut over, or it loses single-sign-on with cucixpress.com. Coordinate with the LiveQue retirement (Month 2-3 per MASTER_PLAN).
- **`/api/auth/verify-token`** (`server/routes.ts:1174`): External-facing handshake endpoint. If any LiveQue or third-party integration calls it, response shape must remain backwards-compatible during the dual-auth window.
- **Frontend token reads**: any `localStorage.getItem('cuci_auth_token')` or fetch with `credentials: 'include'` assuming the legacy cookie name will need to be audited in `client/` as part of the cutover task.

### High-risk (data migration required)

- **Existing user passwords**: `server/unified-auth.ts:138` shows passwords are stored and compared in **plaintext** (`user.password === password`). This is a separate critical security issue independent of Lucia. When Lucia takes over login, every user's password must be:
  1. Hashed on next successful login (lazy migration), OR
  2. Force-reset via email link (clean break)
  Lucia v3 itself is hash-agnostic — it stores whatever you put in `password_hash`. The hashing decision is ours.
- **The `'Buy20sell26!!'` master-password backdoor** (`server/unified-auth.ts:138`): Must be removed in the same change that introduces Lucia password verification, otherwise it leaks into the new system.
- **JWT-issued tokens already in the wild**: 7-day expiry, no revocation. Even after Lucia is wired, existing tokens remain valid for up to 7 days. Two options:
  1. Accept the 7-day overlap (both auth systems read in parallel — already the design in Task 1.3).
  2. Force re-login by deleting the cookie on next request (breaks active sessions; not recommended).
- **`/api/auth/me` schema**: Returns a flattened user object including `car_plate` joined from `cars` table (`server/routes.ts:1393-1407`). Lucia's `getUserAttributes` callback must produce the same shape, or the frontend dashboard breaks.

---

## Findings beyond the original task scope

These came up during the audit and warrant their own tracking, even though Task 1.0 was only meant to inventory.

1. **CRITICAL: Master-password backdoor** — `'Buy20sell26!!'` at `server/unified-auth.ts:138` lets anyone reading the source log in as any user. Should be removed **immediately** in Task 1.1, not deferred to the Lucia cutover.

2. **CRITICAL: Plaintext password storage** — `user.password === password` comparison. Existing 508 users have plaintext passwords in the database. Even if a hash is applied going forward, the existing records are exposed if the DB is ever leaked.

3. **HIGH: Dead duplicate auth code** — 4 dead routes in `server/routes.ts:1288-1432` should be deleted. They contain 3 of the 4 hardcoded `JWT_SECRET` fallbacks and a different cookie name. Risk of someone "fixing" them and re-activating them by accident.

4. **MEDIUM: No protected routes** — Only `/api/auth/me` is gated by `unifiedAuth.requireAuth`. Order creation, history queries, admin actions are all open. Most rely on client-side gating, which is not a security boundary. Out of scope for Week 1; flag for Week 2-3.

5. **LOW: `/api/verify-qr`** at `server/routes.ts:883` — separate auth-shaped flow not covered by `unifiedAuth`. Does not use JWT; uses QR token comparison. Audit out of scope but worth noting for the Week 4-5 POS integration work.

---

## Recommended adjustments to Task 1.1

The original Task 1.1 brief covered the 4 fallback removals. Based on this audit, **expand it** to also:

- **Delete the dead duplicate routes** at `server/routes.ts:1288-1432` (eliminates 3 of the 4 fallbacks at the source, no behaviour change since they're unreachable).
- **Remove the master-password backdoor** at `server/unified-auth.ts:138` — single-line change, no schema impact, immediate security win.

Plaintext-password remediation and the 4-MEDIUM finding should be tracked separately as Week 2 work.

---

**File path:** `docs/AUTH_AUDIT.md`
