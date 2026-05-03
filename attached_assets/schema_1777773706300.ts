import { pgTable, serial, integer, text, timestamp, decimal, boolean, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export * from "./models/chat";

// Users (existing from template)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Stores
export const stores = pgTable("stores", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  location: text("location"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Customers
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Vehicles
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  plate: text("plate").notNull().unique(),
  brand: text("brand"),
  model: text("model"),
  color: text("color"),
  customerId: integer("customer_id").references(() => customers.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Memberships
export const memberships = pgTable("memberships", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  status: text("status").notNull().default("ACTIVE"),
  totalWashes: integer("total_washes").notNull().default(10),
  remainingWashes: integer("remaining_washes").notNull().default(10),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at"),
});

// Orders
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => stores.id),
  vehicleId: integer("vehicle_id").references(() => vehicles.id),
  orderNumber: text("order_number"),
  cashierId: text("cashier_id"),
  cashierName: text("cashier_name"),
  employeeName: text("employee_name"),
  customerName: text("customer_name"),
  licensePlate: text("license_plate"),
  extractedBrand: text("extracted_brand"),
  extractedModel: text("extracted_model"),
  extractedColor: text("extracted_color"),
  serviceBasicWash: boolean("service_basic_wash").notNull().default(true),
  serviceTireShine: boolean("service_tire_shine").notNull().default(false),
  serviceSprayWax: boolean("service_spray_wax").notNull().default(false),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  promocodeDiscount: decimal("promocode_discount", { precision: 10, scale: 2 }).notNull().default("0"),
  serviceCharge: decimal("service_charge", { precision: 10, scale: 2 }).notNull().default("0"),
  tax: decimal("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  paymentType: text("payment_type").notNull(),
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).notNull(),
  changeAmount: decimal("change_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  isRefund: boolean("is_refund").notNull().default(false),
  originalReceiptNo: text("original_receipt_no"),
  orderNotes: text("order_notes"),
  itemNotes: text("item_notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Membership Redemptions
export const membershipRedemptions = pgTable("membership_redemptions", {
  id: serial("id").primaryKey(),
  membershipId: integer("membership_id").notNull().references(() => memberships.id),
  orderId: integer("order_id").notNull().references(() => orders.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// LPR Events (webhook data from Plate Recognizer)
export const lprEvents = pgTable("lpr_events", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").references(() => stores.id),
  plate: text("plate"),
  confidence: decimal("confidence", { precision: 5, scale: 4 }),
  vehicleBrand: text("vehicle_brand"),
  vehicleModel: text("vehicle_model"),
  rawJson: text("raw_json").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Zod schemas
export const insertStoreSchema = createInsertSchema(stores).omit({ id: true, createdAt: true });
export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMembershipSchema = createInsertSchema(memberships).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertMembershipRedemptionSchema = createInsertSchema(membershipRedemptions).omit({ id: true, createdAt: true });
export const insertLprEventSchema = createInsertSchema(lprEvents).omit({ id: true, createdAt: true });

// Types
export type Store = typeof stores.$inferSelect;
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Membership = typeof memberships.$inferSelect;
export type InsertMembership = z.infer<typeof insertMembershipSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type MembershipRedemption = typeof membershipRedemptions.$inferSelect;
export type InsertMembershipRedemption = z.infer<typeof insertMembershipRedemptionSchema>;
export type LprEvent = typeof lprEvents.$inferSelect;
export type InsertLprEvent = z.infer<typeof insertLprEventSchema>;
