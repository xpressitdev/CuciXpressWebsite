// One-time backfill: fill in the branch (Store Name / Employee Name) on
// prepaid-QR sale rows in the SharePoint Excel master that were sent before the
// wash was claimed at a lane and are stuck on "-".
//
// Usage:
//   npx tsx scripts/backfill_prepaid_branch.ts --dry-run   (preview, no writes)
//   npx tsx scripts/backfill_prepaid_branch.ts             (apply)
import { backfillPrepaidBranchRows } from '../server/integrations/sharepointOutbox';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[prepaid-branch-backfill] starting (dryRun=${dryRun})`);
  const result = await backfillPrepaidBranchRows(dryRun);
  console.log('[prepaid-branch-backfill] done:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('[prepaid-branch-backfill] fatal:', err);
  process.exit(1);
});
