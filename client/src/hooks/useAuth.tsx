import { useState, useEffect } from 'react';

export interface User {
  id: number;
  name?: string;
  username?: string;
  email: string | null;
  role?: string | null;
  app_access?: string[] | null;
  is_admin?: boolean;
  points?: number;
  level?: number;
  phone_number?: string;
  car_plate?: string;
  profile_data?: {
    carPlate?: string;
    phone?: string;
  };
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include' // Important for cookies
      });
      
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ email: username, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Fetch full profile data with phone and car plate from /api/auth/me
        await checkAuthStatus();
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const register = async (username: string, password: string, email?: string, appPreference?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password, email, app_preference: appPreference })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setUser(data.user);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Network error' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  // NOTE: the legacy `legacyLogin(password)` helper that gated /admin
  // behind a hardcoded password was removed in the Task-1.6 follow-up.
  // Admin / staff auth now uses `useStaffAuth` against the real
  // `/api/auth/staff/*` endpoints, with a per-account password,
  // server-side enforcement on `/api/admin/*`, lockout, and audit log.

  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    checkAuthStatus
  };
}