import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
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

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  carPlate: text("car_plate").notNull(),
  phone: text("phone").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

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

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCollaborationSubmission = z.infer<typeof insertCollaborationSubmissionSchema>;
export type CollaborationSubmission = typeof collaborationSubmissions.$inferSelect;
export type InsertSubscriptionSignup = z.infer<typeof insertSubscriptionSignupSchema>;
export type SubscriptionSignup = typeof subscriptionSignups.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;
