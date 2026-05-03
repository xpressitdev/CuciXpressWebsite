// ============================================================
// Lucia request validation middleware (Task 1.3 scaffold)
//
// Reads the `cx_session` cookie, validates it via Lucia, refreshes the
// cookie if the session was rolled, and attaches the result to the
// request as `req.lucia`. Does NOT redirect or 401 on its own — call
// `requireLuciaUser` for routes that should reject anonymous traffic.
//
// Coexists with the legacy `req.user` set by unified-auth. Routes pick
// which one they want.
// ============================================================

import type { Request, Response, NextFunction } from "express";
import type { Session, User } from "lucia";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { lucia } from "./lucia";
import { staffLucia } from "./staffLucia";

declare global {
  namespace Express {
    interface Request {
      lucia?: { user: User; session: Session } | { user: null; session: null };
      /** Staff Lucia session (Task 1.6). Independent of `req.lucia` — a
       *  request can be authenticated as both a customer AND a staff
       *  member at once, with two different cookies. */
      staff?: { user: User; session: Session } | { user: null; session: null };
    }
  }
}

export async function attachLuciaSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const sessionId = lucia.readSessionCookie(req.headers.cookie ?? "");
  if (!sessionId) {
    req.lucia = { user: null, session: null };
    return next();
  }

  try {
    const result = await lucia.validateSession(sessionId);

    if (result.session && result.session.fresh) {
      // Session was rolled; emit a refreshed cookie.
      const cookie = lucia.createSessionCookie(result.session.id);
      res.appendHeader("Set-Cookie", cookie.serialize());
    }
    if (!result.session) {
      // Invalidated server-side — clear the client cookie too.
      const cookie = lucia.createBlankSessionCookie();
      res.appendHeader("Set-Cookie", cookie.serialize());
    }

    req.lucia = result;
  } catch (err) {
    // Adapter / DB blew up — never let auth failure crash a request. Treat
    // as anonymous and log; downstream routes can decide what to do.
    console.error("[lucia] session validation failed:", err);
    req.lucia = { user: null, session: null };
  }

  next();
}

export function requireLuciaUser(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.lucia || !req.lucia.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

// ---- Staff session middleware (Task 1.6) -------------------

export async function attachStaffSession(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const sessionId = staffLucia.readSessionCookie(req.headers.cookie ?? "");
  if (!sessionId) {
    req.staff = { user: null, session: null };
    return next();
  }

  try {
    const result = await staffLucia.validateSession(sessionId);

    if (result.session && result.session.fresh) {
      const cookie = staffLucia.createSessionCookie(result.session.id);
      res.appendHeader("Set-Cookie", cookie.serialize());
    }
    if (!result.session) {
      const cookie = staffLucia.createBlankSessionCookie();
      res.appendHeader("Set-Cookie", cookie.serialize());
    }

    req.staff = result;
  } catch (err) {
    console.error("[staff-lucia] session validation failed:", err);
    req.staff = { user: null, session: null };
  }

  next();
}

export function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.staff || !req.staff.user) {
    return res.status(401).json({ error: "Staff authentication required" });
  }
  next();
}

/**
 * Stricter gate that requires the staff member to have one of the
 * allowed roles. Use for owner/manager-only endpoints.
 */
export function requireStaffRole(...allowed: Array<"owner" | "manager" | "lane" | "cashier">) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.staff?.user;
    if (!user) {
      return res.status(401).json({ error: "Staff authentication required" });
    }
    const role = (user as any).role as string | undefined;
    if (!role || !allowed.includes(role as any)) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    next();
  };
}

/**
 * Hybrid guard for customer-history-style endpoints keyed by license plate.
 *
 * Allows the request through if EITHER:
 *   1. There is a valid staff session (any role) — operations need to look up
 *      any customer's history at the lane.
 *   2. There is a valid customer (Lucia) session AND the requested plate
 *      belongs to one of that customer's cars (case-insensitive match against
 *      `cars.license_plate`).
 *
 * Otherwise responds 401. The plate is read from `req.params.carPlate` first,
 * falling back to `req.query.carPlate`. If no plate is supplied, returns
 * 400 — the wrapped route would have done the same.
 *
 * Defensive: any DB error during the ownership lookup is treated as "not
 * owner" rather than crashing the request, so a transient DB hiccup never
 * leaks data.
 */
export async function requireStaffOrPlateOwner(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Staff bypass — fastest path, no DB work.
  if (req.staff?.user) return next();

  const rawPlate =
    (req.params?.carPlate as string | undefined) ??
    (typeof req.query?.carPlate === "string" ? req.query.carPlate : undefined);
  if (!rawPlate || !rawPlate.trim()) {
    return res.status(400).json({ error: "Car plate number required" });
  }

  const customer = req.lucia?.user;
  if (!customer) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const result = await db.execute(sql`
      SELECT 1
        FROM cars
       WHERE user_id = ${Number(customer.id)}
         AND UPPER(license_plate) = UPPER(${rawPlate})
       LIMIT 1
    `);
    if (result.rows.length > 0) return next();
  } catch (err) {
    console.error("[requireStaffOrPlateOwner] ownership lookup failed:", err);
    // Fall through to 403 — never leak data on a failed check.
  }

  return res.status(403).json({ error: "Plate does not belong to this account" });
}
