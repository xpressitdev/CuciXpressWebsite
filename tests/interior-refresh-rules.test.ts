import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  bruneiDate,
  bruneiSlotInstant,
  generateInteriorRefreshSlots,
  isCalendarDate,
  slotsOverlap,
} from "../server/interiorRefreshRules";

describe("Subscriber Interior Refresh Brunei date rules", () => {
  it("uses the Brunei day at the UTC boundary", () => {
    expect(bruneiDate(new Date("2026-07-01T15:59:59Z"))).toBe("2026-07-01");
    expect(bruneiDate(new Date("2026-07-01T16:00:00Z"))).toBe("2026-07-02");
  });

  it("does calendar arithmetic without month rollover bugs", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("2028-02-29")).toBe(true);
  });

  it("generates authoritative 15-minute choices through 18:15", () => {
    const slots = generateInteriorRefreshSlots();
    expect(slots[0]).toBe("08:00");
    expect(slots.at(-1)).toBe("18:15");
    expect(slots).toHaveLength(42);
    expect(bruneiSlotInstant("2026-07-02", "08:00")?.toISOString())
      .toBe("2026-07-02T00:00:00.000Z");
  });

  it("treats touching appointments as safe but overlapping starts as occupied", () => {
    const at = (minute: number) => new Date(1_800_000_000_000 + minute * 60_000);
    expect(slotsOverlap(at(0), at(45), at(45), at(90))).toBe(false);
    expect(slotsOverlap(at(0), at(45), at(15), at(60))).toBe(true);
    expect(slotsOverlap(at(15), at(60), at(0), at(45))).toBe(true);
  });
});