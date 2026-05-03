// Dry-run preview of 2026-05-04_02 dedup. Shows the winner/loser per
// group + count of orders that would be repointed. Read-only — does
// not mutate the database. Self-deleted by the agent after review.
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const planSql = `
      WITH groups AS (
        SELECT c.id, c.license_plate, c.user_id,
               UPPER(REGEXP_REPLACE(c.license_plate, '\\s+', '', 'g')) AS plate_norm,
               u.email AS user_email,
               c.brand, c.model
          FROM cars c
          LEFT JOIN users u ON u.id = c.user_id
      ),
      dup_keys AS (
        SELECT plate_norm FROM groups GROUP BY plate_norm HAVING COUNT(*) > 1
      ),
      ranked AS (
        SELECT g.*,
               ROW_NUMBER() OVER (
                 PARTITION BY g.plate_norm
                 ORDER BY
                   (CASE WHEN g.user_email LIKE 'cucixpress.user.bn+%@gmail.com'
                         THEN 1 ELSE 0 END) ASC,
                   g.id DESC
               ) AS rn
          FROM groups g
         WHERE g.plate_norm IN (SELECT plate_norm FROM dup_keys)
      )
      SELECT id, license_plate, plate_norm, user_id, user_email, brand, model, rn,
             (CASE WHEN rn = 1 THEN 'winner' ELSE 'loser' END) AS role
        FROM ranked
       ORDER BY plate_norm, rn`;
    const rows = (await pool.query(planSql)).rows as any[];

    if (rows.length === 0) {
      console.log("No duplicates found — already deduped.");
      return;
    }

    // Group by plate_norm
    const byPlate = new Map<string, any[]>();
    for (const r of rows) {
      const arr = byPlate.get(r.plate_norm) ?? [];
      arr.push(r);
      byPlate.set(r.plate_norm, arr);
    }

    // Order-repoint counts per loser
    const loserIds = rows.filter(r => r.role.trim() === "loser").map(r => r.id);
    const orderCounts = (await pool.query(
      `SELECT vehicle_id, COUNT(*)::int AS n
         FROM orders WHERE vehicle_id = ANY($1::int[])
        GROUP BY vehicle_id`,
      [loserIds]
    )).rows as Array<{ vehicle_id: number; n: number }>;
    const orderCountByCarId = new Map(orderCounts.map(o => [o.vehicle_id, o.n]));

    let totalLosers = 0, totalRepoints = 0;
    for (const [plate, group] of byPlate) {
      console.log(`\n${plate}`);
      for (const r of group) {
        const orders = orderCountByCarId.get(r.id) ?? 0;
        const tag = r.role.trim() === "winner" ? "✓ KEEP " : "✗ DROP ";
        console.log(
          `  ${tag} car#${String(r.id).padEnd(4)} "${(r.license_plate ?? "").padEnd(10)}" ` +
          `user#${String(r.user_id).padEnd(4)} ${(r.user_email ?? "-").padEnd(48)} ` +
          `${r.brand ?? "-"}/${r.model ?? "-"}` +
          (orders > 0 ? `   (${orders} orders → repoint)` : "")
        );
        if (r.role.trim() === "loser") {
          totalLosers++;
          totalRepoints += orders;
        }
      }
    }

    console.log(`\nSummary:`);
    console.log(`  groups:           ${byPlate.size}`);
    console.log(`  rows to delete:   ${totalLosers}`);
    console.log(`  orders to repoint: ${totalRepoints}`);
    console.log(`  unique constraint: cars_plate_normalized_unique will be added`);
  } finally {
    await pool.end();
  }
})();
