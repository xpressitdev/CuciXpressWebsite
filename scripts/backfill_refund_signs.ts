// One-off: rewrite already-sent SharePoint refund rows to the current convention
// (positive breakdown columns, NEGATIVE Order Total) — matches buildExcelRow().
// Corrects rows written under the earlier all-negative convention.
//
// Run with DRY=1 to preview without writing:
//   DRY=1 tsx scripts/backfill_refund_signs.ts
//   tsx scripts/backfill_refund_signs.ts
import { backfillSentRefundRows } from '../server/integrations/sharepointOutbox';

async function main() {
  const dryRun = process.env.DRY === '1';
  console.log(`[refund-backfill] starting (dryRun=${dryRun})`);
  const result = await backfillSentRefundRows(dryRun);
  console.log('[refund-backfill] done:', JSON.stringify(result, null, 2));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[refund-backfill] fatal:', err);
  process.exit(1);
});
