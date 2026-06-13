// One-off: rewrite already-sent SharePoint refund rows so their money columns
// are NEGATIVE (matches the refund-sign fix in buildExcelRow). Forward-only
// emission was fixed separately; this corrects the rows appended before it.
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
