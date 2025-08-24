import { users, customers, type User, type InsertUser, type Customer, type InsertCustomer } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User>;
  
  // Customers
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  getCustomerByPlate(carPlate: string): Promise<Customer | undefined>;
  updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer>;
  getCustomers(): Promise<Customer[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private customers: Map<number, Customer>;
  currentId: number;
  currentCustomerId: number;

  constructor() {
    this.users = new Map();
    this.customers = new Map();
    this.currentId = 1;
    this.currentCustomerId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { 
      ...insertUser, 
      id,
      email: insertUser.email || null,
      created_at: new Date(),
      last_login: null,
      role: insertUser.role || 'user',
      app_access: insertUser.app_access || ['car_wash', 'laundry'],
      profile_data: insertUser.profile_data || null
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User> {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      throw new Error('User not found');
    }
    const updatedUser = { ...existingUser, ...updates, last_login: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const id = this.currentCustomerId++;
    const now = new Date();
    const customer: Customer = { 
      ...insertCustomer, 
      id, 
      createdAt: now,
      updatedAt: now
    };
    this.customers.set(id, customer);
    return customer;
  }

  async getCustomerByPlate(carPlate: string): Promise<Customer | undefined> {
    return Array.from(this.customers.values()).find(
      (customer) => customer.carPlate === carPlate,
    );
  }

  async updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer> {
    const existingCustomer = this.customers.get(id);
    if (!existingCustomer) {
      throw new Error('Customer not found');
    }
    
    const updatedCustomer: Customer = {
      ...existingCustomer,
      ...updates,
      updatedAt: new Date()
    };
    
    this.customers.set(id, updatedCustomer);
    return updatedCustomer;
  }

  async getCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }
}

export const storage = new MemStorage();
