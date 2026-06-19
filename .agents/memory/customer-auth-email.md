---
name: Customer auth identity & email changes
description: Where customer login email lives, why "no OTP arrived" is usually a wrong/unregistered email, and the safe way to change a customer's email.
---

# Customer auth identity & email changes

- **Customer login identity = `users.email`.** The `customers` table is phone-keyed (no email column); it links to `users` via `customers.user_id`. Email/phone lookup for auth goes through `findCustomerByIdentifier` → `users`.
- **Sign-in / register "start" only send an OTP when the account already exists.** Unknown identifier returns `{ ok: true }` silently (anti-enumeration), no code generated, no `otp_codes` row. So a customer reporting "I never got a code" is *frequently a wrong or unregistered email*, NOT a delivery bug — check the `users` table (and fuzzy-match for typos) before assuming SendGrid/Gmail failed.
- **Staff login is email + password, never OTP.** If someone "didn't get a staff code", that's expected — staff don't get codes.

## Changing a customer's email — the safe rule

**Rule:** an account's login email may only be changed by (a) a logged-in staff owner/manager, or (b) the authenticated account owner via a verify-the-new-email flow. NEVER auto-merge/overwrite by a typed-in phone number during public registration.

**Why:** phone numbers are low-secret and phone OTP is not deliverable in prod (WhatsApp not integrated), so matching an existing account by typed-in phone + verifying only the *new* (attacker-controlled) email = account takeover (steals loyalty/memberships/history). Threat model explicitly flags spoofing/EoP.

## Helping returning customers without leaking

Legacy customers (imported from the live-queue app) already have accounts but keep using **Register** instead of **Sign in**; registration silently no-ops on any conflict (phone/email/plate taken) so they wait on the code screen for a code that never comes.

**Rule:** any "you already have an account, sign in" nudge must be shown **generically to everyone** (driven by UI state, not by a backend account-existence signal). Never make an on-screen message/route response differ based on whether the account exists.

**Why:** any on-screen difference conditioned on existence becomes an enumeration oracle — a stranger could fish for which emails/phones/plates are registered. The register/start endpoint is deliberately non-oracular (returns the same `ok:true` whether or not there's a conflict). The only safe place to put an existence-conditional signal is the real owner's own inbox (email_taken only, since typed addr == owner), and even that doesn't help phone/plate conflicts (checked first), so prefer the generic UI nudge.

**How to apply:** staff-side edit lives on `PATCH /api/admin/customers/:id` (gated `requireStaffRole('owner','manager')`), surfaced in the admin Customers tab edit form. It validates new email is free (case-insensitive vs other `users`), rejects customers with no `user_id` (`no_account`), and runs name/notes + email update in one `db.transaction` so it's all-or-nothing. Fits the business: customers are physically present, staff verify identity in person.

## Self-service profile edit (name/email/phone) must guard identity

**Rule:** when a customer edits their own email/phone (dashboard "Edit Profile" → `PATCH /api/customer/me`), reject any value already attached to a DIFFERENT account, and normalise phone with the SAME `normalisePhone` the sign-in flow uses before storing.

**Why:** `users.email` is DB-unique (23505 → 409), but `users.phone_number` is NOT, and phone is a login identifier (`findCustomerByIdentifier` prefers `users.phone_number ... LIMIT 1`). Letting a customer set their phone to someone else's makes phone sign-in ambiguous / enables account confusion. Storing an un-normalised phone breaks login lookup equivalence (`+673 1234567` vs `1234567`).

**How to apply:** the cross-account phone check (users.phone_number id<>self UNION customers.phone user_id IS DISTINCT FROM self) runs inside the update transaction in `storage.updateCustomerProfile`, throwing a typed conflict the route maps to 409 `field:'phone'`. Optional future hardening: a DB unique constraint on `users.phone_number` (needs dedup/backfill first).

## Onboarding a NEW customer ≠ renaming an existing account

**Rule:** to get a brand-new person logged in, **CREATE a new `users` row** for them; never repurpose an existing legacy account by overwriting its email. An existing legacy account (real email + phone + created date + 161-char legacy password) belongs to its *original* owner even if they've never logged in via OTP.

**Why:** overwriting account A's email to onboard person B hands B the original owner's account — their phone, loyalty, wash history, and active session. It also silently deletes A's only login path. (Hit this live once: renaming an existing legacy account to onboard a different new person hijacked the original owner; fix required restoring the original owner + their car and minting a fresh account for the new person.)

**How to apply:** new OTP-only account = INSERT `users` with `first_name,last_name,email,password` (NOT NULL); `phone_number` nullable; password = a 72-char placeholder (`randomUUID()+randomUUID()`, matches OTP-flow accounts — unusable, login is OTP-only). Then point the customer's car (`cars.user_id`) at the new id. Keep each person's phone with their own account. After moving identity off an account, clear stale sessions: `DELETE FROM auth_sessions WHERE user_id=<id> AND user_type='customer'`. Cars/orders carry wash history by **plate**, so history follows whichever account owns the car.
