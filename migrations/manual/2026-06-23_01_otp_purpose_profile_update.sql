-- Allow the 'profile_update' OTP purpose.
--
-- The customer "Edit Profile" flow sends a one-time code with
-- purpose = 'profile_update' (see ALLOWED_PURPOSES in server/auth/otp.ts).
-- The original otp_codes_purpose_check constraint only permitted
-- 'login', 'verify_phone', 'verify_email', so the OTP insert failed with
-- "violates check constraint otp_codes_purpose_check" and the client
-- showed "Could not send code". This realigns the DB constraint with the
-- application's allowed purposes.
--
-- Idempotent: drop-if-exists then re-add. Safe to run repeatedly and on
-- both $DATABASE_URL and $STAGING_DATABASE_URL.

ALTER TABLE otp_codes DROP CONSTRAINT IF EXISTS otp_codes_purpose_check;

ALTER TABLE otp_codes ADD CONSTRAINT otp_codes_purpose_check
  CHECK (purpose = ANY (ARRAY['login', 'verify_phone', 'verify_email', 'profile_update']));
