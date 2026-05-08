// ============================================================================
// scripts/recompute_vip_tiers.ts
//
// Ranks every car by completed-wash visit count and assigns a VIP tier:
//   * top 20  → 'gold'
//   * next 50 → 'silver'
//   * next 100 → 'bronze'
//   * everyone else → null
//
// Ties: cars with the same visit count get the same tier (we cut the
// boundary inclusively — better to over-give a tier than to under-give).
// Re-run any time after import or when sales accumulate. Cheap (<1s).
// ============================================================================

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const GOLD_TOP   = 20;
const SILVER_TOP = GOLD_TOP + 50;   // 70
const BRONZE_TOP = SILVER_TOP + 100; // 170

async function main() {
  // Wipe previous tiers so cars that fell out of the top 170 don't keep
  // a stale badge.
  await db.execute(sql`UPDATE cars SET vip_tier = NULL, vip_rank = NULL`);

  // Build a ranked list using DENSE_RANK so ties share a position.
  const ranked = (await db.execute(sql`
    SELECT id,
           total_visits,
           DENSE_RANK() OVER (ORDER BY total_visits DESC) AS rank
      FROM cars
     WHERE total_visits > 0
  `)).rows as Array<{ id: number; total_visits: number; rank: number | string }>;

  if (ranked.length === 0) {
    console.log('No cars with visits yet — nothing to tier.');
    process.exit(0);
  }

  // Group by rank so equal-visit cars get the same tier together.
  const byRank = new Map<number, number[]>();
  for (const r of ranked) {
    const k = Number(r.rank);
    if (!byRank.has(k)) byRank.set(k, []);
    byRank.get(k)!.push(Number(r.id));
  }
  const ranksAsc = [...byRank.keys()].sort((a, b) => a - b);

  const goldIds: number[] = [];
  const silverIds: number[] = [];
  const bronzeIds: number[] = [];
  let placed = 0;

  for (const rank of ranksAsc) {
    const ids = byRank.get(rank)!;
    if (placed < GOLD_TOP) goldIds.push(...ids);
    else if (placed < SILVER_TOP) silverIds.push(...ids);
    else if (placed < BRONZE_TOP) bronzeIds.push(...ids);
    else break;
    placed += ids.length;
  }

  // Neon's serverless driver serialises JS arrays as records, so we
  // round-trip the id list through JSONB → int[] using SQL.
  async function setTier(ids: number[], tier: 'gold' | 'silver' | 'bronze') {
    if (ids.length === 0) return;
    const json = JSON.stringify(ids);
    await db.execute(sql`
      UPDATE cars
         SET vip_tier = ${tier}
       WHERE id IN (
         SELECT (value)::int FROM jsonb_array_elements_text(${json}::jsonb)
       )
    `);
  }
  await setTier(goldIds,   'gold');
  await setTier(silverIds, 'silver');
  await setTier(bronzeIds, 'bronze');

  // Store the dense rank too — useful for "rank #4 customer this year"
  // displays later.
  await db.execute(sql`
    WITH r AS (
      SELECT id, DENSE_RANK() OVER (ORDER BY total_visits DESC) AS rank
        FROM cars
       WHERE total_visits > 0
    )
    UPDATE cars c SET vip_rank = r.rank::int FROM r WHERE c.id = r.id
  `);

  console.log(`Done. Gold=${goldIds.length}, Silver=${silverIds.length}, Bronze=${bronzeIds.length}.`);

  // Show the top 10 for a quick sanity check.
  const top = (await db.execute(sql`
    SELECT id, license_plate, total_visits, total_spent_cents, vip_tier, vip_rank
      FROM cars
     WHERE total_visits > 0
     ORDER BY total_visits DESC, id ASC
     LIMIT 10
  `)).rows;
  console.log('\nTop 10:');
  for (const r of top as any[]) {
    console.log(`  #${r.vip_rank} ${r.license_plate.padEnd(10)} ${String(r.total_visits).padStart(4)} visits  B$${(r.total_spent_cents/100).toFixed(2)}  [${r.vip_tier ?? '-'}]`);
  }
  process.exit(0);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
