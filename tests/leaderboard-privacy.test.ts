import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Express } from "express";
import { createTestApp } from "./helpers/app";
import { leaderboardName, leaderboardPlate } from "../server/leaderboardPrivacy";

neonConfig.webSocketConstructor = ws as any;

describe("customer leaderboard privacy", () => {
  const suffix = Math.random().toString(36).slice(2, 9).toUpperCase();
  const plates = [`LB${suffix}1`, `LP${suffix}2`];
  const sessions = [`sess_lb_${suffix}_1`, `sess_lb_${suffix}_2`];
  const orderIds = [`ord_lb_${suffix}_1`, `ord_lb_${suffix}_2`];
  const users: number[] = [];
  const cars: number[] = [];
  let app: Express;
  let pool: Pool;
  const get = () => request(app).get("/api/customer/leaderboard").set("Cookie", `cx_session=${sessions[0]}`);
  const patch = (body: unknown, session = sessions[1]) =>
    request(app).patch("/api/customer/leaderboard/preference")
      .set("Cookie", `cx_session=${session}`).send(body);

  beforeAll(async () => {
    if (!process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL !== process.env.STAGING_DATABASE_URL) {
      throw new Error("Leaderboard integration tests require STAGING_DATABASE_URL");
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    app = await createTestApp();
    for (let i = 0; i < 2; i++) {
      const user = await pool.query(
        `INSERT INTO users (first_name, last_name, email, password)
         VALUES ($1, $2, $3, 'x') RETURNING id, show_full_plate_on_leaderboard`,
        [`Private${suffix}${i}`, `Family${suffix}${i}`, `lb_${suffix}_${i}@test.local`],
      );
      expect(user.rows[0].show_full_plate_on_leaderboard).toBe(true);
      users.push(user.rows[0].id);
      const car = await pool.query(
        `INSERT INTO cars (user_id, license_plate, last_seen_at)
         VALUES ($1, $2, now()) RETURNING id`,
        [users[i], plates[i]],
      );
      cars.push(car.rows[0].id);
      await pool.query(
        `INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
         VALUES ($1, $2, 'customer', now() + interval '1 day')`,
        [sessions[i], String(users[i])],
      );
      await pool.query(
        `INSERT INTO orders (id, branch_id, customer_id, vehicle_id, plate,
          package_id, package_name, package_price_cents, addons, subtotal_cents,
          total_cents, paid_amount_cents, payment_method, ticket_code, status)
         VALUES ($1, 1, $2, $3, $4, 'pkg_basic_tyre_wax', 'Basic', 1200,
          '[]'::jsonb, 1200, 1200, 1200, 'cash', $5, 'done')`,
        [orderIds[i], users[i], cars[i], plates[i], `T-${suffix}-${i}`],
      );
    }
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query("DELETE FROM orders WHERE id = ANY($1)", [orderIds]);
      await pool.query("DELETE FROM auth_sessions WHERE id = ANY($1)", [sessions]);
      await pool.query("DELETE FROM cars WHERE id = ANY($1)", [cars]);
      await pool.query("DELETE FROM users WHERE id = ANY($1)", [users]);
    } finally {
      await pool.end();
    }
  });

  it("never sends raw names or user IDs; shows everyone's plate by default", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.show_full_plate_on_leaderboard).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(`Private${suffix}`);
    expect(JSON.stringify(response.body)).not.toContain(`Family${suffix}`);
    const me = response.body.entries.find((entry: any) => entry.is_me);
    const other = response.body.entries.find((entry: any) => entry.plate === plates[1]);
    expect(me).toEqual({ rank: expect.any(Number), masked_name: "P••• F•••", wash_count: 1, plate: plates[0], is_me: true });
    expect(other).toEqual({ rank: expect.any(Number), masked_name: "P••• F•••", wash_count: 1, plate: plates[1], is_me: false });
    expect(response.body.my_rank).toBe(me.rank);
  });

  it("accepts only a session-owned strict boolean, and opt-out/opt-in takes effect on next GET", async () => {
    expect((await request(app).get("/api/customer/leaderboard")).status).toBe(401);
    expect((await request(app).patch("/api/customer/leaderboard/preference").send({ show_full_plate_on_leaderboard: true })).status).toBe(401);
    for (const invalid of ["true", 1, null]) {
      expect((await patch({ show_full_plate_on_leaderboard: invalid })).status).toBe(400);
    }
    expect((await patch({ show_full_plate_on_leaderboard: false, user_id: users[0] })).status).toBe(400);
    expect((await patch({ show_full_plate_on_leaderboard: false })).status).toBe(200);
    const off = await get();
    expect(JSON.stringify(off.body)).not.toContain(plates[1]);
    expect(off.body.show_full_plate_on_leaderboard).toBe(true);
    expect(off.body.entries.find((entry: any) => entry.plate === leaderboardPlate(plates[1], false, false)))
      .toMatchObject({ masked_name: "P••• F•••", is_me: false });
    expect(JSON.stringify(off.body)).not.toContain(`Private${suffix}`);
    expect(JSON.stringify(off.body)).not.toContain(`Family${suffix}`);
    expect((await pool.query("SELECT show_full_plate_on_leaderboard FROM users WHERE id = $1", [users[0]])).rows[0].show_full_plate_on_leaderboard).toBe(true);
    expect((await patch({ show_full_plate_on_leaderboard: true })).body)
      .toEqual({ show_full_plate_on_leaderboard: true });
    const on = await get();
    expect(on.body.entries.find((entry: any) => entry.plate === plates[1])).toMatchObject({ masked_name: "P••• F•••", is_me: false });
    expect(JSON.stringify(on.body)).not.toContain(`Private${suffix}`);
    expect(JSON.stringify(on.body)).not.toContain(`Family${suffix}`);
  });
});

describe("short plate masking", () => {
  it("censors every name part before serialization, including short and Unicode names", () => {
    expect(leaderboardName("Kamarul", "Ajimain")).toBe("K••• A•••");
    expect(leaderboardName(" A  B ", "Li")).toBe("A••• B••• L•••");
    expect(leaderboardName("Élodie", "王")).toBe("É••• 王•••");
    expect(leaderboardName(null, " ")).toBe("Customer");
    expect(leaderboardName("<script>", null)).toBe("•••");
  });
  it("mostly conceals short plates and never includes separator leaks", () => {
    expect(leaderboardPlate("A", false, false)).toBe("•");
    expect(leaderboardPlate("AB", false, false)).toBe("••");
    expect(leaderboardPlate("AB 1", false, false)).toBe("••1");
    expect(leaderboardPlate("AB123", false, false)).toBe("••••3");
    expect(leaderboardPlate("AB12345", false, false)).toBe("A••••45");
    expect(leaderboardPlate(null, false, false)).toBeNull();
    expect(leaderboardPlate("AB12345", true, false)).toBe("AB12345");
    expect(leaderboardPlate("AB12345", false, true)).toBe("AB12345");
  });
});