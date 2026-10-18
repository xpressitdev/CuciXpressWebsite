import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { pool } from "../server/db";
import { createTestApp } from "./helpers/app";

describe("Order Report uses scan time in table and Excel", () => {
  const tag = randomUUID().slice(0, 8);
  const staff = `report-date-${tag}`, session = randomUUID();
  let app: Awaited<ReturnType<typeof createTestApp>>;
  const created = "2026-10-16T09:42:20.000Z";
  // 00:06 Brunei on the 18th, still the 17th UTC.
  const claimed = "2026-10-17T16:06:05.000Z";
  const cases = [
    { name: "membership", provider: "membership", method: "subscription", claim: claimed },
    { name: "loyalty", provider: "loyalty", method: "voucher", claim: claimed },
    { name: "web", provider: "pocket_pay", method: "qr_code", claim: claimed },
    { name: "cash", provider: null, method: "cash", claim: claimed },
    { name: "legacy-membership", provider: "membership", method: "subscription", claim: null },
    { name: "unclaimed-web", provider: "pocket_pay", method: "qr_code", claim: null },
  ];
  const get = (date: string, exporting = false) => request(app)
    .get(`/api/admin/reports/orders${exporting ? "/export" : ""}`)
    .query({ from: date, to: date, search: tag })
    .set("Cookie", `cx_staff_session=${session}`);

  beforeAll(async () => {
    if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL)
      throw Error("Staging database required");
    app = await createTestApp();
    await pool.query("INSERT INTO staff(id,email,name,role,branch_id,is_active) VALUES($1,$2,'Report test','owner',2,true)", [staff, `${staff}@test.invalid`]);
    await pool.query("INSERT INTO auth_sessions(id,user_id,user_type,expires_at) VALUES($1,$2,'staff',now()+interval '1 hour')", [session, staff]);
    for (const c of cases) {
      await pool.query(`INSERT INTO orders
        (id,branch_id,staff_id,plate,package_name,package_price_cents,subtotal_cents,total_cents,
         payment_method,qr_provider,status,created_at,claimed_at,payment_ref)
        VALUES($1,2,$2,$3,'Report date test',0,0,0,$4,$5,$6,$7,$8,$9)`,
        [`date-${tag}-${c.name}`, staff, tag, c.method, c.provider,
          c.name === "unclaimed-web" ? "paid" : "done", created, c.claim, `ref-${tag}-${c.name}`]);
    }
  });
  afterAll(async () => {
    await pool.query("DELETE FROM orders WHERE staff_id=$1", [staff]);
    await pool.query("DELETE FROM auth_sessions WHERE id=$1", [session]);
    await pool.query("DELETE FROM staff WHERE id=$1", [staff]);
  });
  it("includes all three scanned QR providers on the scan day, retaining creation time for audit", async () => {
    const res = await get("2026-10-18").expect(200);
    expect(res.body.rows).toHaveLength(3);
    for (const row of res.body.rows) {
      expect(new Date(row.report_at).toISOString()).toBe(claimed);
      expect(new Date(row.created_at).toISOString()).toBe(created);
    }
  });
  it("keeps POS and legacy no-claim records on creation day and excludes unclaimed web payments", async () => {
    const res = await get("2026-10-16").expect(200);
    expect(res.body.rows.map((r: any) => r.id).sort()).toEqual(
      [`date-${tag}-cash`, `date-${tag}-legacy-membership`].sort());
    for (const row of res.body.rows) expect(new Date(row.report_at).toISOString()).toBe(created);
  });
  it.each(["2026-10-18", "2026-10-16"])("exports matching Brunei date and time for %s", async date => {
    const res = await get(date, true).buffer(true).parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => callback(null, Buffer.concat(chunks)));
    }).expect(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(res.body);
    const sheet = book.worksheets[0];
    expect(sheet.rowCount).toBe(date.endsWith("18") ? 4 : 3);
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const dt = row.getCell(3).value as Date;
      expect(dt.toISOString().slice(0, 10)).toBe(date);
      const time = row.getCell(4).value;
      const seconds = time instanceof Date
        ? time.getUTCHours() * 3600 + time.getUTCMinutes() * 60 + time.getUTCSeconds()
        : Math.round(Number(time) * 86400);
      expect(seconds).toBe(date.endsWith("18") ? 6 * 60 + 5 : 17 * 3600 + 42 * 60 + 20);
    }
  });
});
