---
name: OTP purpose DB constraint drift
description: "Could not send code" on a working OTP flow usually means a new purpose isn't in the otp_codes CHECK constraint.
---

# OTP purpose DB constraint drift

`server/auth/otp.ts` defines `ALLOWED_PURPOSES` (app-side allow-list, e.g.
login, verify_phone, verify_email, profile_update). The `otp_codes` table also
has a DB CHECK constraint `otp_codes_purpose_check` listing the same values.
These two lists drift independently.

**Symptom:** a customer flow (e.g. Edit Profile → "Continue") shows
"Could not send code / Please try again in a moment." Logs show
`new row for relation "otp_codes" violates check constraint
"otp_codes_purpose_check"` thrown from `sendOtp`'s INSERT.

**Why:** the code started passing a purpose value the DB constraint rejects;
the INSERT fails so sendOtp errors and the client surfaces a generic send
failure (NOT a deliverability problem).

**How to apply:** when adding a value to `ALLOWED_PURPOSES`, also add it to
`otp_codes_purpose_check` via an idempotent raw migration (DROP CONSTRAINT IF
EXISTS then ADD with the full ARRAY) applied to BOTH $DATABASE_URL and
$STAGING_DATABASE_URL — db:push is blocked. Dev `DATABASE_URL` is the live
prod DB, so applying there fixes production with no redeploy.
