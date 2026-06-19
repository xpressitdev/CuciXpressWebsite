import { users, serviceHistory, customers, type User, type InsertUser, type ServiceHistory, type InsertServiceHistory } from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | null>;
  updateCustomerProfile(userId: number, profile: { firstName: string; lastName: string; email: string; phoneNumber: string | null }): Promise<User | null>;
  
  // Service History
  createServiceHistory(entry: InsertServiceHistory): Promise<ServiceHistory>;
  getServiceHistoryByPlate(carPlate: string): Promise<ServiceHistory[]>;
  getServiceHistoryByUserId(userId: number): Promise<ServiceHistory[]>;
  updateServiceHistory(id: number, updates: Partial<InsertServiceHistory>): Promise<ServiceHistory>;
  getServiceHistoryByBranch(branch: string): Promise<ServiceHistory[]>;
  getPendingServices(branch?: string): Promise<ServiceHistory[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        is_admin: insertUser.is_admin ?? false,
        points: insertUser.points ?? 0,
        level: insertUser.level ?? 1,
      })
      .returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | null> {
    try {
      const [user] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();
      return user || null;
    } catch (error) {
      console.error('Error updating user:', error);
      return null;
    }
  }

  async updateCustomerProfile(
    userId: number,
    profile: { firstName: string; lastName: string; email: string; phoneNumber: string | null },
  ): Promise<User | null> {
    // Note: errors are intentionally NOT caught here so the route layer can
    // distinguish a true "user not found" (returns null), a unique-constraint
    // clash (23505 → route maps to 409) and an internal failure (→ 500).
    const { firstName, lastName, email, phoneNumber } = profile;
    return await db.transaction(async (tx) => {
      // Guard phone identity: users.phone_number has no DB unique constraint
      // and phone is a login identifier, so a phone already attached to a
      // DIFFERENT account must be rejected (the route maps this to 409).
      if (phoneNumber) {
        const clash = await tx.execute(sql`
          SELECT 1
            FROM users
           WHERE phone_number = ${phoneNumber} AND id <> ${userId}
          UNION ALL
          SELECT 1
            FROM customers
           WHERE phone = ${phoneNumber} AND user_id IS DISTINCT FROM ${userId}
          LIMIT 1
        `);
        if (clash.rows.length > 0) {
          throw Object.assign(new Error('phone_in_use'), { phoneConflict: true });
        }
      }
      const [user] = await tx
        .update(users)
        .set({
          first_name: firstName,
          last_name: lastName,
          email,
          phone_number: phoneNumber,
        })
        .where(eq(users.id, userId))
        .returning();
      if (!user) return null;
      const fullName = `${firstName} ${lastName}`.trim();
      // Keep the linked customer record in sync. customers.phone is NOT NULL
      // and unique, so only overwrite it when a non-empty phone was provided.
      await tx
        .update(customers)
        .set({
          name: fullName,
          ...(phoneNumber ? { phone: phoneNumber } : {}),
          updated_at: sql`now()`,
        })
        .where(eq(customers.user_id, userId));
      return user;
    });
  }

  async createServiceHistory(entry: InsertServiceHistory): Promise<ServiceHistory> {
    const [record] = await db
      .insert(serviceHistory)
      .values(entry)
      .returning();
    return record;
  }

  async getServiceHistoryByPlate(carPlate: string): Promise<ServiceHistory[]> {
    return await db
      .select()
      .from(serviceHistory)
      .where(eq(serviceHistory.carPlate, carPlate))
      .orderBy(desc(serviceHistory.createdAt));
  }

  async getServiceHistoryByUserId(userId: number): Promise<ServiceHistory[]> {
    return await db
      .select()
      .from(serviceHistory)
      .where(eq(serviceHistory.userId, userId))
      .orderBy(desc(serviceHistory.createdAt));
  }

  async updateServiceHistory(id: number, updates: Partial<InsertServiceHistory>): Promise<ServiceHistory> {
    const [record] = await db
      .update(serviceHistory)
      .set(updates)
      .where(eq(serviceHistory.id, id))
      .returning();
    return record;
  }

  async getServiceHistoryByBranch(branch: string): Promise<ServiceHistory[]> {
    return await db
      .select()
      .from(serviceHistory)
      .where(eq(serviceHistory.branch, branch))
      .orderBy(desc(serviceHistory.createdAt));
  }

  async getPendingServices(branch?: string): Promise<ServiceHistory[]> {
    if (branch) {
      return await db
        .select()
        .from(serviceHistory)
        .where(eq(serviceHistory.branch, branch))
        .orderBy(serviceHistory.queuePosition);
    }
    return await db
      .select()
      .from(serviceHistory)
      .orderBy(serviceHistory.queuePosition);
  }
}

export const storage = new DatabaseStorage();