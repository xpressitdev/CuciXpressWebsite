import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { pool } from "../server/db";
import { createTestApp } from "./helpers/app";
import { expenseOnlyReport } from "../server/expenseViewer";
import type { Express } from "express";

describe("expense-only staff access", () => {
  const id = `expense-${crypto.randomUUID()}`;
  const session = `expense-session-${crypto.randomUUID()}`;
  let app: Express;
  beforeAll(async () => {
    if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL) throw Error("Staging required");
    await pool.query("INSERT INTO staff(id,email,name,role,is_active) VALUES($1,$2,'Expense fixture','expense_viewer',true)", [id,`${id}@test.local`]);
    await pool.query("INSERT INTO auth_sessions(id,user_id,user_type,expires_at) VALUES($1,$2,'staff',now()+interval '1 hour')",[session,id]);
    app = await createTestApp();
  });
  afterAll(async () => {
    await pool.query("DELETE FROM auth_sessions WHERE id=$1",[session]);
    await pool.query("DELETE FROM staff WHERE id=$1",[id]);
  });
  const cookie = () => `cx_staff_session=${session}`;

  it("blocks unrelated reads, writes and hybrid staff endpoints", async () => {
    for (const path of ["/api/admin/dashboard","/api/admin/customers","/api/pos/orders","/api/queue/snapshot","/api/admin/staff"]) {
      expect((await request(app).get(path).set("Cookie",cookie())).status).toBe(403);
    }
    for (const path of ["/api/admin/profit-loss/sync","/api/verify-qr","/api/pos/orders"]) {
      expect((await request(app).post(path).set("Cookie",cookie()).send({})).status).toBe(403);
    }
    expect((await request(app).put("/api/admin/profit-loss/depreciation").set("Cookie",cookie()).send({})).status).toBe(403);
  });
  it("allows only expense report reads and staff identity", async () => {
    expect((await request(app).get("/api/auth/staff/whoami").set("Cookie",cookie())).status).toBe(200);
    const report = await request(app).get("/api/admin/profit-loss?year=2026").set("Cookie",cookie());
    expect(report.status).toBe(200);
    expect(report.body.expenseView).toBe(true);
    expect(report.headers["cache-control"]).toBe("private, no-store");
    for (const month of report.body.months) {
      expect(month.lines.some((line: any) => /revenue|profit|ebitda|margin|depreciation/.test(line.key))).toBe(false);
    }
    expect(Object.keys(report.body.ytd).some(key => /revenue|profit|ebitda|margin|depreciation/.test(key))).toBe(false);
    expect(report.body.coverage.ranges).toBeUndefined();
    expect((await request(app).get("/api/admin/profit-loss/expenses?year=2026&month=6").set("Cookie",cookie())).status).toBe(200);
    expect((await request(app).get("/api/admin/profit-loss?year=2026")).status).toBe(401);
  });
  it("allowlists report fields rather than leaking owner metadata", () => {
    const report = expenseOnlyReport({
      branches: [{ id:"1",name:"Tungku",secretRevenue:987654 }],
      months:[{ month:1, lines:[{key:"revenue",cents:987654},{key:"expense:Staff Wages",label:"Staff Wages",cents:123}] }],
      ytd:{revenue:987654,"expense:Staff Wages":123},secretRevenue:987654,
      coverage:{status:"available",note:"Revenue 987654",ranges:{revenue:987654}},
      sync:{status:"succeeded",lastSuccessfulAt:null,secretRevenue:987654},
    });
    expect(JSON.stringify(report)).not.toContain("987654");
    expect(report.ytd["expense:Staff Wages"]).toBe(123);
  });
});