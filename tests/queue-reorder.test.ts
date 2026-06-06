import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Express } from "express";
import { createTestApp } from "./helpers/app";

neonConfig.webSocketConstructor = ws as any;

// Boots the real route handlers against the STAGING database
// (vitest.config.ts rewires DATABASE_URL -> STAGING_DATABASE_URL). These
// tests MUST NOT run against the shared dev/prod DB.
//
// Focus: "busy multi-device" Lane-control queue edits — the reorder endpoint
// (PATCH /api/pos/queue/reorder) and send-back-to-queue / start-wash status
// transitions racing across two cashier devices. To stay deterministic we
// create our OWN branch so the branch's queued set contains only our seeded
// orders (the reorder route operates on every queued order for a branch,
// with no date filter, so a shared branch would mix in stray rows).
const DB_URL = process.env.DATABASE_URL ?? "";

const rid = () => Math.random().toString(36).slice(2, 10);

describe("Lane control — busy multi-device queue edits", () => {
  let app: Express;
  let pool: Pool;

  const suffix = rid();
  const staffId = `staff_q_${suffix}`;
  const staffSessionId = `sess_sq_${suffix}`;
  const staffCookie = `cx_staff_session=${staffSessionId}`;
  // A cashier at a DIFFERENT branch — used to prove the branch lock.
  const otherStaffId = `staff_qo_${suffix}`;
  const otherSessionId = `sess_sqo_${suffix}`;
  const otherCookie = `cx_staff_session=${otherSessionId}`;

  let branchId: number;
  let otherBranchId: number;
  // Every order id we create, for teardown.
  const createdOrderIds: string[] = [];

  // Insert one order directly. `minutesAgo` controls created_at so FIFO
  // fallback (queue_position NULL) is deterministic; lower minutesAgo = newer.
  const seedOrder = async (opts: {
    status: "queued" | "washing";
    minutesAgo: number;
    queuePosition?: number | null;
    branch?: number;
  }): Promise<{ id: string; plate: string }> => {
    const id = `ord_q_${suffix}_${rid()}`;
    const plate = `Q${suffix.toUpperCase().slice(0, 4)}${createdOrderIds.length}`;
    await pool.query(
      `INSERT INTO orders
         (id, branch_id, plate, package_name, package_price_cents,
          subtotal_cents, total_cents, payment_method, status,
          queue_position, created_at)
       VALUES ($1, $2, $3, 'Test Wash', 1500, 1500, 1500, 'cash', $4, $5,
               now() - ($6 || ' minutes')::interval)`,
      [
        id,
        opts.branch ?? branchId,
        plate,
        opts.status,
        opts.queuePosition ?? null,
        String(opts.minutesAgo),
      ],
    );
    createdOrderIds.push(id);
    return { id, plate };
  };

  // The branch's full queued set, front-first, as the route sees it.
  const queuedOrder = async (branch = branchId): Promise<string[]> => {
    const r = await pool.query(
      `SELECT id FROM orders
        WHERE branch_id = $1 AND status = 'queued'
        ORDER BY queue_position ASC NULLS LAST, created_at ASC`,
      [branch],
    );
    return r.rows.map((x: any) => x.id);
  };

  const positionsById = async (
    ids: string[],
  ): Promise<Record<string, number | null>> => {
    const r = await pool.query(
      `SELECT id, queue_position FROM orders WHERE id = ANY($1)`,
      [ids],
    );
    const out: Record<string, number | null> = {};
    for (const row of r.rows as any[]) out[row.id] = row.queue_position;
    return out;
  };

  beforeAll(async () => {
    if (!DB_URL) {
      throw new Error(
        "STAGING_DATABASE_URL is not set — refusing to run DB tests without a staging DB.",
      );
    }
    pool = new Pool({ connectionString: DB_URL });
    app = await createTestApp();

    const b = await pool.query(
      `INSERT INTO branches
         (name, location, google_maps_url, google_maps_embed_url, review_url, is_open)
       VALUES ($1, 'Test Lane', 'http://x', 'http://x', 'http://x', true)
       RETURNING id`,
      [`Test Branch ${suffix}`],
    );
    branchId = b.rows[0].id;
    const b2 = await pool.query(
      `INSERT INTO branches
         (name, location, google_maps_url, google_maps_embed_url, review_url, is_open)
       VALUES ($1, 'Other Lane', 'http://x', 'http://x', 'http://x', true)
       RETURNING id`,
      [`Other Branch ${suffix}`],
    );
    otherBranchId = b2.rows[0].id;

    await pool.query(
      `INSERT INTO staff (id, email, name, role, branch_id, is_active, password_hash)
       VALUES ($1, $2, $3, 'cashier', $4, true, 'x')`,
      [staffId, `staff_q_${suffix}@test.local`, `Cashier ${suffix}`, branchId],
    );
    await pool.query(
      `INSERT INTO staff (id, email, name, role, branch_id, is_active, password_hash)
       VALUES ($1, $2, $3, 'cashier', $4, true, 'x')`,
      [otherStaffId, `staff_qo_${suffix}@test.local`, `Cashier2 ${suffix}`, otherBranchId],
    );
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
       VALUES ($1, $2, 'staff', now() + interval '1 day')`,
      [staffSessionId, staffId],
    );
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, user_type, expires_at)
       VALUES ($1, $2, 'staff', now() + interval '1 day')`,
      [otherSessionId, otherStaffId],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      if (createdOrderIds.length) {
        await pool.query(`DELETE FROM orders WHERE id = ANY($1)`, [createdOrderIds]);
      }
      await pool.query(`DELETE FROM auth_sessions WHERE id = ANY($1)`, [
        [staffSessionId, otherSessionId],
      ]);
      await pool.query(`DELETE FROM staff WHERE id = ANY($1)`, [
        [staffId, otherStaffId],
      ]);
      await pool.query(`DELETE FROM branches WHERE id = ANY($1)`, [
        [branchId, otherBranchId],
      ]);
    } finally {
      await pool.end();
    }
  });

  it("rejects an unauthenticated reorder", async () => {
    const res = await request(app)
      .patch("/api/pos/queue/reorder")
      .send({ branch_id: branchId, order_ids: ["x"] });
    expect(res.status).toBe(401);
  });

  it("validates the request body (missing order_ids)", async () => {
    const res = await request(app)
      .patch("/api/pos/queue/reorder")
      .set("Cookie", staffCookie)
      .send({ branch_id: branchId });
    expect(res.status).toBe(400);
  });

  it("writes sequential queue_position for a valid reorder", async () => {
    // Seed three queued cars (FIFO order o1, o2, o3 by created_at).
    const o1 = await seedOrder({ status: "queued", minutesAgo: 30 });
    const o2 = await seedOrder({ status: "queued", minutesAgo: 20 });
    const o3 = await seedOrder({ status: "queued", minutesAgo: 10 });

    // Desired order: o3 first, then o1, then o2.
    const desired = [o3.id, o1.id, o2.id];
    const res = await request(app)
      .patch("/api/pos/queue/reorder")
      .set("Cookie", staffCookie)
      .send({ branch_id: branchId, order_ids: desired });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const pos = await positionsById(desired);
    expect(pos[o3.id]).toBe(0);
    expect(pos[o1.id]).toBe(1);
    expect(pos[o2.id]).toBe(2);

    // The branch's effective order now follows queue_position.
    expect(await queuedOrder()).toEqual(desired);

    // The POS today route exposes queue_position so the client can sort.
    const today = await request(app)
      .get(`/api/pos/orders/today?branch_id=${branchId}`)
      .set("Cookie", staffCookie);
    expect(today.status).toBe(200);
    const byId = new Map<string, any>(
      today.body.orders.map((o: any) => [o.id, o]),
    );
    expect(byId.get(o3.id).queue_position).toBe(0);
    expect(byId.get(o1.id).queue_position).toBe(1);
    expect(byId.get(o2.id).queue_position).toBe(2);
  });

  it("rejects a stale reorder that is missing a queued car (409)", async () => {
    const current = await queuedOrder();
    expect(current.length).toBeGreaterThanOrEqual(3);
    const before = await positionsById(current);

    // Drop one id — no longer an exact permutation of what's queued.
    const stale = current.slice(0, current.length - 1);
    const res = await request(app)
      .patch("/api/pos/queue/reorder")
      .set("Cookie", staffCookie)
      .send({ branch_id: branchId, order_ids: stale });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("queue_changed");
    // Nothing moved.
    expect(await positionsById(current)).toEqual(before);
  });

  it("rejects a reorder that includes an unknown car (409)", async () => {
    const current = await queuedOrder();
    const res = await request(app)
      .patch("/api/pos/queue/reorder")
      .set("Cookie", staffCookie)
      .send({ branch_id: branchId, order_ids: [...current, "ord_does_not_exist"] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("queue_changed");
  });

  it("rejects a reorder with a duplicated car id (409)", async () => {
    const current = await queuedOrder();
    // Same length as the queued set, but one id repeated and one dropped.
    const dup = [...current.slice(0, current.length - 1), current[0]];
    const res = await request(app)
      .patch("/api/pos/queue/reorder")
      .set("Cookie", staffCookie)
      .send({ branch_id: branchId, order_ids: dup });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("queue_changed");
  });

  it("rejects a cashier reordering another branch's queue (403)", async () => {
    const current = await queuedOrder();
    const res = await request(app)
      .patch("/api/pos/queue/reorder")
      .set("Cookie", otherCookie) // cashier locked to otherBranchId
      .send({ branch_id: branchId, order_ids: current });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("branch_mismatch");
  });

  it("a stale reorder loses to a concurrent send-back-to-queue (409)", async () => {
    // One car is mid-wash; the cashier device loaded the queue BEFORE it was
    // sent back. Sending it back changes the queued set, so the device's
    // now-stale list is rejected instead of silently dropping the new car.
    const washing = await seedOrder({ status: "washing", minutesAgo: 5 });
    const staleList = await queuedOrder(); // does NOT include the washing car

    const back = await request(app)
      .patch(`/api/pos/orders/${washing.id}/status`)
      .set("Cookie", staffCookie)
      .send({ to: "queued" });
    expect(back.status).toBe(200);
    expect(back.body.order.status).toBe("queued");

    // The device replays its pre-send list — now missing the re-queued car.
    const res = await request(app)
      .patch("/api/pos/queue/reorder")
      .set("Cookie", staffCookie)
      .send({ branch_id: branchId, order_ids: staleList });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("queue_changed");
  });

  it("front-inserts a car sent back from washing ahead of the queue", async () => {
    // After the previous test, the re-queued car should sit at the front
    // (queue_position = MIN(queued) - 1), i.e. lower than every other.
    const current = await queuedOrder();
    const pos = await positionsById(current);
    // The first in effective order is the re-queued (washing->queued) car.
    const frontId = current[0];
    const frontPos = pos[frontId];
    expect(frontPos).not.toBeNull();
    const others = current
      .filter((id) => id !== frontId)
      .map((id) => pos[id])
      .filter((p): p is number => p != null);
    for (const p of others) {
      expect((frontPos as number)).toBeLessThan(p);
    }
  });

  it("keeps queue_position a clean permutation when two devices reorder at once", async () => {
    const current = await queuedOrder();
    expect(current.length).toBeGreaterThanOrEqual(3);

    // Two devices submit different — but each individually valid — orders of
    // the SAME set at the same instant. The FOR UPDATE txn serialises them;
    // whichever commits last wins, but positions must never end up duplicated
    // or null (no interleaved half-applied ordering).
    const a = [...current].reverse();
    const b = [current[1], current[0], ...current.slice(2)];

    const [ra, rb] = await Promise.all([
      request(app)
        .patch("/api/pos/queue/reorder")
        .set("Cookie", staffCookie)
        .send({ branch_id: branchId, order_ids: a }),
      request(app)
        .patch("/api/pos/queue/reorder")
        .set("Cookie", staffCookie)
        .send({ branch_id: branchId, order_ids: b }),
    ]);

    // Both lists were exact permutations, so both succeed.
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);

    const pos = await positionsById(current);
    const values = current.map((id) => pos[id]);
    // No nulls, all distinct, contiguous 0..n-1.
    expect(values.every((v) => v != null)).toBe(true);
    const sorted = [...(values as number[])].sort((x, y) => x - y);
    expect(sorted).toEqual(current.map((_, i) => i));

    // Final order matches exactly one of the two submitted lists.
    const finalOrder = await queuedOrder();
    const matchesA = JSON.stringify(finalOrder) === JSON.stringify(a);
    const matchesB = JSON.stringify(finalOrder) === JSON.stringify(b);
    expect(matchesA || matchesB).toBe(true);
  });

  it("two devices starting the same wash transition it exactly once (idempotent)", async () => {
    const car = await seedOrder({ status: "queued", minutesAgo: 1 });

    // Both phones tap "Start wash" at the same instant. The FOR UPDATE txn
    // serialises them: one performs the real queued->washing transition, the
    // other sees it already washing and is a safe no-op. Neither corrupts the
    // row, so both return 200 — the second is idempotent, not an error.
    const [r1, r2] = await Promise.all([
      request(app)
        .patch(`/api/pos/orders/${car.id}/status`)
        .set("Cookie", staffCookie)
        .send({ to: "washing" }),
      request(app)
        .patch(`/api/pos/orders/${car.id}/status`)
        .set("Cookie", staffCookie)
        .send({ to: "washing" }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // Exactly one did the real transition; the other was a no-op.
    const realTransitions = [r1, r2].filter(
      (r) => r.body.order.no_op === false,
    ).length;
    expect(realTransitions).toBe(1);

    // The car ends up washing.
    const row = await pool.query(`SELECT status FROM orders WHERE id = $1`, [car.id]);
    expect(row.rows[0].status).toBe("washing");
  });

  it("rejects an illegal status transition (done -> washing) with 409", async () => {
    const car = await seedOrder({ status: "washing", minutesAgo: 1 });
    // Finish it.
    const done = await request(app)
      .patch(`/api/pos/orders/${car.id}/status`)
      .set("Cookie", staffCookie)
      .send({ to: "done" });
    expect(done.status).toBe(200);
    // You cannot rewind a finished wash back to washing.
    const res = await request(app)
      .patch(`/api/pos/orders/${car.id}/status`)
      .set("Cookie", staffCookie)
      .send({ to: "washing" });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("invalid_transition_from_done");
  });

  it("a reorder racing a send-back-to-queue either applies or is rejected — never corrupts", async () => {
    // Same instant: device A reorders the queue it currently sees, while
    // device B pulls a washing car back into that same queue (changing the
    // membership). Depending on which txn commits first, A's reorder either
    // applies cleanly (committed before B) or is rejected as stale
    // (committed after B added a car). It must never half-apply.
    const washing = await seedOrder({ status: "washing", minutesAgo: 6 });
    const current = await queuedOrder(); // A's view — excludes the washing car
    expect(current.length).toBeGreaterThanOrEqual(2);

    const [reorder, back] = await Promise.all([
      request(app)
        .patch("/api/pos/queue/reorder")
        .set("Cookie", staffCookie)
        .send({ branch_id: branchId, order_ids: [...current].reverse() }),
      request(app)
        .patch(`/api/pos/orders/${washing.id}/status`)
        .set("Cookie", staffCookie)
        .send({ to: "queued" }),
    ]);

    // The send-back always succeeds.
    expect(back.status).toBe(200);
    expect(back.body.order.status).toBe("queued");
    // The reorder is binary: applied (200) or cleanly rejected as stale (409).
    expect([200, 409]).toContain(reorder.status);
    if (reorder.status === 409) {
      expect(reorder.body.error).toBe("queue_changed");
    }

    // Whatever happened, the queue is consistent: every queued car has a
    // position or NULL, with no duplicate non-null positions.
    const after = await queuedOrder();
    expect(after).toContain(washing.id);
    const pos = await positionsById(after);
    const nonNull = after.map((id) => pos[id]).filter((p): p is number => p != null);
    expect(new Set(nonNull).size).toBe(nonNull.length);
  });

  it("two devices sending the same washing car back transition it once (idempotent)", async () => {
    const car = await seedOrder({ status: "washing", minutesAgo: 4 });

    const [r1, r2] = await Promise.all([
      request(app)
        .patch(`/api/pos/orders/${car.id}/status`)
        .set("Cookie", staffCookie)
        .send({ to: "queued" }),
      request(app)
        .patch(`/api/pos/orders/${car.id}/status`)
        .set("Cookie", staffCookie)
        .send({ to: "queued" }),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const realTransitions = [r1, r2].filter(
      (r) => r.body.order.no_op === false,
    ).length;
    expect(realTransitions).toBe(1);

    const row = await pool.query(`SELECT status FROM orders WHERE id = $1`, [car.id]);
    expect(row.rows[0].status).toBe("queued");
  });

  it("public snapshot lists queued cars in queue_position order, washing first", async () => {
    // Reset to a known set on our branch: one washing + two queued in a
    // chosen order. Move everything else out of the way by marking prior
    // queued cars done so the snapshot for our branch is predictable.
    await pool.query(
      `UPDATE orders SET status = 'done', completed_at = now()
        WHERE branch_id = $1 AND status IN ('queued','washing')`,
      [branchId],
    );

    const w = await seedOrder({ status: "washing", minutesAgo: 9 });
    const q1 = await seedOrder({ status: "queued", minutesAgo: 8 });
    const q2 = await seedOrder({ status: "queued", minutesAgo: 7 });

    // Put q2 ahead of q1 manually.
    const reorder = await request(app)
      .patch("/api/pos/queue/reorder")
      .set("Cookie", staffCookie)
      .send({ branch_id: branchId, order_ids: [q2.id, q1.id] });
    expect(reorder.status).toBe(200);

    const snap = await request(app).get("/api/queue/snapshot");
    expect(snap.status).toBe(200);
    const mine = snap.body.branches.find((b: any) => b.id === branchId);
    expect(mine).toBeTruthy();

    // Washing car is surfaced in the washing lane, not the queue.
    expect(mine.washing.map((o: any) => o.plate)).toContain(w.plate);
    // Queue reflects the manual order: q2 before q1.
    const queuedPlates = mine.queued.map((o: any) => o.plate);
    expect(queuedPlates).toEqual([q2.plate, q1.plate]);
  });
});
