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

export interface OrderRow {
  id: string;
  branch_name: string | null;
  plate: string;
  package_name: string;
  total_cents: number;
  status: string;
  created_at: string;
  payment_method: string;
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
}

export interface CarRow {
  id: number;
  license_plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  last_seen_at: string | null;
  total_washes: number;
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

export const PACKAGE_BADGE: Record<string, string> = {
  basic: "bg-purple-100 text-purple-700",
  full: "bg-purple-100 text-purple-700",
  premium: "bg-amber-100 text-amber-700",
};

export const packageBadgeClass = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("premium")) return "bg-amber-100 text-amber-700";
  if (lower.includes("basic")) return "bg-blue-100 text-blue-700";
  return "bg-purple-100 text-purple-700";
};

export const shortReceiptId = (orderId: string) => {
  // orderId looks like a uuid — show last 4 chars as W-XXXX style.
  const tail = orderId.replace(/-/g, "").slice(-4).toUpperCase();
  return `W-${tail}`;
};
