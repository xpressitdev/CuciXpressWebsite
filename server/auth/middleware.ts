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
