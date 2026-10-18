import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { pool } from "../server/db";
import { createTestApp } from "./helpers/app";
import { jubliEmasPlate, plateSearchKey } from "../shared/plateFormat";

describe("Jubli Emas formatting", () => {
  it.each(["JUBLIEMAS 2266", "jubli emas2266", "JE 2266", "JE2266"])("normalizes %s", value => {
    expect(jubliEmasPlate(value)).toBe("JE2266");
  });
  it.each(["BBH112", "JEX1234", "JE0123", "JE12345", "JUBLIEMAS", "JUBLIEMAS123A"])("does not guess for %s", value => {
    expect(jubliEmasPlate(value)).toBeNull();
  });
  it("supports prefix searches", () => {
    expect(plateSearchKey("jubli emas")).toBe("JE");
    expect(plateSearchKey("JUBLI EMAS 22")).toBe("JE22");
  });
});

describe("Jubli Emas POS identity protection", () => {
  const tag = randomUUID().slice(0, 8), staff = `je-test-${tag}`, session = randomUUID();
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let numbers: string[] = [], carIds: number[] = [];
  const send = (plate: string) => request(app).post("/api/pos/vehicles")
    .set("Cookie", `cx_staff_session=${session}`).send({license_plate: plate});
  beforeAll(async () => {
    if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL)
      throw Error("Staging database required");
    app = await createTestApp();
    numbers = (await pool.query(`SELECT n::text FROM generate_series(9000,9999) n WHERE NOT EXISTS
      (SELECT 1 FROM cars WHERE regexp_replace(upper(license_plate),'[[:space:]]','','g') IN ('JE'||n,'JUBLIEMAS'||n))
      LIMIT 3`)).rows.map(r => r.n);
    expect(numbers).toHaveLength(3);
    await pool.query("INSERT INTO staff(id,email,name,role,branch_id,is_active) VALUES($1,$2,'JE test','owner',2,true)", [staff, `${staff}@test.invalid`]);
    await pool.query("INSERT INTO auth_sessions(id,user_id,user_type,expires_at) VALUES($1,$2,'staff',now()+interval '1 hour')", [session, staff]);
    for (const plate of [`JUBLI EMAS ${numbers[1]}`, `JE${numbers[2]}`, `JUBLIEMAS${numbers[2]}`]) {
      carIds.push((await pool.query("INSERT INTO cars(license_plate,brand) VALUES($1,$2) RETURNING id", [plate, tag])).rows[0].id);
    }
  });
  afterAll(async () => {
    await pool.query("DELETE FROM cars WHERE brand=$1 OR license_plate=$2", [tag, `JE${numbers[0]}`]);
    await pool.query("DELETE FROM auth_sessions WHERE id=$1", [session]);
    await pool.query("DELETE FROM staff WHERE id=$1", [staff]);
  });
  it("stores a newly entered long-form plate as JE without spaces", async () => {
    const res = await send(`jubli emas ${numbers[0]}`).expect(201);
    expect(res.body.vehicle.license_plate).toBe(`JE${numbers[0]}`);
  });
  it("reuses a unique legacy identity without renaming or duplicating it", async () => {
    const res = await send(`JE${numbers[1]}`).expect(200);
    expect(res.body.vehicle.id).toBe(carIds[0]);
    expect(res.body.vehicle.license_plate).toBe(`JUBLI EMAS ${numbers[1]}`);
  });
  it("blocks ambiguous plate writes without changing either vehicle", async () => {
    const res = await send(`jubli emas ${numbers[2]}`).expect(409);
    expect(res.body.error).toBe("plate_review_required");
    const rows = (await pool.query("SELECT license_plate FROM cars WHERE brand=$1 ORDER BY id", [tag])).rows;
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.license_plate)).toContain(`JE${numbers[2]}`);
    expect(rows.map(r => r.license_plate)).toContain(`JUBLIEMAS${numbers[2]}`);
  });
  it.each(["JE", "JUBLI EMAS"])("searches both stored spellings using %s", async prefix => {
    const res = await request(app).get("/api/pos/vehicles/search")
      .query({q: `${prefix}${numbers[2]}`}).set("Cookie", `cx_staff_session=${session}`).expect(200);
    expect(res.body.vehicles.map((r: any) => r.id).sort()).toEqual(carIds.slice(1).sort());
  });
});
