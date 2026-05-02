// ============================================================
// scripts/seed-staff.ts (Task 1.6)
//
// Bootstrap CLI for creating the first staff account. Until we have a
// staff-management UI, this is the only way to create staff rows.
//
// Usage:
//
//   STAFF_SEED_PASSWORD='your-strong-passphrase' \
//     tsx scripts/seed-staff.ts <email> '<full name>' <role> [branch_id]
//
// Example:
//
//   STAFF_SEED_PASSWORD='correct horse battery staple plus' \
//     tsx scripts/seed-staff.ts owner@cucixpress.com 'Hakem Shahbirin' owner
//
// The password is read from the env var (never an arg) so it doesn't
// land in shell history. Roles must be one of:
//   owner | manager | lane | cashier
// ============================================================

import { createStaff, STAFF_ROLES, MIN_PASSWORD_LENGTH, type StaffRole } from "../server/auth/staff";

async function main() {
  const [email, name, roleArg, branchIdArg] = process.argv.slice(2);

  if (!email || !name || !roleArg) {
    console.error(
      "Usage: STAFF_SEED_PASSWORD=... tsx scripts/seed-staff.ts <email> <name> <role> [branch_id]"
    );
    console.error(`Roles: ${STAFF_ROLES.join(" | ")}`);
    process.exit(2);
  }

  if (!STAFF_ROLES.includes(roleArg as StaffRole)) {
    console.error(`[seed-staff] invalid role "${roleArg}". Must be one of: ${STAFF_ROLES.join(", ")}`);
    process.exit(2);
  }

  const password = process.env.STAFF_SEED_PASSWORD;
  if (!password) {
    console.error("[seed-staff] STAFF_SEED_PASSWORD env var is required.");
    process.exit(2);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`[seed-staff] password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(2);
  }

  let branchId: number | null = null;
  if (branchIdArg) {
    const parsed = Number.parseInt(branchIdArg, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      console.error(`[seed-staff] branch_id must be a positive integer, got "${branchIdArg}"`);
      process.exit(2);
    }
    branchId = parsed;
  }

  try {
    const id = await createStaff({
      email,
      name,
      role: roleArg as StaffRole,
      branchId,
      password,
    });
    console.log(`[seed-staff] created staff id=${id} email=${email} role=${roleArg}`);
    process.exit(0);
  } catch (err: any) {
    console.error(`[seed-staff] failed: ${err?.message ?? err}`);
    process.exit(1);
  }
}

main();
