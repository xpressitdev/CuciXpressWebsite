export const WASH_DURATION_SECONDS = 8 * 60;

export type WashingStartedAt = string | Date | null | undefined;

/**
 * Return the remaining duration for one active wash at a server-clock instant.
 * A missing/invalid start is deliberately unknown; callers must not infer one
 * from created_at or any other historical timestamp.
 */
export function remainingWashSeconds(
  washingStartedAt: WashingStartedAt,
  serverNowMs: number,
): number | null {
  if (!washingStartedAt || !Number.isFinite(serverNowMs)) return null;
  const startedMs = washingStartedAt instanceof Date
    ? washingStartedAt.getTime()
    : Date.parse(String(washingStartedAt));
  if (!Number.isFinite(startedMs)) return null;
  const elapsed = Math.max(0, Math.floor((serverNowMs - startedMs) / 1000));
  return Math.max(0, WASH_DURATION_SECONDS - elapsed);
}

/**
 * Compute the first time a NEW arrival can start after assigning the existing
 * queued cars to the earliest available lane each time.
 *
 * With lanes at 4m and 7m and one queued car, the queued car takes the 4m
 * lane, leaving the new arrival at 7m (not 12m). With no active lanes, the
 * single-line model starts at time zero and preserves the old queue*8 rule.
 */
export function estimateNextAvailableSeconds(
  activeRemainingSeconds: readonly number[],
  queuedCount: number,
): number {
  const lanes = activeRemainingSeconds.length > 0
    ? activeRemainingSeconds.map((seconds) => Math.max(0, Math.floor(seconds)))
    : [0];
  const queued = Math.max(0, Math.floor(queuedCount));

  for (let i = 0; i < queued; i += 1) {
    let earliest = 0;
    for (let lane = 1; lane < lanes.length; lane += 1) {
      if (lanes[lane] < lanes[earliest]) earliest = lane;
    }
    lanes[earliest] += WASH_DURATION_SECONDS;
  }

  return Math.min(...lanes);
}