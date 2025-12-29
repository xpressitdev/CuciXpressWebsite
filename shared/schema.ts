import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  first_name: text("first_name").notNull(),
  last_name: text("last_name").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  phone_number: text("phone_number").notNull(),
  address: text("address").notNull(),
  is_admin: boolean("is_admin").default(false).notNull(),
  points: integer("points").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  created_at: timestamp("created_at").defaultNow(),
  last_login: timestamp("last_login"),
});

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

export const insertUserSchema = createInsertSchema(users).pick({
  first_name: true,
  last_name: true,
  email: true,
  password: true,
  phone_number: true,
  address: true,
  is_admin: true,
  points: true,
  level: true,
}).partial({ is_admin: true, points: true, level: true });

export const insertCollaborationSubmissionSchema = createInsertSchema(collaborationSubmissions).omit({
  id: true,
  createdAt: true,
  isRead: true,
});

export const insertSubscriptionSignupSchema = createInsertSchema(subscriptionSignups).omit({
  id: true,
  createdAt: true,
  isNotified: true,
});

export const insertServiceHistorySchema = createInsertSchema(serviceHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCollaborationSubmission = z.infer<typeof insertCollaborationSubmissionSchema>;
export type CollaborationSubmission = typeof collaborationSubmissions.$inferSelect;
export type InsertSubscriptionSignup = z.infer<typeof insertSubscriptionSignupSchema>;
export type SubscriptionSignup = typeof subscriptionSignups.$inferSelect;
export type InsertServiceHistory = z.infer<typeof insertServiceHistorySchema>;
export type ServiceHistory = typeof serviceHistory.$inferSelect;
