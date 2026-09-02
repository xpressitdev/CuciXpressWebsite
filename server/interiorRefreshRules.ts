export const INTERIOR_REFRESH = {
  id: "subscriber-interior-refresh",
  zone: "Asia/Brunei",
  durationMinutes: 45,
  slotStepMinutes: 15,
  opensAt: "08:00",
  finalStartAt: "18:15",
  maxAdvanceDays: 30,
} as const;

const ymd = /^\d{4}-\d{2}-\d{2}$/;
const hm = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isCalendarDate(value: string): boolean {
  if (!ymd.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function bruneiDate(now = new Date()): string {
  return new Date(now.getTime() + 8 * 60 * 60_000).toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fifteen-minute choices allow the explicitly required final 18:15 start. */
export function generateInteriorRefreshSlots(): string[] {
  const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const start = toMin(INTERIOR_REFRESH.opensAt);
  const end = toMin(INTERIOR_REFRESH.finalStartAt);
  const result: string[] = [];
  for (let n = start; n <= end; n += INTERIOR_REFRESH.slotStepMinutes) {
    result.push(`${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`);
  }
  return result;
}

export function bruneiSlotInstant(date: string, time: string): Date | null {
  if (!isCalendarDate(date) || !hm.test(time)) return null;
  const d = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function slotsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}