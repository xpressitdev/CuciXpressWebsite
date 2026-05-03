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

   **Follow-up same day (`2026-05-04_02_dedup_cars_plate_unique.sql`):**
   Owner approved "Option 1: most recent owner wins". Deduped the 16
   duplicate normalised-plate groups in prod — 10 were real-customer-vs-
   shop-account collisions (real customer wins), 6 were two real
   customers (kept the most recently registered car row, i.e. effectively
   "the current owner"), and BAT4455 was the owner's own test data.
   17 loser rows deleted, 0 orders affected (vehicle_id only just landed
   earlier the same day). Replaced the non-unique functional index with
   a UNIQUE one (`cars_plate_normalized_unique`). Going forward the DB
   itself guarantees no two cars share a normalised plate, which lets
   the cashier flow trust plate as the canonical vehicle identifier.
   Cars total: 559 → 542.

   **Phase 2 prep (`2026-05-04_03_flat_pricing.sql`):** Cuci Xpress
   prices are uniform across vehicle sizes (owner-confirmed). Replaced
   the `(package × vehicle_size × branch)` pricing matrix with a single
   `packages.price_cents` column (BND); dropped the `package_pricing`
   table; seeded the 4 canonical packages: Basic Wash B$8, Basic +
   Tyre Shine B$9, Basic + Spray Wax B$11, Basic + Tyre Shine + Spray
   Wax B$12. Ripped the vehicle-size selector out of the POS UI, the
   `vehicle_size` field out of the order-create schema, and the
   `VehicleSize`/`SIZE_LABELS` plumbing out of the codebase. 0 orders
   in prod, so no historical data was at risk; `orders` never had a
   `vehicle_size` column to begin with.

## External Dependencies

- **UI/Styling**: Radix UI, Tailwind CSS, Framer Motion, Lucide React (icons).
- **Database**: PostgreSQL, Drizzle ORM, Zod (runtime validation), @neondatabase/serverless (serverless PostgreSQL driver).
- **Development/Build**: TypeScript, Vite, ESBuild, PostCSS.
- **APIs/Services**: Google Reviews API, Google Maps API, Pocket Pay (payment gateway), ImprovMX (email forwarding for collaboration form).
   **Phase 2 — wash-pack memberships (`2026-05-04_04_memberships.sql`):**
   Replaced the unused `subscriptions` stub with a real prepaid wash-
   pack model: a customer buys N washes up front and the cashier
   redeems them at the POS over time. New tables `memberships` (pack
   itself, with `customer_id`, optional `vehicle_id` pin, `total_washes`,
   `remaining_washes`, `price_cents`, status, expiry, sold-by-who/where
   audit) and `membership_redemptions` (one row per wash consumed,
   UNIQUE on `order_id` so an order can't be double-redeemed). The
   POST /api/pos/orders route was rewritten to run inside a single
   `db.transaction`: when payment_method='subscription' the txn locks
   the membership row FOR UPDATE, validates ownership + remaining +
   vehicle pin + expiry, writes the order with discount_cents=subtotal
   and total_cents=0, inserts the redemption row, and decrements
   remaining_washes (flipping status to 'exhausted' at zero). Mid-
   flow failures roll everything back — no leaked washes, no orphan
   orders. New endpoints: GET /api/pos/memberships/active (powers the
   "Wash pack: 7/10 left" pill on the POS matched-vehicle card), POST
   /api/pos/memberships (sell a pack), GET /api/pos/memberships
   (history). Cashier sees the pack balance immediately after a plate
   match resolves a customer; choosing "Subscription" payment shows a
   green discount line in the order summary and drops the total to B$0.
   Migration applied to staging and prod the same day; 0 subscriptions
   rows lost (the stub had never been populated).

   **Phase 2.1 — unlimited memberships (`2026-05-04_05_membership_kind.sql`):**
   Added a `kind` column to `memberships` (default 'pack') so the
   table also models "unlimited washes for 1 month" passes. New
   CHECK constraints: packs must have `total_washes > 0`, unlimited
   rows must have `expires_at` set. Server-side redemption flow now
   branches on kind: packs decrement and flip to 'exhausted' at zero
   as before; unlimited skips the count check and the decrement,
   relying only on `expires_at` to gate eligibility (so a single
   month-pass redeems many washes without depleting). The active-
   memberships lookup includes unlimited rows where the count would
   otherwise be zero. POS UI badge now shows "Unlimited · until 12
   Sep" for time-bound passes and "Wash pack: 7/10 left" for prepaid
   ones; the order-summary discount line label adapts to match.
   Migration applied to staging and prod the same day; 0 memberships
   rows existed at the time, so nothing to backfill.

   **Phase 3 — license plate recognition (`2026-05-04_06_lpr_attempts.sql`):**
   Added automatic plate reading at the POS. Two new buttons sit above
   the plate input — Camera (uses `capture="environment"` so mobile
   opens the back camera) and Upload (gallery/file picker). Both feed
   one handler that base64-encodes the photo and POSTs it to
   `/api/pos/lpr/recognize`, which forwards to Google Gemini 2.5 Flash
   with a Brunei-plate prompt and `responseMimeType: 'application/json'`
   for structured `{plate, confidence}` output. The server normalises
   the plate (UPPER, no whitespace), looks up `cars` for an exact
   match, and returns the matched vehicle if any. POS auto-picks
   the vehicle on match (plate + customer prefill, vehicle history +
   membership badge load), or just fills the plate text on a new car.
   Staff can always edit/clear afterwards — autofill never locks them
   in. Fails soft: Gemini errors return 503 `lpr_unavailable` and the
   cashier keeps typing by hand; no order flow ever blocks on LPR.
   New table `lpr_attempts` logs every call (image bytes + raw Gemini
   response + matched vehicle) for 30 days so the owner can audit
   false positives; retention is enforced by a lazy DELETE sweep on
   each call (same pattern as Phase 2.1's expiry sweep — no cron).
   Body parser limit bumped to 10mb in server/index.ts to fit ~3-6mb
   base64 photos. Branch authorisation matches POST /api/pos/orders.
   Required new env: `GEMINI_API_KEY` (any tier works, paid recommended
   for higher quota). Migration applied to staging and prod 2026-05-04.

   **Phase 4 — full-order refunds (`2026-05-04_07_order_refunds.sql`):**
   Added a refund flow on the POS Today feed. Owner decisions: any
   staff can refund (no manager PIN gate), full order only (no
   partials), and subscription/membership refunds DO NOT credit the
   wash back to the pack — the redemption stays consumed and only
   the order line is voided for reporting. `orders` gains three
   columns: `refunded_at`, `refunded_by_staff_id` (FK to staff),
   `refund_reason` (optional free-text). `orders_status_check` was
   replaced to allow a new 'refunded' status value, and a paired
   `orders_refund_fields_consistent` CHECK ensures the refund audit
   columns are populated together when status='refunded' and NULL
   otherwise. New endpoint POST /api/pos/orders/:id/refund runs in
   a txn with FOR UPDATE so two cashiers can't double-refund the
   same row; lane/cashier accounts are limited to their own branch
   (mirrors POST /api/pos/orders). Each row in the POS Today feed
   gets a small "Refund" button; after refund the row shows the
   ticket code with strike-through, the total in red prefixed with
   "−", a "Refunded" destructive badge, and the reason underneath
   if provided. Confirm + reason flow uses the browser confirm/
   prompt for v1 — Phase 7 visual refresh will replace with a
   proper modal. Migration applied to staging and prod 2026-05-04.

   **Phase 5a — Owner Dashboard + Order Report + bulk Excel export (no migration):**
   Two new admin endpoints over the existing tables:
   `GET /api/admin/dashboard` returns 12 KPI tiles (today's
   transactions, sales, avg, items sold, refund count, total
   refunds, avg refund, net sales, active staff today, active
   customers today, total staff, total customers — owner skipped
   cost/profit since packages have no cost field) plus a 24-hour
   sales/refund array for the hourly chart. `GET /api/admin/reports/
   orders` returns filtered (branch, date range, payment method,
   staff, free-text search) paginated orders with totals. All time
   math runs in Asia/Brunei (UTC+8). Both endpoints are owner/
   manager only via requireStaffRole. The existing `/admin` page
   gained two new tabs at the top — Dashboard (default) and Order
   Report — alongside the original Collaborations and Subscriptions
   tabs. Dashboard tiles are tinted in the KedaiPOS pill style
   (green/blue/violet/pink/amber); the hourly chart uses recharts
   with a sky-blue sales area and red refund overlay. Order Report
   uses a 6-field filter grid + summary tiles + a paginated
   table; refunded rows render strike-through ticket / negative red
   total / Refunded badge to match the POS feed treatment. Also
   fixed a Phase 4 leftover: `refundOrder` mutation in `pos.tsx`
   was casting the raw Response to the parsed shape; it now does
   `await res.json()` so the success toast actually reads
   `data.order.ticket_code`.

   **Branch-scoped packages (2026-05-04_08).** New `package_branches` join table (composite PK on package_id, branch_id) lets the owner restrict a package to specific branches — e.g. Interior Cleaning is now Tungku-only. Empty assignment = available everywhere (backward-compatible default for the 7 existing packages). Admin package list returns `branch_ids` per row, the edit dialog shows All-branches vs specific-branch checkboxes, and `/api/pos/catalog` accepts `?branch_id=X` so a cashier at Mata-Mata never sees the Tungku-only package. Add-ons remain global. New `GET /api/admin/branches` helper for the dialog.

   **Phase 5c — Catalog management: Packages + Add-ons (originally no migration).** Owner-only CRUD endpoints over the existing `packages` and `addons_catalog` tables (`/api/admin/catalog/packages`, `/api/admin/catalog/addons`, both supporting list / create / update / soft-delete / `?force=1` hard-delete with in-use guard). Surfaced as a new Catalog tab with two stacked sections and inline edit dialogs. Each row shows live usage count (orders that reference the package_id, or that include the add-on in their snapshot jsonb), so the owner sees what is safe to hard-delete vs needs deactivation. Promo codes intentionally skipped this phase per owner direction. Tab strip widened to 7 columns on desktop. Non-owners see a read-only view with an amber banner.

   **Phase 5b — Payment Methods + Best Selling reports (no migration).** Two new admin endpoints — `GET /api/admin/reports/payment-methods` returns sales/refund/share by payment_method × qr_provider for the date range; `GET /api/admin/reports/best-selling` returns the top N (default 25, capped 100) package + addon line-items by quantity, with revenue and revenue-share. Each order contributes 1 package row plus one row per addon unwrapped from the `orders.addons` jsonb snapshot; package revenue = total minus addon snapshot prices so package + addons sum back to the order total. Both surfaced as new tabs (Payment Methods, Best Selling) alongside Dashboard and Order Report. Tab strip widened to 6 columns on desktop.

   **Phase 5a addendum — Power BI export.** New
   `GET /api/admin/reports/orders/export` endpoint streams an
   `.xlsx` matching the 25-column "Master Sales Data" layout the
   owner already uses for Power BI (Source.Name, ID, Receipt Date,
   Receipt Time, Store Name, POS Name, Employee Name, Is Refund,
   Original Receipt No, Order Number, Customer Name, Payment Type,
   Subtotal, Discount Total, Promocode Discount Total, Service
   Charge Total, Tax Total, Order Total, Paid Amount, Change, Order
   Notes, Item Notes, Extracted_Brand, Extracted_Model, License_
   Plate). Same filters as the Order Report. Receipt Date/Time are
   Excel serials in Asia/Brunei. Payment methods are remapped to
   KedaiPOS labels so dashboards keep working unchanged. Hard-capped
   at 100,000 rows per export (413 + JSON hint when exceeded).
   Surfaced as an "Export to Excel" button on the Order Report tab.

   **Phase 6 (in progress) — Public Live Queue.** New `GET /api/queue/snapshot` (no auth) aggregates today's orders across all 5 branches into per-branch `washing[]`, `queued[]`, `today_total`, and `est_wait_minutes` (= queued × 8 min, simple v1 heuristic). Polled every 15s by both:
   - `/queue` page (`client/src/pages/queue.tsx`) — branch picker on the left, KPI tiles + live wash-lane visualization for the selected branch (cars rendered as cards from ENTRY → EXIT, washing cars highlighted in cuci-primary).
   - `<LiveQueueWidget>` on the home page, sandwiched between Hero and Stats — compact card with per-branch wait bars, "today · N washed" pill, and a "Shortest wait" suggestion linking to `/queue`.
   
   The Navigation "Live-Queue" pill (desktop + mobile) was switched from the external `cuci-xpress.com` link to the internal `/queue` route. Functional version only — visual revamp deferred to Phase 7 along with the rest of the landing redesign.

   **Phase 6B — Customer phone-OTP login + dashboard.** Shipped:
   - `POST /api/auth/customer/login/start` (sends 6-digit code via existing `sendOtp(purpose='login')`; dev-mocked to console + `/tmp/last_otp.json`).
   - `POST /api/auth/customer/login/verify` — verifies the code, find-or-creates a `(users, customers)` pair (looking up by `customers.phone`, then `users.phone_number`, then synthesising a placeholder email/password the customer never sees), and mints a Lucia `cx_session` cookie.
   - Lucia-protected reads: `GET /api/customer/me`, `/api/customer/orders`, `/api/customer/memberships`, `/api/customer/cars`.
   - New `/login` page (phone → 6-digit code form) and `/dashboard` page (greeting, 3 KPI tiles for washes done / total spent / washes remaining, active memberships, saved vehicles, last 50 orders). Logout reuses the existing `/api/auth/lucia/logout`.
   - Navigation pill swaps between "Sign in" (anonymous) and "My account" (logged-in) based on `/api/auth/whoami`. "Live Queue" demoted to a regular nav link to make room.
   
   Known limitation: OTP delivery is still dev-mocked. The code is printed in the workflow log and saved to `/tmp/last_otp.json`. Wiring real WhatsApp Business API delivery is queued for the integrations phase — until then, production calls to `sendOtp` will throw rather than silently drop.

   **Phase 7 — Visual refresh (v1).** Promoted the Hero's neo-brutalist look (purple→orange wash, 2px black border, 4px offset shadow) into reusable utility classes in `client/src/index.css`: `.cuci-page-bg`, `.cuci-card`, `.cuci-card-soft`, `.cuci-kpi` (with hover lift), `.cuci-eyebrow`, `.cuci-cta` (press-down animation), `.cuci-live-dot` (pure-CSS pulsing dot). Then upgraded the three Phase 6 pages to use them: `/queue` got a network-wide KPI strip on top + redesigned branch picker + gradient lane container; `/login` got an eyebrow + bold headline + chunky 2px inputs + larger CTA; `/dashboard` got a duotone purple/orange greeting, brutalist KPI tiles, gradient membership rows, vehicle cards with hover-darken borders, and a striped order table with eyebrow header. Home (`/`) untouched — Hero already set the bar.

   **Phase 7 polish (v1.1).** Pulled chrome into the brand DNA. `Navigation` now: (a) uses the shared `.cuci-cta` style on the Sign-in / My-account pill so it matches Hero CTAs, (b) adds `whitespace-nowrap` so the pill no longer wraps to two lines on narrow viewports, (c) swaps the soft `shadow-sm` on scroll for a 2px black bottom border that ties into the brutalist language. `Footer` got: (a) a 1px purple→orange accent stripe across the very top, (b) updated copy to match the new positioning ("five branches, eight-minute washes", "120,000+ cars"), (c) the "Get in Touch" CTA upgraded to brutalist style on cuci-secondary (orange) with black text, (d) © year bumped to 2026.

   **Phase 7 polish (v1.2).** Extended the brand to the remaining surfaces. `/subscriptions` rewritten with the standard Phase 7 vocabulary: `cuci-page-bg` shell, eyebrow + duotone "Wash as much as you drive." headline, brutalist gradient waitlist card ("We're almost ready."), 2px-black email input, `cuci-cta` notify button, three brutalist KPI tiles for the "Why subscribe" trio, brutalist primary/secondary CTAs at the bottom. `AdminLogin` (shared by `/admin` and `/pos` gated states) rewritten to drop shadcn `<Card>`/`<Button>`/`<Input>` in favour of the shared brand vocabulary: page bg, eyebrow + duotone "Sign in" headline, brutalist white card with circle-bordered lock icon, 2px-black inputs, brutalist purple CTA with arrow. Single-source-of-truth — both staff entry points refresh in lockstep.

   **Phase 7 polish (v1.3).** Post-auth `/admin` and `/pos` polished without touching business logic — too big to rewrite, so targeted the high-impact spots: (a) all `min-h-screen bg-gray-50` swapped for `cuci-page-bg`; (b) `/admin` header now opens with eyebrow "Cuci Xpress · Staff console" + duotone "Admin **dashboard**" + brutalist 2px-black staff chip, logout button replaced with `cuci-cta` on white; (c) `/admin` `<TabsList>` upgraded to a brutalist white tab bar with 2px black border + 3px hard shadow; (d) `/admin` Dashboard KPI tiles now use `.cuci-kpi` (white card, 2px black border, hover-lift), eyebrow labels, value chips with 2px-black border instead of subtle ring; (e) `/pos` header upgraded to eyebrow "Cashier · Cuci Xpress" + duotone "Point of **sale**" + brutalist staff chip + brutalist End-of-Day & Logout pills; (f) `/pos` order-confirmation card rewritten as `cuci-card` with eyebrow + duotone "Order **confirmed**" headline, ticket code rendered in a gradient-backed brutalist tile, brutalist purple "New order" CTA. Tables, forms, and the tab content panels intentionally left as-is — they're functional today and a wholesale rewrite carries risk; this pass aligns the chrome instead.

   **Phase 8 — Cashier shifts (drawer reconciliation).** Each cashier now opens a "shift" with a declared cash float, takes orders against it, and closes the shift at end of day with a counted-cash declaration. The system then computes `expected_cash = float + cash_sales − cash_refunds` and surfaces `variance = counted − expected` so over/short is caught immediately rather than at month-end.

   Migration `2026-05-04_09_cashier_shifts.sql` (applied) creates the `cashier_shifts` table with a `BIGSERIAL` id, FKs to `branches` + `staff` (open + close), opening float, closing counted/expected/variance (all NULL while open, all NOT NULL after close — enforced by a CHECK), opening + closing notes, and `status ∈ {open, closed}`. A partial unique index `(opened_by_staff_id) WHERE status='open'` enforces "one open shift per staff" at the DB level. `orders.shift_id BIGINT REFERENCES cashier_shifts(id)` (nullable) was added so legacy and shift-less orders still validate. Indexes: `idx_cashier_shifts_branch_opened`, `idx_cashier_shifts_staff_opened`, `idx_orders_shift_id`.

   `shared/schema.ts` extended with the `cashierShifts` `pgTable`, `insertCashierShiftSchema`, and `CashierShift` / `InsertCashierShift` types.

   Backend (`server/routes.ts`):
   - `POST /api/pos/shifts/open` — opens a drawer; lane/cashier locked to their `branchId`, owner/manager picks the branch. Concurrent open returns 409 `shift_already_open` via a 23505 catch.
   - `GET /api/pos/shifts/current` — returns the staff's open shift plus running totals (per-payment-method breakdown, cash sales, cash refunds, expected cash). Polled every 30s by the POS pill.
   - `POST /api/pos/shifts/close` — `FOR UPDATE` lock on the open row, computes expected + variance via the shared `computeShiftTotals()` helper, persists everything for audit.
   - Order INSERT (`POST /api/pos/orders`) gained a "step 6.5" lookup: it finds the staff's open shift at the effective branch and stamps `orders.shift_id`. Best-effort — orders without an open shift still go through.
   - `GET /api/admin/shifts` + `GET /api/admin/shifts/:id` (owner/manager only) for review. List supports filters: `branch_id`, `staff_id`, `status`, `from`, `to`.

   Frontend:
   - New `client/src/components/ShiftBar.tsx` — self-contained pill + open-modal + close-modal widget. When no shift is open, shows an amber brutalist "Open shift" CTA → modal with float input + optional note. When a shift is open, shows a green-dot pill `Shift open · Float B$X · Hh Mm` → close modal with full per-payment breakdown, expected-cash math (float + cash sales − cash refunds), counted-cash input with live variance preview, and balanced/over/short toast on close.
   - `client/src/pages/pos.tsx` — slotted `<ShiftBar />` into the header. Renamed the deep-link from "End-of-Day" to "Reports" since shift close is now the proper end-of-day action.
   - `client/src/pages/admin.tsx` — new "Shifts" tab (manager + owner) with filterable list (status / branch / date range) and a sticky right-rail detail panel showing per-payment breakdown, the full expected/counted/variance math, and any notes. Variance is highlighted red with an alert icon when non-zero.
