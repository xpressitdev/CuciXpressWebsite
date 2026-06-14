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
