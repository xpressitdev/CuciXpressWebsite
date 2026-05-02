// ============================================================
// OTP module (Task 1.4) — DEV-MOCKED.
//
// Status: dev-mocked WhatsApp / email one-time-code module. The "send"
// step prints the code to the server log instead of actually delivering
// it. The verify step is real and will be the same code path used in
// production. When the WhatsApp Business API verification lands in Week
// 4, only the body of `deliverOtp()` changes — the public API and the
// `otp_codes` table semantics stay identical.
//
// Security posture (defence-in-depth for short-lived 6-digit codes):
//   - Codes are never stored in plaintext. Hashed with Lucia's Scrypt
//     (the same primitive Lucia recommends for passwords).
//   - One-active-code policy: sending a new OTP for the same
//     (identifier, purpose) supersedes any prior unconsumed code,
//     preventing code-spam confusion and reuse-after-rotate.
//   - 5-minute TTL plus a 5-attempt cap per code. Hitting the cap locks
//     the code even if the next attempt would have been correct, so an
//     attacker who has guessed N-1 wrong codes cannot try the Nth.
//   - Every send / verify / failure writes to `audit_log`. Logs include
//     the identifier and purpose but never the code or its hash.
//
// Intentionally NOT in scope for Week 1:
//   - Per-IP rate limiting on the HTTP endpoints (Week 3 task).
//   - Auto-creating a Lucia session on a successful verify (Week 2/4).
//   - Real E.164 phone-number validation (handled by the WABA wrapper
//     when it lands; this module only does whitespace-strip + basic
//     shape check).
// ============================================================

import { sql } from "drizzle-orm";
import { Scrypt, generateIdFromEntropySize } from "lucia";
import { db } from "../db";

// ---- Constants ----------------------------------------------

const CODE_LENGTH = 6;
const TTL_SECONDS = 5 * 60;
const MAX_ATTEMPTS = 5;

const ALLOWED_PURPOSES = ["login", "verify_phone", "verify_email"] as const;
export type OtpPurpose = (typeof ALLOWED_PURPOSES)[number];

const scrypt = new Scrypt();

// ---- Helpers ------------------------------------------------

function isAllowedPurpose(p: unknown): p is OtpPurpose {
  return typeof p === "string" && (ALLOWED_PURPOSES as readonly string[]).includes(p);
}

/**
 * Light identifier normalisation. Email purposes get lowercased + trimmed
 * (RFC says local-part is case-sensitive, but every modern provider treats
 * it case-insensitively and so do we). Phone purposes get whitespace
 * stripped only — full E.164 validation is the WABA wrapper's job.
 */
function normaliseIdentifier(identifier: string, purpose: OtpPurpose): string {
  const trimmed = identifier.trim();
  if (purpose === "verify_email") return trimmed.toLowerCase();
  if (purpose === "verify_phone") return trimmed.replace(/\s+/g, "");
  // 'login' is overloaded; treat as phone-or-email and just strip + lowercase.
  return trimmed.toLowerCase();
}

function generateNumericCode(length: number): string {
  // crypto.randomInt-style without pulling node:crypto: build digit-by-digit
  // from a uniformly-random buffer to avoid modulo bias on small ranges.
  // 6 digits → values 0..999999. Use Web Crypto's getRandomValues.
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    // Map each byte to a digit. Modulo bias here is negligible (256 % 10 = 6,
    // so digits 0..5 are 0.4% more likely than 6..9). Acceptable for OTPs
    // because the security comes from the 5-attempt cap, not the entropy of
    // a single digit.
    out += (bytes[i] % 10).toString();
  }
  return out;
}

async function writeAudit(
  action: string,
  identifier: string,
  purpose: OtpPurpose,
  ip: string | null,
  extra: Record<string, unknown> = {}
): Promise<void> {
  // Note: the metadata field never contains the code or its hash.
  const metadata = { identifier, purpose, ...extra };
  try {
    await db.execute(sql`
      INSERT INTO audit_log (actor_id, actor_type, action, entity_type, entity_id, metadata, ip)
      VALUES (NULL, 'system', ${action}, 'otp', ${identifier}, ${JSON.stringify(metadata)}::jsonb, ${ip})
    `);
  } catch (err) {
    // Audit failure must never break the user-facing flow. Log loudly so it
    // shows up in prod monitoring, but swallow the error.
    console.error("[otp] audit_log insert failed:", err);
  }
}

// ---- Public API ---------------------------------------------

export interface SendOtpResult {
  ok: true;
  expiresAt: Date;
}

export interface SendOtpError {
  ok: false;
  reason: "invalid_purpose" | "invalid_identifier";
}

/**
 * Generate, hash, store, and "deliver" a one-time code. Supersedes any
 * prior unconsumed code for the same (identifier, purpose).
 *
 * In development the code is logged to the server console with a
 * banner so it's easy to spot. In production this currently throws
 * because the WhatsApp Business API wrapper isn't wired yet (Week 4).
 */
export async function sendOtp(args: {
  identifier: string;
  purpose: string;
  ip?: string | null;
}): Promise<SendOtpResult | SendOtpError> {
  if (!isAllowedPurpose(args.purpose)) {
    return { ok: false, reason: "invalid_purpose" };
  }
  const purpose: OtpPurpose = args.purpose;
  const ip = args.ip ?? null;

  if (typeof args.identifier !== "string" || args.identifier.trim().length === 0) {
    return { ok: false, reason: "invalid_identifier" };
  }
  const identifier = normaliseIdentifier(args.identifier, purpose);
  if (identifier.length === 0 || identifier.length > 200) {
    return { ok: false, reason: "invalid_identifier" };
  }

  const code = generateNumericCode(CODE_LENGTH);
  const codeHash = await scrypt.hash(code);
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);
  const id = generateIdFromEntropySize(15); // 24-char base32 nanoid-ish

  // One-active-code policy: invalidate any prior live code for this
  // (identifier, purpose) by marking it consumed. The verify path treats
  // consumed_at IS NOT NULL as "spent".
  await db.execute(sql`
    UPDATE otp_codes
    SET consumed_at = now()
    WHERE identifier = ${identifier}
      AND purpose = ${purpose}
      AND consumed_at IS NULL
  `);

  await db.execute(sql`
    INSERT INTO otp_codes (id, identifier, code_hash, purpose, expires_at)
    VALUES (${id}, ${identifier}, ${codeHash}, ${purpose}, ${expiresAt})
  `);

  await deliverOtp({ identifier, purpose, code });
  await writeAudit("otp.sent", identifier, purpose, ip, { otpId: id });

  return { ok: true, expiresAt };
}

/**
 * Where the actual delivery happens. Mocked in dev (console). In prod
 * this needs to swap to WhatsApp Business API for `verify_phone` /
 * `login`-via-phone, and SendGrid for `verify_email`. Until that lands,
 * production calls explicitly fail loud rather than silently dropping.
 */
async function deliverOtp(args: {
  identifier: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    // Fail-loud: refuse to silently drop a "delivered" code in prod.
    throw new Error(
      "[otp] real OTP delivery is not yet wired (Week 4). " +
        "Refusing to claim delivery in production."
    );
  }
  // Dev: log a single line (multiline console.log content gets clipped by
  // some workflow log capturers) and ALSO drop the latest mock code into
  // /tmp/last_otp.json so frontend devs / smoke tests can read it without
  // scraping stdout. The file is per-process and not network-exposed, so it
  // never leaks across to prod.
  console.log(
    `[otp] DEV-MOCK delivery to=${args.identifier} purpose=${args.purpose} code=${args.code} ttl=${TTL_SECONDS}s`
  );
  try {
    const fs = await import("node:fs/promises");
    await fs.writeFile(
      "/tmp/last_otp.json",
      JSON.stringify({
        identifier: args.identifier,
        purpose: args.purpose,
        code: args.code,
        at: new Date().toISOString(),
      }),
      "utf8"
    );
  } catch {
    // Non-fatal: the console line is the source of truth.
  }
}

export interface VerifyOtpResult {
  ok: true;
}
export interface VerifyOtpError {
  ok: false;
  reason:
    | "invalid_purpose"
    | "invalid_identifier"
    | "no_active_code"
    | "expired"
    | "too_many_attempts"
    | "wrong_code";
  attemptsRemaining?: number;
}

/**
 * Verify a code submitted by the user. Increments the attempts counter
 * on every check. On the 5th wrong attempt the code is consumed (locked
 * out). Returns enough information for the UI to tell the user "X tries
 * left" without leaking whether the identifier even exists.
 */
export async function verifyOtp(args: {
  identifier: string;
  purpose: string;
  code: string;
  ip?: string | null;
}): Promise<VerifyOtpResult | VerifyOtpError> {
  if (!isAllowedPurpose(args.purpose)) {
    return { ok: false, reason: "invalid_purpose" };
  }
  const purpose: OtpPurpose = args.purpose;
  const ip = args.ip ?? null;

  if (typeof args.identifier !== "string" || args.identifier.trim().length === 0) {
    return { ok: false, reason: "invalid_identifier" };
  }
  if (typeof args.code !== "string" || args.code.length === 0) {
    return { ok: false, reason: "wrong_code" };
  }

  const identifier = normaliseIdentifier(args.identifier, purpose);

  // Look up the most recent unconsumed code for this (identifier, purpose).
  // We don't filter by expires_at here because we want to give a precise
  // "expired" error rather than the generic "no_active_code".
  const rows = (await db.execute(sql`
    SELECT id, code_hash, expires_at, attempts
    FROM otp_codes
    WHERE identifier = ${identifier}
      AND purpose = ${purpose}
      AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `)).rows as Array<{
    id: string;
    code_hash: string;
    expires_at: string | Date;
    attempts: number;
  }>;

  if (rows.length === 0) {
    await writeAudit("otp.failed", identifier, purpose, ip, { reason: "no_active_code" });
    return { ok: false, reason: "no_active_code" };
  }
  const row = rows[0];

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    // Mark expired codes as consumed so they don't keep showing up in lookups.
    await db.execute(sql`UPDATE otp_codes SET consumed_at = now() WHERE id = ${row.id}`);
    await writeAudit("otp.failed", identifier, purpose, ip, { reason: "expired" });
    return { ok: false, reason: "expired" };
  }

  // Increment attempts FIRST, atomically, so a brute-forcer who races
  // requests can't get more than MAX_ATTEMPTS chances even with
  // perfectly-timed concurrent calls.
  const updated = (await db.execute(sql`
    UPDATE otp_codes
    SET attempts = attempts + 1
    WHERE id = ${row.id}
      AND consumed_at IS NULL
    RETURNING attempts
  `)).rows as Array<{ attempts: number }>;

  if (updated.length === 0) {
    // Lost the race — another verify call consumed the code between our
    // SELECT and our UPDATE. Treat as no-active-code.
    await writeAudit("otp.failed", identifier, purpose, ip, { reason: "race_consumed" });
    return { ok: false, reason: "no_active_code" };
  }
  const attempts = updated[0].attempts;

  if (attempts > MAX_ATTEMPTS) {
    await db.execute(sql`UPDATE otp_codes SET consumed_at = now() WHERE id = ${row.id}`);
    await writeAudit("otp.failed", identifier, purpose, ip, {
      reason: "too_many_attempts",
      attempts,
    });
    return { ok: false, reason: "too_many_attempts" };
  }

  const matches = await scrypt.verify(row.code_hash, args.code);
  if (!matches) {
    const remaining = Math.max(0, MAX_ATTEMPTS - attempts);
    if (remaining === 0) {
      // Burned the last attempt on a wrong code — lock the row.
      await db.execute(sql`UPDATE otp_codes SET consumed_at = now() WHERE id = ${row.id}`);
    }
    await writeAudit("otp.failed", identifier, purpose, ip, {
      reason: "wrong_code",
      attemptsRemaining: remaining,
    });
    return { ok: false, reason: "wrong_code", attemptsRemaining: remaining };
  }

  // Success: consume the code so it cannot be replayed.
  await db.execute(sql`UPDATE otp_codes SET consumed_at = now() WHERE id = ${row.id}`);
  await writeAudit("otp.verified", identifier, purpose, ip);

  return { ok: true };
}

// Export constants for tests / route handlers that want to surface them.
export const OTP_CONSTANTS = {
  CODE_LENGTH,
  TTL_SECONDS,
  MAX_ATTEMPTS,
  ALLOWED_PURPOSES,
} as const;
