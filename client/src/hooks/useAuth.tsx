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

// Customer auth hook — Lucia (cx_session) only as of 2026-05-09 cutover.
// Sign-in / register flows live in /pages/login.tsx and call the
// /api/auth/customer/{signin,register}/* endpoints directly.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
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

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    logout,
    checkAuthStatus,
  };
}
