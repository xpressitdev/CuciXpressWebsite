import crypto from "node:crypto";
import type { Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { requireStaff, requireStaffRole } from "./auth/middleware";
import {
  allocateConnecteamExpense,
  buildPnl,
  mapPnlExpenseCategory,
  PNL_BRANCH_NAMES,
  type PnlAllocationTarget,
  type PnlExpenseInput,
  type PnlRevenueInput,
} from "@shared/profitLoss";

const CONNECTEAM_FORM_ID = "6495602";
const CONNECTEAM_BASE_URL = "https://api.connecteam.com/forms/v1/forms";
const RECOGNITION_DAYS = 30;
const SYNC_INTERVAL_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 20_000;
const DISTRIBUTED_SYNC_LEASE_MS = 15 * 60_000;

const QUESTION_IDS = {
  branch: "e8fb454f-fce3-5925-b55d-56de962721de",
  expenseDate: "ea53efbb-36f2-b8f3-15e9-b8e579becd84",
  category: "e1952c17-91ee-e2da-5e88-090f05658828",
  cost: "5ddac283-6e65-77aa-40f1-93661b0b17b8",
  status: "65e3093e4aadfdbd0eeb96aa",
} as const;

type ConnecteamAnswer = {
  questionId?: string;
  selectedAnswers?: Array<{ text?: unknown }>;
  timestamp?: unknown;
  inputValue?: unknown;
};
type ConnecteamSubmission = {
  formSubmissionId?: unknown;
  submissionTimestamp?: unknown;
  answers?: ConnecteamAnswer[];
  managerFields?: Array<{ managerFieldId?: unknown; status?: { name?: unknown } }>;
};
type SanitizedSubmission = {
  submissionId: string;
  sourceUpdatedAt: Date | null;
  expenseDate: string | null;
  amountCents: number | null;
  sourceStatus: string | null;
  sourceCategory: string | null;
  branchChoices: string[];
  eligible: boolean;
  contentHash: string;
};

export interface RecognitionInput {
  amountCents: number;
  mdrCents: number;
  startsAt: Date;
  /** Paid invoice period end is exclusive; counter passes omit it (30 days). */
  endsAt?: Date | null;
  branchId: string | null;
}

const normalise = (value: string) => value.trim().toLocaleLowerCase("en-US");
const isBranchName = (value: string): value is (typeof PNL_BRANCH_NAMES)[number] =>
  PNL_BRANCH_NAMES.some((branch) => {
    const choice = normalise(value);
    return choice === normalise(branch) || choice === `${normalise(branch)} branch`;
  });
const canonicalBranchName = (value: string) =>
  PNL_BRANCH_NAMES.find((branch) => {
    const choice = normalise(value);
    return choice === normalise(branch) || choice === `${normalise(branch)} branch`;
  }) ?? null;
const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const asTimestamp = (value: unknown): Date | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
};
export function bruneiYmd(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Brunei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
const dayNumber = (ymd: string) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
const ymdFromDayNumber = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** Exact-cent straight-line recognition by Brunei calendar day. */
export function recognizeRevenueByBruneiDay(input: RecognitionInput): Array<PnlRevenueInput & { year: number }> | null {
  if (!Number.isSafeInteger(input.amountCents) || !Number.isSafeInteger(input.mdrCents)
    || input.amountCents < 0 || input.mdrCents < 0 || Number.isNaN(input.startsAt.getTime())
    || (input.endsAt && Number.isNaN(input.endsAt.getTime()))) return null;
  const startDay = dayNumber(bruneiYmd(input.startsAt));
  const endDay = input.endsAt ? dayNumber(bruneiYmd(input.endsAt)) : startDay + RECOGNITION_DAYS;
  const totalDays = endDay - startDay;
  if (!Number.isInteger(totalDays) || totalDays <= 0 || totalDays > 366) return null;
  return Array.from({ length: totalDays }, (_, index) => {
    const ymd = ymdFromDayNumber(startDay + index);
    // The subscription ledger recognizes net cash (gross less one charge's
    // MDR) over the service period. Spread that net amount first, then derive
    // displayed gross as net plus the separately-spread fee, so every day's
    // gross minus MDR agrees with the established net-recognition schedule.
    const netCents = input.amountCents - input.mdrCents;
    const recognizedNet = Math.round((netCents * (index + 1)) / totalDays)
      - Math.round((netCents * index) / totalDays);
    const recognizedMdr = Math.round((input.mdrCents * (index + 1)) / totalDays)
      - Math.round((input.mdrCents * index) / totalDays);
    return {
      year: Number(ymd.slice(0, 4)),
      month: Number(ymd.slice(5, 7)),
      branchId: input.branchId,
      posNetRevenueCents: 0,
      subscriptionRecognizedGrossCents: recognizedNet + recognizedMdr,
      mdrCents: recognizedMdr,
    };
  });
}

function centsFromConnecteamNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const cents = Math.round(numeric * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Exported for isolated fixture tests; it intentionally does not retain PII fields. */
export function sanitizeConnecteamSubmission(raw: ConnecteamSubmission): SanitizedSubmission | null {
  const submissionId = asString(raw.formSubmissionId);
  if (!submissionId) return null;
  const answers = Array.isArray(raw.answers) ? raw.answers : [];
  const answer = (id: string) => answers.find((entry) => entry.questionId === id);
  const selectedText = (id: string) => (answer(id)?.selectedAnswers ?? [])
    .map((entry) => asString(entry.text))
    .filter((entry): entry is string => Boolean(entry));
  const rawChoices = selectedText(QUESTION_IDS.branch);
  // Keep only the approved branch vocabulary and All. This is a privacy and
  // data-integrity boundary: arbitrary form values never enter our database.
  const branchChoices = rawChoices.map((choice) =>
    normalise(choice) === "all" ? "All" : canonicalBranchName(choice),
  ).filter((choice): choice is Exclude<typeof choice, null> => choice !== null);
  const sourceCategory = selectedText(QUESTION_IDS.category)[0] ?? null;
  const statusField = (raw.managerFields ?? []).find(
    (entry) => entry.managerFieldId === QUESTION_IDS.status,
  );
  const sourceStatus = asString(statusField?.status?.name);
  const statusKey = sourceStatus ? normalise(sourceStatus) : null;
  // Owner-confirmed policy: submissions without a status and Approve/Approved
  // are included. Pending, rejected, and future unknown statuses are excluded.
  const eligible = statusKey === null || statusKey === "approve" || statusKey === "approved";
  const date = asTimestamp(answer(QUESTION_IDS.expenseDate)?.timestamp);
  const expenseDate = date ? bruneiYmd(date) : null;
  const amountCents = centsFromConnecteamNumber(answer(QUESTION_IDS.cost)?.inputValue);
  const sourceUpdatedAt = asTimestamp(
    Math.max(
      Number(raw.submissionTimestamp) || 0,
      ...answers.map((entry) => Number((entry as any).updateTimestamp) || 0),
    ),
  );
  const hashPayload = JSON.stringify({
    submissionId, sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null, expenseDate,
    amountCents, sourceStatus, sourceCategory, branchChoices, eligible,
  });
  return {
    submissionId,
    sourceUpdatedAt,
    expenseDate,
    amountCents,
    sourceStatus,
    sourceCategory,
    branchChoices,
    eligible,
    contentHash: crypto.createHash("sha256").update(hashPayload).digest("hex"),
  };
}

/** Validates an entire snapshot before any database mutation can occur. */
export function validateConnecteamSnapshot(fetched: readonly ConnecteamSubmission[]): SanitizedSubmission[] {
  if (fetched.some((entry) => !entry || typeof entry !== "object" || !Array.isArray(entry.answers))) {
    throw new Error("connecteam_invalid_response");
  }
  const sanitized = fetched.map(sanitizeConnecteamSubmission);
  if (sanitized.some((entry) => entry === null)) throw new Error("connecteam_invalid_response");
  const result = sanitized as SanitizedSubmission[];
  const ids = new Set<string>();
  for (const entry of result) {
    if (ids.has(entry.submissionId)) throw new Error("connecteam_duplicate_submission");
    ids.add(entry.submissionId);
  }
  return result;
}

export function planConnecteamExpenseAllocations(
  entry: SanitizedSubmission,
  branches: readonly PnlAllocationTarget[],
) {
  const category = mapPnlExpenseCategory(entry.sourceCategory);
  const invalidReason = !entry.eligible ? "excluded_status"
    : entry.amountCents === null ? "invalid_amount"
      : entry.expenseDate === null ? "invalid_date"
        : category === "Merchant Discount Rate (MDR)" ? "excluded_mdr_duplicate"
          : undefined;
  if (invalidReason) return [{
    allocationKey: invalidReason, branchId: null, pnlCategory: null,
    allocationStatus: invalidReason, cents: entry.amountCents ?? 0,
  }];
  const split = allocateConnecteamExpense(entry.amountCents!, entry.branchChoices, branches);
  if (!split.length) return [{
    allocationKey: "invalid_branch", branchId: null, pnlCategory: null,
    allocationStatus: "invalid_branch", cents: entry.amountCents!,
  }];
  // An unknown category is still a real branch expense. Preserve its exact
  // branch split in review rather than hiding it in a branchless bucket.
  return split.map((allocation) => ({
    allocationKey: allocation.branchId,
    branchId: allocation.branchId,
    pnlCategory: category ?? null,
    allocationStatus: category ? "allocated" : "unmapped_category",
    cents: allocation.cents,
  }));
}

export async function fetchAllConnecteamSubmissions(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnecteamSubmission[]> {
  const records: ConnecteamSubmission[] = [];
  let offset = 0;
  let pagingTotal: number | null = null;
  // Offset comes from Connecteam's paging response, not a guessed count.
  for (;;) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(
        `${CONNECTEAM_BASE_URL}/${CONNECTEAM_FORM_ID}/form-submissions?limit=100&offset=${offset}`,
        { headers: { "X-API-KEY": apiKey, Accept: "application/json" }, signal: controller.signal },
      );
    } catch {
      throw new Error("connecteam_fetch_timeout");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`connecteam_http_${response.status}`);
    const body = await response.json() as {
      data?: { formSubmissions?: ConnecteamSubmission[] };
      paging?: { offset?: unknown; total?: unknown };
    };
    const page = body.data?.formSubmissions;
    if (!Array.isArray(page) || !body.paging || typeof body.paging !== "object") {
      throw new Error("connecteam_invalid_response");
    }
    if (body.paging.total !== undefined) {
      const total = Number(body.paging.total);
      if (!Number.isSafeInteger(total) || total < 0 || (pagingTotal !== null && pagingTotal !== total)) {
        throw new Error("connecteam_invalid_paging");
      }
      pagingTotal = total;
    }
    records.push(...page);
    const next = Number(body.paging?.offset);
    if (page.length === 0) {
      if (!Number.isSafeInteger(next) || next !== offset) throw new Error("connecteam_invalid_paging");
      break;
    }
    // A 200 response with a non-progressing or skipped offset is incomplete,
    // not a valid snapshot. Never deactivate local records in that case.
    if (!Number.isSafeInteger(next) || next !== offset + page.length) {
      throw new Error("connecteam_invalid_paging");
    }
    offset = next;
  }
  if (pagingTotal !== null && pagingTotal !== records.length) throw new Error("connecteam_incomplete_paging");
  return records;
}

/** Mirrors the owner sales helper: live refunded originals remain gross; legacy reversal rows do not. */
export function grossSalesCents(rows: ReadonlyArray<{
  totalCents: number; status: string; legacySource: string | null;
}>) {
  return rows.reduce((total, row) => total + (
    row.status !== "refunded" || row.legacySource === null ? row.totalCents : 0
  ), 0);
}

/** The matching SQL rounds once for a payment-method/provider group. */
export function mdrFeeForGroup(
  mdrBps: number,
  salesCents: number,
  refundCents = 0,
) {
  if (!Number.isSafeInteger(salesCents) || !Number.isSafeInteger(refundCents)
    || !Number.isSafeInteger(mdrBps) || salesCents < 0 || refundCents < 0 || mdrBps < 0) {
    throw new Error("invalid_mdr_input");
  }
  return Math.round((salesCents + refundCents) * mdrBps / 10_000);
}

let activeSync: Promise<SyncResult> | null = null;
export type SyncResult = { status: "succeeded"; submissionsSeen: number; eligible: number };

export function syncConnecteamExpenses(): Promise<SyncResult> {
  if (!activeSync) {
    activeSync = syncConnecteamExpensesOnce().finally(() => { activeSync = null; });
  }
  return activeSync;
}

async function syncConnecteamExpensesOnce(): Promise<SyncResult> {
  const apiKey = process.env.CONNECTEAM_API_KEY;
  if (!apiKey) {
    await markSyncFailed("connecteam_not_configured");
    throw new Error("connecteam_not_configured");
  }
  // A DB-backed lease complements the in-process promise so parallel app
  // instances cannot race snapshots. A crashed holder expires naturally.
  const leaseToken = crypto.randomUUID();
  const lease = await db.execute(sql`
    INSERT INTO connecteam_expense_sync_state
      (form_id, last_attempt_at, last_attempt_status, lease_token, lease_expires_at, updated_at)
    VALUES (${CONNECTEAM_FORM_ID}, now(), 'running', ${leaseToken},
      now() + (${DISTRIBUTED_SYNC_LEASE_MS} * interval '1 millisecond'), now())
    ON CONFLICT (form_id) DO UPDATE SET
      last_attempt_at = now(), last_attempt_status = 'running',
      last_error_code = NULL, lease_token = EXCLUDED.lease_token,
      lease_expires_at = EXCLUDED.lease_expires_at, updated_at = now()
    WHERE connecteam_expense_sync_state.last_attempt_status <> 'running'
      OR connecteam_expense_sync_state.lease_expires_at IS NULL
      OR connecteam_expense_sync_state.lease_expires_at < now()
    RETURNING form_id
  `);
  if (!lease.rows.length) throw new Error("connecteam_sync_in_progress");
  try {
  // Fetch to memory first. Local rows are only marked absent after every page
  // succeeds, preventing a partial upstream outage from deleting expenses.
  const fetched = await fetchAllConnecteamSubmissions(apiKey);
  const unique = validateConnecteamSnapshot(fetched);

  await db.transaction(async (tx) => {
    // Lock and fence before any mutation. If another worker acquired an
    // expired lease while this one was fetching, this transaction does nothing.
    const fence = await tx.execute(sql`
      SELECT form_id FROM connecteam_expense_sync_state
      WHERE form_id = ${CONNECTEAM_FORM_ID} AND lease_token = ${leaseToken}
        AND lease_expires_at > now() AND last_attempt_status = 'running'
      FOR UPDATE
    `);
    if (!fence.rows.length) throw new Error("connecteam_lease_lost");
    const runResult = await tx.execute(sql`
      INSERT INTO connecteam_expense_sync_runs (form_id, status)
      VALUES (${CONNECTEAM_FORM_ID}, 'running') RETURNING id
    `);
    const runId = Number((runResult.rows[0] as { id: number }).id);
    const branchesResult = await tx.execute(sql`
      SELECT b.id::text AS id, m.canonical_name AS name, m.sort_order
      FROM branches b
      JOIN (VALUES
        ('tungku', 'Tungku', 1), ('cuci xpress tungku', 'Tungku', 1),
        ('salar', 'Salar', 2), ('cuci xpress salar', 'Salar', 2),
        ('bengkurong', 'Bengkurong', 3), ('cuci xpress bengkurong', 'Bengkurong', 3),
        ('tutong', 'Tutong', 4), ('cuci xpress tutong', 'Tutong', 4),
        ('lambak', 'Lambak', 5), ('cuci xpress lambak', 'Lambak', 5)
      ) AS m(db_name, canonical_name, sort_order)
        ON lower(trim(b.name)) = m.db_name
      ORDER BY m.sort_order, b.id
    `);
    const branches = branchesResult.rows.map((row) => ({
      id: String((row as any).id),
      name: String((row as any).name) as PnlAllocationTarget["name"],
    }));
    if (branches.length !== 5 || new Set(branches.map((branch) => branch.name)).size !== 5) {
      throw new Error("connecteam_branch_mapping_invalid");
    }

    // Batch persistence rather than issuing one round trip per submission.
    // The expense form has thousands of historical records; batches keep a
    // full snapshot fast enough for the ten-minute worker interval.
    for (let start = 0; start < unique.length; start += 200) {
      const chunk = unique.slice(start, start + 200);
      const payload = JSON.stringify(chunk.map((entry) => ({
        submission_id: entry.submissionId,
        source_updated_at: entry.sourceUpdatedAt?.toISOString() ?? null,
        expense_date: entry.expenseDate,
        amount_cents: entry.amountCents,
        source_status: entry.sourceStatus,
        source_category: entry.sourceCategory,
        branch_choices: entry.branchChoices,
        is_eligible: entry.eligible,
        content_hash: entry.contentHash,
      })));
      const inserted = await tx.execute(sql`
        INSERT INTO connecteam_expense_submissions
          (form_id, submission_id, source_updated_at, expense_date, amount_cents,
           source_status, source_category, branch_choices, is_eligible, is_present,
           last_seen_run_id, content_hash, updated_at)
        SELECT ${CONNECTEAM_FORM_ID}, x.submission_id, x.source_updated_at::timestamptz,
          x.expense_date::date, x.amount_cents, x.source_status, x.source_category,
          x.branch_choices::jsonb, x.is_eligible, true, ${runId}, x.content_hash, now()
        FROM jsonb_to_recordset(${payload}::jsonb) AS x(
          submission_id text, source_updated_at text, expense_date text, amount_cents integer,
          source_status text, source_category text, branch_choices jsonb, is_eligible boolean,
          content_hash text
        )
        ON CONFLICT (form_id, submission_id) DO UPDATE SET
          source_updated_at = EXCLUDED.source_updated_at, expense_date = EXCLUDED.expense_date,
          amount_cents = EXCLUDED.amount_cents, source_status = EXCLUDED.source_status,
          source_category = EXCLUDED.source_category, branch_choices = EXCLUDED.branch_choices,
          is_eligible = EXCLUDED.is_eligible, is_present = true,
          last_seen_run_id = EXCLUDED.last_seen_run_id, content_hash = EXCLUDED.content_hash,
          updated_at = now()
        RETURNING id, submission_id
      `);
      const idBySubmission = new Map((inserted.rows as any[]).map((row) => [
        String(row.submission_id), Number(row.id),
      ]));
      const ids = Array.from(idBySubmission.values());
      if (ids.length) await tx.execute(sql`
        DELETE FROM pnl_expense_allocations
        WHERE connecteam_expense_submission_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      `);
      const allocations: Array<{
        submission_id: number; allocation_key: string; branch_id: number | null;
        pnl_category: string | null; allocation_status: string; cents: number;
      }> = [];
      for (const entry of chunk) {
        const submissionId = idBySubmission.get(entry.submissionId);
        if (!submissionId) throw new Error("connecteam_persist_failed");
        allocations.push(...planConnecteamExpenseAllocations(entry, branches).map((allocation) => ({
          submission_id: submissionId, allocation_key: allocation.allocationKey,
          branch_id: allocation.branchId === null ? null : Number(allocation.branchId),
          pnl_category: allocation.pnlCategory, allocation_status: allocation.allocationStatus,
          cents: allocation.cents,
        })));
      }
      if (allocations.length) {
        await tx.execute(sql`
          INSERT INTO pnl_expense_allocations
            (connecteam_expense_submission_id, allocation_key, branch_id, pnl_category, allocation_status, cents)
          SELECT x.submission_id, x.allocation_key, x.branch_id, x.pnl_category, x.allocation_status, x.cents
          FROM jsonb_to_recordset(${JSON.stringify(allocations)}::jsonb) AS x(
            submission_id bigint, allocation_key text, branch_id integer, pnl_category text,
            allocation_status text, cents integer
          )
        `);
      }
    }
    await tx.execute(sql`
      UPDATE connecteam_expense_submissions
      SET is_present = false, updated_at = now()
      WHERE form_id = ${CONNECTEAM_FORM_ID} AND last_seen_run_id IS DISTINCT FROM ${runId}
    `);
    await tx.execute(sql`
      UPDATE connecteam_expense_sync_runs
      SET status = 'succeeded', completed_at = now(), submissions_seen = ${unique.length}
      WHERE id = ${runId}
    `);
    const completion = await tx.execute(sql`
      UPDATE connecteam_expense_sync_state
      SET last_successful_run_id = ${runId}, last_successful_at = now(),
          last_attempt_status = 'succeeded', expected_submission_count = ${unique.length},
          last_error_code = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
      WHERE form_id = ${CONNECTEAM_FORM_ID} AND lease_token = ${leaseToken}
      RETURNING form_id
    `);
    if (!completion.rows.length) throw new Error("connecteam_lease_lost");
  });
  return { status: "succeeded", submissionsSeen: unique.length, eligible: unique.filter((entry) => entry.eligible).length };
  } catch (error: unknown) {
    const code = error instanceof Error && /^connecteam_[a-z0-9_]+$/.test(error.message)
      ? error.message : "connecteam_sync_failed";
    if (code !== "connecteam_sync_in_progress") await markSyncFailed(code, leaseToken);
    throw error;
  }
}

async function markSyncFailed(code: string, leaseToken?: string) {
  await db.execute(sql`
    INSERT INTO connecteam_expense_sync_state
      (form_id, last_attempt_at, last_attempt_status, last_error_code, updated_at)
    VALUES (${CONNECTEAM_FORM_ID}, now(), 'failed', ${code}, now())
    ON CONFLICT (form_id) DO UPDATE SET
      last_attempt_at = EXCLUDED.last_attempt_at, last_attempt_status = EXCLUDED.last_attempt_status,
      last_error_code = EXCLUDED.last_error_code, lease_token = NULL, lease_expires_at = NULL, updated_at = now()
    ${leaseToken
      ? sql`WHERE connecteam_expense_sync_state.lease_token = ${leaseToken}`
      : sql`WHERE connecteam_expense_sync_state.last_attempt_status <> 'running'
        OR connecteam_expense_sync_state.lease_expires_at IS NULL
        OR connecteam_expense_sync_state.lease_expires_at < now()`}
  `).catch(() => undefined);
}

export function startConnecteamExpenseSyncWorker() {
  if (!process.env.CONNECTEAM_API_KEY) return;
  const run = () => {
    // Status is persisted for the UI. Never log upstream payloads or secrets.
    syncConnecteamExpenses().catch(async (error: unknown) => {
      // syncConnecteamExpensesOnce has already persisted owner-fenced errors.
      // A competing instance's active lease is normal, never a failure.
      if (error instanceof Error && error.message === "connecteam_sync_in_progress") return;
    });
  };
  run();
  const timer = setInterval(run, SYNC_INTERVAL_MS);
  timer.unref();
}

function lineValue(month: ReturnType<typeof buildPnl>[number], key: string) {
  return month.lines.find((line) => line.key === key)?.cents ?? 0;
}

export function buildYtdFromMonths(
  months: ReadonlyArray<{ month: number; lines: ReadonlyArray<{ key: string; cents: number }> }>,
  reportYear: number,
  currentBruneiYmd: string,
) {
  const currentYear = Number(currentBruneiYmd.slice(0, 4));
  const ytdThroughMonth = reportYear < currentYear ? 12
    : reportYear === currentYear ? Number(currentBruneiYmd.slice(5, 7))
      : 0;
  const ytd = {} as Record<string, number>;
  for (const month of months) {
    for (const entry of month.lines) {
      if (entry.key !== "profit_margin_bps") ytd[entry.key] ??= 0;
    }
    if (month.month > ytdThroughMonth) continue;
    for (const entry of month.lines) {
      if (entry.key !== "profit_margin_bps") ytd[entry.key] = (ytd[entry.key] ?? 0) + entry.cents;
    }
  }
  ytd.profit_margin_bps = ytd.revenue
    ? Math.round((ytd.net_profit ?? 0) * 10_000 / ytd.revenue)
    : 0;
  return { ytd, ytdThroughMonth };
}

export function deriveCoverageStatus(
  syncHealth: "live" | "stale" | "error" | "never",
  revenueAvailable: boolean,
  hasAccountingWarnings: boolean,
) {
  if (syncHealth !== "live") return syncHealth;
  return revenueAvailable && !hasAccountingWarnings ? "live" : "provisional";
}

export async function getProfitLossReport(year: number, branchId: string | "overall") {
  const [expenseRows, warningRows, depreciationRows, branchesRows, stateRows, posRows, counterRows, invoiceRows, legacySubscriptionRows, feeRateRows, sourceRangeRows] = await Promise.all([
    db.execute(sql`
      SELECT extract(month FROM s.expense_date)::int AS month, a.branch_id::text AS branch_id,
             a.pnl_category, a.allocation_status, a.cents
      FROM pnl_expense_allocations a
      JOIN connecteam_expense_submissions s ON s.id = a.connecteam_expense_submission_id
      WHERE s.form_id = ${CONNECTEAM_FORM_ID} AND s.is_present AND s.is_eligible
        AND s.expense_date >= make_date(${year}, 1, 1) AND s.expense_date < make_date(${year + 1}, 1, 1)
        AND a.allocation_status <> 'excluded_mdr_duplicate'
    `),
    db.execute(sql`
      SELECT a.allocation_status, count(*)::int AS count,
        count(*) FILTER (WHERE s.expense_date IS NULL)::int AS missing_date_count,
        count(*) FILTER (WHERE s.amount_cents IS NULL)::int AS missing_amount_count,
        COALESCE(sum(s.amount_cents), 0)::int AS known_cents
      FROM pnl_expense_allocations a
      JOIN connecteam_expense_submissions s ON s.id = a.connecteam_expense_submission_id
      WHERE s.form_id = ${CONNECTEAM_FORM_ID} AND s.is_present
        AND (s.expense_date IS NULL OR (
          s.expense_date >= make_date(${year}, 1, 1) AND s.expense_date < make_date(${year + 1}, 1, 1)
        ))
        AND a.allocation_status <> 'allocated'
      GROUP BY a.allocation_status
      ORDER BY a.allocation_status
    `),
    db.execute(sql`
      SELECT month, branch_id::text AS branch_id, cents
      FROM pnl_depreciation_settings WHERE year = ${year}
    `),
    db.execute(sql`
      SELECT b.id::text AS id, m.canonical_name AS name
      FROM branches b
      JOIN (VALUES
        ('tungku', 'Tungku', 1), ('cuci xpress tungku', 'Tungku', 1),
        ('salar', 'Salar', 2), ('cuci xpress salar', 'Salar', 2),
        ('bengkurong', 'Bengkurong', 3), ('cuci xpress bengkurong', 'Bengkurong', 3),
        ('tutong', 'Tutong', 4), ('cuci xpress tutong', 'Tutong', 4),
        ('lambak', 'Lambak', 5), ('cuci xpress lambak', 'Lambak', 5)
      ) AS m(db_name, canonical_name, sort_order) ON lower(trim(b.name)) = m.db_name
      ORDER BY m.sort_order, b.id
    `),
    db.execute(sql`SELECT last_successful_at, last_attempt_status, last_error_code, expected_submission_count FROM connecteam_expense_sync_state WHERE form_id = ${CONNECTEAM_FORM_ID}`),
    db.execute(sql`
      SELECT extract(month FROM date(CASE WHEN o.qr_provider = 'pocket_pay' THEN o.claimed_at ELSE o.created_at END AT TIME ZONE 'Asia/Brunei'))::int AS month,
        o.branch_id::text AS branch_id,
        COALESCE(SUM(CASE
          WHEN o.status = 'refunded' AND o.legacy_source IS NOT NULL THEN 0
          WHEN o.status <> 'refunded' OR o.legacy_source IS NULL THEN o.total_cents
          ELSE 0
        END), 0)::int
          - COALESCE(SUM(CASE
            WHEN o.status = 'refunded' THEN o.total_cents
            ELSE 0
          END), 0)::int AS pos_net_cents,
        ROUND(
          COALESCE(SUM(CASE
            WHEN o.status = 'refunded' AND o.legacy_source IS NOT NULL THEN 0
            ELSE o.total_cents
          END), 0) * COALESCE(r.mdr_bps, 0) / 10000.0
        )::int AS mdr_cents
      FROM orders o
      LEFT JOIN payment_fee_rates r ON r.payment_method = o.payment_method
        AND COALESCE(r.qr_provider, '') = COALESCE(o.qr_provider, '')
      WHERE o.status NOT IN ('voided', 'pending_payment')
        AND COALESCE(o.order_type, '') NOT IN ('counter_subscription', 'interior_refresh_promo')
        AND date((CASE WHEN o.qr_provider = 'pocket_pay' THEN o.claimed_at ELSE o.created_at END) AT TIME ZONE 'Asia/Brunei')
          >= make_date(${year}, 1, 1)
        AND date((CASE WHEN o.qr_provider = 'pocket_pay' THEN o.claimed_at ELSE o.created_at END) AT TIME ZONE 'Asia/Brunei')
          < make_date(${year + 1}, 1, 1)
      GROUP BY 1, 2, o.payment_method, o.qr_provider, r.mdr_bps
    `),
    db.execute(sql`
      SELECT id, branch_id::text AS branch_id, vehicle_id, total_cents, payment_method, qr_provider, created_at
      FROM orders WHERE order_type = 'counter_subscription' AND status NOT IN ('voided', 'pending_payment', 'refunded')
        AND date(created_at AT TIME ZONE 'Asia/Brunei') < make_date(${year + 1}, 1, 1)
      ORDER BY vehicle_id NULLS LAST, created_at ASC, id ASC
    `),
    db.execute(sql`
      SELECT i.id, i.amount_cents, i.period_start, i.period_end, s.payment_provider
      FROM subscription_invoices i
      JOIN subscriptions s ON s.id = i.subscription_id
      WHERE i.status = 'paid' AND COALESCE(s.is_test, false) = false
        AND s.status <> 'incomplete'
        AND (
          i.period_start IS NULL OR i.period_end IS NULL OR (
            date(i.period_start AT TIME ZONE 'Asia/Brunei') < make_date(${year + 1}, 1, 1)
            AND date(i.period_end AT TIME ZONE 'Asia/Brunei') > make_date(${year}, 1, 1)
          )
        )
      ORDER BY i.period_start ASC, i.created_at ASC, i.id ASC
    `),
    db.execute(sql`
      SELECT s.id, s.price_cents, s.created_at, s.payment_provider
      FROM subscriptions s
      WHERE COALESCE(s.is_test, false) = false AND s.status <> 'incomplete'
        AND date(s.created_at AT TIME ZONE 'Asia/Brunei') >= make_date(${year}, 1, 1) - 30
        AND date(s.created_at AT TIME ZONE 'Asia/Brunei') < make_date(${year + 1}, 1, 1)
        AND NOT EXISTS (
          SELECT 1 FROM subscription_invoices i
          WHERE i.subscription_id = s.id AND i.status = 'paid'
        )
    `),
    db.execute(sql`SELECT payment_method, qr_provider, mdr_bps FROM payment_fee_rates`),
    db.execute(sql`
      SELECT 'expenses' AS source, min(s.expense_date)::text AS first_date, max(s.expense_date)::text AS last_date
      FROM connecteam_expense_submissions s
      WHERE s.form_id = ${CONNECTEAM_FORM_ID} AND s.is_present
      UNION ALL
      SELECT 'pos' AS source,
        min(date((CASE WHEN o.qr_provider = 'pocket_pay' THEN o.claimed_at ELSE o.created_at END) AT TIME ZONE 'Asia/Brunei'))::text,
        max(date((CASE WHEN o.qr_provider = 'pocket_pay' THEN o.claimed_at ELSE o.created_at END) AT TIME ZONE 'Asia/Brunei'))::text
      FROM orders o
      WHERE o.status NOT IN ('voided', 'pending_payment')
        AND COALESCE(o.order_type, '') NOT IN ('counter_subscription', 'interior_refresh_promo')
      UNION ALL
      SELECT 'subscription_invoices' AS source,
        min(date(i.period_start AT TIME ZONE 'Asia/Brunei'))::text,
        max(date(i.period_end AT TIME ZONE 'Asia/Brunei'))::text
      FROM subscription_invoices i
      JOIN subscriptions s ON s.id = i.subscription_id
      WHERE i.status = 'paid' AND COALESCE(s.is_test, false) = false
    `),
  ]);

  const revenue: PnlRevenueInput[] = posRows.rows.map((row: any) => ({
    month: Number(row.month), branchId: row.branch_id ?? null,
    posNetRevenueCents: Number(row.pos_net_cents), subscriptionRecognizedGrossCents: 0, mdrCents: Number(row.mdr_cents),
  }));
  const revenueWarnings: Array<{ code: string; count: number }> = [];
  const addRevenueWarning = (code: string) => {
    const existing = revenueWarnings.find((warning) => warning.code === code);
    if (existing) existing.count += 1;
    else revenueWarnings.push({ code, count: 1 });
  };
  const addRecognition = (input: RecognitionInput, warningCode: string) => {
    const recognized = recognizeRevenueByBruneiDay(input);
    if (!recognized) {
      addRevenueWarning(warningCode);
      return;
    }
    revenue.push(...recognized.filter((entry) => entry.year === year).map(({ year: _year, ...entry }) => entry));
  };
  // Counter subscriptions are ordered by vehicle just as the established
  // subscription report does; early renewals start after the prior 30-day window.
  const lastCounterEnd = new Map<string, number>();
  const feeRates = new Map((feeRateRows.rows as any[]).map((row) => [
    `${row.payment_method}|${row.qr_provider ?? ""}`, Number(row.mdr_bps) || 0,
  ]));
  for (const row of counterRows.rows as any[]) {
    const sale = new Date(row.created_at);
    const saleDay = dayNumber(bruneiYmd(sale));
    const key = row.vehicle_id != null ? `v${row.vehicle_id}` : `o${row.id}`;
    const startDay = Math.max(saleDay, (lastCounterEnd.get(key) ?? -Infinity) + 1);
    lastCounterEnd.set(key, startDay + RECOGNITION_DAYS - 1);
    const gross = Number(row.total_cents);
    const bpsRow = feeRates.get(`${row.payment_method}|${row.qr_provider ?? ""}`) ?? 0;
    const fee = mdrFeeForGroup(bpsRow, gross);
    addRecognition({
      amountCents: gross, mdrCents: fee, startsAt: new Date(startDay * 86_400_000),
      branchId: row.branch_id ?? null,
    }, "invalid_counter_subscription");
  }
  // Invoice rows are the source of truth for both CyberSource recurring
  // charges and PocketPay activations. A legacy subscription is used only
  // where no paid invoice exists, which prevents the PocketPay double count.
  for (const row of invoiceRows.rows as any[]) {
    if (!row.period_start || !row.period_end || !Number.isSafeInteger(Number(row.amount_cents))) {
      addRevenueWarning("invalid_subscription_invoice_period");
      continue;
    }
    const isPocketPay = row.payment_provider === "pocket_pay";
    const bps = feeRates.get(isPocketPay ? "qr_code|pocket_pay" : "card|") ?? 0;
    const gross = Number(row.amount_cents);
    addRecognition({
      amountCents: gross,
      mdrCents: mdrFeeForGroup(bps, gross),
      startsAt: new Date(row.period_start),
      endsAt: row.period_end ? new Date(row.period_end) : null,
      branchId: null,
    }, "invalid_subscription_invoice_period");
  }
  for (const row of legacySubscriptionRows.rows as any[]) {
    const isPocketPay = row.payment_provider === "pocket_pay";
    const bps = feeRates.get(isPocketPay ? "qr_code|pocket_pay" : "card|") ?? 0;
    const gross = Number(row.price_cents);
    addRecognition({
      amountCents: gross,
      mdrCents: mdrFeeForGroup(bps, gross),
      startsAt: new Date(row.created_at),
      branchId: null,
    }, "legacy_subscription_without_paid_invoice");
  }
  const expenses: PnlExpenseInput[] = expenseRows.rows.map((row: any) => ({
    month: Number(row.month), branchId: row.branch_id ?? null,
    category: row.allocation_status === "allocated" ? row.pnl_category : undefined,
    unmappedReason: row.allocation_status === "allocated" ? undefined : row.allocation_status,
    cents: Number(row.cents),
  }));
  const depreciation = depreciationRows.rows.map((row: any) => ({
    month: Number(row.month), branchId: String(row.branch_id), cents: Number(row.cents),
  }));
  const months = buildPnl({
    branchId,
    overallBranchIds: (branchesRows.rows as any[]).map((branch) => String(branch.id)),
    revenue, expenses, depreciation,
  }).map((month) => ({
    ...month,
    labels: Object.fromEntries(month.lines.map((line) => [line.key, line.label])),
  }));
  const { ytd, ytdThroughMonth } = buildYtdFromMonths(months, year, bruneiYmd(new Date()));
  const sync = stateRows.rows[0] as any;
  const lastSuccessMs = sync?.last_successful_at ? new Date(sync.last_successful_at).getTime() : NaN;
  const syncHealth = !sync ? "never"
    : sync.last_attempt_status === "failed" || sync.last_attempt_status === "incomplete" ? "error"
      : !Number.isFinite(lastSuccessMs) || Date.now() - lastSuccessMs > 15 * 60_000 ? "stale"
        : "live";
  const revenueCoverage = posRows.rows.length > 0 ? "available" : "not_available";
  const juneLiveExpenseCents = expenses
    .filter((entry) => entry.month === 6)
    .reduce((total, entry) => total + entry.cents, 0);
  const referenceNote = year === 2026
    ? ` June 2026 live eligible expenses are B$${(juneLiveExpenseCents / 100).toFixed(2)} versus the supplied workbook's B$25,873.22; the B$${((juneLiveExpenseCents - 2_587_322) / 100).toFixed(2)} difference is retained as source-coverage variance, not forced into reconciliation.`
    : "";
  const branchMappingValid = branchesRows.rows.length === 5
    && new Set((branchesRows.rows as any[]).map((branch) => branch.name)).size === 5;
  const accountingWarningStatuses = new Set([
    "unmapped_category", "invalid_amount", "invalid_date", "invalid_branch", "excluded_mdr_duplicate",
  ]);
  const hasAccountingWarnings = !branchMappingValid
    || (warningRows.rows as any[]).some((row) => accountingWarningStatuses.has(String(row.allocation_status)))
    || revenueWarnings.length > 0
    // A historical month without a configured depreciation amount is a known
    // provisional result, rather than an asserted zero expense.
    || months.some((month) => month.month <= ytdThroughMonth && !month.depreciationConfigured);
  const coverageStatus = deriveCoverageStatus(syncHealth, revenueCoverage === "available", hasAccountingWarnings);
  const observedRanges = Object.fromEntries((sourceRangeRows.rows as any[]).map((row) => [
    row.source, { firstDate: row.first_date ?? null, lastDate: row.last_date ?? null },
  ]));
  return {
    year, branchId, branches: branchesRows.rows,
    months, ytd,
    // Monetary accounting begins only where POS/Connecteam sources have
    // coverage; the UI presents this as a warning rather than invented zeroes.
    coverage: {
      status: coverageStatus,
      note: `Connecteam expenses are live only after a complete sync. ${revenueCoverage === "available"
        ? "Historical POS coverage follows KedaiPOS lineage and may differ from the reference workbook."
        : "No POS rows are available for this filter/year, so revenue is provisional rather than asserted as zero."}${referenceNote}`,
      unallocatedOnlineRevenueCents: months.reduce((total, month) => total + lineValue(month, "recognized_subscription_revenue"), 0),
      depreciationMissingMonths: months.filter((month) => !month.depreciationConfigured).map((month) => month.month),
      staleAfterSeconds: DISTRIBUTED_SYNC_LEASE_MS / 1000,
      ranges: {
        requested: {
          expenseDate: `${year}-01-01 through ${year}-12-31 (Brunei calendar)`,
          posRevenue: `${year}-01-01 through ${year}-12-31 (Brunei realization day)`,
          subscriptionRevenue: "Paid invoice period_start inclusive through period_end exclusive (Brunei calendar)",
        },
        observed: observedRanges,
      },
      ytdThroughMonth,
      warnings: [
        ...(branchMappingValid ? [] : [{ code: "branch_mapping_invalid", count: branchesRows.rows.length }]),
        ...(warningRows.rows as any[]).map((row) => ({
          code: row.allocation_status,
          count: Number(row.count),
          missingDateCount: Number(row.missing_date_count),
          missingAmountCount: Number(row.missing_amount_count),
          knownCents: Number(row.known_cents),
        })),
        ...revenueWarnings,
      ],
    },
    sync: sync ? {
      lastSuccessfulAt: sync.last_successful_at, status: sync.last_attempt_status,
      errorCode: sync.last_error_code, expectedSubmissionCount: sync.expected_submission_count,
    } : { status: "never" },
  };
}

export function registerProfitLossRoutes(app: Express) {
  app.get("/api/admin/profit-loss", requireStaff, requireStaffRole("owner"), async (req, res) => {
    const year = Number(req.query.year);
    const branchId = String(req.query.branch_id ?? "overall");
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ error: "invalid_year" });
    if (branchId !== "overall" && (!/^\d+$/.test(branchId) || !await isCanonicalBranchId(Number(branchId)))) {
      return res.status(400).json({ error: "invalid_branch" });
    }
    try { res.json(await getProfitLossReport(year, branchId)); }
    catch { res.status(503).json({ error: "profit_loss_unavailable" }); }
  });
  app.get("/api/admin/profit-loss/expenses", requireStaff, requireStaffRole("owner"), async (req, res) => {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ error: "invalid_period" });
    const branchId = String(req.query.branch_id ?? "overall");
    if (branchId !== "overall" && (!/^\d+$/.test(branchId) || !await isCanonicalBranchId(Number(branchId)))) {
      return res.status(400).json({ error: "invalid_branch" });
    }
    const branchPredicate = branchId === "overall" ? sql`` : sql`AND a.branch_id = ${Number(branchId)}`;
    const rows = await db.execute(sql`
      SELECT s.submission_id, s.expense_date, s.source_category, s.source_status,
             a.branch_id, a.pnl_category, a.allocation_status, a.cents
      FROM pnl_expense_allocations a JOIN connecteam_expense_submissions s ON s.id = a.connecteam_expense_submission_id
      WHERE s.form_id = ${CONNECTEAM_FORM_ID} AND s.is_present
        AND (
          (extract(year FROM s.expense_date) = ${year} AND extract(month FROM s.expense_date) = ${month})
          OR s.expense_date IS NULL
        )
        ${branchPredicate}
      ORDER BY s.expense_date, s.submission_id
    `);
    res.json({ entries: rows.rows }); // deliberately excludes description, receipt, user and account fields
  });
  app.post("/api/admin/profit-loss/sync", requireStaff, requireStaffRole("owner"), async (_req, res) => {
    try { res.json(await syncConnecteamExpenses()); }
    catch { res.status(502).json({ error: "connecteam_sync_failed" }); }
  });
  app.put("/api/admin/profit-loss/depreciation", requireStaff, requireStaffRole("owner"), async (req, res) => {
    const { year, month, branch_id, cents } = req.body ?? {};
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12
      || !Number.isInteger(branch_id) || !Number.isInteger(cents) || cents < 0) {
      return res.status(400).json({ error: "invalid_depreciation" });
    }
    if (!await isCanonicalBranchId(branch_id)) return res.status(400).json({ error: "invalid_branch" });
    await db.execute(sql`
      INSERT INTO pnl_depreciation_settings (year, month, branch_id, cents, updated_by_staff_id, updated_at)
      VALUES (${year}, ${month}, ${branch_id}, ${cents}, ${(req as any).staff?.user?.id ?? null}, now())
      ON CONFLICT (year, month, branch_id) DO UPDATE SET cents = EXCLUDED.cents,
        updated_by_staff_id = EXCLUDED.updated_by_staff_id, updated_at = now()
    `);
    res.json({ ok: true });
  });
}

async function isCanonicalBranchId(branchId: number) {
  const result = await db.execute(sql`
    SELECT b.id
    FROM branches b
    JOIN (VALUES
      ('tungku'), ('cuci xpress tungku'), ('salar'), ('cuci xpress salar'),
      ('bengkurong'), ('cuci xpress bengkurong'), ('tutong'), ('cuci xpress tutong'),
      ('lambak'), ('cuci xpress lambak')
    ) AS allowed(db_name) ON lower(trim(b.name)) = allowed.db_name
    WHERE b.id = ${branchId}
  `);
  return result.rows.length === 1;
}