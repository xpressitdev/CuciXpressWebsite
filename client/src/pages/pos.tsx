// ============================================================
// POS Surface (Task 2.4)
//
// Cashier-facing point-of-sale. Staff signs in via the existing
// /api/auth/staff/login flow, picks vehicle size + addons + payment
// method, enters the plate, and submits. Server-side recomputes price
// from the catalog and assigns the next ticket code.
//
// Single-screen, no router-internal navigation. After a successful
// order, shows a confirmation card with the ticket; "New Order" resets
// the form.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft,
  Car,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  ShieldCheck,
  User,
  X,
  QrCode,
  Play,
  CheckCheck,
  Activity,
  ChevronUp,
  ChevronDown,
  Undo2,
  RotateCcw,
  Pencil,
  Stamp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AdminLogin from "@/components/AdminLogin";
import ShiftBar from "@/components/ShiftBar";
import DailyReport from "@/components/DailyReport";
import ScanInTab from "@/components/admin/ScanInTab";
import LoyaltyStampTab from "@/components/admin/LoyaltyStampTab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  printReceipt,
  isBluetoothPrintingSupported,
  BluetoothPrintError,
} from "@/lib/btPrinter";

type PaymentMethod =
  | "cash" | "bank_transfer" | "card" | "qr_code"
  | "baiduri_pay" | "quick_pay" | "subscription" | "voucher";

interface CatalogPackage {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  sort_order: number;
  price_cents: number;
  category_id: string | null;
}
interface CatalogAddon {
  id: string;
  name: string;
  price_cents: number;
  sort_order: number;
  category_id: string | null;
}
interface CatalogCategory {
  id: string;
  name: string;
  sort_order: number;
}
interface CatalogResponse {
  packages: CatalogPackage[];
  addons: CatalogAddon[];
  payment_methods: readonly PaymentMethod[];
  categories?: CatalogCategory[];
}

// POS Control Room: rows the cashier-facing endpoints return.
interface PosPaymentMethod {
  id: string;
  label: string;
  method: PaymentMethod;
  qr_provider: string | null;
  sort_order: number;
}
interface PosDiscount {
  id: string;
  name: string;
  kind: "percent" | "fixed";
  value: number;
  // When set, the discount only applies to orders for this package
  // (e.g. BruHealth $2 Off → B$12 Full Package only).
  only_package_id: string | null;
}

interface ActiveMembership {
  id: string;
  customer_id: number;
  vehicle_id: number | null;
  kind: "pack" | "unlimited";
  total_washes: number;
  remaining_washes: number;
  price_cents: number;
  status: string;
  expires_at: string | null;
  created_at: string;
}

interface TodayOrder {
  id: string;
  ticket_code: string;
  plate: string;
  package_name: string;
  total_cents: number;
  payment_method: PaymentMethod;
  qr_provider?: string | null;
  status: string;
  created_at: string;
  // Lane-control manual ordering. NULL = FIFO by created_at.
  queue_position?: number | null;
  // Phase 4 — populated when status='refunded'.
  refunded_at?: string | null;
  refund_reason?: string | null;
  // Receipt re-print: full line-item + payment detail so a cashier can
  // print a paper copy of a past order on customer request.
  branch_id: number;
  package_price_cents: number;
  addons: Array<{ id?: string; name: string; price_cents: number; quantity?: number }>;
  subtotal_cents: number;
  paid_amount_cents: number | null;
  change_cents: number | null;
}

interface VehicleSuggestion {
  id: number;
  license_plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  type: string | null;
  last_seen_at: string | null;
  customer: { id: number; phone: string; name: string } | null;
}
type VipTier = "gold" | "silver" | "bronze";
interface VehicleHistory {
  vehicle: VehicleSuggestion & { vip_tier: VipTier | null; vip_rank: number | null };
  customer: { id: number; phone: string; name: string } | null;
  total_visits: number;
  total_spent_cents: number;
  favourite_branch_id: number | null;
  recent_orders: Array<{
    id: string;
    ticket_code: string;
    branch_id: number;
    package_name: string;
    total_cents: number;
    payment_method: PaymentMethod;
    status: string;
    created_at: string;
  }>;
}

interface CreatedOrder {
  id: string;
  ticket_code: string;
  branch_id: number;
  plate: string;
  package_name: string;
  package_price_cents: number;
  addons: Array<{ id: string; name: string; price_cents: number; quantity?: number }>;
  subtotal_cents: number;
  total_cents: number;
  paid_amount_cents: number | null;
  change_cents: number;
  payment_method: PaymentMethod;
  qr_provider: string | null;
  status: string;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  qr_code: "QR Code",
  baiduri_pay: "Baiduripay",
  quick_pay: "Quickpay",
  subscription: "Subscription",
  voucher: "Voucher",
};

// Payment options shown in the POS dropdown. These mirror the real POS
// payment types. The "wallet" methods (Pocket / Baiduri MS) all store as
// payment_method='qr_code' with a distinguishing qr_provider, matching how
// synced/reported data already represents them (see paymentLabel() on the
// server) — so no new payment_method values or DB migration are needed.
type PaymentOption = {
  key: string;
  label: string;
  method: PaymentMethod;
  qrProvider: string | null;
};
const PAYMENT_OPTIONS: ReadonlyArray<PaymentOption> = [
  { key: "cash", label: "Cash", method: "cash", qrProvider: null },
  { key: "card", label: "Card", method: "card", qrProvider: null },
  { key: "bank_transfer", label: "Bank Transfer", method: "bank_transfer", qrProvider: null },
  { key: "baiduri_pay", label: "Baiduripay", method: "baiduri_pay", qrProvider: null },
  { key: "quick_pay", label: "Quickpay", method: "quick_pay", qrProvider: null },
  { key: "pocket_pay_qr", label: "Pocket Payment QR", method: "qr_code", qrProvider: "pocket_pay_qr" },
  { key: "pocket_pay_invoice", label: "Pocket Payment Invoice", method: "qr_code", qrProvider: "pocket_pay_invoice" },
  { key: "baiduri_ms", label: "Baiduri MS Payment Request", method: "qr_code", qrProvider: "baiduri_ms" },
  { key: "subscription", label: "Subscription", method: "subscription", qrProvider: null },
  { key: "voucher", label: "Voucher", method: "voucher", qrProvider: null },
];

// Label an order for receipts/confirmation, taking the qr_provider into
// account so the three "wallet" methods read correctly instead of all
// showing "QR Code".
function paymentDisplayLabel(
  method: PaymentMethod,
  qrProvider: string | null,
): string {
  const opt = PAYMENT_OPTIONS.find(
    (o) => o.method === method && (o.qrProvider ?? null) === (qrProvider ?? null),
  );
  if (opt) return opt.label;
  // Web checkout orders pay via Pocket Pay on cucixpress.com and store
  // qr_provider 'pocket_pay' (distinct from the in-store 'pocket_pay_qr').
  // They are not in PAYMENT_OPTIONS (web-only, never selectable at POS), so
  // name them explicitly instead of humanising to a bare "Pocket Pay".
  if (method === "qr_code" && qrProvider === "pocket_pay") {
    return "Website cucixpress.com";
  }
  // Owner-added wallets (e.g. 'progresif_ding') aren't in the static list —
  // humanise the slug so the receipt names them instead of falling back to a
  // generic "QR Payment".
  if (method === "qr_code" && qrProvider) {
    return qrProvider.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return PAYMENT_LABELS[method] ?? method;
}

// Source of truth for branch id -> display name. Lane/cashier accounts
// are bound to one of these via staff.branch_id; owner/manager can
// switch freely via the branch picker.
const BRANCHES: ReadonlyArray<{ id: number; name: string }> = [
  { id: 1, name: "Tungku Link" },
  { id: 2, name: "Salar" },
  { id: 3, name: "Bengkurong" },
  { id: 4, name: "Tutong" },
  { id: 5, name: "Lambak" },
];

const BRANCH_NAME_BY_ID: Record<number, string> = Object.fromEntries(
  BRANCHES.map((b) => [b.id, b.name]),
);

const BRANCH_LS_KEY = "cx.pos.branchId";

function formatBND(cents: number): string {
  return `B$${(cents / 100).toFixed(2)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Brunei",
  });
}

// "3 days ago", "just now". Compact relative time for the autocomplete +
// matched-vehicle pill. Falls back to a date for anything older than 30d.
function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Brunei",
  });
}

export default function POS() {
  const { staff, isAuthenticated, isLoading: authLoading, login, logout } = useStaffAuth();
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [packageId, setPackageId] = useState<string>("");
  const [plate, setPlate] = useState<string>("");
  // Add-on id → per-line quantity (e.g. 3 vouchers). Presence in the map
  // means selected; the value is the quantity (always ≥ 1).
  const [selectedAddons, setSelectedAddons] = useState<Map<string, number>>(new Map());
  const [paymentKey, setPaymentKey] = useState<string>("cash");
  const [paymentRef, setPaymentRef] = useState<string>("");
  const [cashReceived, setCashReceived] = useState<string>("");
  const [itemNotes, setItemNotes] = useState<string>("");
  const [scanOpen, setScanOpen] = useState<boolean>(false);
  // Phase 7 refund: styled confirm modal (replaces native confirm/prompt).
  const [refundTarget, setRefundTarget] = useState<TodayOrder | null>(null);
  const [refundReason, setRefundReason] = useState<string>("");

  // POS Control Room: cashier-selected discount + promo code.
  const [discountId, setDiscountId] = useState<string>("none");
  const [promoInput, setPromoInput] = useState<string>("");
  const [appliedPromo, setAppliedPromo] = useState<
    { code: string; kind: "percent" | "fixed"; value: number; discount_cents: number } | null
  >(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoChecking, setPromoChecking] = useState<boolean>(false);

  // Phase 1: vehicle/customer linkage.
  // - `matchedVehicleId` is set when the cashier picks a suggestion from
  //   the autocomplete. Cleared when they edit the plate further (so a
  //   typo correction doesn't accidentally tag the order to the wrong car).
  // - For a first-time plate (no match) the cashier records the car's
  //   brand + model. We don't ask for the customer's name/phone at POS —
  //   we don't know them. The brand/model is stored on the cars row keyed
  //   by plate, so when the customer later registers and claims the plate,
  //   those details are retained (and they can edit them afterwards).
  const [matchedVehicleId, setMatchedVehicleId] = useState<number | null>(null);
  const [vehicleSuggestions, setVehicleSuggestions] = useState<VehicleSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [newCarBrand, setNewCarBrand] = useState<string>("");
  const [newCarModel, setNewCarModel] = useState<string>("");
  // Inline edit of the matched car's brand/model when the cashier spots
  // wrong details on a plate lookup. Saving updates the single cars row,
  // which is reflected everywhere the car appears (customer dashboard,
  // admin profile, future POS lookups).
  const [editingVehicle, setEditingVehicle] = useState<boolean>(false);
  const [editBrand, setEditBrand] = useState<string>("");
  const [editModel, setEditModel] = useState<string>("");
  const plateInputRef = useRef<HTMLInputElement | null>(null);

  // Counter-sold Unlimited pass (sell/renew) dialog state.
  const [sellPassOpen, setSellPassOpen] = useState<boolean>(false);
  const [sellName, setSellName] = useState<string>("");
  const [sellPhone, setSellPhone] = useState<string>("");
  const [sellPayKey, setSellPayKey] = useState<string>("cash");
  const [sellCash, setSellCash] = useState<string>("");
  const [sellRef, setSellRef] = useState<string>("");
  // Set when the phone entered already belongs to an existing customer:
  // the cashier must confirm before the pass attaches to that account.
  const [sellExistingName, setSellExistingName] = useState<string | null>(null);

  // Confirmation state
  const [lastOrder, setLastOrder] = useState<CreatedOrder | null>(null);
  // Which Today's-orders row is currently re-printing (per-row spinner).
  const [reprintId, setReprintId] = useState<string | null>(null);
  const [printing, setPrinting] = useState<boolean>(false);

  // Branch resolution.
  // - Owner & manager pick a branch via the dropdown; choice persists
  //   in localStorage so a refresh doesn't kick them back to "no branch".
  // - Lane & cashier are locked to staff.branchId — the server enforces
  //   this regardless of what the client sends.
  const canSwitchBranch =
    staff?.role === "owner" || staff?.role === "manager";

  const [pickedBranchId, setPickedBranchId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(BRANCH_LS_KEY);
    const n = v ? Number.parseInt(v, 10) : NaN;
    return Number.isInteger(n) && BRANCHES.some((b) => b.id === n) ? n : null;
  });

  const branchId: number | null = canSwitchBranch
    ? pickedBranchId
    : staff?.branchId ?? null;

  const handlePickBranch = (id: number) => {
    setPickedBranchId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BRANCH_LS_KEY, String(id));
    }
  };

  // Catalog is now branch-scoped: a package may be hidden at branches
  // it isn't assigned to (see migration 2026-05-04_08). We re-key by
  // branchId so switching branches refetches.
  const { data: catalog, isLoading: catalogLoading } = useQuery<CatalogResponse>({
    queryKey: ["/api/pos/catalog", branchId],
    enabled: isAuthenticated && branchId !== null,
    queryFn: async () => {
      const r = await fetch(
        `/api/pos/catalog?branch_id=${encodeURIComponent(String(branchId))}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("catalog_failed");
      return r.json();
    },
  });

  const { data: todayData } = useQuery<{ orders: TodayOrder[] }>({
    queryKey: ["/api/pos/orders/today", branchId],
    enabled: isAuthenticated && branchId !== null,
    queryFn: async () => {
      const r = await fetch(`/api/pos/orders/today?branch_id=${branchId}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  });

  // POS Control Room: payment methods + discounts the owner configured.
  // The payment dropdown is driven by this instead of the hardcoded list;
  // we fall back to PAYMENT_OPTIONS until the fetch lands so the UI never
  // shows an empty selector.
  const { data: paymentMethodsData } = useQuery<{ rows: PosPaymentMethod[] }>({
    queryKey: ["/api/pos/payment-methods"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const r = await fetch("/api/pos/payment-methods", { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  });

  const { data: discountsData } = useQuery<{ rows: PosDiscount[] }>({
    queryKey: ["/api/pos/discounts"],
    enabled: isAuthenticated,
    queryFn: async () => {
      const r = await fetch("/api/pos/discounts", { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  });

  // Map configured payment methods onto the existing PaymentOption shape so
  // the qr_provider special-handling downstream keeps working. Key is the
  // config row id — unique per row and stable across reloads. (Using method
  // or qr_provider would collide when two rows share a method, e.g. two
  // "Bank Transfer" accounts, making the second unselectable.)
  const paymentOptions: ReadonlyArray<PaymentOption> = useMemo(() => {
    const rows = paymentMethodsData?.rows ?? [];
    if (rows.length === 0) return PAYMENT_OPTIONS;
    return rows.map((r) => ({
      key: r.id,
      label: r.label,
      method: r.method,
      qrProvider: r.qr_provider,
    }));
  }, [paymentMethodsData]);

  const selectedPayment =
    paymentOptions.find((o) => o.key === paymentKey) ?? paymentOptions[0];
  const paymentMethod = selectedPayment.method;
  const qrProvider = selectedPayment.qrProvider;

  // If the configured list doesn't contain the sticky selection (e.g. the
  // owner removed a method), snap to the first available option.
  useEffect(() => {
    if (!paymentOptions.some((o) => o.key === paymentKey)) {
      setPaymentKey(paymentOptions[0]?.key ?? "cash");
    }
  }, [paymentOptions, paymentKey]);

  // Default the package selection as soon as the catalog loads. Prefer the
  // "Full Package" (the most common sale) and fall back to the first package.
  useEffect(() => {
    if (catalog && !packageId && catalog.packages.length > 0) {
      const fullPackage = catalog.packages.find((p) =>
        p.name.toLowerCase().includes("full package"),
      );
      setPackageId((fullPackage ?? catalog.packages[0]).id);
    }
  }, [catalog, packageId]);

  const activePackage = useMemo(
    () => catalog?.packages.find((p) => p.id === packageId) ?? null,
    [catalog, packageId],
  );

  const packagePrice = activePackage?.price_cents ?? null;

  // Add-ons can be sold in bulk via a per-line quantity (e.g. several wash
  // vouchers), so each contributes price × its quantity. The package itself
  // is always a single wash.
  const addonsTotal = useMemo(() => {
    if (!catalog) return 0;
    // Mirror the server: a subscription/free wash is a single car, so its
    // add-ons stay at qty 1 regardless of the stepper value.
    return catalog.addons
      .filter((a) => selectedAddons.has(a.id))
      .reduce((s, a) => {
        const qty = paymentMethod === "subscription" ? 1 : (selectedAddons.get(a.id) ?? 1);
        return s + a.price_cents * qty;
      }, 0);
  }, [catalog, selectedAddons, paymentMethod]);

  const subtotal = (packagePrice ?? 0) + addonsTotal;

  // Clicking a payment-method tile filters the transaction list below it to
  // just that method. null = show everything. The filter key is the same
  // display label used to build the tiles, so matching is exact.
  const [methodFilter, setMethodFilter] = useState<string | null>(null);

  // Today's sales summary for the right-rail: net sales (excluding refunds),
  // refund total, and a per-payment-method breakdown so the cashier can see
  // how much came in via Cash / Bank Transfer / each wallet at a glance.
  const todaySummary = useMemo(() => {
    const orders = todayData?.orders ?? [];
    let salesCents = 0;
    let salesCount = 0;
    let refundCents = 0;
    let refundCount = 0;
    const byMethod = new Map<
      string,
      { label: string; cents: number; count: number }
    >();
    for (const o of orders) {
      if (o.status === "refunded") {
        refundCents += o.total_cents;
        refundCount += 1;
        continue;
      }
      salesCents += o.total_cents;
      salesCount += 1;
      const label = paymentDisplayLabel(o.payment_method, o.qr_provider ?? null);
      const prev = byMethod.get(label) ?? { label, cents: 0, count: 0 };
      prev.cents += o.total_cents;
      prev.count += 1;
      byMethod.set(label, prev);
    }
    const methods = Array.from(byMethod.values()).sort(
      (a, b) => b.cents - a.cents,
    );
    return { salesCents, salesCount, refundCents, refundCount, methods };
  }, [todayData]);

  // Transaction list, filtered to the selected payment-method tile (if any).
  const visibleTodayOrders = useMemo(() => {
    const orders = todayData?.orders ?? [];
    if (!methodFilter) return orders;
    return orders.filter(
      (o) =>
        paymentDisplayLabel(o.payment_method, o.qr_provider ?? null) ===
        methodFilter,
    );
  }, [todayData, methodFilter]);

  // Drop a stale filter when its method no longer has a tile (e.g. the data
  // refreshed, the branch changed, or that method's only order was refunded)
  // so the list never stays silently filtered by an invisible selection.
  useEffect(() => {
    if (
      methodFilter &&
      !todaySummary.methods.some((m) => m.label === methodFilter)
    ) {
      setMethodFilter(null);
    }
  }, [todaySummary, methodFilter]);

  // Debounced plate autocomplete. Hits /api/pos/vehicles/search 200ms after
  // the user pauses typing. Skipped when a suggestion is already matched.
  useEffect(() => {
    if (!isAuthenticated) return;
    const q = plate.trim();
    if (q.length < 1 || matchedVehicleId !== null) {
      setVehicleSuggestions([]);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/pos/vehicles/search?q=${encodeURIComponent(q)}`,
          { credentials: "include" },
        );
        if (!r.ok) return;
        const data = (await r.json()) as { vehicles: VehicleSuggestion[] };
        setVehicleSuggestions(data.vehicles);
      } catch {
        /* ignore */
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [plate, matchedVehicleId, isAuthenticated]);

  // Fetch history for the picked vehicle so the cashier sees prior visits.
  const { data: vehicleHistory } = useQuery<VehicleHistory>({
    queryKey: ["/api/pos/vehicles", matchedVehicleId, "history"],
    enabled: matchedVehicleId !== null,
    queryFn: async () => {
      const r = await fetch(
        `/api/pos/vehicles/${matchedVehicleId}/history`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  });

  // Phase 2: wash-pack lookup. Driven by the customer attached to the
  // matched vehicle. The server applies the customer + (optional)
  // vehicle pin filter and only returns active, non-expired packs.
  const customerIdForMembership = vehicleHistory?.customer?.id ?? null;

  const { data: membershipData } = useQuery<{ memberships: ActiveMembership[] }>({
    queryKey: [
      "/api/pos/memberships/active",
      customerIdForMembership,
      matchedVehicleId,
    ],
    enabled: customerIdForMembership !== null,
    queryFn: async () => {
      const params = new URLSearchParams({ customer_id: String(customerIdForMembership) });
      if (matchedVehicleId !== null) params.set("vehicle_id", String(matchedVehicleId));
      const r = await fetch(`/api/pos/memberships/active?${params}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  });

  // Pick the most specific pack — vehicle-pinned trumps customer-wide.
  const activeMembership: ActiveMembership | null = useMemo(() => {
    const list = membershipData?.memberships ?? [];
    if (list.length === 0) return null;
    const pinned = list.find(m => m.vehicle_id === matchedVehicleId);
    return pinned ?? list[0];
  }, [membershipData, matchedVehicleId]);

  // Counter-sold Unlimited pass. Price is server-authoritative (B$39/mo)
  // — this constant is display-only. The sale rings a normal paid order
  // so it lands in the drawer + today's list.
  const UNLIMITED_PASS_CENTS = 3900;
  const hasKnownCustomer = !!vehicleHistory?.customer;
  const unlimitedOnCar =
    activeMembership?.kind === "unlimited" ? activeMembership : null;
  const sellPayOption = useMemo(
    () =>
      PAYMENT_OPTIONS.find((o) => o.key === sellPayKey) ?? PAYMENT_OPTIONS[0],
    [sellPayKey],
  );
  const sellCashCents = (() => {
    const t = sellCash.trim();
    if (t === "") return null;
    const n = parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  })();
  const sellNeedsContact = !hasKnownCustomer;
  const canSellPass =
    plate.trim().length > 0 &&
    branchId !== null &&
    (!sellNeedsContact ||
      (sellName.trim().length > 0 && sellPhone.trim().length > 0)) &&
    (sellPayOption.method !== "cash" ||
      (sellCashCents != null && sellCashCents >= UNLIMITED_PASS_CENTS)) &&
    (sellPayOption.method !== "bank_transfer" || sellRef.trim().length > 0);

  const sellPass = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/pos/subscriptions/sell", {
        plate: plate.trim(),
        brand: newCarBrand.trim() || null,
        model: newCarModel.trim() || null,
        customer_name: sellName.trim() || null,
        customer_phone: sellPhone.trim() || null,
        payment_method: sellPayOption.method,
        qr_provider: sellPayOption.qrProvider,
        payment_ref: sellRef.trim() || null,
        paid_amount_cents:
          sellPayOption.method === "cash" ? sellCashCents : null,
        branch_id: branchId,
        confirm_existing_customer: sellExistingName !== null,
      });
      return (await r.json()) as {
        ok: true;
        renewed: boolean;
        change_cents: number;
        membership: { expires_at: string | null };
      };
    },
    onSuccess: (data) => {
      setSellPassOpen(false);
      setSellName("");
      setSellPhone("");
      setSellCash("");
      setSellRef("");
      setSellExistingName(null);
      const until = data.membership.expires_at
        ? new Date(data.membership.expires_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Asia/Brunei",
          })
        : "";
      toast({
        title: data.renewed ? "Pass renewed" : "Unlimited pass sold",
        description:
          `Valid until ${until}.` +
          (data.change_cents > 0
            ? ` Change: ${formatBND(data.change_cents)}.`
            : ""),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/orders/today", branchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/pos/memberships/active"] });
      if (matchedVehicleId !== null) {
        queryClient.invalidateQueries({
          queryKey: ["/api/pos/vehicles", matchedVehicleId, "history"],
        });
      }
    },
    onError: (err: any) => {
      const text = String(err?.message ?? "");
      if (text.includes("phone_belongs_to_existing_customer")) {
        // Surface the existing account so the cashier confirms (or fixes
        // a typo) before the pass attaches to it.
        let name: string | null = null;
        const jsonStart = text.indexOf("{");
        if (jsonStart >= 0) {
          try {
            name = JSON.parse(text.slice(jsonStart))?.existing_customer_name ?? null;
          } catch { /* keep null */ }
        }
        setSellExistingName(name ?? "an existing customer");
        return;
      }
      const msg = text.includes("customer_details_required")
        ? "Enter the customer's name and phone number."
        : text.includes("cash_amount_too_low")
          ? "Cash received is less than B$39.00."
          : "Could not complete the pass sale. Try again.";
      toast({ title: msg, variant: "destructive" });
    },
  });

  // When the cashier picks "Subscription" AND we have an active wash-pack
  // for the customer, the pack covers the full subtotal (Phase 2 model —
  // matches the server-side discount calculation).
  // NB: must be defined AFTER activeMembership to avoid a TDZ ReferenceError.
  const useMembership =
    paymentMethod === "subscription" && activeMembership !== null;
  const discount = useMembership ? subtotal : 0;

  // POS Control Room: manual discount + promo code. Both are computed off
  // the subtotal, stacked, and clamped so the total never goes below zero.
  // The server recomputes these authoritatively at checkout — this is only
  // a live display estimate. Neither applies to a subscription redemption.
  const selectedDiscount = useMemo(
    () => discountsData?.rows.find((d) => d.id === discountId) ?? null,
    [discountsData, discountId],
  );

  // A package-locked discount stops applying the moment the cashier switches
  // to a non-qualifying package — deselect it so it can't ride along.
  useEffect(() => {
    if (
      selectedDiscount?.only_package_id &&
      selectedDiscount.only_package_id !== packageId
    ) {
      setDiscountId("none");
    }
  }, [selectedDiscount, packageId]);

  const manualDiscountCents = useMemo(() => {
    if (paymentMethod === "subscription" || !selectedDiscount) return 0;
    const raw =
      selectedDiscount.kind === "percent"
        ? Math.round((subtotal * selectedDiscount.value) / 100)
        : selectedDiscount.value;
    return Math.min(Math.max(raw, 0), subtotal);
  }, [selectedDiscount, subtotal, paymentMethod]);

  const promoDiscountCents = useMemo(() => {
    if (paymentMethod === "subscription" || !appliedPromo) return 0;
    const remaining = Math.max(subtotal - manualDiscountCents, 0);
    return Math.min(Math.max(appliedPromo.discount_cents, 0), remaining);
  }, [appliedPromo, subtotal, manualDiscountCents, paymentMethod]);

  const total = useMembership
    ? 0
    : Math.max(subtotal - manualDiscountCents - promoDiscountCents, 0);

  // Re-validate an applied promo against the live subtotal so the displayed
  // amount stays correct as the cashier changes packages/add-ons.
  const validatePromo = async (rawCode: string) => {
    const code = rawCode.trim();
    if (code === "") {
      setAppliedPromo(null);
      setPromoError(null);
      return;
    }
    setPromoChecking(true);
    setPromoError(null);
    try {
      const r = await fetch(
        `/api/pos/promo/validate?code=${encodeURIComponent(code)}&subtotal_cents=${subtotal}`,
        { credentials: "include" },
      );
      const data = await r.json();
      if (!r.ok || !data?.valid) {
        setAppliedPromo(null);
        setPromoError(
          data?.reason === "expired"
            ? "This promo code has expired."
            : data?.reason === "exhausted"
              ? "This promo code has reached its usage limit."
              : data?.reason === "not_started"
                ? "This promo code isn't active yet."
                : "Promo code not found.",
        );
        return;
      }
      setAppliedPromo({
        code: data.promo.code,
        kind: data.promo.kind,
        value: data.promo.value,
        discount_cents: data.promo.discount_cents,
      });
      setPromoError(null);
    } catch {
      setAppliedPromo(null);
      setPromoError("Couldn't check the promo code. Try again.");
    } finally {
      setPromoChecking(false);
    }
  };

  // Keep the applied promo's amount in sync when the subtotal changes.
  useEffect(() => {
    if (appliedPromo) {
      validatePromo(appliedPromo.code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  // Cash handling — only meaningful when paying by cash. We let the
  // cashier punch in the cash handed over so the receipt can show the
  // amount paid and the change due. Blank = treat as exact payment.
  const cashReceivedCents = (() => {
    const trimmed = cashReceived.trim();
    if (trimmed === "") return null; // blank = exact payment, not zero
    const n = parseFloat(trimmed);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  })();
  const changeCents =
    paymentMethod === "cash" && cashReceivedCents != null
      ? Math.max(0, cashReceivedCents - total)
      : 0;

  // A first-time plate (no matched car on file) requires the cashier to
  // record the car's brand + model so the cars row carries those details
  // forward to the customer when they later claim the plate.
  const isFirstTimerPlate = matchedVehicleId === null && plate.trim().length > 0;
  const newCarDetailsComplete =
    newCarBrand.trim().length > 0 && newCarModel.trim().length > 0;

  const canSubmit =
    !!activePackage &&
    packagePrice !== null &&
    plate.trim().length > 0 &&
    branchId !== null &&
    // First-time plate: brand + model are mandatory before the sale.
    (!isFirstTimerPlate || newCarDetailsComplete) &&
    // Cash payments must record how much cash was handed over (no blank /
    // "exact" shortcut) so the drawer reconciles and the receipt shows change.
    (paymentMethod !== "cash" || cashReceivedCents != null) &&
    // Bank transfer must record a reference (transaction id) so the sale can
    // be matched against the bank statement.
    (paymentMethod !== "bank_transfer" || paymentRef.trim().length > 0) &&
    // Subscription payment requires an active wash-pack on file. Block
    // submit until the cashier either resolves a customer with a pack
    // or switches payment method — the server enforces this too, but
    // catching it client-side avoids a confusing 400 round-trip.
    (paymentMethod !== "subscription" || activeMembership !== null);

  // When picking a suggestion, prefill the plate so the cashier doesn't
  // retype it. They can still edit before submitting.
  const pickVehicle = (v: VehicleSuggestion) => {
    setPlate(v.license_plate);
    setMatchedVehicleId(v.id);
    setEditingVehicle(false);
    setShowSuggestions(false);
    setVehicleSuggestions([]);
    // An existing car already has its details on file (and the server links
    // the customer via the vehicle), so clear any first-timer brand/model
    // entry — it only applies to brand-new plates.
    setNewCarBrand("");
    setNewCarModel("");
  };

  const clearMatchedVehicle = () => {
    setMatchedVehicleId(null);
    setEditingVehicle(false);
    setNewCarBrand("");
    setNewCarModel("");
  };

  // ----- Edit a matched car's brand/model -----
  // Brand/model are stored only on the cars row, so this single PATCH fixes
  // the details everywhere the car shows up. We invalidate the vehicle
  // history query so the card refreshes with the corrected values.
  const editVehicle = useMutation({
    mutationFn: async (vars: { id: number; brand: string; model: string }) => {
      const res = await apiRequest("PATCH", `/api/pos/vehicles/${vars.id}`, {
        brand: vars.brand.trim(),
        model: vars.model.trim(),
      });
      return (await res.json()) as { vehicle: VehicleSuggestion };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/pos/vehicles", vars.id, "history"],
      });
      setEditingVehicle(false);
      toast({ title: "Vehicle details updated" });
    },
    onError: () => {
      toast({
        title: "Couldn't update vehicle",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const startEditVehicle = () => {
    setEditBrand(vehicleHistory?.vehicle.brand ?? "");
    setEditModel(vehicleHistory?.vehicle.model ?? "");
    setEditingVehicle(true);
  };

  // ----- Phase 4: full-order refund -----
  // Any staff can refund (per owner decision). Confirmation + optional
  // reason are captured by the styled AlertDialog below (see promptRefund /
  // confirmRefund). The modal stays open while the request is in flight and
  // closes from these callbacks. Subscription orders DO NOT credit the wash back.
  const refundOrder = useMutation({
    mutationFn: async (vars: { orderId: string; reason: string | null }) => {
      // apiRequest returns the raw Response (it only does the
      // HTTP throw); parse the JSON body ourselves.
      const res = await apiRequest(
        "POST",
        `/api/pos/orders/${vars.orderId}/refund`,
        { reason: vars.reason },
      );
      return (await res.json()) as { ok: true; order: TodayOrder };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/pos/orders/today", branchId],
      });
      toast({
        title: `Refunded ${data.order.ticket_code}`,
        description: `${data.order.plate} · −${formatBND(data.order.total_cents)}`,
      });
      setRefundTarget(null);
    },
    onError: (err: any) => {
      const code = err?.message ?? "refund_failed";
      const friendly =
        code.includes("already_refunded")
          ? "This order has already been refunded."
          : code.includes("branch_mismatch")
            ? "You can only refund orders at your own branch."
            : code.includes("not_found")
              ? "Order not found."
              : "Could not issue refund.";
      toast({
        title: "Refund failed",
        description: friendly,
        variant: "destructive",
      });
      setRefundTarget(null);
    },
  });

  // Open the styled refund confirmation modal. Actual refund fires from
  // the modal's "Refund" action so the cashier can't trigger it by an
  // accidental dismiss (the AlertDialog is modal — no outside-click /
  // Escape-to-confirm).
  const promptRefund = (o: TodayOrder) => {
    setRefundReason("");
    setRefundTarget(o);
  };

  const confirmRefund = () => {
    if (!refundTarget) return;
    // Leave the modal open while the request is in flight so the cashier
    // sees the "Refunding…" state; the mutation callbacks close it.
    refundOrder.mutate({
      orderId: refundTarget.id,
      reason: refundReason.trim() || null,
    });
  };

  const createOrder = useMutation<
    { ok: true; order: CreatedOrder },
    Error,
    { unlimited?: boolean } | void
  >({
    mutationFn: async (vars) => {
      // The "Free Unlimited wash" path skips package/add-on/payment
      // selection entirely: it sends no package_id and forces a
      // subscription redemption against the active Unlimited membership.
      // The server synthesizes a B$0 "Unlimited Xpress" line.
      const oneTap = !!vars && (vars as { unlimited?: boolean }).unlimited === true;
      const res = await apiRequest("POST", "/api/pos/orders", {
        package_id: oneTap ? null : packageId,
        plate: plate.trim(),
        addon_ids: oneTap ? [] : Array.from(selectedAddons.keys()),
        addon_quantities: oneTap ? undefined : Object.fromEntries(selectedAddons),
        payment_method: oneTap ? "subscription" : paymentMethod,
        // Wallets are owner-defined in Admin → Payment Setup; whatever
        // qr_provider slug the selected method carries flows straight through
        // to the order so reporting can attribute it.
        qr_provider: oneTap ? null : (qrProvider || null),
        payment_ref:
          oneTap || paymentMethod === "cash" ? null : paymentRef.trim() || null,
        paid_amount_cents:
          oneTap || paymentMethod !== "cash" ? null : cashReceivedCents,
        branch_id: branchId,
        item_notes: oneTap ? null : itemNotes.trim() || null,
        vehicle_id: matchedVehicleId,
        // First-time plate: send the car's brand + model so the server
        // stores them on the new (or still-blank) cars row. Ignored when an
        // existing vehicle is matched.
        brand: oneTap ? null : newCarBrand.trim() || null,
        model: oneTap ? null : newCarModel.trim() || null,
        membership_id:
          (oneTap || paymentMethod === "subscription") && activeMembership
            ? activeMembership.id
            : null,
        // POS Control Room: discount + promo. Skipped on the unlimited
        // one-tap path and on subscription (server rejects them anyway).
        discount_id:
          oneTap || paymentMethod === "subscription" || discountId === "none"
            ? null
            : discountId,
        promo_code:
          oneTap || paymentMethod === "subscription" || !appliedPromo
            ? null
            : appliedPromo.code,
      });
      return (await res.json()) as { ok: true; order: CreatedOrder };
    },
    onSuccess: (data) => {
      setLastOrder(data.order);
      queryClient.invalidateQueries({
        queryKey: ["/api/pos/orders/today", branchId],
      });
      // Refresh membership balance after a redemption.
      if (data.order.payment_method === "subscription") {
        queryClient.invalidateQueries({
          queryKey: ["/api/pos/memberships/active"],
        });
      }
      toast({
        title: `Ticket ${data.order.ticket_code}`,
        description: `${data.order.plate} · ${formatBND(data.order.total_cents)}`,
      });
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? err);
      toast({
        title: "Could not create order",
        description: msg.includes("409")
          ? "Ticket collision — please try again."
          : msg.includes("car_details_required")
            ? "First-time plate — enter the car's brand and model first."
            : msg,
        variant: "destructive",
      });
    },
  });

  const resetForNew = () => {
    setLastOrder(null);
    setPlate("");
    setSelectedAddons(new Map());
    setPaymentRef("");
    setCashReceived("");
    setItemNotes("");
    setMatchedVehicleId(null);
    setVehicleSuggestions([]);
    setShowSuggestions(false);
    setNewCarBrand("");
    setNewCarModel("");
    setDiscountId("none");
    setPromoInput("");
    setAppliedPromo(null);
    setPromoError(null);
    // Keep packageId, paymentMethod sticky for fast successive orders.
  };

  // On-demand Bluetooth thermal-printer receipt. Digital receipts remain the
  // default; this only fires when a cashier taps "Print receipt".
  // Shared "is Bluetooth available?" guard + toast. Returns false (and warns)
  // when Web Bluetooth isn't usable here (e.g. iPhone/iPad, insecure context).
  const ensurePrinter = (): boolean => {
    if (!isBluetoothPrintingSupported()) {
      toast({
        variant: "destructive",
        title: "Bluetooth printing unavailable",
        description:
          "Use Chrome or Edge on an Android tablet, phone, or computer over a secure connection. It isn't supported on iPhone/iPad.",
      });
      return false;
    }
    return true;
  };

  // Build the ESC/POS receipt from any order shape and send it to the BLE
  // printer. Shared by the post-checkout confirmation screen and the per-order
  // "Print" buttons in Today's orders (re-print on customer request).
  const sendReceiptToPrinter = async (o: {
    ticket_code: string;
    plate: string;
    branch_id: number;
    package_name: string;
    package_price_cents: number;
    addons: Array<{ name: string; price_cents: number; quantity?: number }>;
    subtotal_cents: number;
    total_cents: number;
    paid_amount_cents: number | null;
    change_cents: number | null;
    payment_method: PaymentMethod;
    qr_provider: string | null;
    when: Date;
  }) => {
    const items = [
      { name: o.package_name, price: formatBND(o.package_price_cents) },
      ...o.addons.map((a) => {
        const q = a.quantity ?? 1;
        return {
          name: q > 1 ? `+ ${a.name} × ${q}` : `+ ${a.name}`,
          price: formatBND(a.price_cents * q),
        };
      }),
    ];
    await printReceipt({
      branchName: BRANCH_NAME_BY_ID[o.branch_id] ?? "Cuci Xpress",
      ticketCode: o.ticket_code,
      plate: o.plate,
      dateTime: o.when.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Brunei",
      }),
      items,
      subtotal: formatBND(o.subtotal_cents),
      total: formatBND(o.total_cents),
      paymentLabel: paymentDisplayLabel(o.payment_method, o.qr_provider),
      paidAmount:
        o.paid_amount_cents != null ? formatBND(o.paid_amount_cents) : undefined,
      change:
        o.paid_amount_cents != null
          ? formatBND(o.change_cents ?? 0)
          : undefined,
      cashierName: staff?.name ?? undefined,
    });
  };

  const handlePrintReceipt = async () => {
    if (!lastOrder) return;
    if (!ensurePrinter()) return;
    setPrinting(true);
    try {
      await sendReceiptToPrinter({
        ticket_code: lastOrder.ticket_code,
        plate: lastOrder.plate,
        branch_id: lastOrder.branch_id,
        package_name: lastOrder.package_name,
        package_price_cents: lastOrder.package_price_cents,
        addons: lastOrder.addons,
        subtotal_cents: lastOrder.subtotal_cents,
        total_cents: lastOrder.total_cents,
        paid_amount_cents: lastOrder.paid_amount_cents,
        change_cents: lastOrder.change_cents,
        payment_method: lastOrder.payment_method,
        qr_provider: lastOrder.qr_provider,
        when: new Date(),
      });
      toast({ title: "Receipt sent to printer" });
    } catch (e) {
      const err = e as BluetoothPrintError;
      if (err?.code === "cancelled") {
        setPrinting(false);
        return;
      }
      toast({
        variant: "destructive",
        title: "Couldn't print",
        description: err?.message ?? "Please try again.",
      });
    } finally {
      setPrinting(false);
    }
  };

  // Re-print a paper receipt for an existing order (customer asked for one).
  // Uses the order's original date/time so the slip matches the original sale.
  const handleReprint = async (o: TodayOrder) => {
    if (!ensurePrinter()) return;
    setReprintId(o.id);
    try {
      await sendReceiptToPrinter({
        ticket_code: o.ticket_code,
        plate: o.plate,
        branch_id: o.branch_id,
        package_name: o.package_name,
        package_price_cents: o.package_price_cents,
        addons: o.addons ?? [],
        subtotal_cents: o.subtotal_cents,
        total_cents: o.total_cents,
        paid_amount_cents: o.paid_amount_cents,
        change_cents: o.change_cents,
        payment_method: o.payment_method,
        qr_provider: o.qr_provider ?? null,
        when: new Date(o.created_at),
      });
      toast({ title: "Receipt sent to printer" });
    } catch (e) {
      const err = e as BluetoothPrintError;
      if (err?.code === "cancelled") {
        setReprintId(null);
        return;
      }
      toast({
        variant: "destructive",
        title: "Couldn't print",
        description: err?.message ?? "Please try again.",
      });
    } finally {
      setReprintId(null);
    }
  };

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 1);
      return next;
    });
  };

  // Set an add-on's per-line quantity (e.g. 3 vouchers). Clamps to ≥ 1 — use
  // toggleAddon to remove an add-on entirely.
  const setAddonQty = (id: string, qty: number) => {
    setSelectedAddons((prev) => {
      const next = new Map(prev);
      next.set(id, Math.max(1, qty));
      return next;
    });
  };

  // ---- Auth gates ----------------------------------------------------------

  if (authLoading) {
    return (
      <div className="cuci-page-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cuci-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="cuci-page-bg">
        <main className="pt-20 pb-16">
          <div className="max-w-md mx-auto px-4">
            <AdminLogin onLogin={login} />
          </div>
        </main>
      </div>
    );
  }

  // ---- Confirmation card ---------------------------------------------------

  if (lastOrder) {
    return (
      <div className="cuci-page-bg">
        <main className="pt-12 pb-16">
          <div className="max-w-2xl mx-auto px-4">
            <div className="cuci-card p-8" data-testid="card-order-confirmation">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 rounded-full border-2 border-black bg-green-100 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-9 h-9 text-green-600" />
                </div>
                <div className="cuci-eyebrow mb-2">Ticket issued</div>
                <h2 className="text-3xl font-extrabold tracking-tight text-gray-900">
                  Order <span className="text-cuci-primary">confirmed</span>
                </h2>
                <p className="text-gray-600 mt-2 text-sm">Hand the ticket to the lane.</p>
              </div>

              <div className="mt-6 mb-6 rounded-xl border-2 border-black bg-gradient-to-br from-cuci-primary/10 to-cuci-secondary/10 p-6 text-center">
                <div
                  className="text-6xl font-extrabold tracking-wider text-cuci-primary"
                  data-testid="text-ticket-code"
                >
                  {lastOrder.ticket_code}
                </div>
                <div
                  className="mt-2 text-xl font-bold text-gray-900"
                  data-testid="text-ticket-plate"
                >
                  {lastOrder.plate}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-700">{lastOrder.package_name}</span>
                  <span className="font-semibold">
                    {formatBND(lastOrder.package_price_cents)}
                  </span>
                </div>
                {lastOrder.addons.map((a) => {
                  const q = a.quantity ?? 1;
                  return (
                    <div key={a.id} className="flex justify-between text-gray-600">
                      <span>
                        + {a.name}
                        {q > 1 && <span className="text-gray-500"> × {q}</span>}
                      </span>
                      <span>{formatBND(a.price_cents * q)}</span>
                    </div>
                  );
                })}
                <div className="border-t-2 border-dashed border-gray-300 my-3" />
                <div className="flex justify-between text-lg font-extrabold">
                  <span>Total</span>
                  <span data-testid="text-ticket-total">
                    {formatBND(lastOrder.total_cents)}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Paid via</span>
                  <span className="capitalize font-semibold">
                    {paymentDisplayLabel(lastOrder.payment_method, lastOrder.qr_provider)}
                  </span>
                </div>
                {lastOrder.paid_amount_cents != null && (
                  <>
                    <div className="flex justify-between text-gray-600">
                      <span>Paid</span>
                      <span className="font-semibold" data-testid="text-ticket-paid">
                        {formatBND(lastOrder.paid_amount_cents)}
                      </span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Change</span>
                      <span className="font-semibold" data-testid="text-ticket-change">
                        {formatBND(lastOrder.change_cents ?? 0)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={handlePrintReceipt}
                disabled={printing}
                className="cuci-cta border-2 border-black bg-white text-gray-900 w-full rounded-lg px-4 py-3 mt-6 inline-flex items-center justify-center gap-2 text-base disabled:opacity-60"
                data-testid="button-print-receipt"
              >
                {printing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Printing…
                  </>
                ) : (
                  <>
                    <Printer className="w-5 h-5" />
                    Print receipt
                  </>
                )}
              </button>

              <button
                onClick={resetForNew}
                className="cuci-cta bg-cuci-primary text-white w-full rounded-lg px-4 py-3 mt-3 inline-flex items-center justify-center gap-2 text-base"
                data-testid="button-new-order"
              >
                <Plus className="w-5 h-5" />
                New order
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---- Catalog still loading -----------------------------------------------
  // Only show the spinner when the catalog query is actually in flight.
  // If branchId is null (e.g. owner/manager in incognito with no picked
  // branch), the query is disabled and we must fall through so the
  // branch picker renders — otherwise the page is stuck forever.

  if (branchId !== null && (catalogLoading || !catalog)) {
    return (
      <div className="cuci-page-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-cuci-primary mx-auto mb-3" />
          <p className="text-gray-600">Loading catalog…</p>
        </div>
      </div>
    );
  }

  if (catalog && catalog.packages.length === 0) {
    return (
      <div className="cuci-page-bg flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-700">
              No active packages configured. Ask the owner to seed the catalog.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Main POS form -------------------------------------------------------

  return (
    <div className="cuci-page-bg">
      <main className="pt-6 pb-16">
        <div className="max-w-6xl mx-auto px-4 space-y-6">
          {/* Header — eyebrow + duotone, brutalist staff chip + CTAs. */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-2">
              <Link href="/" className="inline-block">
                <button className="flex items-center text-sm text-gray-600 hover:text-cuci-primary transition-colors font-semibold">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </button>
              </Link>
              <div className="cuci-eyebrow">Cashier · Cuci Xpress</div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900">
                Point of <span className="text-cuci-primary">Sale</span>
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {staff && (
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 bg-white border-2 border-black rounded-full px-3 py-1.5">
                  <ShieldCheck className="w-4 h-4 text-cuci-primary" />
                  <span data-testid="text-staff-name">{staff.name}</span>
                  <span className="text-gray-400">·</span>
                  <span className="capitalize" data-testid="text-staff-role">
                    {staff.role}
                  </span>
                  {branchId !== null && (
                    <>
                      <span className="text-gray-400">·</span>
                      <span data-testid="text-staff-branch">
                        {BRANCH_NAME_BY_ID[branchId] ?? `Branch ${branchId}`}
                      </span>
                    </>
                  )}
                </div>
              )}
              {/* Phase 8: shift open/close pill. Self-contained widget;
                  shows "Open shift" CTA when no drawer is open, or a
                  green "Shift open · float · Xh" pill that opens the
                  close-shift modal. Disabled until a branch is picked. */}
              <ShiftBar
                branchId={branchId}
                branchName={branchId !== null ? BRANCH_NAME_BY_ID[branchId] ?? null : null}
                enabled={isAuthenticated}
                canManage={canSwitchBranch}
              />
              {/* End-of-shift sales report. Self-contained modal that
                  reads the cashier's open shift and renders totals in the
                  same format as the paper report owner reviews — no
                  /admin access needed. */}
              <DailyReport
                branchName={branchId !== null ? BRANCH_NAME_BY_ID[branchId] ?? null : null}
                staffName={staff?.name ?? null}
                branchId={branchId}
                canManage={canSwitchBranch}
              />
              {/* Branch availability — pop-out button (open / closed /
                  maintenance / busy). Lives up here with Open shift and
                  Daily report since it's set occasionally, not per sale. */}
              {branchId !== null && (
                <BranchStatusControl branchId={branchId} />
              )}
              {/* Loyalty stamps — credit a customer's physical B$12 receipts.
                  Open to owner/manager/cashier; hidden from lane staff since
                  the backend route excludes them (they'd only hit a 403). */}
              {staff && staff.role !== "lane" && (
                <>
                  <button
                    onClick={() => setLoyaltyOpen(true)}
                    className="cuci-cta bg-white text-gray-900 px-4 py-2 rounded-full inline-flex items-center gap-2 text-sm"
                    data-testid="button-open-loyalty"
                  >
                    <Stamp className="w-4 h-4" />
                    Loyalty stamps
                  </button>
                  <Dialog open={loyaltyOpen} onOpenChange={setLoyaltyOpen}>
                    <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <Stamp className="w-5 h-5" /> Loyalty stamps
                        </DialogTitle>
                      </DialogHeader>
                      <LoyaltyStampTab />
                    </DialogContent>
                  </Dialog>
                </>
              )}
              <button
                onClick={logout}
                className="cuci-cta bg-white text-gray-900 px-4 py-2 rounded-full inline-flex items-center gap-2 text-sm"
                data-testid="button-staff-logout"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>

          {!canSwitchBranch && branchId === null && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="p-4 text-amber-900 text-sm">
                Your staff account isn't tied to a branch yet. Ask the owner
                to set your branch before taking orders.
              </CardContent>
            </Card>
          )}

          {canSwitchBranch && branchId === null && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="p-4 text-amber-900 text-sm">
                Pick a branch below to start taking orders. Your choice is
                remembered on this device.
              </CardContent>
            </Card>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* --- Left: Order builder ----------------------------------- */}
            <div className="lg:col-span-2 space-y-4">
              {/* Branch — switcher for owner/manager only. Cashiers/lanes are
                  locked to their assigned branch (staff.branchId), so the
                  card is hidden for them entirely — no branch to pick. */}
              {canSwitchBranch && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Branch
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select
                      value={branchId !== null ? String(branchId) : ""}
                      onValueChange={(v) => handlePickBranch(Number(v))}
                    >
                      <SelectTrigger data-testid="select-branch">
                        <SelectValue placeholder="Select a branch…" />
                      </SelectTrigger>
                      <SelectContent>
                        {BRANCHES.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              {/* Lane control — moved to the top of the builder so lane staff
                  see the wash + queue first, before starting a new order.
                  Shows queued + washing cars for this branch with buttons to
                  advance them through the wash lifecycle. Reads from the same
                  /api/pos/orders/today query and filters client-side. */}
              <LaneControl
                orders={(todayData?.orders ?? []).filter(
                  (o) => o.status === "queued" || o.status === "washing",
                )}
                branchId={branchId}
                onChanged={() => {
                  queryClient.invalidateQueries({
                    queryKey: ["/api/pos/orders/today", branchId],
                  });
                  queryClient.invalidateQueries({
                    queryKey: ["/api/queue/snapshot"],
                  });
                }}
              />

              {/* Plate + customer — Step 1: identify the customer. The Scan
                  QR shortcut lives here as the alternate to typing the plate;
                  both resolve who the customer is (walk-in / subscriber /
                  paid online) before a package is picked. */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <StepNo n={1} />
                    <CardTitle className="text-base">License Plate</CardTitle>
                    <button
                      onClick={() => setScanOpen(true)}
                      className="ml-auto cuci-cta bg-cuci-primary text-white px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 text-xs"
                      data-testid="button-pos-scan-qr"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Scan QR
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Type the plate to identify the customer — walk-in,
                    subscriber, or paid online — or scan their QR.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Input
                      ref={plateInputRef}
                      value={plate}
                      onChange={(e) => {
                        setPlate(e.target.value.toUpperCase());
                        // Editing the plate clears any prior match AND its
                        // prefilled customer so the order won't accidentally
                        // tag the wrong vehicle or person.
                        if (matchedVehicleId !== null) clearMatchedVehicle();
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => {
                        // Delay so a click on a suggestion still registers.
                        setTimeout(() => setShowSuggestions(false), 150);
                      }}
                      placeholder="BB1234"
                      autoCapitalize="characters"
                      autoComplete="off"
                      data-testid="input-plate"
                    />
                    {showSuggestions && vehicleSuggestions.length > 0 && (
                      <div
                        className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-72 overflow-y-auto"
                        data-testid="list-vehicle-suggestions"
                      >
                        {vehicleSuggestions.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickVehicle(v)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            data-testid={`suggestion-vehicle-${v.id}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold tracking-wide">
                                {v.license_plate}
                              </span>
                              {v.last_seen_at && (
                                <span className="text-xs text-gray-500 inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatRelative(v.last_seen_at)}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 mt-0.5">
                              {[v.brand, v.model, v.color].filter(Boolean).join(" · ") || "No details on file"}
                              {v.customer && (
                                <span className="ml-2 text-cuci-primary">
                                  · {v.customer.name}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {matchedVehicleId !== null && vehicleHistory && (
                    <div
                      className="rounded-md border border-cuci-primary/30 bg-cuci-primary/5 px-3 py-2"
                      data-testid="card-matched-vehicle"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm">
                          <div className="font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                            <span>
                              {[vehicleHistory.vehicle.brand, vehicleHistory.vehicle.model]
                                .filter(Boolean)
                                .join(" ") || "Vehicle on file"}
                              {vehicleHistory.vehicle.color && (
                                <span className="text-gray-600 font-normal">
                                  {" · "}{vehicleHistory.vehicle.color}
                                </span>
                              )}
                            </span>
                            {!editingVehicle && (
                              <button
                                type="button"
                                onClick={startEditVehicle}
                                className="inline-flex items-center gap-1 text-xs font-medium text-cuci-primary hover:underline"
                                data-testid="button-edit-vehicle"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                            )}
                            {vehicleHistory.vehicle.vip_tier && (
                              <span
                                className={
                                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
                                  (vehicleHistory.vehicle.vip_tier === "gold"
                                    ? "bg-amber-100 border-amber-400 text-amber-800"
                                    : vehicleHistory.vehicle.vip_tier === "silver"
                                    ? "bg-slate-100 border-slate-400 text-slate-700"
                                    : "bg-orange-100 border-orange-400 text-orange-800")
                                }
                                data-testid={`badge-vip-${vehicleHistory.vehicle.vip_tier}`}
                                title={
                                  vehicleHistory.vehicle.vip_rank
                                    ? `Rank #${vehicleHistory.vehicle.vip_rank} customer`
                                    : undefined
                                }
                              >
                                ★ {vehicleHistory.vehicle.vip_tier} VIP
                                {vehicleHistory.vehicle.vip_rank && (
                                  <span className="font-semibold opacity-70">
                                    {" "}#{vehicleHistory.vehicle.vip_rank}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                          {editingVehicle && (
                            <div
                              className="mt-2 flex flex-wrap items-end gap-2"
                              data-testid="form-edit-vehicle"
                            >
                              <div className="flex flex-col gap-0.5">
                                <Label className="text-[11px] text-gray-600">Brand</Label>
                                <Input
                                  value={editBrand}
                                  onChange={(e) => setEditBrand(e.target.value)}
                                  placeholder="e.g. Toyota"
                                  className="h-8 w-32 text-sm"
                                  data-testid="input-edit-brand"
                                />
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <Label className="text-[11px] text-gray-600">Model</Label>
                                <Input
                                  value={editModel}
                                  onChange={(e) => setEditModel(e.target.value)}
                                  placeholder="e.g. Vios"
                                  className="h-8 w-32 text-sm"
                                  data-testid="input-edit-model"
                                />
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                className="h-8"
                                disabled={editVehicle.isPending}
                                onClick={() =>
                                  matchedVehicleId !== null &&
                                  editVehicle.mutate({
                                    id: matchedVehicleId,
                                    brand: editBrand,
                                    model: editModel,
                                  })
                                }
                                data-testid="button-save-vehicle"
                              >
                                {editVehicle.isPending ? "Saving…" : "Save"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8"
                                disabled={editVehicle.isPending}
                                onClick={() => setEditingVehicle(false)}
                                data-testid="button-cancel-edit-vehicle"
                              >
                                Cancel
                              </Button>
                            </div>
                          )}
                          {/* Customer name + phone — the cashier can greet
                              the customer by name and has a number to call. */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <span className="inline-flex items-center gap-1 font-medium text-gray-900">
                              <User className="w-3.5 h-3.5 text-gray-500" />
                              {vehicleHistory.customer?.name?.trim() || "Walk-in (no customer on file)"}
                            </span>
                            {vehicleHistory.customer?.phone?.trim() && (
                              <a
                                href={`tel:${vehicleHistory.customer.phone.trim()}`}
                                className="inline-flex items-center gap-1 text-cuci-primary hover:underline"
                                data-testid="link-customer-phone"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                {vehicleHistory.customer.phone.trim()}
                              </a>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                              <History className="w-3 h-3" />
                              {vehicleHistory.total_visits} prior visit{vehicleHistory.total_visits === 1 ? "" : "s"}
                            </span>
                            {vehicleHistory.total_visits > 0 && (
                              <span className="font-medium text-gray-700">
                                Spent {formatBND(vehicleHistory.total_spent_cents)}
                              </span>
                            )}
                            {vehicleHistory.favourite_branch_id && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                Usual: {BRANCH_NAME_BY_ID[vehicleHistory.favourite_branch_id] ??
                                  `Branch ${vehicleHistory.favourite_branch_id}`}
                              </span>
                            )}
                          </div>
                          {vehicleHistory.recent_orders[0] && (
                            <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last visit:{" "}
                                {new Date(vehicleHistory.recent_orders[0].created_at).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                  timeZone: "Asia/Brunei",
                                })}
                                {" "}({formatRelative(vehicleHistory.recent_orders[0].created_at)})
                              </span>
                              <span>
                                · {vehicleHistory.recent_orders[0].package_name}
                                {" · "}
                                {formatBND(vehicleHistory.recent_orders[0].total_cents)}
                                {" · "}
                                {BRANCH_NAME_BY_ID[vehicleHistory.recent_orders[0].branch_id] ??
                                  `Branch ${vehicleHistory.recent_orders[0].branch_id}`}
                              </span>
                            </div>
                          )}
                          {activeMembership && (
                            <div
                              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-800"
                              data-testid="badge-active-membership"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              {activeMembership.kind === "unlimited" ? (
                                <>
                                  Unlimited
                                  {activeMembership.expires_at && (
                                    <span className="text-emerald-700/80">
                                      {" "}· until{" "}
                                      {new Date(activeMembership.expires_at).toLocaleDateString("en-GB", {
                                        day: "numeric",
                                        month: "short",
                                        timeZone: "Asia/Brunei",
                                      })}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  Wash pack: {activeMembership.remaining_washes}/{activeMembership.total_washes} left
                                </>
                              )}
                              {activeMembership.vehicle_id !== null && (
                                <span className="text-emerald-700/70 font-normal">
                                  · this car
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={clearMatchedVehicle}
                          className="text-gray-400 hover:text-gray-700 shrink-0"
                          aria-label="Clear matched vehicle"
                          data-testid="button-clear-matched-vehicle"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* First-time plate — no car on file yet. The cashier must
                      record the brand + model so the new cars row carries
                      those details forward to the customer when they later
                      claim the plate. We don't ask for the customer's name or
                      phone here — at the drive-thru we don't know them. */}
                  {isFirstTimerPlate && (
                    <div className="space-y-2 pt-1 border-t border-gray-100">
                      <div className="flex items-center gap-1.5">
                        <Car className="w-3.5 h-3.5 text-gray-500" />
                        <Label className="text-xs text-gray-600">
                          New car details{" "}
                          <span className="text-red-500">(required)</span>
                        </Label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={newCarBrand}
                          onChange={(e) => setNewCarBrand(e.target.value)}
                          placeholder="Brand (e.g. Toyota)"
                          aria-label="Car brand"
                          data-testid="input-new-car-brand"
                        />
                        <Input
                          value={newCarModel}
                          onChange={(e) => setNewCarModel(e.target.value)}
                          placeholder="Model (e.g. Hilux)"
                          aria-label="Car model"
                          data-testid="input-new-car-model"
                        />
                      </div>
                      {!newCarDetailsComplete && (
                        <p className="text-xs text-gray-400">
                          First-time plate — enter the car's brand and model to
                          continue.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Counter-sold Unlimited pass — sell or renew a one-month
                      pass paid at the till. Shown once a plate is entered
                      (matched car or first-timer with details filled). */}
                  {plate.trim().length > 0 &&
                    (!isFirstTimerPlate || newCarDetailsComplete) && (
                    <div className="pt-1 border-t border-gray-100">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                        onClick={() => {
                          // Prefill from the customer on file so the cashier
                          // sees who the pass will go to (still editable).
                          setSellName(vehicleHistory?.customer?.name ?? "");
                          setSellPhone(vehicleHistory?.customer?.phone ?? "");
                          setSellExistingName(null);
                          setSellPassOpen(true);
                        }}
                        data-testid="button-sell-unlimited-pass"
                      >
                        <ShieldCheck className="w-4 h-4 mr-1.5" />
                        {unlimitedOnCar
                          ? "Renew Unlimited Pass · +1 month · B$39"
                          : "Sell Unlimited Pass · 1 month · B$39"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sell / renew Unlimited pass dialog */}
              <Dialog open={sellPassOpen} onOpenChange={setSellPassOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>
                      {unlimitedOnCar ? "Renew Unlimited Pass" : "Sell Unlimited Pass"}
                    </DialogTitle>
                    <DialogDescription>
                      {unlimitedOnCar
                        ? `Extends ${plate.trim().toUpperCase()}'s pass by 1 month for ${formatBND(UNLIMITED_PASS_CENTS)}.`
                        : `1 month of unlimited washes for ${plate.trim().toUpperCase()} — ${formatBND(UNLIMITED_PASS_CENTS)}, paid at the counter.`}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2">
                      {!sellNeedsContact && (
                        <p className="text-xs text-gray-600">
                          Customer on file — details prefilled below.
                        </p>
                      )}
                        <div>
                          <Label htmlFor="sell-name">Customer name</Label>
                          <Input
                            id="sell-name"
                            value={sellName}
                            onChange={(e) => setSellName(e.target.value)}
                            placeholder="e.g. Hjh Aminah"
                            data-testid="input-sell-name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="sell-phone">Phone number</Label>
                          <Input
                            id="sell-phone"
                            type="tel"
                            value={sellPhone}
                            onChange={(e) => {
                              setSellPhone(e.target.value);
                              setSellExistingName(null);
                            }}
                            placeholder="e.g. 8123456"
                            data-testid="input-sell-phone"
                          />
                          {sellExistingName && (
                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                              This number belongs to{" "}
                              <span className="font-semibold">{sellExistingName}</span>.
                              Check the number — if it's right, press{" "}
                              {unlimitedOnCar ? "Renew" : "Sell"} again to
                              attach the pass to their account.
                            </p>
                          )}
                          <p className="text-[11px] text-gray-500 mt-1">
                            The customer uses this number to link the pass to
                            their account when they register on the website.
                          </p>
                        </div>
                      </div>
                    <div>
                      <Label>Payment</Label>
                      <Select value={sellPayKey} onValueChange={setSellPayKey}>
                        <SelectTrigger data-testid="select-sell-payment">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_OPTIONS.filter(
                            (o) => o.method !== "subscription" && o.method !== "voucher",
                          ).map((o) => (
                            <SelectItem key={o.key} value={o.key}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {sellPayOption.method === "cash" && (
                      <div>
                        <Label htmlFor="sell-cash">Cash received (required)</Label>
                        <Input
                          id="sell-cash"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.05"
                          value={sellCash}
                          onChange={(e) => setSellCash(e.target.value)}
                          placeholder="39.00"
                          data-testid="input-sell-cash"
                        />
                        {sellCashCents != null && sellCashCents >= UNLIMITED_PASS_CENTS && (
                          <p className="text-xs text-gray-600 mt-1">
                            Change: {formatBND(sellCashCents - UNLIMITED_PASS_CENTS)}
                          </p>
                        )}
                      </div>
                    )}
                    {sellPayOption.method === "bank_transfer" && (
                      <div>
                        <Label htmlFor="sell-ref">Reference (required)</Label>
                        <Input
                          id="sell-ref"
                          value={sellRef}
                          onChange={(e) => setSellRef(e.target.value)}
                          placeholder="Transaction reference"
                          data-testid="input-sell-ref"
                        />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setSellPassOpen(false)}
                      disabled={sellPass.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => sellPass.mutate()}
                      disabled={!canSellPass || sellPass.isPending}
                      data-testid="button-confirm-sell-pass"
                    >
                      {sellPass.isPending && (
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      )}
                      {unlimitedOnCar
                        ? `Renew — ${formatBND(UNLIMITED_PASS_CENTS)}`
                        : `Sell — ${formatBND(UNLIMITED_PASS_CENTS)}`}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Package picker — Step 2 */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StepNo n={2} />
                    <CardTitle className="text-base">Package</CardTitle>
                    {activePackage?.description && (
                      <p className="text-sm text-gray-500">
                        {activePackage.description}
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(() => {
                    const pkgs = catalog?.packages ?? [];
                    const cats = [...(catalog?.categories ?? [])].sort(
                      (a, b) => a.sort_order - b.sort_order,
                    );
                    // Build category groups in order, then an "Other" bucket
                    // for packages with no (or an unknown) category. When no
                    // categories exist at all, fall back to one flat group.
                    const groups: Array<{ id: string; name: string | null; items: CatalogPackage[] }> = [];
                    for (const c of cats) {
                      const items = pkgs.filter((p) => p.category_id === c.id);
                      if (items.length > 0) groups.push({ id: c.id, name: c.name, items });
                    }
                    const known = new Set(cats.map((c) => c.id));
                    const uncategorised = pkgs.filter(
                      (p) => !p.category_id || !known.has(p.category_id),
                    );
                    if (uncategorised.length > 0) {
                      groups.push({
                        id: "__uncat",
                        name: groups.length > 0 ? "Other" : null,
                        items: uncategorised,
                      });
                    }
                    return groups.map((g) => (
                      <div key={g.id} className="space-y-2">
                        {g.name && (
                          <p
                            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                            data-testid={`label-category-${g.id}`}
                          >
                            {g.name}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {g.items.map((p) => (
                            <Button
                              key={p.id}
                              type="button"
                              variant={p.id === packageId ? "default" : "outline"}
                              onClick={() => setPackageId(p.id)}
                              data-testid={`button-package-${p.id}`}
                            >
                              {p.name}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </CardContent>
              </Card>

              {/* Addons */}
              {catalog && catalog.addons.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <StepNo n={3} />
                      <CardTitle className="text-base">Add-ons</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const addons = catalog?.addons ?? [];
                      const cats = [...(catalog?.categories ?? [])].sort(
                        (a, b) => a.sort_order - b.sort_order,
                      );
                      // Same grouping rule as the package picker: ordered
                      // category groups, then an "Other" bucket for add-ons
                      // with no (or an unknown) category.
                      const groups: Array<{ id: string; name: string | null; items: CatalogAddon[] }> = [];
                      for (const c of cats) {
                        const items = addons.filter((a) => a.category_id === c.id);
                        if (items.length > 0) groups.push({ id: c.id, name: c.name, items });
                      }
                      const known = new Set(cats.map((c) => c.id));
                      const uncategorised = addons.filter(
                        (a) => !a.category_id || !known.has(a.category_id),
                      );
                      if (uncategorised.length > 0) {
                        groups.push({
                          id: "__uncat",
                          name: groups.length > 0 ? "Other" : null,
                          items: uncategorised,
                        });
                      }
                      return groups.map((g) => (
                        <div key={g.id} className="space-y-2">
                          {g.name && (
                            <p
                              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
                              data-testid={`label-addon-category-${g.id}`}
                            >
                              {g.name}
                            </p>
                          )}
                          <div className="grid sm:grid-cols-2 gap-2">
                            {g.items.map((a) => {
                              const qty = selectedAddons.get(a.id);
                              const isSelected = qty !== undefined;
                              return (
                                <div
                                  key={a.id}
                                  className={`flex items-center justify-between rounded-md border p-3 transition-all
                                    ${isSelected
                                      ? "border-cuci-primary bg-cuci-primary/10 ring-2 ring-cuci-primary"
                                      : "border-gray-200 hover:border-gray-300"}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleAddon(a.id)}
                                    data-testid={`button-addon-${a.id}`}
                                    className="flex flex-1 items-center justify-between gap-2 text-left"
                                  >
                                    <span className="font-medium">{a.name}</span>
                                    <span className="text-sm text-gray-700">
                                      +{formatBND(a.price_cents)}
                                    </span>
                                  </button>
                                  {isSelected && paymentMethod !== "subscription" && (
                                    <div className="ml-3 flex items-center gap-1">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setAddonQty(a.id, (qty ?? 1) - 1)}
                                        disabled={(qty ?? 1) <= 1}
                                        data-testid={`button-addon-qty-dec-${a.id}`}
                                      >
                                        −
                                      </Button>
                                      <span
                                        className="w-6 text-center text-sm font-semibold"
                                        data-testid={`text-addon-qty-${a.id}`}
                                      >
                                        {qty}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => setAddonQty(a.id, (qty ?? 1) + 1)}
                                        data-testid={`button-addon-qty-inc-${a.id}`}
                                      >
                                        +
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ));
                    })()}
                  </CardContent>
                </Card>
              )}

              {/* Payment + notes — last step. Numbered 4 when the Add-ons
                  card is shown, else 3 (Add-ons is hidden for branches with
                  no add-ons), so the cashier never sees a skipped step. */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <StepNo n={catalog && catalog.addons.length > 0 ? 4 : 3} />
                    <CardTitle className="text-base">Payment</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="payment-method">Method</Label>
                    <Select
                      value={paymentKey}
                      onValueChange={(v) => setPaymentKey(v)}
                    >
                      <SelectTrigger id="payment-method" data-testid="select-payment-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentOptions.map((opt) => (
                          <SelectItem key={opt.key} value={opt.key}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {paymentMethod === "cash" && (
                    <div>
                      <Label htmlFor="cash-received">
                        Cash received{" "}
                        <span className="text-red-500 text-xs">(required)</span>
                      </Label>
                      <Input
                        id="cash-received"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder={`e.g. ${(total / 100).toFixed(2)}`}
                        data-testid="input-cash-received"
                      />
                      {cashReceivedCents != null && (
                        <div className="mt-1 flex justify-between text-sm">
                          <span className="text-gray-600">
                            {cashReceivedCents < total ? "Short by" : "Change"}
                          </span>
                          <span
                            className={
                              cashReceivedCents < total
                                ? "font-semibold text-red-600"
                                : "font-semibold text-gray-900"
                            }
                            data-testid="text-cash-change"
                          >
                            {cashReceivedCents < total
                              ? formatBND(total - cashReceivedCents)
                              : formatBND(changeCents)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Reference is only meaningful for non-cash payments
                      (card/QR txn id, transfer ref). Cash has no transaction
                      id, so hide it to avoid a redundant empty field. */}
                  {paymentMethod !== "cash" && (
                    <div>
                      <Label htmlFor="payment-ref">
                        Reference{" "}
                        {paymentMethod === "bank_transfer" ? (
                          <span className="text-red-500 text-xs">(required)</span>
                        ) : (
                          <span className="text-gray-400 text-xs">(optional)</span>
                        )}
                      </Label>
                      <Input
                        id="payment-ref"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        placeholder="Last 4 digits / txn id"
                        data-testid="input-payment-ref"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="item-notes">
                      Visit note{" "}
                      <span className="text-gray-400 text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="item-notes"
                      value={itemNotes}
                      onChange={(e) => setItemNotes(e.target.value)}
                      placeholder="e.g. extra dirty, scratch on door"
                      data-testid="input-item-notes"
                    />
                  </div>
                  {/* POS Control Room: discount + promo. Optional, so they
                      sit below the required fields + visit note. Hidden on a
                      subscription redemption (the pack covers the wash). */}
                  {paymentMethod !== "subscription" && (
                    <>
                      <div>
                        <Label htmlFor="discount-select">
                          Discount{" "}
                          <span className="text-gray-400 text-xs">(optional)</span>
                        </Label>
                        <Select value={discountId} onValueChange={setDiscountId}>
                          <SelectTrigger id="discount-select" data-testid="select-discount">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No discount</SelectItem>
                            {(discountsData?.rows ?? []).map((d) => {
                              const locked =
                                !!d.only_package_id && d.only_package_id !== packageId;
                              return (
                                <SelectItem key={d.id} value={d.id} disabled={locked}>
                                  {d.name} (
                                  {d.kind === "percent"
                                    ? `${d.value}%`
                                    : formatBND(d.value)}
                                  ){locked ? " — wrong package" : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="promo-code">
                          Promo code{" "}
                          <span className="text-gray-400 text-xs">(optional)</span>
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="promo-code"
                            value={promoInput}
                            onChange={(e) => {
                              setPromoInput(e.target.value.toUpperCase());
                              setPromoError(null);
                            }}
                            placeholder="e.g. CUCI10"
                            data-testid="input-promo-code"
                            disabled={appliedPromo !== null}
                          />
                          {appliedPromo ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setAppliedPromo(null);
                                setPromoInput("");
                                setPromoError(null);
                              }}
                              data-testid="button-remove-promo"
                            >
                              Remove
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => validatePromo(promoInput)}
                              disabled={promoChecking || promoInput.trim() === ""}
                              data-testid="button-apply-promo"
                            >
                              {promoChecking ? "Checking…" : "Apply"}
                            </Button>
                          )}
                        </div>
                        {promoError && (
                          <p
                            className="mt-1 text-xs text-red-600"
                            data-testid="text-promo-error"
                          >
                            {promoError}
                          </p>
                        )}
                        {appliedPromo && (
                          <p
                            className="mt-1 text-xs text-emerald-700"
                            data-testid="text-promo-applied"
                          >
                            {appliedPromo.code} applied.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* --- Right: Summary + Today's orders --------------------- */}
            <div className="space-y-4">
              <Card className="lg:sticky lg:top-4">
                <CardHeader>
                  <CardTitle className="text-base">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        {activePackage?.name ?? "—"}
                      </span>
                      <span>
                        {packagePrice !== null
                          ? formatBND(packagePrice)
                          : "—"}
                      </span>
                    </div>
                    {Array.from(selectedAddons).map(([id, rawQty]) => {
                      const a = catalog?.addons.find((x) => x.id === id);
                      if (!a) return null;
                      const qty = paymentMethod === "subscription" ? 1 : rawQty;
                      return (
                        <div key={id} className="flex justify-between text-gray-600">
                          <span>
                            + {a.name}
                            {qty > 1 && <span className="text-gray-500"> × {qty}</span>}
                          </span>
                          <span>{formatBND(a.price_cents * qty)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {useMembership && (
                    <div
                      className="flex justify-between text-sm text-emerald-700 font-medium"
                      data-testid="row-summary-membership-discount"
                    >
                      <span>
                        {activeMembership?.kind === "unlimited"
                          ? "Unlimited pass"
                          : "Wash pack redemption"}
                      </span>
                      <span>−{formatBND(discount)}</span>
                    </div>
                  )}
                  {!useMembership && manualDiscountCents > 0 && (
                    <div
                      className="flex justify-between text-sm text-emerald-700 font-medium"
                      data-testid="row-summary-discount"
                    >
                      <span>{selectedDiscount?.name ?? "Discount"}</span>
                      <span>−{formatBND(manualDiscountCents)}</span>
                    </div>
                  )}
                  {!useMembership && promoDiscountCents > 0 && (
                    <div
                      className="flex justify-between text-sm text-emerald-700 font-medium"
                      data-testid="row-summary-promo"
                    >
                      <span>Promo {appliedPromo?.code}</span>
                      <span>−{formatBND(promoDiscountCents)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span data-testid="text-summary-total">
                      {formatBND(total)}
                    </span>
                  </div>
                  {paymentMethod === "subscription" && !activeMembership && (
                    <p
                      className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
                      data-testid="hint-no-membership"
                    >
                      No active wash pack found for this customer.
                      Pick a different payment method or sell a pack first.
                    </p>
                  )}
                  {activeMembership?.kind === "unlimited" && (
                    <div className="space-y-1">
                      <Button
                        type="button"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                        size="lg"
                        disabled={
                          plate.trim().length === 0 ||
                          branchId === null ||
                          createOrder.isPending
                        }
                        onClick={() => createOrder.mutate({ unlimited: true })}
                        data-testid="button-unlimited-wash"
                      >
                        {createOrder.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Submitting…
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4 mr-2" />
                            Free Unlimited wash · B$0
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-gray-500 text-center">
                        Covers the wash instantly. Use the form below only to
                        add paid extras.
                      </p>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!canSubmit || createOrder.isPending}
                    onClick={() => createOrder.mutate()}
                    data-testid="button-submit-order"
                  >
                    {createOrder.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Submitting…
                      </>
                    ) : (
                      <>
                        <ReceiptText className="w-4 h-4 mr-2" />
                        Submit Order
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

            </div>

            {/* --- Today's orders — full width below the builder -------- */}
            <div className="space-y-4 lg:col-span-3">
              {/* Today's orders */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                    <span>Today</span>
                    <span
                      className="inline-flex items-center rounded-full border-2 border-black bg-emerald-50 px-3 py-1 text-sm font-extrabold text-emerald-700"
                      data-testid="text-today-total-sales"
                    >
                      Total Sales: {formatBND(todaySummary.salesCents)}
                    </span>
                  </CardTitle>
                </CardHeader>
                {(todaySummary.methods.length > 0 ||
                  todaySummary.refundCount > 0) && (
                  <CardContent className="pt-0">
                    {todaySummary.methods.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {todaySummary.methods.map((m) => {
                          const active = methodFilter === m.label;
                          return (
                            <button
                              key={m.label}
                              type="button"
                              onClick={() =>
                                setMethodFilter(active ? null : m.label)
                              }
                              aria-pressed={active}
                              title={
                                active
                                  ? "Click to show all transactions"
                                  : `Show only ${m.label} transactions`
                              }
                              className={`flex items-center justify-between rounded-md border-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${
                                active
                                  ? "border-black bg-emerald-100 ring-2 ring-emerald-500"
                                  : "border-black bg-gray-50 hover:bg-gray-100"
                              }`}
                              data-testid={`tile-payment-${m.label}`}
                            >
                              <span className="min-w-0 truncate font-medium text-gray-700">
                                {m.label}
                                <span className="ml-1 text-xs text-gray-400">
                                  ×{m.count}
                                </span>
                              </span>
                              <span className="ml-2 shrink-0 font-extrabold">
                                {formatBND(m.cents)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {todaySummary.refundCount > 0 && (
                      <p
                        className="mt-2 text-xs font-medium text-red-600"
                        data-testid="text-today-refunds"
                      >
                        Refunds: {todaySummary.refundCount} (−
                        {formatBND(todaySummary.refundCents)})
                      </p>
                    )}
                  </CardContent>
                )}
                {methodFilter && (
                  <CardContent className="pt-0 pb-2">
                    <div className="flex items-center justify-between gap-2 rounded-md bg-emerald-50 border-2 border-emerald-500 px-3 py-1.5 text-sm">
                      <span className="font-medium text-emerald-800 truncate">
                        Showing {methodFilter} only ·{" "}
                        {visibleTodayOrders.length}{" "}
                        {visibleTodayOrders.length === 1
                          ? "transaction"
                          : "transactions"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 shrink-0"
                        onClick={() => setMethodFilter(null)}
                        data-testid="button-clear-payment-filter"
                      >
                        Clear filter
                      </Button>
                    </div>
                  </CardContent>
                )}
                <CardContent className="max-h-96 overflow-y-auto">
                  {!todayData || visibleTodayOrders.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      {methodFilter
                        ? `No ${methodFilter} transactions today.`
                        : "No orders yet today."}
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {visibleTodayOrders.map((o) => {
                        const isRefunded = o.status === "refunded";
                        return (
                          <div
                            key={o.id}
                            className={`flex items-center justify-between text-sm border rounded-md p-2 gap-2 ${
                              isRefunded ? "opacity-70" : ""
                            }`}
                            data-testid={`row-today-${o.id}`}
                          >
                            <div className="flex flex-col min-w-0">
                              <span
                                className={`font-mono font-semibold ${
                                  isRefunded ? "line-through text-gray-500" : ""
                                }`}
                              >
                                {o.ticket_code}
                              </span>
                              <span className="text-gray-500 text-xs truncate">
                                {o.plate} · {formatTime(o.created_at)} ·{" "}
                                {paymentDisplayLabel(o.payment_method, o.qr_provider ?? null)}
                              </span>
                              {isRefunded && o.refund_reason && (
                                <span className="text-xs text-red-600 italic truncate">
                                  {o.refund_reason}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span
                                className={`font-medium ${
                                  isRefunded ? "text-red-600" : ""
                                }`}
                              >
                                {isRefunded ? "−" : ""}
                                {formatBND(o.total_cents)}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-gray-600 hover:text-cuci-primary hover:bg-gray-100"
                                  disabled={reprintId === o.id}
                                  onClick={() => handleReprint(o)}
                                  data-testid={`button-print-${o.id}`}
                                >
                                  <Printer className="w-3 h-3 mr-1" />
                                  {reprintId === o.id ? "Printing…" : "Print"}
                                </Button>
                                {isRefunded ? (
                                  <Badge
                                    variant="destructive"
                                    className="text-xs"
                                    data-testid={`badge-refunded-${o.id}`}
                                  >
                                    Refunded
                                  </Badge>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                    disabled={refundOrder.isPending}
                                    onClick={() => promptRefund(o)}
                                    data-testid={`button-refund-${o.id}`}
                                  >
                                    Refund
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Phase 12c-ui: prepaid scan-in modal. Closing the dialog
          unmounts ScanInTab, which stops the camera in its cleanup
          effect — no zombie video stream. */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-cuci-primary" />
              Scan-In · Prepaid or Free-wash QR
            </DialogTitle>
          </DialogHeader>
          {/* Pass the active POS branch so free-wash vouchers get
              rerouted to this lane on scan instead of staying tied
              to whichever branch the customer chose at redemption. */}
          <ScanInTab
            branchId={branchId}
            branchName={branchId !== null ? BRANCH_NAME_BY_ID[branchId] ?? null : null}
            onScanned={() => {
              // Close the camera dialog and refresh both the cashier's
              // lane/queue (today's orders) and the public queue widget
              // so the just-scanned car shows up right away.
              setScanOpen(false);
              queryClient.invalidateQueries({
                queryKey: ["/api/pos/orders/today", branchId],
              });
              queryClient.invalidateQueries({
                queryKey: ["/api/queue/snapshot"],
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Phase 7 refund confirmation — styled, branded modal that replaces
          the browser's native confirm()/prompt(). It is modal (no
          outside-click or Escape dismiss), so a cashier can only close it
          via Cancel or Refund. The optional reason is captured inline. */}
      <AlertDialog
        open={refundTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRefundTarget(null);
        }}
      >
        <AlertDialogContent
          className="border-2 border-black rounded-2xl"
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-red-600" />
              Refund this order?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-1">
                {refundTarget && (
                  <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Ticket</span>
                      <span className="font-semibold text-gray-900">
                        {refundTarget.ticket_code}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Plate</span>
                      <span className="font-semibold text-gray-900">
                        {refundTarget.plate}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Amount</span>
                      <span className="font-bold text-red-600">
                        −{formatBND(refundTarget.total_cents)}
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-sm text-gray-600">
                  This cannot be undone. The order will show as a negative
                  entry in today's sales.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason" className="text-sm">
              Reason <span className="text-gray-400">(optional)</span>
            </Label>
            <Textarea
              id="refund-reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. customer changed their mind, double charge…"
              rows={2}
              className="resize-none"
              data-testid="input-refund-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-refund-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRefund}
              disabled={refundOrder.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="button-refund-confirm"
            >
              {refundOrder.isPending ? "Refunding…" : "Refund"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// BranchStatusControl — cashier-controlled branch availability.
//
// Lets the on-site cashier flag their branch as Open / Closed /
// Under maintenance / Busy (extra-long wait) and add a short reason
// note shown to customers on the live queue. Reads the current state
// from the public snapshot, writes via PATCH /api/pos/branch/status,
// then invalidates the snapshot so the public widget updates within
// one tick. The server locks lane/cashier to their own branch.
// ============================================================
const BRANCH_STATUS_OPTIONS: Array<{
  value: "open" | "closed" | "maintenance" | "busy";
  label: string;
  hint: string;
}> = [
  { value: "open", label: "Open", hint: "Taking cars as normal." },
  { value: "busy", label: "Busy / extra-long wait", hint: "Open, but warn customers of a long wait." },
  { value: "maintenance", label: "Under maintenance", hint: "Closed for maintenance — not taking cars." },
  { value: "closed", label: "Closed", hint: "Closed — not taking cars." },
];

// Small numbered step badge used to guide the cashier through the lean
// order flow: 1 License Plate → 2 Package → 3 Add-ons → 4 Payment.
function StepNo({ n }: { n: number }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cuci-primary text-white text-xs font-bold"
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

function BranchStatusControl({ branchId }: { branchId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: snapshot } = useQuery<{
    branches: Array<{ id: number; status?: string | null; status_note?: string | null }>;
  }>({
    queryKey: ["/api/queue/snapshot"],
  });

  const current = (snapshot?.branches ?? []).find((b) => b.id === branchId);
  const currentStatus = (current?.status ?? "open") as
    | "open" | "closed" | "maintenance" | "busy";
  const currentNote = current?.status_note ?? "";

  const [status, setStatus] = useState<"open" | "closed" | "maintenance" | "busy">(currentStatus);
  const [note, setNote] = useState<string>(currentNote);
  const [touched, setTouched] = useState(false);

  // Re-sync local edits to the server value until the cashier starts editing.
  useEffect(() => {
    if (!touched) {
      setStatus(currentStatus);
      setNote(currentNote);
    }
  }, [currentStatus, currentNote, touched]);

  const save = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", "/api/pos/branch/status", {
        status,
        note: note.trim() || null,
        branch_id: branchId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue/snapshot"] });
      setTouched(false);
      toast({ title: "Branch status updated" });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't update status",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const dirty = status !== currentStatus || note.trim() !== currentNote.trim();
  const selected = BRANCH_STATUS_OPTIONS.find((o) => o.value === status);
  const accentFor = (s: typeof status) =>
    s === "open" ? "bg-green-600"
    : s === "busy" ? "bg-amber-500"
    : s === "maintenance" ? "bg-blue-600"
    : "bg-gray-500";
  const currentLabel =
    BRANCH_STATUS_OPTIONS.find((o) => o.value === currentStatus)?.label ?? "Open";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="cuci-cta bg-white text-gray-900 px-4 py-2 rounded-full inline-flex items-center gap-2 text-sm"
        data-testid="button-branch-availability"
      >
        <Activity className="w-4 h-4" />
        Branch
        <Badge className={`${accentFor(currentStatus)} text-white`}>
          {currentLabel}
        </Badge>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          // Drop unsaved edits when the cashier dismisses the dialog so the
          // form re-syncs to the live server value next time it opens.
          if (!o) setTouched(false);
        }}
      >
        <DialogContent
          className="cuci-card border-2 border-black sm:max-w-md"
          data-testid="card-branch-status"
        >
          <DialogHeader>
            <div className="cuci-eyebrow">Live status</div>
            <DialogTitle className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-cuci-primary" />
              Branch <span className="text-cuci-primary">availability</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Tell customers what's happening at your branch right now. This shows on
              the public live queue.
            </p>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => {
                  setTouched(true);
                  setStatus(v as typeof status);
                }}
              >
                <SelectTrigger data-testid="select-branch-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANCH_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected && (
                <p className="text-[11px] text-gray-500 mt-1">{selected.hint}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Reason note (optional)</Label>
              <Input
                value={note}
                maxLength={160}
                placeholder="e.g. water supply issue, back by 3pm"
                onChange={(e) => {
                  setTouched(true);
                  setNote(e.target.value);
                }}
                data-testid="input-branch-status-note"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Shown to customers under your branch on the live queue.
              </p>
            </div>
            <Button
              className="w-full cuci-cta border-2 border-black"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
              data-testid="button-save-branch-status"
            >
              {save.isPending ? "Saving…" : "Update status"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// LaneControl — Phase 12d.
//
// Two-column lane card on /pos. Left: queued cars waiting to be
// started. Right: cars currently being washed. Tapping the button
// on a row PATCHes /api/pos/orders/:id/status, then invalidates
// today's orders + the public queue snapshot so both this card
// and the public widget reflect reality within one tick.
// ============================================================
function LaneControl({
  orders,
  branchId,
  onChanged,
}: {
  orders: TodayOrder[];
  branchId: number | null;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const washing = orders.filter((o) => o.status === "washing");
  // "Up next", front-first: manual queue_position wins, then FIFO by created_at.
  const queued = orders
    .filter((o) => o.status === "queued")
    .sort((a, b) => {
      const pa = a.queue_position ?? Number.POSITIVE_INFINITY;
      const pb = b.queue_position ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return a.created_at.localeCompare(b.created_at);
    });

  const advance = async (
    orderId: string,
    to: "washing" | "done" | "queued",
  ) => {
    setPendingId(orderId);
    try {
      const r = await apiRequest("PATCH", `/api/pos/orders/${orderId}/status`, { to });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `${r.status}`);
      }
      onChanged();
      toast({
        title:
          to === "washing"
            ? "Wash started"
            : to === "done"
              ? "Marked done"
              : "Sent back to queue",
        description:
          to === "washing"
            ? "Car moved to the washing lane."
            : to === "done"
              ? "Car checked out — counted in today's total."
              : "Car moved to the front of Up next.",
      });
    } catch (e: any) {
      toast({
        title: "Couldn't update status",
        description: e?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setPendingId(null);
    }
  };

  // Move a queued car up/down by one slot, then persist the whole order.
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= queued.length) return;
    const next = [...queued];
    [next[index], next[target]] = [next[target], next[index]];
    setReordering(true);
    try {
      const r = await apiRequest("PATCH", `/api/pos/queue/reorder`, {
        branch_id: branchId,
        order_ids: next.map((o) => o.id),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `${r.status}`);
      }
      onChanged();
    } catch (e: any) {
      const stale = String(e?.message ?? "").includes("queue_changed");
      toast({
        title: "Couldn't reorder",
        description: stale
          ? "The queue changed on another device — refreshed it."
          : e?.message ?? "Try again.",
        variant: "destructive",
      });
      // Snap the list back to server truth (esp. on a stale 409).
      onChanged();
    } finally {
      setReordering(false);
    }
  };

  if (branchId === null) return null;

  return (
    <Card data-testid="card-lane-control">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-cuci-primary" />
          Lane control
          <span className="ml-auto text-xs font-normal text-gray-500">
            {queued.length} queued · {washing.length} washing
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Side-by-side on desktop so the wide lane view uses the full
            width; stacks on mobile. */}
        <div className="grid lg:grid-cols-2 gap-6">
        {/* Currently washing */}
        <div>
          <p className="cuci-eyebrow mb-2 text-cuci-secondary">Washing now</p>
          {washing.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No cars in the wash.</p>
          ) : (
            <div className="space-y-2">
              {washing.map((o) => (
                <div
                  key={o.id}
                  className="border-2 border-cuci-secondary/40 bg-cuci-secondary/5 rounded-lg px-3 py-2.5"
                  data-testid={`row-washing-${o.id}`}
                >
                  <div className="mb-2">
                    <p className="font-mono font-extrabold text-xl leading-tight break-words">
                      {o.plate}
                    </p>
                    <p className="text-sm text-gray-600 break-words">
                      {o.ticket_code} · {o.package_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={pendingId === o.id}
                      onClick={() => advance(o.id, "queued")}
                      data-testid={`button-send-back-${o.id}`}
                      title="Send this car back to Up next"
                    >
                      <Undo2 className="w-3.5 h-3.5 mr-1" />
                      Back
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={pendingId === o.id}
                      onClick={() => advance(o.id, "done")}
                      data-testid={`button-mark-done-${o.id}`}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {pendingId === o.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <CheckCheck className="w-3.5 h-3.5 mr-1" />
                          Done
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* In the queue, oldest first */}
        <div>
          <p className="cuci-eyebrow mb-2">Up next</p>
          {queued.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Queue is empty.</p>
          ) : (
            <div className="space-y-2">
              {queued.map((o, i) => (
                  <div
                    key={o.id}
                    className="border border-gray-200 rounded-lg px-3 py-2.5"
                    data-testid={`row-queued-${o.id}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {/* Reorder controls — move this car up/down the queue. */}
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={reordering || i === 0}
                          onClick={() => move(i, -1)}
                          data-testid={`button-move-up-${o.id}`}
                          aria-label="Move up"
                          className="text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={reordering || i === queued.length - 1}
                          onClick={() => move(i, 1)}
                          data-testid={`button-move-down-${o.id}`}
                          aria-label="Move down"
                          className="text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono font-extrabold text-xl leading-tight break-words">
                          {o.plate}
                        </p>
                        <p className="text-sm text-gray-600 break-words">
                          {o.ticket_code} · {o.package_name}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={pendingId === o.id}
                      onClick={() => advance(o.id, "washing")}
                      data-testid={`button-start-wash-${o.id}`}
                      className="w-full bg-cuci-primary hover:bg-cuci-primary/90"
                    >
                      {pendingId === o.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 mr-1" />
                          Start wash
                        </>
                      )}
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
