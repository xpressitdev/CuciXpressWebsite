import { describe, expect, it } from "vitest";
import {
  estimateNextAvailableSeconds,
  formatLiveWaitSeconds,
  formatWashingState,
  liveQueueWaitSeconds,
  WASH_DURATION_SECONDS,
} from "@/lib/liveQueue";

const serverTime = "2026-09-13T12:00:00.000Z";
const serverMs = Date.parse(serverTime);

describe("live queue wash timing", () => {
  it("starts an eight-minute estimate from washing_started_at", () => {
    const branch = {
      washing_count: 1,
      queued_count: 0,
      est_wait_seconds: WASH_DURATION_SECONDS,
      est_wait_minutes: 8,
      washing: [{
        plate: "T-1",
        package_name: "Basic",
        washing_started_at: serverTime,
      }],
    };

    expect(liveQueueWaitSeconds(branch, serverTime, serverMs)).toBe(480);
    expect(formatWashingState(branch.washing[0], serverTime, serverMs))
      .toBe("Washing · ~8m");
  });

  it("ticks down from the server anchor and never goes negative", () => {
    const branch = {
      washing_count: 1,
      queued_count: 1,
      est_wait_seconds: 600,
      est_wait_minutes: 10,
      washing: [{
        plate: "T-2",
        package_name: "Basic",
        washing_started_at: serverTime,
      }],
    };

    expect(liveQueueWaitSeconds(branch, serverTime, serverMs + 121_000)).toBe(839);
    expect(formatLiveWaitSeconds(479)).toBe("~7:59");
    expect(liveQueueWaitSeconds(branch, serverTime, serverMs + 900_000)).toBe(480);
    expect(formatWashingState(branch.washing[0], serverTime, serverMs + 900_000))
      .toBe("Washing · finishing");
  });

  it("anchors local ticking to server time despite a skewed phone clock", () => {
    const branch = {
      washing_count: 1,
      queued_count: 0,
      est_wait_seconds: WASH_DURATION_SECONDS,
      est_wait_minutes: 8,
      washing: [{
        plate: "SKEW-1",
        package_name: "Basic",
        washing_started_at: serverTime,
      }],
    };
    const receivedAt = serverMs + 10 * 60 * 1000; // phone is ten minutes fast
    expect(
      liveQueueWaitSeconds(branch, serverTime, receivedAt + 1_000, receivedAt),
    ).toBe(479);
  });

  it("uses the earliest known concurrent lane, not a serial sum", () => {
    const branch = {
      washing_count: 2,
      queued_count: 1,
      est_wait_seconds: 480,
      est_wait_minutes: 8,
      washing: [
        {
          plate: "T-3",
          package_name: "Basic",
          washing_started_at: new Date(serverMs - 60_000).toISOString(),
        },
        {
          plate: "T-4",
          package_name: "Basic",
          washing_started_at: new Date(serverMs - 240_000).toISOString(),
        },
      ],
    };

    // The queued car takes the 4-minute lane; the new arrival can use the
    // other lane in 7 minutes rather than waiting 4 + 8 minutes.
    expect(liveQueueWaitSeconds(branch, serverTime, serverMs)).toBe(420);
  });

  it("assigns multiple queued cars to the earliest lane each time", () => {
    // Existing lanes: 4m and 7m. Q1 makes the first lane 12m; Q2 makes the
    // second 15m; Q3 makes the first 20m. The new arrival is at 15m.
    expect(estimateNextAvailableSeconds([240, 420], 2)).toBe(720);
    expect(estimateNextAvailableSeconds([240, 420], 3)).toBe(900);
  });

  it("keeps an old washing row occupied when its start is unknown", () => {
    const branch = {
      washing_count: 1,
      queued_count: 0,
      est_wait_seconds: null,
      est_wait_minutes: null,
      washing: [{
        plate: "OLD-1",
        package_name: "Basic",
        washing_started_at: null,
      }],
    };

    expect(liveQueueWaitSeconds(branch, serverTime, serverMs)).toBe(480);
    expect(liveQueueWaitSeconds(branch, serverTime, serverMs + 900_000)).toBe(480);
    expect(liveQueueWaitSeconds({ ...branch, queued_count: 1 }, serverTime, serverMs)).toBe(960);
    expect(formatWashingState(branch.washing[0], serverTime, serverMs))
      .toBe("Washing · ~8m estimated");
    expect(formatWashingState({ ...branch.washing[0], washing_started_at: "invalid" }, serverTime, serverMs))
      .toBe("Washing · ~8m estimated");
  });
});