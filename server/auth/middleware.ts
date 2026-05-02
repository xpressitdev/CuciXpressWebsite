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

declare global {
  namespace Express {
    interface Request {
      lucia?: { user: User; session: Session } | { user: null; session: null };
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
