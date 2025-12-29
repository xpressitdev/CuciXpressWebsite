import { users, customers, serviceHistory, type User, type InsertUser, type Customer, type InsertCustomer, type ServiceHistory, type InsertServiceHistory } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | null>;
  
  // Customers
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  getCustomerByPlate(carPlate: string): Promise<Customer | undefined>;
  updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer>;
  getCustomers(): Promise<Customer[]>;
  
  // Service History
  createServiceHistory(entry: InsertServiceHistory): Promise<ServiceHistory>;
  getServiceHistoryByPlate(carPlate: string): Promise<ServiceHistory[]>;
  getServiceHistoryByCustomerId(customerId: number): Promise<ServiceHistory[]>;
  updateServiceHistory(id: number, updates: Partial<InsertServiceHistory>): Promise<ServiceHistory>;
  getServiceHistoryByBranch(branch: string): Promise<ServiceHistory[]>;
  getPendingServices(branch?: string): Promise<ServiceHistory[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
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
        role: insertUser.role || 'customer',
        app_access: insertUser.app_access || ['car_wash', 'laundry'],
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

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db
      .insert(customers)
      .values(insertCustomer)
      .returning();
    return customer;
  }

  async getCustomerByPlate(carPlate: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.carPlate, carPlate));
    return customer || undefined;
  }

  async updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer> {
    const [customer] = await db
      .update(customers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers);
  }

  // Service History methods
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

  async getServiceHistoryByCustomerId(customerId: number): Promise<ServiceHistory[]> {
    return await db
      .select()
      .from(serviceHistory)
      .where(eq(serviceHistory.customerId, customerId))
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