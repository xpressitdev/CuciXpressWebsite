# Cuci Xpress - Car Wash Business Landing Page

## Overview
Cuci Xpress is a full-stack web application for a successful car wash business. It serves as a customer-facing website showcasing services, business achievements (114K+ cars cleaned, $1M+ revenue, 6 branches), and as an investor portal for business expansion opportunities. The application integrates with a live queue system (CuciXpressLiveQue) for unified customer and service tracking via shared PostgreSQL database, and features a comprehensive Pocket Pay payment gateway with QR code receipts.

## User Preferences
Preferred communication style: Simple, everyday language.
Landing page style: Professional but not overly pushy for investments - subtle business inquiry approach preferred.

## System Architecture

### UI/UX Decisions
- **Frontend**: React 18 with TypeScript, Tailwind CSS for styling, shadcn/ui for components, Framer Motion for animations.
- **Design**: Fixed header, smooth scrolling navigation, animated counters for business metrics, customer review carousel, masonry image gallery, and a subtle investment/collaboration form.
- **Branding**: Utilizes a vibrant purple and orange color scheme, with specific accents for pricing tiers. Authentic Cuci Xpress photos and logos are used throughout.
- **Responsiveness**: Designed to be mobile-friendly and accessible.

### Technical Implementations
- **Frontend**: React 18, TypeScript, Wouter for routing, TanStack Query for server state management, Vite for building.
- **Backend**: Node.js with Express.js, TypeScript, RESTful API endpoints.
- **Database**: PostgreSQL with Drizzle ORM for type-safe operations and schema management. Neon Database is used as the serverless PostgreSQL provider.
- **Cross-App Integration**: CuciXpressLiveQue app is the master database owner. This website connects to that database for unified customer records (334+ registered users), service tracking, and real-time queue status synchronization.
- **Data Flow**: Frontend uses TanStack Query to make API calls to the Express backend. The backend validates requests using Zod schemas, processes business logic, and interacts with the PostgreSQL database via Drizzle ORM, returning JSON responses.

### Feature Specifications
- **Customer Facing**: Hero section with CTAs, animated business stats, dynamic testimonials with Google Reviews integration, interactive branch locations with Google Maps, image gallery, service pricing, and a "Queue Now" feature.
- **Investment/Collaboration Portal**: Form for capturing business inquiries with database storage and admin dashboard integration.
- **Subscription Management**: Dedicated page for subscription plans with email signup for lead capture.
- **Payment System**: Integrated Pocket Pay gateway with QR code receipt system for transaction verification and POS integration.
- **Admin Tools**: `/admin` route for managing collaboration submissions.
- **Service Status Flow**: `pending`, `in_queue`, `in_progress`, `completed`, `cancelled` states for car wash services.

### Authentication (Week 1 plan, in progress)
Two auth systems coexist by design during the Week 1–Week 2 cutover:

1. **Legacy JWT** (`server/unified-auth.ts`) — currently authoritative for
   `/api/auth/login`, `/api/auth/me`, `/api/auth/register`, `/api/auth/logout`.
   Hardened in Task 1.1: requires a 32+ char `JWT_SECRET` at boot (refuses
   to start otherwise — see `docs/AUTH_AUDIT.md`); the master-password
   backdoor and the dead duplicate auth routes were removed.
2. **Lucia v3 scaffold** (`server/auth/lucia.ts`, `server/auth/middleware.ts`)
   — runs side-by-side via the global `attachLuciaSession` middleware,
   reads/writes the `cx_session` HttpOnly cookie, and is backed by a custom
   polymorphic adapter over the new `auth_sessions` table (scoped to
   `user_type='customer'` for now; staff comes online with the POS work).
   Debug routes: `GET /api/auth/whoami`, `POST /api/auth/lucia/dev-login`
   (DEV-ONLY), `POST /api/auth/lucia/logout`. Full E2E verified.
   Lucia v3 is officially sunset; planned migration to oslojs after the
   Week-1..Week-5 plan ships.
3. **OTP module — DEV-MOCKED** (`server/auth/otp.ts`) — pure send/verify
   primitives backed by the `otp_codes` table. 6-digit codes hashed with
   Lucia's Scrypt, 5-min TTL, 5-attempt cap, one-active-code-per-
   `(identifier, purpose)` policy. Every send / verify / failure writes to
   `audit_log` (never the code or hash). In dev the "send" step prints a
   single `[otp] DEV-MOCK delivery …` log line and writes the code to
   `/tmp/last_otp.json` for testing; in prod the same path throws fail-
   loud so we don't silently drop a "delivered" code. The Week-4 WhatsApp
   Business API integration only swaps the body of `deliverOtp()`. HTTP
   surface: `POST /api/auth/otp/send` and `POST /api/auth/otp/verify`.
   These primitives do NOT yet mint a Lucia session on success — that
   wiring is a Week-2/4 task.
4. **Google OAuth via Arctic** (`server/auth/google.ts`) — Authorization-
   Code flow with PKCE. Routes: `GET /api/auth/google` (starts the flow,
   sets `google_oauth_state` + `google_oauth_code_verifier` +
   `google_oauth_return_to` HttpOnly cookies, 302s to Google) and
   `GET <callbackPath>` where `callbackPath` is parsed from
   `GOOGLE_REDIRECT_URI` so it always matches what's registered in
   Google Cloud Console. The callback verifies state (CSRF), exchanges
   the code, decodes the id_token (no JWKS verification yet — Week-2/3
   hardening), then runs find-or-create:
     - Match by `users.google_id` → log in.
     - Else if `email_verified=true` and email matches an existing user
       → LINK (set google_id) and log in.
     - Else create a new user with a Scrypt-of-random-bytes placeholder
       password (so legacy bcrypt password-login is impossible until
       reset). `users.phone_number` and `users.address` were dropped to
       NULLABLE in this task to support Google users who haven't filled
       in a profile.
     - Unverified Google emails are REJECTED (never linked) to prevent
       account-takeover via gmail-forwarding tricks.
   On success, mints BOTH the new Lucia `cx_session` cookie AND the
   legacy `cuci_auth_token` JWT cookie — the latter bridges the existing
   `useAuth` hook so checkout/CRM/admin flows recognise the Google user
   without any frontend rewiring. Then 302s to a same-origin path with
   `?google_oauth=ok` appended (taken from the validated `return_to`
   cookie if set, else `/`). `isSafeReturnTo` strictly rejects
   `//evil.com`, `https://evil.com`, protocol-relative URLs, control
   chars, and paths > 256 chars. Every start / success / failure writes
   to `audit_log` with the resolved `returnTo` in metadata. UI surface:
   a "Continue with Google" button at the top of the Pay&Que Secure
   Checkout `Login / Register` modal (`PaymentCheckout.tsx`); on return
   the modal auto-closes, fires a toast, and strips the marker from the
   URL. Boot-time `loadGoogleOAuthConfig()` validates the three env
   vars together — partial config refuses to boot. If no Google env
   vars are set at all, the route returns 503 instead. Production
   prereq: `app.set("trust proxy", 1)` is set in `server/index.ts` so
   `secure: true` cookies stick behind Replit's HTTPS reverse proxy and
   `req.ip` records real client IPs in `audit_log`.

5. **Staff password auth** (`server/auth/staff.ts`,
   `server/auth/staffLucia.ts`) — Task 1.6. A SECOND Lucia instance
   (`staffLucia`, cookie `cx_staff_session`, 12h TTL) backed by its own
   `StaffSessionAdapter` scoped to `auth_sessions.user_type='staff'`
   and joined against the `staff` table. Independent of customer auth,
   so a person can be signed in as both a customer (personal account)
   and a staff member (POS terminal) on the same browser without one
   kicking the other out. `loginStaff()` is the single entry point:
   constant-time hash compare even on unknown emails (no email-
   enumeration via timing), in-memory lockout (5 failed attempts in
   15 min → 423 Locked, even a correct password during the lockout
   window is rejected), inactive accounts return `account_inactive`
   without consuming attempts. `MIN_PASSWORD_LENGTH=12`. HTTP surface:
   `POST /api/auth/staff/login`, `POST /api/auth/staff/logout`,
   `GET /api/auth/staff/whoami`. Middleware: `attachStaffSession` runs
   globally (sets `req.staff`); `requireStaff` and
   `requireStaffRole(...roles)` gate endpoints. CLI seeder for the
   first owner: `STAFF_SEED_PASSWORD='...' tsx scripts/seed-staff.ts
   <email> <name> <role> [branch_id]` (roles:
   owner|manager|lane|cashier; password from env so it doesn't land in
   shell history). Every create/login_success/login_failed/login_locked/
   login_inactive/logout writes to `audit_log` (entity_type='staff';
   actor_type='staff' on success, 'system' on failure). E2E verified:
   happy login, wrong-password, 5-attempt lockout, locked-state rejects
   correct password, logout invalidates session. Orphan packages
   `passport` and `passport-local` removed in the same pass (never used).

   `/admin` rewire (Task 1.6 follow-up — done): the page now uses
   `useStaffAuth` (calls `/api/auth/staff/login|logout|whoami`) instead
   of the old `useAuth.legacyLogin` hardcoded-password gate. The
   hardcoded `Buy20sell26!!` value AND the `legacyLogin` helper were
   deleted from `client/src/hooks/useAuth.tsx`. `AdminLogin.tsx` is now
   an email + password form with proper error toasts (invalid /
   account_locked / account_inactive / network), and the dashboard
   header shows the signed-in staff name + role. Crucially, the same
   pass added the **server-side** lock that was missing the whole time:
   `/api/admin/collaborations` (GET + PATCH) and
   `/api/admin/subscriptions` (GET) are now wrapped with
   `requireStaff` + `requireStaffRole('owner','manager')`. Verified
   E2E: unauth → 401 (was wide open before), owner cookie → 200,
   cashier cookie → 403.

6. **POS customer + vehicle linkage** (Phase 1 of POS_CX feature port,
   2026-05-04) — A new `customers` table for walk-ins (phone-keyed, no
   login, optional FK to `users` when they later self-register on the
   trunk app). The existing `cars` table now also holds orphan +
   walk-in vehicles: `user_id`/`brand`/`model`/`type` were relaxed to
   NULL, plus new columns `customer_id` (FK customers), `color`,
   `last_seen_at`. `orders.vehicle_id` now FK-links each wash to the
   washed car. Lookup uses a non-unique functional index on
   `UPPER(REGEXP_REPLACE(license_plate,'\s+','','g'))` — production has
   17 duplicate normalised plates we can't UNIQUE without a separate
   dedup pass. **Trunk-user immutability:** the POS surface NEVER
   overwrites a non-null `cars.user_id`; trunk vehicle ownership is
   read-only from the cashier flow.
   New endpoints (all `requireStaff`-gated):
   `GET /api/pos/customers/lookup?phone=`,
   `POST /api/pos/customers` (upsert by phone),
   `GET /api/pos/vehicles/search?q=` (debounced plate autocomplete),
   `GET /api/pos/vehicles/:id/history` (visit count, total spent,
   favourite branch, last 10 orders),
   `POST /api/pos/vehicles` (upsert by normalised plate). Existing
   `POST /api/pos/orders` extended to accept optional `vehicle_id`,
   `customer_phone`, `customer_name`; resolves/upserts vehicle +
   customer atomically and writes `orders.vehicle_id` +
   `orders.customer_name_walkin`. POS UI (`client/src/pages/pos.tsx`)
   now has live plate autocomplete with a 200ms debounce, a matched-
   vehicle pill showing prior visits + favourite branch + last wash, and
   an optional "+ Add customer info" form. Migration:
   `migrations/manual/2026-05-04_01_pos_customers_vehicles.sql`,
   applied to both staging and prod (559 cars + 508 users untouched).

## External Dependencies

- **UI/Styling**: Radix UI, Tailwind CSS, Framer Motion, Lucide React (icons).
- **Database**: PostgreSQL, Drizzle ORM, Zod (runtime validation), @neondatabase/serverless (serverless PostgreSQL driver).
- **Development/Build**: TypeScript, Vite, ESBuild, PostCSS.
- **APIs/Services**: Google Reviews API, Google Maps API, Pocket Pay (payment gateway), ImprovMX (email forwarding for collaboration form).