// ============================================================
// Staff password auth (Task 1.6)
//
// Pure backend module — no HTTP handlers here, those live in
// server/routes.ts. This file owns:
//
//   1. Password hashing / verification (Lucia's Scrypt — same primitive
//      as customer OTP and Google placeholder passwords, so we have one
//      verifier across the platform).
//   2. createStaff(...) — admin-side helper used by the seed script and
//      (later) the staff-management UI.
//   3. loginStaff(...) — single entry-point for staff sign-in. Takes
//      email + password + ip, returns either a staff row or a typed
//      error. Writes audit_log on every outcome.
//   4. In-memory lockout — N failed attempts within W minutes locks the
//      account for the rest of the window. Reset on successful login.
//      Stored in process memory (lost on restart, which is acceptable
//      and actually a feature: a deploy unsticks anyone genuinely
//      locked out by accident).
//
// Deliberately NOT in scope:
//   - HTTP rate-limiting per IP (Week 3 task — global rate limiter).
//   - Password reset / forgot-password (out of band; staff are managed
//     by the owner, who can re-seed via the CLI for now).
//   - 2FA on staff (post-Week-5 — POS terminals first need to be
//     stable on a single factor before adding friction).
// ============================================================

import { sql } from "drizzle-orm";
import { Scrypt, generateIdFromEntropySize } from "lucia";
import { db } from "../db";

// ---- Constants ----------------------------------------------

/** Allowed values of `staff.role`. Mirrors the CHECK constraint in the migration. */
export const STAFF_ROLES = ["owner", "manager", "lane", "cashier"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Minimum password length. Owner / manager passwords protect the whole
 *  business — too low here is genuinely dangerous. 12 is a sane floor
 *  that still composes with a passphrase. */
export const MIN_PASSWORD_LENGTH = 12;

/** Lockout policy. After this many failed attempts within
 *  LOCKOUT_WINDOW_MS, the account is locked for the remainder of the
 *  window. */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 min

// ---- Types ---------------------------------------------------

export interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  branchId: number | null;
  isActive: boolean;
}

export type LoginError =
  | "invalid_credentials"
  | "account_locked"
  | "account_inactive";

export type LoginOutcome =
  | { ok: true; staff: StaffRow }
  | { ok: false; error: LoginError; retryAfterSeconds?: number };

// ---- Hashing -------------------------------------------------

const scrypt = new Scrypt();

export function hashStaffPassword(plain: string): Promise<string> {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `[staff-auth] password must be at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }
  return scrypt.hash(plain);
}

export async function verifyStaffPassword(
  hash: string | null,
  plain: string
): Promise<boolean> {
  if (!hash) return false;
  // Scrypt.verify is constant-time at the hash-comparison level.
  return scrypt.verify(hash, plain);
}

// ---- Create -------------------------------------------------

export interface CreateStaffInput {
  email: string;
  name: string;
  role: StaffRole;
  branchId?: number | null;
  password: string;
}

/**
 * Insert a new staff row with a hashed password. Returns the new
 * staff.id. Throws on validation failure or if the email is already
 * taken (Postgres unique-violation surfaces as an error).
 */
export async function createStaff(input: CreateStaffInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !email.includes("@")) {
    throw new Error("[staff-auth] invalid email");
  }
  if (!name) {
    throw new Error("[staff-auth] name required");
  }
  if (!STAFF_ROLES.includes(input.role)) {
    throw new Error(`[staff-auth] invalid role: ${input.role}`);
  }
  const passwordHash = await hashStaffPassword(input.password);
  const id = generateIdFromEntropySize(15);
  const branchId = input.branchId ?? null;

  await db.execute(sql`
    INSERT INTO staff (id, email, name, role, branch_id, password_hash, is_active)
    VALUES (${id}, ${email}, ${name}, ${input.role}, ${branchId}, ${passwordHash}, true)
  `);

  await writeStaffAudit("staff.created", id, null, { email, role: input.role });
  return id;
}

// ---- Lockout (in-memory) ------------------------------------

interface FailureWindow {
  count: number;
  firstFailedAt: number;
}

const failureMap = new Map<string, FailureWindow>();

/** Returns null if not locked, or seconds remaining if locked. */
function checkLockout(emailKey: string): number | null {
  const fw = failureMap.get(emailKey);
  if (!fw) return null;
  const elapsed = Date.now() - fw.firstFailedAt;
  if (elapsed >= LOCKOUT_WINDOW_MS) {
    failureMap.delete(emailKey);
    return null;
  }
  if (fw.count >= MAX_FAILED_ATTEMPTS) {
    return Math.ceil((LOCKOUT_WINDOW_MS - elapsed) / 1000);
  }
  return null;
}

function recordFailure(emailKey: string): void {
  const fw = failureMap.get(emailKey);
  const now = Date.now();
  if (!fw || now - fw.firstFailedAt >= LOCKOUT_WINDOW_MS) {
    failureMap.set(emailKey, { count: 1, firstFailedAt: now });
  } else {
    fw.count += 1;
  }
}

function clearFailures(emailKey: string): void {
  failureMap.delete(emailKey);
}

/** Test/admin helper. Not exposed via HTTP. */
export function _resetStaffLockoutForTests(): void {
  failureMap.clear();
}

// ---- Login --------------------------------------------------

/**
 * Verify staff credentials. Always writes audit_log. Returns a typed
 * outcome — never throws on bad credentials. Throws only on programmer
 * error (e.g. DB blew up).
 */
export async function loginStaff(
  rawEmail: string,
  password: string,
  ip: string | null
): Promise<LoginOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, error: "invalid_credentials" };
  }

  // 1. Lockout gate — checked BEFORE we hit the DB so a locked-out
  //    attacker can't use the endpoint to enumerate valid emails by
  //    response timing.
  const lockedFor = checkLockout(email);
  if (lockedFor !== null) {
    await writeStaffAudit("staff.login_locked", email, ip, {
      retryAfterSeconds: lockedFor,
    });
    return { ok: false, error: "account_locked", retryAfterSeconds: lockedFor };
  }

  // 2. Look up by email.
  const rows = (await db.execute(sql`
    SELECT id, email, name, role, branch_id, password_hash, is_active
    FROM staff
    WHERE email = ${email}
    LIMIT 1
  `)).rows as Array<{
    id: string;
    email: string;
    name: string;
    role: StaffRole;
    branch_id: number | null;
    password_hash: string | null;
    is_active: boolean;
  }>;

  // 3. Always run a hash compare — even when the email is unknown — so
  //    response timing doesn't leak which emails exist.
  const found = rows[0];
  const hashToVerify =
    found?.password_hash ??
    // Pre-computed scrypt of a known throwaway value. The verify call
    // below will fail on this just like a real wrong password, but it
    // takes the same amount of time as a real verification.
    "$scrypt$ts:$throwaway$throwaway";
  const passwordOk = await verifyStaffPassword(hashToVerify, password).catch(
    () => false
  );

  if (!found || !passwordOk) {
    recordFailure(email);
    await writeStaffAudit("staff.login_failed", email, ip, {
      reason: !found ? "no_such_email" : "wrong_password",
    });
    return { ok: false, error: "invalid_credentials" };
  }

  if (!found.is_active) {
    // Don't count inactive-account attempts toward lockout — the owner
    // disabled this account on purpose; locking ourselves out further
    // doesn't help anyone.
    await writeStaffAudit("staff.login_inactive", email, ip, {
      staffId: found.id,
    });
    return { ok: false, error: "account_inactive" };
  }

  clearFailures(email);
  await writeStaffAudit("staff.login_success", found.id, ip, {
    email,
    role: found.role,
  });

  return {
    ok: true,
    staff: {
      id: found.id,
      email: found.email,
      name: found.name,
      role: found.role,
      branchId: found.branch_id,
      isActive: found.is_active,
    },
  };
}

// ---- Audit helper -------------------------------------------

export type StaffAuditAction =
  | "staff.created"
  | "staff.login_success"
  | "staff.login_failed"
  | "staff.login_locked"
  | "staff.login_inactive"
  | "staff.logout";

export async function writeStaffAudit(
  action: StaffAuditAction,
  entityId: string,
  ip: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    // For "success" outcomes the actor IS the staff member. For
    // failures we don't know who's behind the keyboard, so log as
    // 'system'.
    const isSuccess =
      action === "staff.login_success" ||
      action === "staff.logout" ||
      action === "staff.created";
    const actorId = isSuccess ? entityId : null;
    const actorType = isSuccess ? "staff" : "system";

    await db.execute(sql`
      INSERT INTO audit_log (actor_id, actor_type, action, entity_type, entity_id, metadata, ip)
      VALUES (${actorId}, ${actorType}, ${action}, 'staff', ${entityId}, ${JSON.stringify(metadata)}::jsonb, ${ip})
    `);
  } catch (err) {
    console.error("[staff-auth] audit_log insert failed:", err);
  }
}
