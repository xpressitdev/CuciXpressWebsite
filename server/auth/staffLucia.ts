// ============================================================
// Staff Lucia instance (Task 1.6)
//
// A SECOND Lucia instance, scoped to user_type='staff' in the shared
// auth_sessions table. Why a separate instance instead of one Lucia
// over both user types:
//
//   - Different cookie name (`cx_staff_session` vs `cx_session`) means
//     a person can be signed in on the same browser as both a customer
//     (their personal account) and a staff member (POS terminal). One
//     session never kicks the other out.
//   - Different user-attribute shapes. Customers have first/last/phone;
//     staff have name/role/branchId. Lucia's `DatabaseUserAttributes`
//     is a per-instance type, so two instances = two clean shapes.
//   - Different lifetimes. Staff sessions are 12h (POS shift length)
//     vs customer 30d. Refresh-on-use, so an active POS terminal stays
//     signed in across a shift but a forgotten browser logs out
//     overnight.
//
// The adapter mirrors CustomerSessionAdapter — same 7 methods, scoped
// to user_type='staff', joined against the staff table on text=text
// (no cast needed; both id columns are text).
// ============================================================

import { Lucia, TimeSpan, type Adapter, type DatabaseSession, type DatabaseUser } from "lucia";
import { sql } from "drizzle-orm";
import { db } from "../db";

const USER_TYPE_STAFF = "staff" as const;

class StaffSessionAdapter implements Adapter {
  async getSessionAndUser(
    sessionId: string
  ): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]> {
    const rows = (await db.execute(sql`
      SELECT
        s.id          AS s_id,
        s.user_id     AS s_user_id,
        s.expires_at  AS s_expires_at,
        st.id         AS st_id,
        st.email      AS st_email,
        st.name       AS st_name,
        st.role       AS st_role,
        st.branch_id  AS st_branch_id,
        st.is_active  AS st_is_active
      FROM auth_sessions s
      LEFT JOIN staff st ON st.id = s.user_id
      WHERE s.id = ${sessionId}
        AND s.user_type = ${USER_TYPE_STAFF}
      LIMIT 1
    `)).rows as any[];

    if (rows.length === 0) return [null, null];
    const r = rows[0];

    const session: DatabaseSession = {
      id: r.s_id,
      userId: r.s_user_id,
      expiresAt: new Date(r.s_expires_at),
      attributes: {},
    };

    // Treat deleted OR deactivated staff as "no user", so a session
    // belonging to a disabled staff account stops working immediately
    // without us having to delete the session row.
    const user: DatabaseUser | null =
      r.st_id == null || r.st_is_active === false
        ? null
        : {
            id: r.st_id,
            attributes: {
              email: r.st_email,
              name: r.st_name,
              role: r.st_role,
              branchId: r.st_branch_id,
            },
          };

    return [session, user];
  }

  async getUserSessions(userId: string): Promise<DatabaseSession[]> {
    const rows = (await db.execute(sql`
      SELECT id, user_id, expires_at
      FROM auth_sessions
      WHERE user_id = ${userId}
        AND user_type = ${USER_TYPE_STAFF}
    `)).rows as any[];
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      expiresAt: new Date(r.expires_at),
      attributes: {},
    }));
  }

  async setSession(session: DatabaseSession): Promise<void> {
    await db.execute(sql`
      INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
      VALUES (${session.id}, ${session.userId}, ${USER_TYPE_STAFF}, ${session.expiresAt})
    `);
  }

  async updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void> {
    await db.execute(sql`
      UPDATE auth_sessions
      SET expires_at = ${expiresAt}
      WHERE id = ${sessionId}
        AND user_type = ${USER_TYPE_STAFF}
    `);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM auth_sessions
      WHERE id = ${sessionId}
        AND user_type = ${USER_TYPE_STAFF}
    `);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM auth_sessions
      WHERE user_id = ${userId}
        AND user_type = ${USER_TYPE_STAFF}
    `);
  }

  async deleteExpiredSessions(): Promise<void> {
    // Customer Lucia already sweeps the whole table on its own
    // schedule; this no-op avoids double-deletes racing.
  }
}

// Note: this `staffLucia` is a SEPARATE Lucia instance from the
// customer one, so the typing for cookie name + user attributes lives
// in its own narrow declare-module block. We can't share the Register
// interface — Lucia v3 only allows one global Register augmentation
// per process. So we use Lucia's instance-level types directly when
// reading req.staff in middleware.
export const staffLucia = new Lucia(new StaffSessionAdapter(), {
  sessionExpiresIn: new TimeSpan(12, "h"),
  sessionCookie: {
    name: "cx_staff_session",
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  },
  getUserAttributes: (attrs) => ({
    email: attrs.email as string,
    name: attrs.name as string,
    role: attrs.role as "owner" | "manager" | "lane" | "cashier" | "investor",
    branchId: attrs.branchId as number | null,
  }),
});

export type StaffLuciaUser = ReturnType<typeof staffLucia.getUserAttributes> & {
  id: string;
};
