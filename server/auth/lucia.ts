// ============================================================
// Lucia v3 scaffold (Task 1.3)
//
// Status: SCAFFOLD ONLY. Runs side-by-side with the legacy JWT system in
// server/unified-auth.ts. Nothing is replaced yet. The legacy system stays
// authoritative for /api/auth/login, /api/auth/me, etc. until the Week 2
// auth migration tasks land.
//
// Scope: CUSTOMER auth only. The `auth_sessions` table is polymorphic
// (user_id text + user_type discriminator) so it can also back staff /
// POS auth later, but this Lucia instance always scopes to
// `user_type = 'customer'`. Staff auth gets its own Lucia instance (or an
// expanded adapter) when the POS work begins.
//
// Why a custom adapter instead of @lucia-auth/adapter-drizzle:
//   - Our `users.id` is integer serial, but `auth_sessions.user_id` is text
//     (it has to hold either a customer integer-id or a staff text-id).
//   - The stock Drizzle adapter assumes the session.user_id type matches the
//     users.id type, so it builds a JOIN that Postgres rejects.
//   - The Adapter interface is tiny (7 methods), so a hand-rolled adapter
//     scoped to a discriminator is simpler than fighting the generic one.
//
// Lucia v3 itself is officially sunset; the migration target is oslojs.
// We intentionally adopt v3 now to land sessions / cookies quickly, with a
// migration to oslojs scheduled for after the Week-1..Week-5 plan ships.
// ============================================================

import { Lucia, TimeSpan, type Adapter, type DatabaseSession, type DatabaseUser } from "lucia";
import { sql } from "drizzle-orm";
import { db } from "../db";

// ---- Custom polymorphic adapter -----------------------------

const USER_TYPE_CUSTOMER = "customer" as const;

class CustomerSessionAdapter implements Adapter {
  async getSessionAndUser(
    sessionId: string
  ): Promise<[session: DatabaseSession | null, user: DatabaseUser | null]> {
    const rows = (await db.execute(sql`
      SELECT
        s.id            AS s_id,
        s.user_id       AS s_user_id,
        s.expires_at    AS s_expires_at,
        u.id            AS u_id,
        u.email         AS u_email,
        u.first_name    AS u_first_name,
        u.last_name     AS u_last_name,
        u.phone_number  AS u_phone_number
      FROM auth_sessions s
      LEFT JOIN users u ON u.id::text = s.user_id
      WHERE s.id = ${sessionId}
        AND s.user_type = ${USER_TYPE_CUSTOMER}
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

    // If the user row was deleted but the session row lingers, treat as no user.
    const user: DatabaseUser | null =
      r.u_id == null
        ? null
        : {
            id: String(r.u_id),
            attributes: {
              email: r.u_email,
              firstName: r.u_first_name,
              lastName: r.u_last_name,
              phoneNumber: r.u_phone_number,
            },
          };

    return [session, user];
  }

  async getUserSessions(userId: string): Promise<DatabaseSession[]> {
    const rows = (await db.execute(sql`
      SELECT id, user_id, expires_at
      FROM auth_sessions
      WHERE user_id = ${userId}
        AND user_type = ${USER_TYPE_CUSTOMER}
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
      VALUES (${session.id}, ${session.userId}, ${USER_TYPE_CUSTOMER}, ${session.expiresAt})
    `);
  }

  async updateSessionExpiration(sessionId: string, expiresAt: Date): Promise<void> {
    await db.execute(sql`
      UPDATE auth_sessions
      SET expires_at = ${expiresAt}
      WHERE id = ${sessionId}
        AND user_type = ${USER_TYPE_CUSTOMER}
    `);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM auth_sessions
      WHERE id = ${sessionId}
        AND user_type = ${USER_TYPE_CUSTOMER}
    `);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM auth_sessions
      WHERE user_id = ${userId}
        AND user_type = ${USER_TYPE_CUSTOMER}
    `);
  }

  async deleteExpiredSessions(): Promise<void> {
    // Sweep ALL expired sessions, not just customer ones — cheap and keeps
    // the table tidy across both user types.
    await db.execute(sql`
      DELETE FROM auth_sessions WHERE expires_at <= now()
    `);
  }
}

// ---- Lucia instance -----------------------------------------

export const lucia = new Lucia(new CustomerSessionAdapter(), {
  sessionExpiresIn: new TimeSpan(30, "d"),
  sessionCookie: {
    name: "cx_session",
    expires: false, // session-cookie semantics: refresh on every request
    attributes: {
      // `secure` flips on automatically in production via the env check below.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  },
  getUserAttributes: (attrs) => ({
    email: attrs.email,
    firstName: attrs.firstName,
    lastName: attrs.lastName,
    phoneNumber: attrs.phoneNumber,
  }),
});

// ---- Module augmentation (Lucia v3 typing pattern) ----------

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      firstName: string;
      lastName: string;
      // Nullable since Task 1.5 — Google-OAuth-only users won't have a
      // phone number until they complete their profile.
      phoneNumber: string | null;
    };
    DatabaseSessionAttributes: {};
  }
}
