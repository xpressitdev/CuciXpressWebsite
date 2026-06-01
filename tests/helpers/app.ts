import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../../server/routes";
import {
  attachLuciaSession,
  attachStaffSession,
} from "../../server/auth/middleware";

// Build the real Express app the same way server/index.ts does, minus the
// HTTP listen and the Vite dev middleware. Used by supertest so the
// integration tests exercise the actual route handlers + auth middleware.
export async function createTestApp(): Promise<Express> {
  const app = express();
  app.set("trust proxy", 1);
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
  app.use(attachLuciaSession);
  app.use(attachStaffSession);
  await registerRoutes(app);
  return app;
}
