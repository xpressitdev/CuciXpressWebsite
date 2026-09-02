import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
  send: vi.fn(),
}));

vi.mock("../server/db", () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

vi.mock("../server/email", () => ({
  sendInteriorRefreshReminder: mocks.send,
}));

import { deliverDueInteriorRefreshReminders } from "../server/interiorRefreshReminders";

const booking = (id: string, email: string) => ({
  id,
  slot_start: "2026-09-03T02:15:00.000Z",
  license_plate: "B1234",
  brand: "Toyota",
  model: "Vios",
  branch_name: "Tungku Link",
  email,
  first_name: "Aisyah",
});

describe("Interior Refresh reminder worker", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
    mocks.transaction.mockReset();
    mocks.send.mockReset();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({ execute: mocks.execute }));
  });

  it("continues to later due reminders when one recipient fails", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [booking("failed", "bad@example.com")] })
      .mockResolvedValueOnce({ rows: [booking("delivered", "good@example.com")] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.send
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const clock = vi.fn(() => new Date("2026-09-02T02:20:00.000Z"));

    await expect(deliverDueInteriorRefreshReminders(clock)).resolves.toBe(1);

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls.map(([message]) => message.customerEmail))
      .toEqual(["bad@example.com", "good@example.com"]);
    expect(clock).toHaveBeenCalledTimes(3);
  });
});