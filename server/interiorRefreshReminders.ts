import { sql } from "drizzle-orm";
import { db } from "./db";
import { sendInteriorRefreshReminder } from "./email";
import { addCalendarDays, bruneiDate } from "./interiorRefreshRules";

const REMINDER_LEAD_MS = 24 * 60 * 60_000;
const POLL_MS = 5 * 60_000;
let started = false;
let running = false;
let timer: NodeJS.Timeout | undefined;

export async function deliverDueInteriorRefreshReminders(
  clock: () => Date = () => new Date(),
): Promise<number> {
  if (running) return 0;
  running = true;
  let delivered = 0;
  const failedBookingIds: string[] = [];
  try {
    while (true) {
      const now = clock();
      const tomorrow = addCalendarDays(bruneiDate(now), 1);
      const excludeFailed = failedBookingIds.length
        ? sql`AND b.id NOT IN (${sql.join(failedBookingIds.map((id) => sql`${id}`), sql`, `)})`
        : sql``;
      const result = await db.transaction(async (tx) => {
        const row = (await tx.execute(sql`
          SELECT b.id, b.slot_start, c.license_plate, c.brand, c.model,
            br.name AS branch_name, u.email, u.first_name
          FROM interior_refresh_bookings b
          JOIN cars c ON c.id = b.vehicle_id
          JOIN branches br ON br.id = b.branch_id
          JOIN subscriptions s ON s.id = b.subscription_id
          JOIN users u ON u.id = s.user_id
          WHERE b.status = 'booked'
            AND b.reminder_opt_in = true
            AND b.reminder_sent_at IS NULL
            AND b.slot_start > ${now.toISOString()}::timestamptz
            AND b.slot_start <= ${new Date(now.getTime() + REMINDER_LEAD_MS).toISOString()}::timestamptz
            AND (b.slot_start AT TIME ZONE 'Asia/Brunei')::date = ${tomorrow}::date
            AND u.email IS NOT NULL AND u.email <> ''
            ${excludeFailed}
          ORDER BY b.slot_start
          LIMIT 1
          FOR UPDATE OF b SKIP LOCKED
        `)).rows[0] as any;
        if (!row) return { outcome: "empty" as const };

        // Keep the booking row locked through provider acceptance. Cancellation
        // and staff status changes lock the same row, preventing a stale send.
        const vehicle = [row.license_plate, row.brand, row.model].filter(Boolean).join(" · ");
        const accepted = await sendInteriorRefreshReminder({
          customerEmail: row.email,
          customerName: row.first_name,
          branchName: row.branch_name || "Tungku Link",
          vehicle,
          slotStart: new Date(row.slot_start),
        });
        if (!accepted) return { outcome: "failed" as const, bookingId: String(row.id) };
        await tx.execute(sql`
          UPDATE interior_refresh_bookings
          SET reminder_sent_at = now(), updated_at = now()
          WHERE id = ${row.id} AND status = 'booked' AND reminder_sent_at IS NULL
        `);
        return { outcome: "delivered" as const };
      });
      if (result.outcome === "empty") break;
      if (result.outcome === "failed") {
        failedBookingIds.push(result.bookingId);
        continue;
      }
      delivered += 1;
    }
    return delivered;
  } finally {
    running = false;
  }
}

export function startInteriorRefreshReminderWorker() {
  if (started) return;
  started = true;
  const run = () => deliverDueInteriorRefreshReminders().catch((err) =>
    console.error("[interior-refresh.reminders]", err?.message ?? err));
  timer = setTimeout(() => {
    void run();
    timer = setInterval(run, POLL_MS);
  }, 10_000);
}

export function stopInteriorRefreshReminderWorker() {
  if (timer) clearTimeout(timer);
  started = false;
  timer = undefined;
}