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

/**
 * Returns the JWT signing secret from the environment.
 * Throws if missing or weak — the app must refuse to boot rather than
 * silently fall back to a hardcoded value that anyone reading the source
 * could use to forge tokens.
 *
 * Call this at startup (in server/index.ts) for fail-fast behaviour, and
 * everywhere a JWT is signed or verified.
 */
export function requireJwtSecret(): string {
  // Existing projects may have only SESSION_SECRET configured. It is already
  // a private server-side signing secret, so it is a safe compatibility
  // source for the legacy cross-domain JWTs while a separate JWT_SECRET is
  // unavailable in a development workspace.
  const s = process.env.JWT_SECRET ?? process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'JWT_SECRET or SESSION_SECRET is required and must be at least 32 characters. ' +
      'Set it in Replit Secrets before booting.'
    );
  }
  return s;
}

// Unified Authentication System for Multiple Domains
export class UnifiedAuth {
  private jwtSecret: string;
  private allowedDomains: string[];

  constructor() {
    this.jwtSecret = requireJwtSecret();
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

      // Check password (plaintext compare — to be replaced with hashed
      // verification in the Lucia v3 cutover; tracked in docs/AUTH_AUDIT.md
      // finding #2). The previous master-password backdoor was removed.
      if (user.password !== password) {
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