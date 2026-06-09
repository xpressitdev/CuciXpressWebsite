# Threat Model

## Project Overview

Cuci Xpress is a public internet-facing car wash application with a React/Vite frontend and an Express/TypeScript backend backed by PostgreSQL via Drizzle. It exposes a public marketing site, customer sign-in and self-checkout flows, staff/POS workflows, and several third-party integrations including Pocket Pay, Google OAuth, Google Places, Gmail-based email delivery, and Gemini-based license-plate recognition.

For production scoping, the deployed Express API is reachable from the public internet. The mockup sandbox is not considered production. Dev-only routes guarded by `NODE_ENV === "production"` are treated as out of scope unless production reachability is demonstrated.

## Assets

- **Customer accounts and sessions** — Lucia customer sessions, staff sessions, Google-linked identities, OTP codes, and any legacy auth artifacts. Compromise allows account takeover or staff impersonation.
- **Customer personal data** — names, phone numbers, email addresses, license plates, saved vehicles, wash history, memberships, and loyalty data. Exposure creates privacy harm and can support targeted abuse.
- **Payment and order integrity** — package prices, pending payment records, payment references, callbacks, refunds, memberships, and queue/ticket state. Tampering here directly affects revenue and service fulfillment.
- **Staff/admin capabilities** — POS order creation, refunds, shift operations, customer lookup, branch reporting, catalog management, and staff management. Unauthorized access would expose broad business and customer data.
- **Application and integration secrets** — database credentials, JWT/Lucia secrets, Pocket Pay credentials, Google OAuth credentials, Gmail app password, Gemini key, and Replit environment secrets. Leakage would enable downstream service abuse.

## Trust Boundaries

- **Browser to Express API** — all client input is untrusted, including checkout data, customer auth identifiers, QR payloads, and public form submissions.
- **Express API to PostgreSQL** — the server holds broad read/write access to customer, order, loyalty, and staff tables; route-layer validation mistakes can become full data or integrity issues.
- **Express API to external providers** — Pocket Pay, Google OAuth/Places, Gmail, and Gemini are called with privileged server-side credentials and must not accept attacker-controlled operations without validation.
- **Public to authenticated customer boundary** — marketing, checkout, and auth-start routes are public; customer dashboard and garage routes must require a valid customer session.
- **Customer to staff/admin boundary** — POS, reporting, branch management, refunds, and staff operations must be enforced server-side with role checks.
- **Production to dev-only boundary** — diagnostic helpers and mock flows must stay unreachable in production; production assumptions include `NODE_ENV=production`.

## Scan Anchors

- Production entry points: `server/index.ts`, `server/routes.ts`, `client/src/App.tsx`.
- Highest-risk code areas: `server/routes.ts` public auth and payment routes, `server/payment.ts`, `server/auth/*.ts`, and staff/POS routes under `server/routes.ts`.
- Public surfaces: landing-page APIs, customer auth start/verify routes, web checkout, payment callback/status, Google review endpoints.
- Authenticated surfaces: `/api/customer/*` for customer sessions, `/api/pos/*` and `/api/admin/*` for staff sessions and role-based actions.
- Usually ignore unless production reachability is shown: mockup sandbox artifacts, routes explicitly disabled when `NODE_ENV === "production"`, and local OTP mock file output.

## Threat Categories

### Spoofing

This project supports customer auth, staff auth, Google OAuth, OTP-based sign-in, and payment-provider callbacks. The system must ensure that only valid customer or staff sessions reach protected routes, and that external callback/webhook-style requests are authenticated before changing order state. Customer lookup helpers must not leak enough identity data to help attackers impersonate real users.

Required guarantees:
- Customer and staff routes MUST enforce the correct session and role checks on the server.
- OTP and sign-in start routes MUST resist account enumeration and bulk abuse.
- Payment callbacks MUST only change order state for authentic provider events tied to the expected order and amount.

### Tampering

The public checkout flow crosses from an untrusted browser into payment creation and order creation. Staff flows also update orders, memberships, queue state, refunds, and reports. Any server path that trusts client-supplied prices, identifiers, or branch context can be abused to change business records or obtain services without proper payment.

Required guarantees:
- Prices, totals, and billable items MUST be derived server-side from trusted catalog data.
- Payment success handling MUST verify the amount and transaction details before marking an order paid.
- Sensitive state transitions such as refunds, queue admission, and membership redemption MUST remain server-authoritative.

### Information Disclosure

The application stores vehicle and customer data that is sensitive in this business context, especially license plates, phone numbers, emails, wash history, memberships, and branch-level reporting. Public helper endpoints can easily become scraping or enumeration oracles even when they expose only part of a record.

Required guarantees:
- Public routes MUST not expose customer identifiers, vehicle identifiers, or account existence details beyond what is strictly necessary.
- API responses and logs MUST avoid leaking secrets, payment internals, and unnecessary PII.
- Diagnostic endpoints and mock data endpoints MUST not expose business or customer data in production.

### Denial of Service

Public forms, checkout creation, auth-start flows, and third-party integrations can all be triggered from the internet. Without throttling, attackers can spam OTP sends, create excessive external payment sessions, flood business inboxes, or force repeated expensive upstream API calls.

Required guarantees:
- Public auth-start, checkout, and contact endpoints MUST have per-IP and per-identifier throttling.
- Public routes that trigger third-party calls MUST have abuse controls and bounded work.
- External API failures MUST not cascade into broad service instability.

### Elevation of Privilege

The codebase contains clear separation between public users, authenticated customers, staff, and higher-privilege owner/manager roles. Any missing route guard, overly broad data lookup, or user-controlled identifier crossing into staff-only operations could let attackers access privileged data or perform privileged actions.

Required guarantees:
- Staff/admin capabilities MUST be enforced server-side with explicit role checks.
- Customer-scoped data reads and writes MUST always bind to the authenticated customer identity, not caller-supplied IDs.
- Public helper or debug routes MUST not become alternate paths into staff or customer workflows.
