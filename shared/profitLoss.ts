/**
 * Pure accounting contract for the owner P&L surface.
 *
 * All money is integer BND cents.  This module deliberately has no database
 * dependency so the API, sync worker, and UI use the same allocation and
 * subtotal rules without rounding differently.
 */

export const PNL_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const PNL_BRANCH_NAMES = [
  "Tungku",
  "Salar",
  "Bengkurong",
  "Tutong",
  "Lambak",
] as const;

/**
 * The sync API deliberately exposes only these stable, non-sensitive error
 * codes.  Upstream response bodies (which can contain account details or
 * credentials) never cross the API boundary.
 */
export const CONNECTEAM_SYNC_ERROR_CODES = [
  "connecteam_not_configured",
  "connecteam_fetch_timeout",
  "connecteam_http_400",
  "connecteam_http_401",
  "connecteam_http_403",
  "connecteam_http_404",
  "connecteam_http_408",
  "connecteam_http_409",
  "connecteam_http_425",
  "connecteam_http_429",
  "connecteam_http_500",
  "connecteam_http_502",
  "connecteam_http_503",
  "connecteam_http_504",
  "connecteam_invalid_response",
  "connecteam_invalid_paging",
  "connecteam_incomplete_paging",
  "connecteam_duplicate_submission",
  "connecteam_branch_mapping_invalid",
  "connecteam_persist_failed",
  "connecteam_lease_lost",
  "connecteam_sync_failed",
] as const;

export type ConnecteamSyncErrorCode = (typeof CONNECTEAM_SYNC_ERROR_CODES)[number];

const connecteamSyncErrorCodeSet = new Set<string>(CONNECTEAM_SYNC_ERROR_CODES);

/**
 * Converts persisted/upstream-derived values to the response whitelist. This
 * is intentionally defensive for rows written by older application versions.
 */
export function safeConnecteamSyncErrorCode(value: unknown): ConnecteamSyncErrorCode {
  return typeof value === "string" && connecteamSyncErrorCodeSet.has(value)
    ? value as ConnecteamSyncErrorCode
    : "connecteam_sync_failed";
}

export function connecteamSyncErrorMessage(value: unknown): string {
  const code = safeConnecteamSyncErrorCode(value);
  if (code === "connecteam_not_configured") {
    return "Connecteam sync is not configured. Ask an administrator to configure the Connecteam integration, then try again.";
  }
  if (code === "connecteam_fetch_timeout") {
    return "Connecteam did not respond in time. Existing synced expense data is unchanged; try again shortly.";
  }
  if (code === "connecteam_http_401" || code === "connecteam_http_403") {
    return "Connecteam rejected the integration credentials. Ask an administrator to verify the API key, then try again.";
  }
  if (code === "connecteam_http_429") {
    return "Connecteam is rate-limiting requests. Wait a moment before trying the sync again.";
  }
  if (code === "connecteam_http_408") {
    return "Connecteam timed out while serving the snapshot. Existing synced expense data is unchanged; try again shortly.";
  }
  if (code === "connecteam_http_500" || code === "connecteam_http_502"
    || code === "connecteam_http_503" || code === "connecteam_http_504") {
    return "Connecteam is temporarily unavailable. Existing synced expense data is unchanged; try again shortly.";
  }
  if (code === "connecteam_invalid_response" || code === "connecteam_invalid_paging"
    || code === "connecteam_incomplete_paging" || code === "connecteam_duplicate_submission") {
    return "Connecteam returned an incomplete expense snapshot. Existing synced expense data is unchanged; try again after the source data is available.";
  }
  if (code === "connecteam_branch_mapping_invalid") {
    return "The five P&L branch mappings are incomplete. Ask an administrator to fix the branch configuration before syncing.";
  }
  if (code === "connecteam_persist_failed") {
    return "The Connecteam snapshot could not be saved. Existing synced expense data is unchanged; try again shortly.";
  }
  if (code === "connecteam_lease_lost") {
    return "Another sync took ownership while this sync was running. The report will update when that sync finishes.";
  }
  return "Connecteam sync could not be completed. Existing synced expense data is unchanged; try again shortly.";
}

export type PnlBranchName = (typeof PNL_BRANCH_NAMES)[number];
export type PnlSection = "cost_of_services" | "operating_expense";

export type PnlCategory =
  | "Water Bill"
  | "Electricity Bill"
  | "Car Wash Shampoo & Tyre Shine + Car Wax"
  | "Staff Wages"
  | "Part-timer Wages"
  | "Bonus"
  | "Miscellaneous"
  | "Maintenance & Repair"
  | "Total Units Rental"
  | "Point-of-Sale System"
  | "Wifi Internet"
  | "SPK"
  | "Connecteam (Employee Management App)"
  | "Barang Harian Serbaguna"
  | "Foods & Drink"
  | "Management Fee"
  | "Merchant Discount Rate (MDR)";

export interface PnlCategoryDefinition {
  category: PnlCategory;
  section: PnlSection;
}

/** Workbook-compatible rows, with MDR deliberately separated from all other OPEX. */
export const PNL_CATEGORIES: readonly PnlCategoryDefinition[] = [
  { category: "Water Bill", section: "cost_of_services" },
  { category: "Electricity Bill", section: "cost_of_services" },
  { category: "Car Wash Shampoo & Tyre Shine + Car Wax", section: "cost_of_services" },
  { category: "Staff Wages", section: "cost_of_services" },
  { category: "Part-timer Wages", section: "cost_of_services" },
  { category: "Bonus", section: "cost_of_services" },
  { category: "Miscellaneous", section: "cost_of_services" },
  { category: "Maintenance & Repair", section: "cost_of_services" },
  { category: "Total Units Rental", section: "operating_expense" },
  { category: "Point-of-Sale System", section: "operating_expense" },
  { category: "Wifi Internet", section: "operating_expense" },
  { category: "SPK", section: "operating_expense" },
  { category: "Connecteam (Employee Management App)", section: "operating_expense" },
  { category: "Barang Harian Serbaguna", section: "operating_expense" },
  { category: "Foods & Drink", section: "operating_expense" },
  { category: "Management Fee", section: "operating_expense" },
  { category: "Merchant Discount Rate (MDR)", section: "operating_expense" },
] as const;

const categoryByKey = new Map<string, PnlCategory>();
const normalise = (value: string) =>
  value.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();

function registerCategory(category: PnlCategory, ...aliases: string[]) {
  for (const alias of [category, ...aliases]) categoryByKey.set(normalise(alias), category);
}

registerCategory("Water Bill", "water", "water bills", "bil air", "water bill admin only");
registerCategory("Electricity Bill", "electricity", "electric bill", "electricity bills", "bil elektrik", "electric des admin only");
registerCategory(
  "Car Wash Shampoo & Tyre Shine + Car Wax",
  "car wash shampoo",
  "shampoo tyre shine car wax",
  "shampoo and tyre shine",
  "car wash supplies",
  "shampoo amarol wheel rim cleaner kleenson wax si plus wiper car wash cleaning tools equipments",
);
registerCategory("Staff Wages", "staff salary", "staff salaries", "gaji staff", "wages", "advance salary pg h approval", "full time staff salary admin only");
registerCategory("Part-timer Wages", "part timer wages", "part time wages", "part timer", "gaji part time", "gaji hari part timer back up tidak termasuk bonus");
registerCategory("Bonus", "staff bonus", "bonus pg h approval", "bonus pgh approval");
registerCategory("Miscellaneous", "misc", "other cos", "others");
registerCategory("Maintenance & Repair", "maintenance", "repair", "maintenance repair", "maintenance and repair", "maintenance and repair mesin kadai");
registerCategory("Total Units Rental", "rental", "rent", "unit rental", "shop rental", "building unit rental admin only");
registerCategory("Point-of-Sale System", "pos system", "point of sale", "point of sale system", "pos admin only");
registerCategory("Wifi Internet", "wifi", "internet", "wifi internet", "internet progresif admin only");
registerCategory("SPK", "spk company contribution");
registerCategory(
  "Connecteam (Employee Management App)",
  "connecteam",
  "connecteam employee management app",
  "employee management app",
);
registerCategory("Barang Harian Serbaguna", "barang harian", "daily supplies", "barang harian serbaguna kadai");
registerCategory("Foods & Drink", "food and drink", "foods drinks", "food drinks", "food and drinks for occasion event");
registerCategory("Management Fee", "management fees", "management fee admin only", "mudarabah profit sharing payable admin only");
registerCategory(
  "Merchant Discount Rate (MDR)",
  "mdr",
  "merchant discount rate",
  "merchant discount rates",
  "payment gateway fee",
  "payment processing fee",
);

/**
 * Maps a source category to a workbook row. Undefined is intentional: callers
 * must retain and expose it in an "Unmapped / invalid" audit bucket rather
 * than quietly dropping the expense.
 */
export function mapPnlExpenseCategory(sourceCategory: string | null | undefined): PnlCategory | undefined {
  if (!sourceCategory) return undefined;
  return categoryByKey.get(normalise(sourceCategory));
}

export function pnlSectionForCategory(category: PnlCategory): PnlSection {
  const result = PNL_CATEGORIES.find((entry) => entry.category === category);
  if (!result) throw new Error(`Unknown P&L category: ${category}`);
  return result.section;
}

export interface PnlAllocationTarget {
  /** Database branch id, represented as a string only to permit fixture ids. */
  id: string;
  name: PnlBranchName;
}

export interface PnlAllocation {
  branchId: string;
  cents: number;
}

/**
 * Splits a cent amount once, in the supplied stable branch order.  The first
 * recipients get the remainder, so allocations always conserve exactly:
 * sum(result.cents) === totalCents, including negative correcting entries.
 */
export function splitCentsExactly(totalCents: number, targets: readonly PnlAllocationTarget[]): PnlAllocation[] {
  if (!Number.isSafeInteger(totalCents)) throw new Error("P&L amount must be a safe integer number of cents");
  if (targets.length === 0) return [];

  const sign = totalCents < 0 ? -1 : 1;
  const absolute = Math.abs(totalCents);
  const quotient = Math.floor(absolute / targets.length);
  const remainder = absolute % targets.length;
  return targets.map((target, index) => ({
    branchId: target.id,
    cents: sign * (quotient + (index < remainder ? 1 : 0)),
  }));
}

/**
 * Connecteam branch handling. "All" wins over individual duplicates and is
 * split across all five P&L branches. Unknown/no selected choices deliberately
 * return no allocation; the sync must persist them as invalid/unallocated
 * instead of assigning a guessed branch.
 */
export function allocateConnecteamExpense(
  totalCents: number,
  rawChoices: readonly string[] | null | undefined,
  branches: readonly PnlAllocationTarget[],
): PnlAllocation[] {
  const branchChoiceKey = (value: string) => normalise(value).replace(/\s+branch$/, "");
  const selected = new Set((rawChoices ?? []).map(branchChoiceKey));
  const allSelected = selected.has("all");
  const branchByName = new Map(branches.map((branch) => [branchChoiceKey(branch.name), branch]));
  const targets = allSelected
    ? branches
    : Array.from(selected)
      .map((choice) => branchByName.get(choice))
      .filter((branch): branch is PnlAllocationTarget => Boolean(branch));
  return splitCentsExactly(totalCents, targets);
}

export interface PnlRevenueInput {
  /** 1..12 calendar month in the requested P&L year. */
  month: number;
  /** null means online revenue with no attributable branch. */
  branchId: string | null;
  /** POS gross sales less refunds; counter subscriptions must already be excluded. */
  posNetRevenueCents: number;
  /** Gross recognized subscription revenue, not net of MDR. */
  subscriptionRecognizedGrossCents: number;
  /** MDR for both POS digital sales and recognized subscription revenue. */
  mdrCents: number;
}

export interface PnlExpenseInput {
  month: number;
  branchId: string | null;
  category?: PnlCategory;
  /** Kept visible in output if category is missing; never omitted from totals. */
  unmappedReason?: string;
  cents: number;
}

export interface PnlDepreciationInput {
  month: number;
  branchId: string;
  cents: number;
}

export interface PnlLine {
  key: string;
  label: string;
  cents: number;
}

export interface PnlMonth {
  month: number;
  lines: PnlLine[];
  /** A configured value is required for every selected branch/month. */
  depreciationConfigured: boolean;
}

export interface PnlBuildInput {
  branchId: string | "overall";
  /** Required to decide whether an Overall depreciation month is complete. */
  overallBranchIds?: readonly string[];
  revenue: readonly PnlRevenueInput[];
  expenses: readonly PnlExpenseInput[];
  depreciation: readonly PnlDepreciationInput[];
}

function assertMonth(month: number) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`Invalid P&L month: ${month}`);
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/**
 * Produces the P&L formula rows. Overall includes each record exactly once,
 * including branchless online revenue. A branch view never receives an
 * unallocated record, preventing the common "online revenue in every branch"
 * overstatement.
 */
export function buildPnl(input: PnlBuildInput): PnlMonth[] {
  const isOverall = input.branchId === "overall";
  const includes = (branchId: string | null) => isOverall || branchId === input.branchId;

  return Array.from({ length: 12 }, (_, offset) => {
    const month = offset + 1;
    const revenue = input.revenue.filter((entry) => {
      assertMonth(entry.month);
      return entry.month === month && includes(entry.branchId);
    });
    const expenses = input.expenses.filter((entry) => {
      assertMonth(entry.month);
      return entry.month === month && includes(entry.branchId);
    });
    const depreciation = input.depreciation.filter((entry) => {
      assertMonth(entry.month);
      return entry.month === month && includes(entry.branchId);
    });

    const netPosRevenue = sum(revenue.map((entry) => entry.posNetRevenueCents));
    const recognizedSubscriptions = sum(revenue.map((entry) => entry.subscriptionRecognizedGrossCents));
    const mdr = sum(revenue.map((entry) => entry.mdrCents));
    const categoryCents = (category: PnlCategory) =>
      sum(expenses.filter((entry) => entry.category === category).map((entry) => entry.cents));
    const unmapped = sum(expenses.filter((entry) => !entry.category).map((entry) => entry.cents));
    const cos = sum(PNL_CATEGORIES
      .filter((entry) => entry.section === "cost_of_services")
      .map((entry) => categoryCents(entry.category)));
    const opexWithoutMdr = sum(PNL_CATEGORIES
      .filter((entry) => entry.section === "operating_expense" && entry.category !== "Merchant Discount Rate (MDR)")
      .map((entry) => categoryCents(entry.category)));
    const revenueTotal = netPosRevenue + recognizedSubscriptions;
    const grossProfit = revenueTotal - cos;
    const configuredMdr = categoryCents("Merchant Discount Rate (MDR)");
    const operatingExpenses = opexWithoutMdr + mdr + configuredMdr;
    const ebitda = grossProfit - operatingExpenses - unmapped;
    const depreciationCents = sum(depreciation.map((entry) => entry.cents));
    const netProfit = ebitda - depreciationCents;

    const lines: PnlLine[] = [
      { key: "pos_net_revenue", label: "POS Revenue (net refunds)", cents: netPosRevenue },
      { key: "recognized_subscription_revenue", label: "Recognized Subscription Revenue", cents: recognizedSubscriptions },
      { key: "revenue", label: "Revenue", cents: revenueTotal },
      ...PNL_CATEGORIES
        .filter((entry) => entry.section === "cost_of_services")
        .map((entry) => ({ key: `expense:${entry.category}`, label: entry.category, cents: categoryCents(entry.category) })),
      { key: "cost_of_services", label: "Total COS", cents: cos },
      { key: "gross_profit", label: "Gross Profit", cents: grossProfit },
      ...PNL_CATEGORIES
        .filter((entry) => entry.section === "operating_expense" && entry.category !== "Merchant Discount Rate (MDR)")
        .map((entry) => ({ key: `expense:${entry.category}`, label: entry.category, cents: categoryCents(entry.category) })),
      { key: "merchant_discount_rate", label: "Merchant Discount Rate (MDR)", cents: mdr + configuredMdr },
      { key: "operating_expense", label: "Total OPEX", cents: operatingExpenses },
      { key: "unmapped_expenses", label: "Unmapped / invalid expenses (review required)", cents: unmapped },
      { key: "ebitda", label: "EBITDA", cents: ebitda },
      { key: "depreciation", label: "Asset Depreciation", cents: depreciationCents },
      { key: "net_profit", label: "Net Profit", cents: netProfit },
      {
        key: "profit_margin_bps",
        label: "Profit Margin",
        cents: revenueTotal === 0 ? 0 : Math.round((netProfit * 10_000) / revenueTotal),
      },
    ];

    return {
      month,
      lines,
      depreciationConfigured: isOverall
        ? Boolean(input.overallBranchIds?.length)
          && input.overallBranchIds!.every((id) => depreciation.some((entry) => entry.branchId === id))
        : depreciation.some((entry) => entry.branchId === input.branchId),
    };
  });
}

/**
 * A sanitized, allocation-level observation used by the recurring expense
 * reminder.  This intentionally contains only the source projection already
 * retained for P&L (never a description, receipt, submitter, or account
 * field).  `sourceCategory` is preferred over `category` so the reminder can
 * explain which source label established the pattern.
 */
export interface RecurringExpenseObservation {
  expenseDate?: string | null;
  year?: number;
  month?: number;
  sourceCategory?: string | null;
  category?: string | null;
  branchId?: string | null;
  eligible?: boolean;
  sourceStatus?: string | null;
  /** Optional source status for pure fixtures that do not have eligible. */
  status?: string | null;
  allocationStatus?: string | null;
  isPresent?: boolean;
}

export type RecurringExpenseReminderStatus = "missing" | "pending" | "rejected";

export interface RecurringExpenseReminder {
  /** Canonical P&L category when known, otherwise the sanitized source label. */
  category: string;
  /** The sanitized label as submitted to Connecteam. */
  sourceCategory: string;
  branchId: string;
  branchName?: string;
  year: number;
  month: number;
  monthKey: string;
  /** Current Brunei month is a check; a closed month is only possibly missing. */
  period: "current" | "completed";
  status: RecurringExpenseReminderStatus;
  /** Approved captures in the six preceding calendar months. */
  evidenceMonths: string[];
  /** Kept explicit for clients that want to explain the inference. */
  pattern: "two-of-preceding-six";
  sourceStatus?: string | null;
}

export interface InferRecurringExpenseRemindersInput {
  observations?: readonly RecurringExpenseObservation[];
  /** Alias useful to callers that model the source projection as records. */
  records?: readonly RecurringExpenseObservation[];
  reportYear: number;
  currentBruneiYmd: string;
  /** "overall" evaluates each known allocation independently. */
  branchId?: string | "overall";
  branchNames?: Readonly<Record<string, string>>;
  recentMonths?: number;
}

const monthIndex = (year: number, month: number) => year * 12 + month - 1;
const monthFromIndex = (index: number) => ({
  year: Math.floor(index / 12),
  month: (index % 12) + 1,
});
const monthKeyFromIndex = (index: number) => {
  const value = monthFromIndex(index);
  return `${value.year}-${String(value.month).padStart(2, "0")}`;
};
const validMonthDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return { year, month };
};

function observationMonth(observation: RecurringExpenseObservation) {
  if (observation.expenseDate !== undefined) {
    if (typeof observation.expenseDate !== "string") return null;
    return validMonthDate(observation.expenseDate);
  }
  if (Number.isInteger(observation.year) && Number.isInteger(observation.month)
    && observation.month! >= 1 && observation.month! <= 12) {
    return { year: observation.year!, month: observation.month! };
  }
  return null;
}

function observationLabel(observation: RecurringExpenseObservation) {
  const sourceCategory = observation.sourceCategory?.trim() || observation.category?.trim() || "";
  if (!sourceCategory) return null;
  const canonical = mapPnlExpenseCategory(sourceCategory);
  return {
    sourceCategory,
    category: canonical ?? sourceCategory,
    key: normalise(canonical ?? sourceCategory),
  };
}

function notApprovedStatus(observation: RecurringExpenseObservation) {
  if (observation.eligible === true) return null;
  if (observation.eligible === undefined
    && (observation.allocationStatus === "allocated"
      || observation.allocationStatus === "unmapped_category")) return null;
  const status = normalise(observation.sourceStatus ?? observation.status ?? "");
  if (observation.eligible === undefined && (!status || status === "approve" || status === "approved")) {
    return null;
  }
  if (status.includes("reject") || status.includes("declin")) return "rejected" as const;
  return "pending" as const;
}

/**
 * Infers recurring omissions without treating an aggregate P&L line as an
 * expense.  Each canonical branch/category pair is evaluated independently.
 *
 * A pair establishes a pattern for a candidate month only when approved
 * captures exist in at least two distinct months in the six calendar months
 * immediately before that candidate.  This makes July/August captures
 * establish a September expectation, while never considering a future month
 * or a same-month capture as evidence.  Invalid dates, branches, categories,
 * and non-present rows are deliberately ignored because they cannot prove
 * either capture or absence.
 */
export function inferRecurringExpenseReminders(
  input: InferRecurringExpenseRemindersInput,
): RecurringExpenseReminder[] {
  const recentMonths = input.recentMonths ?? 6;
  if (!Number.isInteger(input.reportYear) || input.reportYear < 1
    || !Number.isInteger(recentMonths) || recentMonths < 2) return [];
  const current = validMonthDate(input.currentBruneiYmd);
  if (!current) return [];
  const currentIndex = monthIndex(current.year, current.month);
  const reportStart = monthIndex(input.reportYear, 1);
  const reportEnd = monthIndex(input.reportYear, 12);
  if (reportStart > currentIndex) return [];
  const lastCandidate = Math.min(reportEnd, currentIndex);
  const selectedBranch = input.branchId && input.branchId !== "overall"
    ? input.branchId : null;
  type Group = {
    category: string;
    sourceCategory: string;
    branchId: string;
    branchName?: string;
    approved: Set<number>;
    submissions: Map<number, { status: RecurringExpenseReminderStatus; sourceStatus: string | null }>;
  };
  const groups = new Map<string, Group>();
  const observations = input.observations ?? input.records ?? [];
  for (const observation of observations) {
    if (observation.isPresent === false) continue;
    const branchId = observation.branchId?.trim();
    if (!branchId || (selectedBranch !== null && branchId !== selectedBranch)) continue;
    const date = observationMonth(observation);
    const label = observationLabel(observation);
    if (!date || !label) continue;
    const index = monthIndex(date.year, date.month);
    // Future source rows must not establish an expectation in the present.
    if (index > currentIndex) continue;
    // Invalid allocations cannot prove either a capture or an omission. Keep
    // this before the eligible check so an invalid eligible fixture cannot
    // accidentally become recurrence evidence.
    if (observation.allocationStatus === "invalid_amount"
      || observation.allocationStatus === "invalid_date"
      || observation.allocationStatus === "invalid_branch"
      || observation.allocationStatus === "excluded_mdr_duplicate") continue;
    const key = `${branchId}\u0000${label.key}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        category: label.category,
        sourceCategory: label.sourceCategory,
        branchId,
        branchName: input.branchNames?.[branchId],
        approved: new Set<number>(),
        submissions: new Map(),
      };
      groups.set(key, group);
    }
    // The source label is stable for a mapped category in normal operation.
    // Prefer the first observed label and never expose an unsanitized field.
    if (notApprovedStatus(observation) === null) {
      group.approved.add(index);
      group.submissions.delete(index);
      continue;
    }
    const status = notApprovedStatus(observation);
    const existing = group.submissions.get(index);
    if (status && !existing) {
      group.submissions.set(index, {
        status,
        sourceStatus: observation.sourceStatus ?? observation.status ?? null,
      });
    }
  }

  const reminders: RecurringExpenseReminder[] = [];
  groups.forEach((group) => {
    for (let candidate = reportStart; candidate <= lastCandidate; candidate += 1) {
      if (group.approved.has(candidate)) continue;
      const evidence: number[] = Array.from(group.approved)
        .filter((observed) => observed >= candidate - recentMonths && observed < candidate)
        .sort((left, right) => left - right);
      if (new Set(evidence).size < 2) continue;
      const submission = group.submissions.get(candidate);
      const period = candidate === currentIndex ? "current" : "completed";
      const date = monthFromIndex(candidate);
      reminders.push({
        category: group.category,
        sourceCategory: group.sourceCategory,
        branchId: group.branchId,
        ...(group.branchName ? { branchName: group.branchName } : {}),
        year: date.year,
        month: date.month,
        monthKey: monthKeyFromIndex(candidate),
        period,
        status: submission?.status ?? "missing",
        evidenceMonths: evidence.map(monthKeyFromIndex),
        pattern: "two-of-preceding-six",
        ...(submission ? { sourceStatus: submission.sourceStatus } : {}),
      });
    }
  });
  return reminders.sort((left, right) => {
    const branchOrder = (left.branchName ?? left.branchId).localeCompare(right.branchName ?? right.branchId);
    return left.year - right.year
      || left.month - right.month
      || branchOrder
      || left.category.localeCompare(right.category);
  });
}

/** Short alias for callers that prefer a noun-oriented helper name. */
export const inferRecurringExpenseGaps = inferRecurringExpenseReminders;