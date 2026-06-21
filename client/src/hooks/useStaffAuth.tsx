// ============================================================
// useStaffAuth — staff session hook (Task 1.6 follow-up)
//
// Talks ONLY to the staff auth endpoints (`/api/auth/staff/*`).
// Completely independent of `useAuth`, which handles customer
// sessions. A user can be signed in as both a customer and a staff
// member at once — different cookies, different sessions.
// ============================================================

import { useCallback, useEffect, useState } from 'react';

export type StaffRole = 'owner' | 'manager' | 'lane' | 'cashier' | 'investor';

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  branchId: number | null;
}

export type StaffLoginError =
  | 'invalid_credentials'
  | 'account_locked'
  | 'account_inactive'
  | 'network';

export interface StaffLoginResult {
  success: boolean;
  error?: StaffLoginError;
  retryAfterSeconds?: number;
}

export function useStaffAuth() {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/staff/whoami', {
        credentials: 'include',
      });
      if (!res.ok) {
        setStaff(null);
        return;
      }
      const data = await res.json();
      setStaff(data.authenticated ? data.staff : null);
    } catch (err) {
      console.error('[useStaffAuth] whoami failed:', err);
      setStaff(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(
    async (email: string, password: string): Promise<StaffLoginResult> => {
      try {
        const res = await fetch('/api/auth/staff/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data?.ok && data?.staff) {
          setStaff(data.staff as StaffUser);
          return { success: true };
        }

        return {
          success: false,
          error: (data?.error as StaffLoginError) ?? 'invalid_credentials',
          retryAfterSeconds: data?.retryAfterSeconds,
        };
      } catch (err) {
        console.error('[useStaffAuth] login failed:', err);
        return { success: false, error: 'network' };
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/staff/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('[useStaffAuth] logout failed:', err);
    } finally {
      setStaff(null);
    }
  }, []);

  return {
    staff,
    isAuthenticated: staff !== null,
    isLoading,
    login,
    logout,
    checkAuth,
  };
}
