import { describe, it, expect } from "vitest";
import { customerHistoryLabel } from "../client/src/lib/customerHistoryLabel";
import { readFileSync } from "node:fs";

describe("Customer history purchase/scan labels", () => {
  const base = { status: "paid", ticket_code: null, qr_provider: "pocket_pay", claimed_at: null };
  it("labels a counter purchase separately, even when paid by wallet", () => {
    expect(customerHistoryLabel({ ...base, order_type: "counter_subscription", status: "done" }))
      .toEqual({ text: "Counter pass purchase", awaitingScan: false });
  });
  it.each(["pocket_pay", "loyalty", "membership"])("marks an unclaimed paid %s wash awaiting scan", qr_provider => {
    expect(customerHistoryLabel({ ...base, qr_provider }).awaitingScan).toBe(true);
  });
  it.each(["pending_payment", "refunded", "voided", "done", "queued", "washing"])
    ("never marks a %s order awaiting scan", status => {
      expect(customerHistoryLabel({ ...base, status }).awaitingScan).toBe(false);
    });
  it("preserves issued tickets and does not infer scan state from a missing ticket", () => {
    expect(customerHistoryLabel({ ...base, ticket_code: "S-123" }).text).toBe("S-123");
    expect(customerHistoryLabel({ ...base, claimed_at: "2026-10-07T12:00:00Z" }).awaitingScan).toBe(false);
    expect(customerHistoryLabel({ ...base, claimed_at: undefined }).awaitingScan).toBe(false);
    expect(customerHistoryLabel({ ...base, qr_provider: null }).awaitingScan).toBe(false);
    expect(customerHistoryLabel({ ...base, status: "done", qr_provider: null }).text).toBe("Completed");
  });
  it("supplies type and claim state on both customer and walk-in profile queries", () => {
    const source = readFileSync("server/routes.ts", "utf8");
    const route = source.slice(source.indexOf("app.get('/api/admin/customers/:id'"),
      source.indexOf("app.patch('/api/admin/customers/:id'"));
    const selections = [...route.matchAll(/SELECT o\.id, o\.ticket_code[\s\S]*?FROM orders o/g)];
    expect(selections).toHaveLength(2);
    for (const [query] of selections) {
      expect(query).toContain("o.order_type");
      expect(query).toContain("o.claimed_at");
    }
  });
});
