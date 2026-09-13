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
  const selected = new Set((rawChoices ?? []).map(normalise));
  const allSelected = selected.has("all");
  const branchByName = new Map(branches.map((branch) => [normalise(branch.name), branch]));
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