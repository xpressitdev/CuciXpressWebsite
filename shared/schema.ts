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
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
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
  phone_number: text("phone_number").notNull(),
  address: text("address").notNull(),
  is_admin: boolean("is_admin").default(false), // ← REMOVED .notNull() to match DB
  points: integer("points").default(0), // ← REMOVED .notNull() to match DB
  level: integer("level").default(1), // ← REMOVED .notNull() to match DB
  created_at: timestamp("created_at").defaultNow(),
  last_login: timestamp("last_login"),
});

// ============================================================
// CARS — NEW (was missing, exists in LiveQue DB with 559 rows)
// ============================================================
export const cars = pgTable("cars", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id")
    .references(() => users.id)
    .notNull(),
  license_plate: text("license_plate").notNull(),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  type: text("type").notNull(),
  photo_url: text("photo_url"),
});

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
