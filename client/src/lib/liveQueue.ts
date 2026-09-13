import {
  estimateNextAvailableSeconds,
  remainingWashSeconds,
  WASH_DURATION_SECONDS,
} from "@shared/liveQueue";

export {
  estimateNextAvailableSeconds,
  remainingWashSeconds,
  WASH_DURATION_SECONDS,
} from "@shared/liveQueue";

export interface LiveWashingCar {
  plate: string;
  package_name: string;
  washing_started_at?: string | null;
}

export interface LiveQueueBranch {
  washing_count: number;
  queued_count: number;
  est_wait_seconds?: number | null;
  est_wait_minutes?: number | null;
  washing: LiveWashingCar[];
}

/**
 * Estimate the next available lane using the server-anchored client clock.
 *
 * The server's estimate is useful for older snapshots, but an active wash is
 * recalculated locally so the display can tick once per second without
 * waiting for a network request. Missing starts use the eight-minute default,
 * rather than inventing a timestamp from created_at.
 */
export function liveQueueWaitSeconds(
  branch: LiveQueueBranch,
  serverTime: string | undefined,
  nowMs = Date.now(),
  snapshotReceivedAtMs?: number,
): number | null {
  const washing = branch.washing ?? [];
  if (washing.length === 0) {
    if (typeof branch.est_wait_seconds === "number") {
      return Math.max(0, branch.est_wait_seconds);
    }
    return typeof branch.est_wait_minutes === "number"
      ? Math.max(0, branch.est_wait_minutes * 60)
      : null;
  }

  const serverMs = Date.parse(serverTime ?? "");
  // Once a response is received, advance the server timestamp by elapsed
  // browser time rather than comparing the server timestamp to the phone's
  // wall clock. This prevents a badly-set mobile clock from changing ETA.
  const anchoredNowMs =
    Number.isFinite(serverMs) && Number.isFinite(snapshotReceivedAtMs)
      ? serverMs + (nowMs - (snapshotReceivedAtMs as number))
      : nowMs;
  const remaining = washing.map((car) =>
    remainingWashSeconds(car.washing_started_at, anchoredNowMs),
  );

  return estimateNextAvailableSeconds(
    remaining,
    branch.queued_count,
  );
}

export function formatLiveWaitSeconds(seconds: number | null): string {
  if (seconds === null) return "Time unavailable";
  const safe = Math.max(0, Math.floor(seconds));
  if (safe === 0) return "0m";
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (remainder === 0) return `~${minutes}m`;
  return `~${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatWashingState(
  car: LiveWashingCar,
  serverTime: string | undefined,
  nowMs = Date.now(),
  snapshotReceivedAtMs?: number,
): string {
  if (!car.washing_started_at || !Number.isFinite(Date.parse(car.washing_started_at))) {
    return "Washing · ~8m estimated";
  }
  const serverMs = Date.parse(serverTime ?? "");
  if (!Number.isFinite(serverMs)) {
    return "Washing · ~8m estimated";
  }
  const anchoredNowMs =
    Number.isFinite(snapshotReceivedAtMs)
      ? serverMs + (nowMs - (snapshotReceivedAtMs as number))
      : nowMs;
  const remaining = remainingWashSeconds(car.washing_started_at, anchoredNowMs);
  return remaining > 0
    ? `Washing · ${formatLiveWaitSeconds(remaining)}`
    : "Washing · finishing";
}