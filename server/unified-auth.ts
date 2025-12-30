import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// Unified Authentication System for Multiple Domains
export class UnifiedAuth {
  private jwtSecret: string;
  private allowedDomains: string[];

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'cuci-xpress-unified-secret-key-2025';
    this.allowedDomains = [
      'cucixpress.com',
      'cuci-xpress.com', 
      'www.cucixpress.com',
      'www.cuci-xpress.com',
      'localhost:5000', // For development
      'localhost:3000'
    ];
  }

  // Generate JWT token for cross-domain authentication
  generateToken(user: any): string {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username,
        email: user.email || null,
        app_access: ['car_wash', 'laundry'], // User can access both apps
        issued_at: Date.now()
      },
      this.jwtSecret,
      { expiresIn: '7d' } // Token valid for 7 days
    );
  }

  // Verify JWT token
  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      return null;
    }
  }

  // Middleware to check authentication across domains
  requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for token in multiple places
      const token = 
        req.headers.authorization?.replace('Bearer ', '') ||
        req.cookies?.['cuci_auth_token'] ||
        req.query.token as string;

      if (!token) {
        return res.status(401).json({ 
          error: 'Authentication required',
          login_url: this.getLoginUrl(req)
        });
      }

      const decoded = this.verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ 
          error: 'Invalid or expired token',
          login_url: this.getLoginUrl(req)
        });
      }

      // Attach user info to request
      req.user = decoded;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Authentication error' });
    }
  };

  // Get appropriate login URL based on requesting domain
  private getLoginUrl(req: Request): string {
    const host = req.get('host') || 'cucixpress.com';
    const protocol = req.secure ? 'https' : 'http';
    
    // Always redirect to main domain for login
    return `https://cucixpress.com/login?return_to=${encodeURIComponent(req.originalUrl)}`;
  }

  // Cross-domain cookie settings
  getCookieOptions(domain?: string) {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      domain: domain || (process.env.NODE_ENV === 'production' ? '.cucixpress.com' : undefined)
    };
  }

  // Set authentication cookie for cross-domain access
  setAuthCookie(res: Response, token: string, domain?: string) {
    res.cookie('cuci_auth_token', token, this.getCookieOptions(domain));
    
    // Also set for the alternate domain
    if (process.env.NODE_ENV === 'production') {
      res.cookie('cuci_auth_token', token, this.getCookieOptions('.cuci-xpress.com'));
    }
  }

  // Clear authentication cookies
  clearAuthCookies(res: Response) {
    const cookieOptions = { ...this.getCookieOptions(), maxAge: 0 };
    res.clearCookie('cuci_auth_token', cookieOptions);
    
    if (process.env.NODE_ENV === 'production') {
      res.clearCookie('cuci_auth_token', { ...cookieOptions, domain: '.cuci-xpress.com' });
    }
  }

  // Login method that works for both apps
  async login(identifier: string, password: string): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
    try {
      // Find user by email
      const user = await storage.getUserByEmail(identifier);
      
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check password - support both regular password and admin password
      const isValidPassword = user.password === password || password === 'Buy20sell26!!';
      
      if (!isValidPassword) {
        return { success: false, error: 'Invalid password' };
      }

      const token = this.generateToken(user);
      return { success: true, token, user: { ...user, password: undefined } };

    } catch (error) {
      return { success: false, error: 'Login failed' };
    }
  }

  // Register new user (for both apps)
  async register(userData: { username: string; password: string; email?: string; app_preference?: string }): Promise<{ success: boolean; token?: string; user?: any; error?: string }> {
    try {
      // Check if user already exists by email
      const email = userData.email || userData.username;
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return { success: false, error: 'Email already registered' };
      }

      // Create new user with required fields
      const newUser = await storage.createUser({
        first_name: userData.username.split(' ')[0] || 'User',
        last_name: userData.username.split(' ')[1] || '',
        email: email,
        password: userData.password,
        phone_number: '',
        address: ''
      });

      const token = this.generateToken(newUser);
      return { success: true, token, user: { ...newUser, password: undefined } };

    } catch (error) {
      return { success: false, error: 'Registration failed' };
    }
  }

  // Get user info from token
  async getUserFromToken(token: string): Promise<any> {
    const decoded = this.verifyToken(token);
    if (!decoded) return null;

    // Get fresh user data from database
    const user = await storage.getUser(decoded.id);
    if (!user) return null;

    return { ...user, password: undefined };
  }

  // Check if user has access to specific app
  hasAppAccess(user: any, app: 'car_wash' | 'laundry'): boolean {
    return user.app_access?.includes(app) || user.role === 'admin';
  }
}

// Export singleton instance
export const unifiedAuth = new UnifiedAuth();