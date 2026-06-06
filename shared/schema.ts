// shared/schema.ts — REPLACEMENT FOR CucumberShowcase
// Date prepared: 2026-05-02 (late night)
// Purpose: Align this project's schema with LiveQue's actual production database
//
// REVIEW CHECKLIST BEFORE APPLYING:
// [ ] Backup taken (backup_pre_schema_fix_*.sql)
// [ ] Replit Agent locked down (told to do nothing)
// [ ] Both cucixpress.com and cuci-xpress.com still load right now
// [ ] You've read each section of this file
// [ ] You've understood why each change was made (notes below)
//
// HOW TO APPLY:
// 1. Open shared/schema.ts in CucumberShowcase Replit
// 2. Replace the ENTIRE FILE contents with everything below this comment block
// 3. Save (Ctrl+S)
// 4. DO NOT run db:push yet
// 5. Tell Claude — we'll do a dry-run check before pushing
//
// ============================================================
// NOTES ON CHANGES (read this before applying)
// ============================================================
//
// Change 1: USERS table
//   - Removed `.notNull()` from is_admin, points, level
//     Why: LiveQue's actual DB has these as nullable. CucumberShowcase
//     was declaring them notNull, which would make Drizzle want to ALTER
//     these columns. Some of the 508 existing users might have null values
//     here, which would fail the alter. Safer to match reality.
//   - Added `.unique()` to email
//     Why: LiveQue's DB has this unique constraint. CucumberShowcase
//     was missing it. Drizzle was trying to add it, which is fine.
//     Adding it here so the schema explicitly declares what exists.
//
// Change 2: NEW TABLES (cars, branches, achievements, user_achievements)
//   - Added all 4 tables that exist in LiveQue's DB but were missing here
//   - Used snake_case variable names (first_name, etc.) to match this
//     project's existing convention
//   - Used the EXACT Postgres column names from LiveQue's DB
//
// Change 3: KEPT existing tables (collaboration_submissions, subscription_signups, service_history)
//   - These already exist in the database (confirmed by Agent earlier)
//   - Schema definitions kept as-is
//
// Change 4: NO CHANGE to types or insert schemas at the bottom
//   - Adding new types for the new tables
//   - Existing types preserved exactly
// ============================================================

import {
  pgTable,
  text,
  serial,
  integer,
  bigserial,
  boolean,
  timestamp,
  date,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================
// USERS — adjusted to match LiveQue's actual DB
// ============================================================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  first_name: text("first_name").notNull(),
  last_name: text("last_name").notNull(),
  email: text("email").notNull().unique(), // ← ADDED .unique() to match DB
  password: text("password").notNull(),
  // Task 1.5: phone_number / address dropped NOT NULL to support
  // Google-OAuth-only users who haven't entered a profile yet. Existing
  // 508 users all have values; the alter is non-destructive.
  phone_number: text("phone_number"),
  address: text("address"),
  is_admin: boolean("is_admin").default(false), // ← REMOVED .notNull() to match DB
  points: integer("points").default(0), // ← REMOVED .notNull() to match DB
  level: integer("level").default(1), // ← REMOVED .notNull() to match DB
  created_at: timestamp("created_at").defaultNow(),
  last_login: timestamp("last_login"),
  // Task 1.5: Google OAuth identity. Holds Google's `sub` claim. Nullable
  // because legacy users sign in by password. Unique partial index in DB
  // so multiple legacy NULLs are allowed but a `sub` can map to one user.
  google_id: text("google_id").unique(),
});

// ============================================================
// CARS — exists in LiveQue DB with 559 rows.
// Phase 1 (2026-05-04_01): relaxed user_id/brand/model/type to NULL
// so POS walk-in + LPR-orphan vehicles can be inserted, added
// customer_id (FK to new customers table), color, last_seen_at.
// ============================================================
export const cars = pgTable("cars", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
  license_plate: text("license_plate").notNull(),
  brand: text("brand"),
  model: text("model"),
  type: text("type"),
  photo_url: text("photo_url"),
  // Added 2026-05-04_01:
  customer_id: integer("customer_id"),         // FK -> customers(id), declared inline below
  color: text("color"),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }),
});

// ============================================================
// CUSTOMERS — NEW (Phase 1, 2026-05-04_01)
// Walk-in customers tracked from the POS, keyed by phone.
// Optional FK to users(id) when they later self-register on the trunk.
// ============================================================
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull(),
  user_id: integer("user_id").references(() => users.id),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

// ============================================================
// BRANCHES — NEW (was missing, exists in LiveQue DB with 5 rows)
// ============================================================
export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  queue_count: integer("queue_count").default(0),
  google_maps_url: text("google_maps_url").notNull(),
  google_maps_embed_url: text("google_maps_embed_url").notNull(),
  review_url: text("review_url").notNull(),
  last_queue_update: timestamp("last_queue_update"),
  is_open: boolean("is_open").default(true),
});

// ============================================================
// ACHIEVEMENTS — NEW (was missing, exists in LiveQue DB)
// ============================================================
export const achievements = pgTable("achievements", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  required_points: integer("required_points").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

// ============================================================
// USER_ACHIEVEMENTS — NEW (was missing, exists in LiveQue DB)
// ============================================================
export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id),
  achievement_id: integer("achievement_id").references(() => achievements.id),
  unlocked_at: timestamp("unlocked_at").defaultNow(),
});

// ============================================================
// EXISTING TABLES — UNCHANGED
// ============================================================

export const collaborationSubmissions = pgTable("collaboration_submissions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  businessType: text("business_type"),
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isRead: boolean("is_read").default(false).notNull(),
});

export const subscriptionSignups = pgTable("subscription_signups", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  isNotified: boolean("is_notified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Phase 11: subscriptions product page captures plan + phone + (optional) user_id
  plan: text("plan"),
  phone: text("phone"),
  userId: integer("user_id").references(() => users.id),
});

export const serviceHistory = pgTable("service_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  carPlate: text("car_plate").notNull(),
  phone: text("phone"),
  serviceType: text("service_type").notNull(),
  branch: text("branch").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").default("pending").notNull(),
  queuePosition: integer("queue_position"),
  paymentReference: text("payment_reference"),
  transactionId: text("transaction_id"),
  checkInTime: timestamp("check_in_time"),
  completedTime: timestamp("completed_time"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================
// ZOD SCHEMAS & TYPES
// ============================================================

// User schema — UNCHANGED
export const insertUserSchema = createInsertSchema(users)
  .pick({
    first_name: true,
    last_name: true,
    email: true,
    password: true,
    phone_number: true,
    address: true,
    is_admin: true,
    points: true,
    level: true,
  })
  .partial({ is_admin: true, points: true, level: true });

// Car schema — NEW
export const insertCarSchema = createInsertSchema(cars).omit({
  id: true,
});

// Branch schema — NEW
export const insertBranchSchema = createInsertSchema(branches).omit({
  id: true,
});

// Achievement schema — NEW
export const insertAchievementSchema = createInsertSchema(achievements).omit({
  id: true,
  created_at: true,
});

// UserAchievement schema — NEW
export const insertUserAchievementSchema = createInsertSchema(
  userAchievements,
).omit({
  id: true,
  unlocked_at: true,
});

// Existing schemas — UNCHANGED
export const insertCollaborationSubmissionSchema = createInsertSchema(
  collaborationSubmissions,
).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export const insertSubscriptionSignupSchema = createInsertSchema(
  subscriptionSignups,
).omit({
  id: true,
  createdAt: true,
  isNotified: true,
});

export const insertServiceHistorySchema = createInsertSchema(
  serviceHistory,
).omit({
  id: true,
  createdAt: true,
});

// Types — existing UNCHANGED
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCollaborationSubmission = z.infer<
  typeof insertCollaborationSubmissionSchema
>;
export type CollaborationSubmission =
  typeof collaborationSubmissions.$inferSelect;
export type InsertSubscriptionSignup = z.infer<
  typeof insertSubscriptionSignupSchema
>;
export type SubscriptionSignup = typeof subscriptionSignups.$inferSelect;
export type InsertServiceHistory = z.infer<typeof insertServiceHistorySchema>;
export type ServiceHistory = typeof serviceHistory.$inferSelect;

// Types — NEW
export type Car = typeof cars.$inferSelect;
export type InsertCar = z.infer<typeof insertCarSchema>;
export type Branch = typeof branches.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type InsertUserAchievement = z.infer<typeof insertUserAchievementSchema>;

// ============================================================
// AUTH + POS PREREQS — added 2026-05-02
// Migration: migrations/manual/2026-05-02_01_auth_and_pos_prereqs.sql
// ============================================================

// --- Staff (POS / CRM operators) -----------------------------
export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'owner' | 'manager' | 'lane' | 'cashier'
  branch_id: integer("branch_id").references(() => branches.id),
  password_hash: text("password_hash"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertStaffSchema = createInsertSchema(staff).omit({
  created_at: true,
});
export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;

// --- Auth sessions (Lucia v3) --------------------------------
// Distinct from the legacy 'session' table owned by connect-pg-simple
// in LiveQue. Do not unify.
export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  user_type: text("user_type").notNull(), // 'customer' | 'staff'
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: text("ip"),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAuthSessionSchema = createInsertSchema(authSessions).omit({
  created_at: true,
});
export type AuthSession = typeof authSessions.$inferSelect;
export type InsertAuthSession = z.infer<typeof insertAuthSessionSchema>;

// --- OTP codes -----------------------------------------------
export const otpCodes = pgTable("otp_codes", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(), // phone or email
  code_hash: text("code_hash").notNull(),   // never plaintext
  purpose: text("purpose").notNull(),       // 'login' | 'verify_phone' | 'verify_email'
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumed_at: timestamp("consumed_at", { withTimezone: true }),
  attempts: integer("attempts").default(0).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertOtpCodeSchema = createInsertSchema(otpCodes).omit({
  consumed_at: true,
  attempts: true,
  created_at: true,
});
export type OtpCode = typeof otpCodes.$inferSelect;
export type InsertOtpCode = z.infer<typeof insertOtpCodeSchema>;

// --- Audit log -----------------------------------------------
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actor_id: text("actor_id"),
  actor_type: text("actor_type"), // 'customer' | 'staff' | 'system'
  action: text("action").notNull(),
  entity_type: text("entity_type"),
  entity_id: text("entity_id"),
  metadata: jsonb("metadata").default({}).notNull(),
  ip: text("ip"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  created_at: true,
});
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// --- Lanes (per-branch wash lanes) ---------------------------
export const lanes = pgTable("lanes", {
  id: text("id").primaryKey(),
  branch_id: integer("branch_id").references(() => branches.id).notNull(),
  name: text("name").notNull(),
  position: integer("position").default(0).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});

export const insertLaneSchema = createInsertSchema(lanes);
export type Lane = typeof lanes.$inferSelect;
export type InsertLane = z.infer<typeof insertLaneSchema>;

// --- Addons catalog (POS upsells) ----------------------------
export const addonsCatalog = pgTable("addons_catalog", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  price_cents: integer("price_cents").notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
});

export const insertAddonCatalogSchema = createInsertSchema(addonsCatalog);
export type AddonCatalog = typeof addonsCatalog.$inferSelect;
export type InsertAddonCatalog = z.infer<typeof insertAddonCatalogSchema>;

// --- Packages (POS catalog) ----------------------------------
// Originally added by 2026-05-03_01_packages_and_pricing.sql.
// `price_cents` (flat, BND) added by 2026-05-04_03_flat_pricing.sql,
// which also dropped the now-redundant `package_pricing` matrix —
// Cuci Xpress prices are uniform across vehicle sizes.
export const packages = pgTable("packages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  duration_minutes: integer("duration_minutes"),
  price_cents: integer("price_cents").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  // POS Control Room (2026-06-05): optional grouping for the POS grid.
  // NULL = "Uncategorised". FK is lazy so categories may be declared later.
  category_id: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertPackageSchema = createInsertSchema(packages).omit({
  created_at: true,
});
export type Package = typeof packages.$inferSelect;
export type InsertPackage = z.infer<typeof insertPackageSchema>;

// ============================================================
// POS CONTROL ROOM (Task #7, 2026-06-05)
// Categories, Discounts, Promo codes, Payment methods.
// Discounts / promo codes / payment methods drive POS checkout.
// ============================================================

// --- Categories (POS product grouping) -----------------------
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertCategorySchema = createInsertSchema(categories).omit({
  created_at: true,
});
export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

// --- Discounts (cashier-applied at checkout) -----------------
// kind='percent' → value is a whole percent 1-100.
// kind='fixed'   → value is an amount in BND cents.
export const discounts = pgTable("discounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // 'percent' | 'fixed'
  value: integer("value").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertDiscountSchema = createInsertSchema(discounts).omit({
  created_at: true,
});
export type Discount = typeof discounts.$inferSelect;
export type InsertDiscount = z.infer<typeof insertDiscountSchema>;

// --- Promo codes (customer-entered at checkout) --------------
// Same value semantics as discounts. Optional date window + usage cap.
export const promoCodes = pgTable("promo_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(), // stored normalised UPPERCASE
  kind: text("kind").notNull(), // 'percent' | 'fixed'
  value: integer("value").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  starts_at: timestamp("starts_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  max_uses: integer("max_uses"), // NULL = unlimited
  used_count: integer("used_count").default(0).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({
  created_at: true,
  used_count: true,
});
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;

// --- Payment methods (POS dropdown config) -------------------
// Presentation/config layer over the fixed orders.payment_method CHECK
// codes. `method` is the underlying code; `qr_provider` discriminates
// wallet methods (method='qr_code'). System rows can't be hard-deleted.
export const paymentMethods = pgTable("payment_methods", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  method: text("method").notNull(), // underlying orders.payment_method code
  qr_provider: text("qr_provider"), // only when method='qr_code'
  is_active: boolean("is_active").default(true).notNull(),
  sort_order: integer("sort_order").default(0).notNull(),
  is_system: boolean("is_system").default(false).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({
  created_at: true,
});
export type PaymentMethodConfig = typeof paymentMethods.$inferSelect;
export type InsertPaymentMethodConfig = z.infer<typeof insertPaymentMethodSchema>;

// --- Orders (POS transactions) -------------------------------
// addons: jsonb array of { id: string, name: string, price_cents: number }
// payment_method: 'cash' | 'card' | 'qr' | 'subscription' | 'voucher'
// status: 'paid' | 'queued' | 'washing' | 'done' | 'voided' | 'refunded'
//   'refunded' added 2026-05-04_07. When set, refunded_at and
//   refunded_by_staff_id are non-null (CHECK constraint enforces).
export type OrderAddonSnapshot = {
  id: string;
  name: string;
  price_cents: number;
};

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  // Nullable since 2026-05-06_01: customers buy a wash without picking
  // a branch — the branch is stamped onto the order at scan-in time
  // (verify-qr writes the scanning cashier's branch). Until then the
  // order is "branchless" and doesn't show on any POS / queue snapshot.
  branch_id: integer("branch_id").references(() => branches.id),
  lane_id: text("lane_id").references(() => lanes.id),
  customer_id: integer("customer_id").references(() => users.id),
  staff_id: text("staff_id").references(() => staff.id),
  // Added 2026-05-04_01: link to the washed vehicle in `cars`.
  vehicle_id: integer("vehicle_id").references(() => cars.id),
  plate: text("plate").notNull(),
  package_id: text("package_id"),
  package_name: text("package_name").notNull(),
  package_price_cents: integer("package_price_cents").notNull(),
  addons: jsonb("addons").$type<OrderAddonSnapshot[]>().default([]).notNull(),
  subtotal_cents: integer("subtotal_cents").notNull(),
  total_cents: integer("total_cents").notNull(),
  payment_method: text("payment_method").notNull(),
  payment_ref: text("payment_ref"),
  // Phase 12a (2026-05-04_10): nullable so web-checkout rows that
  // start as `status='pending_payment'` can exist without a lane
  // ticket. Staff allocates T-NNN at scan-in time. The unique
  // index on (branch_id, ticket_code, ticket_day) permits NULLs.
  ticket_code: text("ticket_code"),
  // ticket_day: app-supplied bucket for the daily uniqueness constraint.
  // Defaults to the UTC date at insert time when omitted.
  ticket_day: date("ticket_day")
    .notNull()
    .default(sql`((now() AT TIME ZONE 'UTC')::date)`),
  status: text("status").default("paid").notNull(),
  // Lane-control manual ordering (2026-06-06): cashiers can reorder the
  // "Up next" queue. NULL = no manual position → falls back to created_at
  // (FIFO). Lower number = earlier in the queue.
  queue_position: integer("queue_position"),
  // Phase 4 — refund audit. Populated together when status='refunded'.
  refunded_at: timestamp("refunded_at", { withTimezone: true }),
  refunded_by_staff_id: text("refunded_by_staff_id").references(() => staff.id),
  refund_reason: text("refund_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true }),

  // --- KedaiPOS sync columns (added 2026-05-03_02) -----------
  // Mirror the fields KedaiPOS exports so historical backfill (Month 3)
  // and live two-way sync land cleanly. All optional / default 0.
  kedaipos_id: text("kedaipos_id"),                           // KedaiPOS internal "ID" (unique when present)
  kedaipos_order_number: text("kedaipos_order_number"),       // e.g. "76-1000" (branch prefix + counter)
  kedaipos_pos_name: text("kedaipos_pos_name"),               // e.g. "POS 1", "Default"
  original_receipt_no: text("original_receipt_no"),           // for refund chains: links a refund row to the original receipt
  customer_name_walkin: text("customer_name_walkin"),         // when a walk-in gives a name but isn't a registered user
  qr_provider: text("qr_provider"),                           // when payment_method='qr_code': 'pocket_pay' | 'dst_easy' | etc.
  service_charge_cents: integer("service_charge_cents").default(0).notNull(),
  tax_cents: integer("tax_cents").default(0).notNull(),
  discount_cents: integer("discount_cents").default(0).notNull(),
  promo_discount_cents: integer("promo_discount_cents").default(0).notNull(),
  // POS Control Room (2026-06-05): which configured discount / promo
  // drove the amounts above (audit + reporting). NULL = none applied.
  discount_id: text("discount_id"),
  promo_code_id: text("promo_code_id"),
  paid_amount_cents: integer("paid_amount_cents"),            // what cashier accepted; >= total when tip given
  change_cents: integer("change_cents").default(0).notNull(),
  order_notes: text("order_notes"),                           // operational notes ("water pressure low", "tips $1")
  item_notes: text("item_notes"),                             // car description ("Mini Cooper BAK9007")
  // Phase 12f (2026-05-05_01): when this order has been "punched" toward
  // a free-wash redemption, points at the loyalty_redemptions row that
  // consumed it. NULL = still eligible to count toward a future stamp.
  loyalty_consumed_in: text("loyalty_consumed_in"),
});

// Allowed payment methods. Mirrors the orders.payment_method CHECK
// constraint set in 2026-05-03_02_pos_sync_alignment.sql.
export type PaymentMethod =
  | "cash"
  | "bank_transfer"
  | "card"
  | "qr_code"
  | "baiduri_pay"
  | "quick_pay"
  | "subscription"
  | "voucher";

export const insertOrderSchema = createInsertSchema(orders).omit({
  created_at: true,
  completed_at: true,
  ticket_day: true,
});
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;

// --- Memberships (prepaid wash-pack) -------------------------
// Added by 2026-05-04_04_memberships.sql (replacing the unused
// `subscriptions` stub which modelled a different product).
//
// A wash-pack belongs to a `customers` row (POS customer, keyed
// by phone). It MAY be pinned to a specific `cars` row (vehicle),
// or left null so any of the customer's cars can redeem against
// it. `sold_by_staff_id` and `sold_at_branch_id` are audit fields
// pointing at our `staff` table (POS auth, separate from the trunk
// `users` table) and our `branches` table — matching how
// `orders.staff_id` is wired.
export const memberships = pgTable("memberships", {
  id: text("id").primaryKey(),
  customer_id: integer("customer_id").references(() => customers.id).notNull(),
  vehicle_id: integer("vehicle_id").references(() => cars.id),
  // kind='pack' (Phase 2): N prepaid washes, decrements per redemption.
  // kind='unlimited' (Phase 2.1): time-bound, expires_at required, no
  //   wash count gating — staff just check the expiry. total_washes /
  //   remaining_washes are stored as 0 for unlimited rows.
  kind: text("kind").default("pack").notNull(),
  total_washes: integer("total_washes").notNull(),
  remaining_washes: integer("remaining_washes").notNull(),
  price_cents: integer("price_cents").notNull(),
  status: text("status").default("active").notNull(), // 'active' | 'exhausted' | 'expired' | 'cancelled'
  expires_at: timestamp("expires_at", { withTimezone: true }),
  sold_by_staff_id: text("sold_by_staff_id").references(() => staff.id).notNull(),
  sold_at_branch_id: integer("sold_at_branch_id").references(() => branches.id).notNull(),
  cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMembershipSchema = createInsertSchema(memberships).omit({
  created_at: true,
  cancelled_at: true,
});
export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = z.infer<typeof insertMembershipSchema>;

// --- Membership redemptions ---------------------------------
// One row per wash consumed. The unique index on `order_id`
// guarantees an order is never the redemption target of two
// memberships at once.
export const membershipRedemptions = pgTable("membership_redemptions", {
  id: text("id").primaryKey(),
  membership_id: text("membership_id").references(() => memberships.id).notNull(),
  order_id: text("order_id").references(() => orders.id).notNull(),
  staff_id: text("staff_id").references(() => staff.id).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMembershipRedemptionSchema = createInsertSchema(membershipRedemptions).omit({
  created_at: true,
});
export type MembershipRedemption = typeof membershipRedemptions.$inferSelect;
export type InsertMembershipRedemption = z.infer<typeof insertMembershipRedemptionSchema>;

// --- Loyalty redemptions (Phase 12f) ------------------------
// One row per "collect 4 × B$12 receipts → free B$12 wash"
// redemption. Voucher orders are real `orders` rows with
// payment_method='voucher', qr_provider='loyalty', total_cents=0.
export const loyaltyRedemptions = pgTable("loyalty_redemptions", {
  id: text("id").primaryKey(),
  customer_user_id: integer("customer_user_id").references(() => users.id).notNull(),
  voucher_order_id: text("voucher_order_id").references(() => orders.id).notNull(),
  package_id: text("package_id").notNull(),
  // Nullable since 2026-05-06_01: free-wash voucher's branch is set
  // when the customer scans the QR at the lane, not when they redeem.
  branch_id: integer("branch_id").references(() => branches.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export type LoyaltyRedemption = typeof loyaltyRedemptions.$inferSelect;

// --- Cashier shifts (Phase 8) -------------------------------
// One open shift per staff at a time (enforced by partial unique
// index on opened_by_staff_id WHERE status='open'). The shift
// captures the cash float at open, the counted cash + computed
// expected + variance at close. Migration: 2026-05-04_09.
export const cashierShifts = pgTable("cashier_shifts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  branch_id: integer("branch_id").references(() => branches.id).notNull(),
  opened_by_staff_id: text("opened_by_staff_id").references(() => staff.id).notNull(),
  closed_by_staff_id: text("closed_by_staff_id").references(() => staff.id),
  opening_float_cents: integer("opening_float_cents").notNull(),
  closing_counted_cents: integer("closing_counted_cents"),
  closing_expected_cents: integer("closing_expected_cents"),
  closing_variance_cents: integer("closing_variance_cents"),
  opening_note: text("opening_note"),
  closing_note: text("closing_note"),
  status: text("status").default("open").notNull(), // 'open' | 'closed'
  opened_at: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closed_at: timestamp("closed_at", { withTimezone: true }),
});

export const insertCashierShiftSchema = createInsertSchema(cashierShifts).omit({
  id: true,
  opened_at: true,
  closed_at: true,
  closed_by_staff_id: true,
  closing_counted_cents: true,
  closing_expected_cents: true,
  closing_variance_cents: true,
  closing_note: true,
});
export type CashierShift = typeof cashierShifts.$inferSelect;
export type InsertCashierShift = z.infer<typeof insertCashierShiftSchema>;

// --- SharePoint outbox (2026-05-07_01) -----------------------
// Every reportable order (POS sale, web-checkout-paid, voucher
// redemption, refund) is enqueued here by a Postgres AFTER trigger
// on `orders`. A background worker drains pending rows and appends
// them into the SharePoint Excel master file via Microsoft Graph.
// POS NEVER blocks on SharePoint — failures stay queued for retry.
export const sharepointOutbox = pgTable("sharepoint_outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  order_id: text("order_id").references(() => orders.id, { onDelete: "cascade" }).notNull(),
  op: text("op").notNull(), // 'sale' | 'refund'
  cx_number: text("cx_number").notNull(), // e.g. "CX-1" — written to Excel col J
  status: text("status").default("pending").notNull(), // 'pending' | 'sent' | 'failed'
  attempts: integer("attempts").default(0).notNull(),
  last_error: text("last_error"),
  excel_row_id: text("excel_row_id"),
  enqueued_at: timestamp("enqueued_at", { withTimezone: true }).defaultNow().notNull(),
  sent_at: timestamp("sent_at", { withTimezone: true }),
  next_attempt_at: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
});
export type SharepointOutboxRow = typeof sharepointOutbox.$inferSelect;
