import { createHash, timingSafeEqual } from "node:crypto";
import type { Express } from "express";
import { investorPeriod } from "./investorPerformance";

export const FINANCIAL_EXPORT_PATH = "/api/integrations/investor/financial-export";
type Exporter = (period: ReturnType<typeof investorPeriod>) => Promise<unknown>;
const digest = (value: string) => createHash("sha256").update(value).digest();

export function registerFinancialExportRoutes(
  app: Express, generate: Exporter,
  key = () => process.env.INVESTOR_EXPORT_API_KEY,
  clock = () => new Date(),
) {
  let busy = false;
  let attempts = 0;
  let windowUntil = 0;
  app.get(FINANCIAL_EXPORT_PATH, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    // No CORS: this endpoint is exclusively a server-to-server boundary.
    const expected = key();
    if (!expected || expected.length < 32) return res.status(503).json({ error: "financial_export_not_configured" });
    const authorization = req.get("Authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(expected))) {
      return res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "unauthorized" });
    }
    let period;
    try {
      if (Object.keys(req.query).some(k => !["year", "quarter"].includes(k)) ||
        req.query.year === undefined || req.query.quarter === undefined) throw Error();
      period = investorPeriod(req.query.year, req.query.quarter, clock());
      if (period.status !== "completed_period") throw Error();
    } catch {
      return res.status(400).json({ error: "invalid_period", message: "Specify a completed quarter from Q3 2026 onward using year and quarter." });
    }
    const now = clock().getTime();
    if (now >= windowUntil) { attempts = 0; windowUntil = now + 60_000; }
    if (busy || attempts >= 3) return res.status(429).set("Retry-After", "60").json({ error: "export_rate_limited" });
    attempts++; busy = true;
    try {
      const result = await generate(period);
      const body = JSON.stringify(result);
      if (Buffer.byteLength(body) > 50 * 1024 * 1024) {
        return res.status(413).json({ error: "export_too_large", message: "No partial export was returned. Contact the source maintainer." });
      }
      return res.type("application/json").send(body);
    } catch {
      // Never log upstream SQL, credentials, raw financial records or error messages.
      console.warn("[investor-export] generation failed");
      return res.status(503).set("Retry-After", "60").json({ error: "financial_export_unavailable" });
    } finally { busy = false; }
  });
}
