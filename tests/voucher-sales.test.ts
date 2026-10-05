import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { pool } from "../server/db";
import { createTestApp } from "./helpers/app";
import { buildPnl } from "../shared/profitLoss";
import { voucherRevenue, voucherSaleSchema } from "../server/voucherSales";

describe("offline voucher sales", () => {
  let app: Express;
  const prefix = `voucher-test-${crypto.randomUUID()}`;
  const staffIds: string[] = [];
  const saleIds: string[] = [];
  const cookies: Record<string, string> = {};
  let branch: number;
  const payload = {
    sale_date: "2026-07-01", buyer: prefix, quantity: 50, unit_price_cents: 900,
    branch_id: null, payment_method: "unspecified", reference: null, notes: null,
  };
  beforeAll(async () => {
    if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL) throw Error("Staging required");
    app = await createTestApp();
    for (const role of ["owner", "manager", "cashier", "lane", "investor", "expense_viewer"]) {
      const id = `${prefix}-${role}`;
      const sid = crypto.randomUUID();
      staffIds.push(id);
      await pool.query("INSERT INTO staff(id,email,name,role,is_active) VALUES($1,$2,'Voucher test',$3,true)", [id, `${id}@test.invalid`, role]);
      await pool.query("INSERT INTO auth_sessions(id,user_id,user_type,expires_at) VALUES($1,$2,'staff',now()+interval '1 hour')", [sid,id]);
      cookies[role] = `cx_staff_session=${sid}`;
    }
    const response = await request(app).get("/api/admin/voucher-sales").set("Cookie",cookies.owner);
    expect(response.status).toBe(200);
    branch = response.body.branches[0].id;
  });
  afterAll(async () => {
    await pool.query("DELETE FROM audit_log WHERE entity_type='voucher_sale' AND entity_id IN (SELECT id FROM voucher_sales WHERE buyer=$1)",[prefix]);
    await pool.query("DELETE FROM voucher_sales WHERE buyer=$1",[prefix]);
    for (const id of staffIds) {
      await pool.query("DELETE FROM auth_sessions WHERE user_type='staff' AND user_id=$1",[id]);
      await pool.query("DELETE FROM staff WHERE id=$1",[id]);
    }
  });
  it("restricts reads, creates, edits, and voids to owners", async () => {
    expect((await request(app).get("/api/admin/voucher-sales")).status).toBe(401);
    for (const role of ["manager","cashier","lane","investor","expense_viewer"]) {
      expect((await request(app).get("/api/admin/voucher-sales").set("Cookie",cookies[role])).status).toBe(403);
      expect((await request(app).post("/api/admin/voucher-sales").set("Cookie",cookies[role]).send(payload)).status).toBe(403);
      expect((await request(app).patch("/api/admin/voucher-sales/missing").set("Cookie",cookies[role]).send(payload)).status).toBe(403);
      expect((await request(app).post("/api/admin/voucher-sales/missing/void").set("Cookie",cookies[role]).send({reason:"Test"})).status).toBe(403);
    }
  });
  it("validates amounts, date ranges, branches and original sale dates", async () => {
    for (const bad of [{quantity:0},{quantity:1.5},{unit_price_cents:0},{sale_date:"2026-02-30"},{sale_date:"2199-01-01"},{total_cents:1},{branch_id:2147483647}]) {
      expect((await request(app).post("/api/admin/voucher-sales").set("Cookie",cookies.owner)
        .send({...payload,...bad,idempotency_key:crypto.randomUUID()})).status).toBe(400);
    }
    expect((await request(app).get("/api/admin/voucher-sales?start_date=2026-01-01").set("Cookie",cookies.owner)).status).toBe(400);
    expect(voucherSaleSchema.safeParse({...payload,quantity:100_000,unit_price_cents:1_000_000}).success).toBe(false);
  });
  it("records exactly once under concurrent retries, without creating POS orders", async () => {
    const key = crypto.randomUUID();
    const body = {...payload,idempotency_key:key};
    const before = Number((await pool.query("SELECT count(*) AS count FROM orders")).rows[0].count);
    const responses = await Promise.all([1,2].map(() => request(app).post("/api/admin/voucher-sales").set("Cookie",cookies.owner).send(body)));
    expect(responses.map(r=>r.status).sort()).toEqual([200,201]);
    const sale = responses[0].body.sale;
    saleIds.push(sale.id);
    expect(responses[1].body.sale.id).toBe(sale.id);
    expect(sale.total_cents).toBe(45000);
    expect(sale.sale_date).toBe("2026-07-01");
    expect(sale.branch_id).toBe(null);
    expect(Number((await pool.query("SELECT count(*) AS count FROM orders")).rows[0].count)).toBe(before);
    expect((await request(app).post("/api/admin/voucher-sales").set("Cookie",cookies.owner).send({...body,quantity:51})).status).toBe(409);
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_log WHERE entity_id=$1 AND action='voucher_sale.created'",[sale.id])).rows[0].count).toBe(1);
  });
  it("feeds sale-date revenue into annual/custom P&L, overall only when branch unspecified", async () => {
    const report = await request(app).get("/api/admin/profit-loss?year=2026").set("Cookie",cookies.owner);
    expect(report.status).toBe(200);
    const july = report.body.months.find((m: any)=>m.month===7);
    expect(july.lines.find((l: any)=>l.key==="voucher_sales_revenue").cents).toBeGreaterThanOrEqual(45000);
    const range = await request(app).get("/api/admin/profit-loss?start_date=2026-07-01&end_date=2026-07-01").set("Cookie",cookies.owner);
    expect(range.status).toBe(200);
    expect(range.body.ytd.voucher_sales_revenue).toBeGreaterThanOrEqual(45000);
    const exp = await request(app).get("/api/admin/profit-loss?year=2026").set("Cookie",cookies.expense_viewer);
    expect(exp.body.ytd.voucher_sales_revenue).toBeUndefined();
    expect(exp.body.months[6].lines.some((l: any)=>l.key==="voucher_sales_revenue")).toBe(false);
    const revenue = [{year:2026,month:7,branchId:null,posNetRevenueCents:0,subscriptionRecognizedGrossCents:0,mdrCents:0,voucherSalesRevenueCents:45000}];
    const overall = buildPnl({branchId:"overall",reportYear:2026,revenue,expenses:[],depreciation:[]})[6];
    expect(overall.lines.find(l=>l.key==="revenue")?.cents).toBe(45000);
    const selected = buildPnl({branchId:String(branch),reportYear:2026,revenue,expenses:[],depreciation:[]})[6];
    expect(selected.lines.find(l=>l.key==="voucher_sales_revenue")?.cents).toBe(0);
  });
  it("edits with an audit trail, filters by date, and voids without deleting history", async () => {
    const id = saleIds[0];
    const edited = await request(app).patch(`/api/admin/voucher-sales/${id}`).set("Cookie",cookies.owner)
      .send({...payload,sale_date:"2026-08-14",quantity:4,branch_id:branch});
    expect(edited.status).toBe(200);
    expect(edited.body.sale.total_cents).toBe(3600);
    const ranged = await request(app).get("/api/admin/voucher-sales?start_date=2026-08-14&end_date=2026-08-14").set("Cookie",cookies.owner);
    expect(ranged.body.sales.some((s:any)=>s.id===id)).toBe(true);
    const outside = await request(app).get("/api/admin/voucher-sales?start_date=2026-07-01&end_date=2026-07-01").set("Cookie",cookies.owner);
    expect(outside.body.sales.some((s:any)=>s.id===id)).toBe(false);
    expect((await request(app).post(`/api/admin/voucher-sales/${id}/void`).set("Cookie",cookies.owner).send({reason:""})).status).toBe(400);
    const before = await voucherRevenue("2026-08-14","2026-08-14");
    expect((await request(app).post(`/api/admin/voucher-sales/${id}/void`).set("Cookie",cookies.owner).send({reason:"Correction fixture"})).body.sale.status).toBe("void");
    const after = await voucherRevenue("2026-08-14","2026-08-14");
    const total = (rows: typeof before) => rows.reduce((n,r)=>n+(r.voucherSalesRevenueCents??0),0);
    expect(total(before)-total(after)).toBe(3600);
    expect((await request(app).patch(`/api/admin/voucher-sales/${id}`).set("Cookie",cookies.owner).send(payload)).status).toBe(409);
    const history = await request(app).get("/api/admin/voucher-sales").set("Cookie",cookies.owner);
    expect(history.body.sales.find((s:any)=>s.id===id).void_reason).toBe("Correction fixture");
  });
});
