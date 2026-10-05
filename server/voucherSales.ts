import crypto from "node:crypto";
import type { Express, Response } from "express";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { requireStaff, requireStaffRole } from "./auth/middleware";
import { PNL_BRANCH_NAMES, type PnlRevenueInput } from "../shared/profitLoss";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= "2000-01-01" && value <= "2200-12-31";
}, "Invalid date");
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null);
export const voucherSaleSchema = z.object({
  sale_date: dateOnly.refine(value => value <= new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10), "Sale date cannot be in the future"),
  buyer: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(100_000),
  unit_price_cents: z.number().int().min(1).max(1_000_000),
  branch_id: z.number().int().positive().nullable().default(null),
  payment_method: z.enum(["unspecified", "cash", "bank_transfer", "card", "qr_code"]).default("unspecified"),
  reference: nullableText(200),
  notes: nullableText(2000),
}).strict().refine(v => v.quantity * v.unit_price_cents <= 2_000_000_000, "Total too large");

const selection = sql`v.id, v.sale_date::text, v.buyer, v.quantity, v.unit_price_cents,
  v.total_cents, v.branch_id, b.name AS branch_name, v.payment_method, v.reference,
  v.notes, v.status, v.void_reason, v.created_at`;
class SaleError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function fail(res: Response, error: unknown) {
  if (error instanceof SaleError) return res.status(error.status).json({ error: error.message });
  if ((error as any)?.code === "23503") return res.status(400).json({ error: "Invalid branch" });
  console.error("[voucher-sales] operation failed", (error as any)?.code ?? "unknown");
  return res.status(503).json({ error: "Voucher sales are unavailable. Please retry." });
}
async function branches() {
  const rows = (await db.execute(sql`SELECT id,name FROM branches ORDER BY id`)).rows as Array<{id: number; name: string}>;
  return rows.filter(b => PNL_BRANCH_NAMES.some(n => b.name.trim().toLowerCase().replace(/^cuci xpress /, "") === n.toLowerCase()));
}
async function checkBranch(id: number | null) {
  if (id !== null && !(await branches()).some(b => b.id === id)) throw new SaleError(400, "Invalid P&L branch");
}
async function readSale(tx: any, id: string) {
  return (await tx.execute(sql`SELECT ${selection} FROM voucher_sales v LEFT JOIN branches b ON b.id=v.branch_id WHERE v.id=${id}`)).rows[0];
}
async function audit(tx: any, actor: string | null, action: string, id: string, metadata: unknown) {
  await tx.execute(sql`INSERT INTO audit_log(actor_id,actor_type,action,entity_type,entity_id,metadata)
    VALUES(${actor},${actor ? "staff" : "system"},${action},'voucher_sale',${id},${JSON.stringify(metadata)}::jsonb)`);
}

/** Idempotent insert shared by the authenticated route and explicitly authorized backfills. */
export async function createVoucherSale(input: unknown, idempotencyKey: string, actor: string | null) {
  const data = voucherSaleSchema.parse(input);
  await checkBranch(data.branch_id);
  const hash = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  return db.transaction(async tx => {
    const id = crypto.randomUUID();
    const inserted = await tx.execute(sql`INSERT INTO voucher_sales
      (id,idempotency_key,request_hash,sale_date,buyer,quantity,unit_price_cents,total_cents,branch_id,payment_method,reference,notes,created_by)
      VALUES(${id},${idempotencyKey},${hash},${data.sale_date}::date,${data.buyer},${data.quantity},
        ${data.unit_price_cents},${data.quantity * data.unit_price_cents},${data.branch_id},
        ${data.payment_method},${data.reference},${data.notes},${actor})
      ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`);
    if (!inserted.rows.length) {
      const existing = (await tx.execute(sql`SELECT id,request_hash FROM voucher_sales WHERE idempotency_key=${idempotencyKey}`)).rows[0] as any;
      if (!existing || existing.request_hash !== hash) throw new SaleError(409, "This request was already used for a different sale");
      return { sale: await readSale(tx, existing.id), created: false };
    }
    const sale = await readSale(tx, id);
    await audit(tx, actor, "voucher_sale.created", id, { after: sale });
    return { sale, created: true };
  });
}

export async function voucherRevenue(start: string, end: string): Promise<PnlRevenueInput[]> {
  const result = await db.execute(sql`SELECT extract(year FROM sale_date)::int AS year,
    extract(month FROM sale_date)::int AS month,branch_id::text AS branch_id,sum(total_cents)::bigint AS cents
    FROM voucher_sales WHERE status='active' AND sale_date BETWEEN ${start}::date AND ${end}::date
    GROUP BY 1,2,3`);
  return result.rows.map((r: any) => ({
    year: Number(r.year), month: Number(r.month), branchId: r.branch_id,
    posNetRevenueCents: 0, subscriptionRecognizedGrossCents: 0, mdrCents: 0,
    voucherSalesRevenueCents: Number(r.cents),
  }));
}

export function registerVoucherSalesRoutes(app: Express) {
  const guard = [requireStaff, requireStaffRole("owner")];
  app.get("/api/admin/voucher-sales", ...guard, async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    const { start_date: start, end_date: end } = req.query;
    if ((start !== undefined || end !== undefined)
      && (!dateOnly.safeParse(start).success || !dateOnly.safeParse(end).success || String(start) > String(end))) {
      return res.status(400).json({ error: "Provide a valid start and end date" });
    }
    try {
      const range = start === undefined ? sql`true` : sql`v.sale_date BETWEEN ${start}::date AND ${end}::date`;
      const [rows, branchList] = await Promise.all([
        db.execute(sql`SELECT ${selection} FROM voucher_sales v LEFT JOIN branches b ON b.id=v.branch_id
          WHERE ${range} ORDER BY v.sale_date DESC,v.created_at DESC`),
        branches(),
      ]);
      const active = rows.rows.filter((r: any) => r.status === "active") as any[];
      return res.json({ sales: rows.rows, branches: branchList, summary: {
        quantity: active.reduce((n, r) => n + r.quantity, 0),
        total_cents: active.reduce((n, r) => n + r.total_cents, 0),
      } });
    } catch (e) { return fail(res, e); }
  });
  app.post("/api/admin/voucher-sales", ...guard, async (req, res) => {
    const { idempotency_key: key, ...input } = req.body ?? {};
    const parsed = voucherSaleSchema.safeParse(input);
    if (!z.string().uuid().safeParse(key).success || !parsed.success) return res.status(400).json({ error: "Invalid voucher sale" });
    try {
      const result = await createVoucherSale(parsed.data, key, req.staff!.user!.id);
      return res.status(result.created ? 201 : 200).json({ sale: result.sale });
    } catch (e) { return fail(res, e); }
  });
  app.patch("/api/admin/voucher-sales/:id", ...guard, async (req, res) => {
    const parsed = voucherSaleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid voucher sale" });
    const d = parsed.data;
    try {
      await checkBranch(d.branch_id);
      const sale = await db.transaction(async tx => {
        const before = (await tx.execute(sql`SELECT * FROM voucher_sales WHERE id=${req.params.id} FOR UPDATE`)).rows[0] as any;
        if (!before) throw new SaleError(404, "Voucher sale not found");
        if (before.status !== "active") throw new SaleError(409, "Voided sales cannot be edited");
        await tx.execute(sql`UPDATE voucher_sales SET sale_date=${d.sale_date}::date,buyer=${d.buyer},
          quantity=${d.quantity},unit_price_cents=${d.unit_price_cents},total_cents=${d.quantity*d.unit_price_cents},
          branch_id=${d.branch_id},payment_method=${d.payment_method},reference=${d.reference},notes=${d.notes},updated_at=now()
          WHERE id=${req.params.id}`);
        const after = await readSale(tx, req.params.id);
        await audit(tx, req.staff!.user!.id, "voucher_sale.updated", String(req.params.id), { before, after });
        return after;
      });
      return res.json({ sale });
    } catch (e) { return fail(res, e); }
  });
  app.post("/api/admin/voucher-sales/:id/void", ...guard, async (req, res) => {
    const parsed = z.object({ reason: z.string().trim().min(1).max(1000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "A void reason is required" });
    try {
      const sale = await db.transaction(async tx => {
        const before = (await tx.execute(sql`SELECT * FROM voucher_sales WHERE id=${req.params.id} FOR UPDATE`)).rows[0] as any;
        if (!before) throw new SaleError(404, "Voucher sale not found");
        if (before.status === "active") {
          await tx.execute(sql`UPDATE voucher_sales SET status='void',void_reason=${parsed.data.reason},updated_at=now() WHERE id=${req.params.id}`);
          await audit(tx, req.staff!.user!.id, "voucher_sale.voided", String(req.params.id), { before, reason: parsed.data.reason });
        }
        return readSale(tx, req.params.id);
      });
      return res.json({ sale });
    } catch (e) { return fail(res, e); }
  });
}
