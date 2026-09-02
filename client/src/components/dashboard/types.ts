export interface Whoami {
  authenticated: boolean;
  user?: { id: string; firstName: string; lastName: string; email: string };
}

export interface MeResp {
  profile: {
    id: number;
    first_name: string;
    last_name: string;
    phone_number: string | null;
    email: string;
    customer_id: number | null;
    customer_name: string | null;
    customer_phone: string | null;
  };
  stats: {
    total_done: number;
    total_spent_cents: number;
    remaining_washes: number;
    washes_this_month: number;
    washes_last_month: number;
    member_since: string | null;
    loyalty_points: number;
    saved_this_cycle_cents: number;
  };
}

export interface OrderAddonLine {
  id: string;
  name: string;
  price_cents: number;
}

export interface OrderRow {
  id: string;
  branch_name: string | null;
  plate: string;
  package_name: string;
  total_cents: number;
  status: string;
  created_at: string;
  payment_method: string;
  qr_provider?: string | null;
  // Optional richer fields — populated by /api/customer/orders so the
  // digital receipt matches the printed one. Older callers ignore them.
  package_price_cents?: number | null;
  addons?: OrderAddonLine[] | null;
  subtotal_cents?: number | null;
  discount_cents?: number | null;
  promo_discount_cents?: number | null;
  paid_amount_cents?: number | null;
  change_cents?: number | null;
  item_notes?: string | null;
  ticket_code?: string | null;
  cashier_name?: string | null;
  // Pocket Pay order reference — only present (and non-null) for web-paid
  // walk-in washes (qr_provider === 'pocket_pay'). It is the order_id that
  // the in-dashboard wash QR encodes for the POS scanner.
  payment_ref?: string | null;
}

export interface MembershipRow {
  id: string;
  kind: "pack" | "unlimited";
  total_washes: number;
  remaining_washes: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  price_cents: number;
  sold_at_branch_name: string | null;
  vehicle_id: number | null;
  vehicle_plate: string | null;
}

export interface SubscriptionRow {
  id: string;
  plan_id: string;
  status: string;
  price_cents: number;
  currency: string;
  card_brand: string | null;
  card_last4: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface CarRow {
  id: number;
  license_plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  photo_url: string | null;
  last_seen_at: string | null;
  total_washes: number;
}

export type InteriorRefreshStatus =
  | "available"
  | "booked"
  | "checked_in"
  | "used"
  | "completed"
  | "cancelled"
  | "expired"
  | "no_show"
  | "unavailable";

export interface InteriorRefreshAppointment {
  id: string;
  status: Exclude<InteriorRefreshStatus, "available" | "expired" | "unavailable">;
  starts_at: string;
  ends_at: string;
  branch_name: string;
  vehicle_id: number;
  vehicle_plate: string;
  vehicle_label?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  checked_in_at?: string | null;
  completed_at?: string | null;
}

export interface InteriorRefreshBenefit {
  promotion: {
    enabled: boolean;
    starts_on: string | null;
    ends_on: string | null;
    branch_name: string;
    duration_minutes: number;
  };
  covered_vehicle_ids: number[];
  entitlement: {
    status: InteriorRefreshStatus;
    period_start: string;
    period_end: string;
    bookable_through: string | null;
  } | null;
  appointment: InteriorRefreshAppointment | null;
}

export interface InteriorRefreshSlot {
  starts_at: string;
  ends_at: string;
}

export interface QueueBranch {
  id: number;
  name: string;
  location: string | null;
  is_open: boolean;
  washing_count: number;
  queued_count: number;
  today_total: number;
  est_wait_minutes: number;
}

export const formatBND = (cents: number) => `BND ${(cents / 100).toFixed(0)}`;
export const formatBNDFull = (cents: number) =>
  `BND ${(cents / 100).toFixed(2)}`;

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  return `${date} ${time}`;
};

// Handoff rule: orange for Premium · purple for Full · gray for Basic
export const packageBadgeClass = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("premium")) return "bg-amber-100 text-amber-700";
  if (lower.includes("basic")) return "bg-gray-100 text-gray-700";
  return "bg-purple-100 text-purple-700";
};

export const shortReceiptId = (orderId: string) => {
  // orderId looks like a uuid — show last 4 chars as W-XXXX style.
  const tail = orderId.replace(/-/g, "").slice(-4).toUpperCase();
  return `W-${tail}`;
};
