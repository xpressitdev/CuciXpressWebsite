import type { RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { jubliEmasPlate } from "../shared/plateFormat";

/** New records use JE. Existing identities stay untouched until reviewed. */
export const resolveJubliEmasPlate = (field: string, multiple = false): RequestHandler => async (req, res, next) => {
  const raw = req.body?.[field];
  if (typeof raw !== "string") return next();
  const inputs = multiple ? raw.split(",") : [raw];
  if (!inputs.some(value => jubliEmasPlate(value))) return next();
  if (raw.length > 120) return res.status(400).json({ error: "invalid_plate" });
  try {
    const resolved: string[] = [];
    for (const input of inputs) {
    const canonical = jubliEmasPlate(input);
    if (!canonical) { resolved.push(input); continue; }
    const legacy = canonical.replace(/^JE/, "JUBLIEMAS");
    const matches = (await db.execute(sql`
      SELECT id, license_plate FROM cars
      WHERE UPPER(REGEXP_REPLACE(license_plate, '[[:space:]]', '', 'g'))
        IN (${canonical}, ${legacy})
      LIMIT 2
    `)).rows as Array<{ id: number; license_plate: string }>;
    if (matches.length > 1) {
      return res.status(409).json({
        error: "plate_review_required",
        message: "This Jubli Emas number has multiple vehicle records. Please ask the owner to review them before proceeding. No records have been merged.",
      });
    }
    // Route ownership/claim guards still run on the original, unique identity.
    resolved.push(matches[0]?.license_plate ?? canonical);
    }
    req.body[field] = resolved.join(",");
    return next();
  } catch (err) {
    console.error("[jubli-emas.lookup] failed", err);
    return res.status(503).json({ error: "plate_lookup_failed", message: "Unable to check this plate. Please try again." });
  }
};
