export const VOUCHER_SALES_URL = "/api/admin/voucher-sales";
export const VOUCHER_PAYMENT_LABELS = {
  unspecified: "Unspecified / unknown",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Card",
  qr_code: "QR code",
} as const;
export type VoucherPayment = keyof typeof VOUCHER_PAYMENT_LABELS;
export type VoucherSale = {
  id: string;
  sale_date: string;
  buyer: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  branch_id: number | null;
  branch_name: string | null;
  payment_method: VoucherPayment;
  reference: string | null;
  notes: string | null;
  status: string;
  void_reason: string | null;
  created_at: string;
};
export type VoucherSalesResponse = {
  sales: VoucherSale[];
  branches: Array<{ id: number; name: string }>;
  summary: { quantity: number; total_cents: number };
};
export type VoucherDraft = {
  sale_date: string; buyer: string; quantity: string; unit_price: string;
  branch_id: string; payment_method: VoucherPayment; reference: string; notes: string;
};
export function bruneiToday() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function newVoucherDraft(): VoucherDraft {
  return {
    sale_date: bruneiToday(), buyer: "", quantity: "1", unit_price: "9.00",
    branch_id: "unknown", payment_method: "unspecified", reference: "", notes: "",
  };
}
export function voucherDraftFromSale(sale: VoucherSale): VoucherDraft {
  return {
    sale_date: sale.sale_date, buyer: sale.buyer, quantity: String(sale.quantity),
    unit_price: (sale.unit_price_cents / 100).toFixed(2),
    branch_id: sale.branch_id === null ? "unknown" : String(sale.branch_id),
    payment_method: sale.payment_method, reference: sale.reference ?? "", notes: sale.notes ?? "",
  };
}
export function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function voucherRangeError(start: string, end: string): string | null {
  if (!start && !end) return null;
  if (!isDateOnly(start) || !isDateOnly(end)) return "Enter both a valid start date and end date.";
  return start > end ? "Start date must be on or before end date." : null;
}
export function voucherSalesUrl(start = "", end = "") {
  if (voucherRangeError(start, end)) throw new Error(voucherRangeError(start, end)!);
  return start ? `${VOUCHER_SALES_URL}?start_date=${start}&end_date=${end}` : VOUCHER_SALES_URL;
}
export function voucherDraftError(draft: VoucherDraft): string | null {
  if (!isDateOnly(draft.sale_date)) return "Enter a valid original sale date.";
  if (!draft.buyer.trim()) return "Enter the buyer name.";
  const quantity = Number(draft.quantity);
  if (!/^\d+$/.test(draft.quantity) || !Number.isSafeInteger(quantity) || quantity < 1)
    return "Quantity must be a positive whole number.";
  if (!/^\d+(\.\d{1,2})?$/.test(draft.unit_price) || Number(draft.unit_price) <= 0)
    return "Unit price must be greater than zero with at most two decimal places.";
  const cents = Math.round(Number(draft.unit_price) * 100);
  if (!Number.isSafeInteger(cents * quantity)) return "Sale total is too large.";
  if (draft.branch_id !== "unknown" && (!Number.isSafeInteger(Number(draft.branch_id)) || Number(draft.branch_id) < 1))
    return "Choose a valid branch or Unspecified / unknown.";
  if (!(draft.payment_method in VOUCHER_PAYMENT_LABELS)) return "Choose a valid payment method.";
  return null;
}
export function voucherSalePayload(draft: VoucherDraft) {
  const error = voucherDraftError(draft);
  if (error) throw new Error(error);
  return {
    sale_date: draft.sale_date, buyer: draft.buyer.trim(), quantity: Number(draft.quantity),
    unit_price_cents: Math.round(Number(draft.unit_price) * 100),
    branch_id: draft.branch_id === "unknown" ? null : Number(draft.branch_id),
    payment_method: draft.payment_method,
    reference: draft.reference.trim() || null, notes: draft.notes.trim() || null,
  };
}
export function isVoucherAccountingQuery(queryKey: readonly unknown[]) {
  const key = queryKey[0];
  return typeof key === "string" && (
    key === VOUCHER_SALES_URL || key.startsWith(`${VOUCHER_SALES_URL}?`)
    || key === "/api/admin/profit-loss" || key.startsWith("/api/admin/profit-loss?")
  );
}
