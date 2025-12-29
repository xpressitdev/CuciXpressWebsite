import { users, serviceHistory, type User, type InsertUser, type ServiceHistory, type InsertServiceHistory } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | null>;
  
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