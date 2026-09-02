import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { requireJwtSecret } from "./unified-auth";
import { attachLuciaSession, attachStaffSession } from "./auth/middleware";
import { loadGoogleOAuthConfig } from "./auth/google";
import { startSharePointOutboxWorker } from "./integrations/sharepointOutbox";
import { startPendingPaymentSweeper } from "./integrations/pendingPaymentSweeper";
import { startSubscriptionRenewalWorker } from "./subscriptions";
import { startInteriorRefreshReminderWorker } from "./interiorRefreshReminders";

// Fail-fast on missing or weak JWT_SECRET. Refuse to boot rather than
// silently fall back to a hardcoded value. See docs/AUTH_AUDIT.md.
requireJwtSecret();

// Google OAuth config validation. Throws on partial config (some env
// vars set but not all) so a misconfig never silently boots. Returns
// null if no Google env vars are set, in which case Google sign-in is
// simply unavailable.
const googleOAuthConfig = loadGoogleOAuthConfig();
if (googleOAuthConfig) {
  log(`[google-oauth] enabled, callback path = ${googleOAuthConfig.callbackPath}`);
} else {
  log(`[google-oauth] disabled (no GOOGLE_CLIENT_ID set)`);
}

const app = express();
// Replit (and most platforms) terminate TLS at a reverse proxy and forward
// HTTP to our process. Without this, Express thinks the connection is
// insecure, which means:
//   - `secure: true` cookies (Lucia session, OAuth flight cookies) get
//     dropped silently by the browser in production.
//   - `req.ip` returns the proxy IP instead of the real client IP, so our
//     audit_log "ip" column would record garbage.
// Trusting the immediate proxy hop fixes both. We do NOT trust arbitrary
// hops (would be `true`) — only the platform's edge proxy.
app.set("trust proxy", 1);
app.use(cookieParser()); // Add cookie parsing middleware
// 10mb limit accommodates Phase 3 LPR uploads (base64 photo of an
// arriving car ~3-6mb after JPEG encoding × 4/3 base64 overhead). All
// other endpoints send tiny JSON bodies so the bump has no downside.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
// Attach Lucia session info to every request as `req.lucia`. Read-only —
// does not 401 on its own. Routes that want to require auth use
// `requireLuciaUser` from server/auth/middleware.ts. Coexists with the
// legacy JWT `req.user` set by unified-auth. See server/auth/lucia.ts.
app.use(attachLuciaSession);
app.use(attachStaffSession);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Background workers (inert if their env vars are not configured).
  startSharePointOutboxWorker();
  startPendingPaymentSweeper();
  startSubscriptionRenewalWorker();
  startInteriorRefreshReminderWorker();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
