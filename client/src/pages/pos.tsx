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
  Camera,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Printer,
  ReceiptText,
  ShieldCheck,
  Upload,
  User,
  X,
  QrCode,
  Play,
  CheckCheck,
  Activity,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
}
interface CatalogAddon {
  id: string;
  name: string;
  price_cents: number;
  sort_order: number;
}
interface CatalogResponse {
  packages: CatalogPackage[];
  addons: CatalogAddon[];
  payment_methods: readonly PaymentMethod[];
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
  status: string;
  created_at: string;
  // Phase 4 — populated when status='refunded'.
  refunded_at?: string | null;
  refund_reason?: string | null;
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
  addons: Array<{ id: string; name: string; price_cents: number }>;
  subtotal_cents: number;
  total_cents: number;
  payment_method: PaymentMethod;
  status: string;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  qr_code: "QR Code",
  baiduri_pay: "Baiduri Pay",
  quick_pay: "Quick Pay",
  subscription: "Subscription",
  voucher: "Voucher",
};

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
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [packageId, setPackageId] = useState<string>("");
  const [plate, setPlate] = useState<string>("");
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentRef, setPaymentRef] = useState<string>("");
  const [itemNotes, setItemNotes] = useState<string>("");
  const [scanOpen, setScanOpen] = useState<boolean>(false);

  // Phase 1: vehicle/customer linkage.
  // - `matchedVehicleId` is set when the cashier picks a suggestion from
  //   the autocomplete. Cleared when they edit the plate further (so a
  //   typo correction doesn't accidentally tag the order to the wrong car).
  // - `customerPhone/Name` are optional. When provided, the server upserts
  //   a customers row, links it to the vehicle if it has no owner yet,
  //   and stores the name on the order for receipts.
  const [matchedVehicleId, setMatchedVehicleId] = useState<number | null>(null);
  const [vehicleSuggestions, setVehicleSuggestions] = useState<VehicleSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [showCustomerForm, setShowCustomerForm] = useState<boolean>(false);
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const plateInputRef = useRef<HTMLInputElement | null>(null);

  // Confirmation state
  const [lastOrder, setLastOrder] = useState<CreatedOrder | null>(null);
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

  // Default to the first package as soon as the catalog loads.
  useEffect(() => {
    if (catalog && !packageId && catalog.packages.length > 0) {
      setPackageId(catalog.packages[0].id);
    }
  }, [catalog, packageId]);

  const activePackage = useMemo(
    () => catalog?.packages.find((p) => p.id === packageId) ?? null,
    [catalog, packageId],
  );

  const packagePrice = activePackage?.price_cents ?? null;

  const addonsTotal = useMemo(() => {
    if (!catalog) return 0;
    return catalog.addons
      .filter((a) => selectedAddons.has(a.id))
      .reduce((s, a) => s + a.price_cents, 0);
  }, [catalog, selectedAddons]);

  const subtotal = (packagePrice ?? 0) + addonsTotal;

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

  // When the cashier picks "Subscription" AND we have an active wash-pack
  // for the customer, the pack covers the full subtotal (Phase 2 model —
  // matches the server-side discount calculation).
  // NB: must be defined AFTER activeMembership to avoid a TDZ ReferenceError.
  const useMembership =
    paymentMethod === "subscription" && activeMembership !== null;
  const discount = useMembership ? subtotal : 0;
  const total = subtotal - discount;

  const canSubmit =
    !!activePackage &&
    packagePrice !== null &&
    plate.trim().length > 0 &&
    branchId !== null &&
    // Subscription payment requires an active wash-pack on file. Block
    // submit until the cashier either resolves a customer with a pack
    // or switches payment method — the server enforces this too, but
    // catching it client-side avoids a confusing 400 round-trip.
    (paymentMethod !== "subscription" || activeMembership !== null);

  // When picking a suggestion, prefill plate + customer info (if any) so
  // the cashier doesn't retype it. They can still edit before submitting.
  const pickVehicle = (v: VehicleSuggestion) => {
    setPlate(v.license_plate);
    setMatchedVehicleId(v.id);
    setShowSuggestions(false);
    setVehicleSuggestions([]);
    if (v.customer) {
      setCustomerPhone(v.customer.phone);
      setCustomerName(v.customer.name);
      setShowCustomerForm(true);
    }
  };

  const clearMatchedVehicle = () => {
    setMatchedVehicleId(null);
  };

  // ----- Phase 4: full-order refund -----
  // Any staff can refund (per owner decision). Confirm + optional
  // reason via the browser's confirm/prompt — keeps the UI minimal
  // for v1; the Phase 7 visual refresh will replace these with a
  // proper modal. Subscription orders DO NOT credit the wash back.
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
    },
  });

  const promptRefund = (o: TodayOrder) => {
    if (!confirm(
      `Refund ticket ${o.ticket_code} (${o.plate}) for ${formatBND(o.total_cents)}?\n\n` +
      `This cannot be undone. The order will show as a negative entry.`,
    )) {
      return;
    }
    const reason = prompt("Reason (optional):") ?? "";
    refundOrder.mutate({
      orderId: o.id,
      reason: reason.trim() || null,
    });
  };

  // ----- Phase 3: license plate recognition -----
  // Two hidden file inputs: one with `capture="environment"` opens the
  // device camera on mobile (and falls back to a file picker on desktop),
  // the other is a plain gallery/upload picker. Both feed the same handler
  // so behaviour is identical post-capture.
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [lprBusy, setLprBusy] = useState<boolean>(false);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("file_read_failed"));
      r.onload = () => {
        const out = String(r.result ?? "");
        // Strip the "data:<mime>;base64," prefix the server also strips.
        const i = out.indexOf(",");
        resolve(i >= 0 ? out.slice(i + 1) : out);
      };
      r.readAsDataURL(file);
    });

  const recognizePlate = async (file: File) => {
    if (branchId === null) {
      toast({
        title: "Pick a branch first",
        description: "Choose a branch before scanning a plate.",
        variant: "destructive",
      });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Not an image", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Please use a photo under 8MB.",
        variant: "destructive",
      });
      return;
    }
    setLprBusy(true);
    try {
      const base64 = await fileToBase64(file);
      const r = await fetch("/api/pos/lpr/recognize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: base64,
          image_mime: file.type,
          branch_id: branchId,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (r.status === 503) {
          toast({
            title: "Plate scanner unavailable",
            description: "Please type the plate by hand.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Couldn't read plate",
            description: j.error ?? `Error ${r.status}`,
            variant: "destructive",
          });
        }
        return;
      }
      const data = (await r.json()) as {
        recognized_plate: string | null;
        confidence: number | null;
        vehicle: VehicleSuggestion | null;
      };
      if (!data.recognized_plate) {
        toast({
          title: "No plate detected",
          description: "Try a clearer photo, or type the plate.",
          variant: "destructive",
        });
        return;
      }
      // Auto-fill, and auto-pick the vehicle if there's an exact match
      // on file. Staff can still edit the plate or clear the match.
      if (data.vehicle) {
        pickVehicle(data.vehicle);
        const pct = data.confidence !== null ? ` (${Math.round(data.confidence * 100)}%)` : "";
        toast({
          title: `Matched ${data.vehicle.license_plate}${pct}`,
          description: data.vehicle.customer
            ? `${data.vehicle.customer.name} — please confirm`
            : "No customer on file — please confirm",
        });
      } else {
        setPlate(data.recognized_plate);
        setMatchedVehicleId(null);
        const pct = data.confidence !== null ? ` (${Math.round(data.confidence * 100)}%)` : "";
        toast({
          title: `Read ${data.recognized_plate}${pct}`,
          description: "New vehicle — please confirm and add details.",
        });
      }
    } catch (err) {
      console.error("[lpr] failed:", err);
      toast({
        title: "Plate scanner failed",
        description: "Please type the plate by hand.",
        variant: "destructive",
      });
    } finally {
      setLprBusy(false);
      // Reset file inputs so picking the same file twice still fires onChange.
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
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
        addon_ids: oneTap ? [] : Array.from(selectedAddons),
        payment_method: oneTap ? "subscription" : paymentMethod,
        payment_ref: oneTap ? null : paymentRef.trim() || null,
        branch_id: branchId,
        item_notes: oneTap ? null : itemNotes.trim() || null,
        vehicle_id: matchedVehicleId,
        customer_phone: oneTap ? null : customerPhone.trim() || null,
        customer_name: oneTap ? null : customerName.trim() || null,
        membership_id:
          (oneTap || paymentMethod === "subscription") && activeMembership
            ? activeMembership.id
            : null,
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
          : msg,
        variant: "destructive",
      });
    },
  });

  const resetForNew = () => {
    setLastOrder(null);
    setPlate("");
    setSelectedAddons(new Set());
    setPaymentRef("");
    setItemNotes("");
    setMatchedVehicleId(null);
    setVehicleSuggestions([]);
    setShowSuggestions(false);
    setCustomerPhone("");
    setCustomerName("");
    setShowCustomerForm(false);
    // Keep packageId, paymentMethod sticky for fast successive orders.
  };

  // On-demand Bluetooth thermal-printer receipt. Digital receipts remain the
  // default; this only fires when a cashier taps "Print receipt".
  const handlePrintReceipt = async () => {
    if (!lastOrder) return;
    if (!isBluetoothPrintingSupported()) {
      toast({
        variant: "destructive",
        title: "Bluetooth printing unavailable",
        description:
          "Use Chrome or Edge on an Android tablet, phone, or computer over a secure connection. It isn't supported on iPhone/iPad.",
      });
      return;
    }
    setPrinting(true);
    try {
      const items = [
        {
          name: lastOrder.package_name,
          price: formatBND(lastOrder.package_price_cents),
        },
        ...lastOrder.addons.map((a) => ({
          name: `+ ${a.name}`,
          price: formatBND(a.price_cents),
        })),
      ];
      await printReceipt({
        branchName: BRANCH_NAME_BY_ID[lastOrder.branch_id] ?? "Cuci Xpress",
        ticketCode: lastOrder.ticket_code,
        plate: lastOrder.plate,
        dateTime: new Date().toLocaleString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Brunei",
        }),
        items,
        total: formatBND(lastOrder.total_cents),
        paymentLabel: PAYMENT_LABELS[lastOrder.payment_method],
        cashierName: staff?.name ?? undefined,
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

  const toggleAddon = (id: string) => {
    setSelectedAddons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
                  <span className="font-semibold">{formatBND(lastOrder.package_price_cents)}</span>
                </div>
                {lastOrder.addons.map((a) => (
                  <div key={a.id} className="flex justify-between text-gray-600">
                    <span>+ {a.name}</span>
                    <span>{formatBND(a.price_cents)}</span>
                  </div>
                ))}
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
                    {PAYMENT_LABELS[lastOrder.payment_method]}
                  </span>
                </div>
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
                Point of <span className="text-cuci-primary">sale</span>
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
              />
              {/* Phase 12c-ui: prepaid scan-in. Opens a modal containing
                  the ScanInTab component so cashiers don't have to leave
                  POS to allocate a ticket for a customer who paid online. */}
              <button
                onClick={() => setScanOpen(true)}
                className="cuci-cta bg-cuci-primary text-white px-4 py-2 rounded-full inline-flex items-center gap-2 text-sm"
                data-testid="button-pos-scan-qr"
              >
                <QrCode className="w-4 h-4" />
                Scan QR
              </button>
              {/* End-of-shift sales report. Self-contained modal that
                  reads the cashier's open shift and renders totals in the
                  same format as the paper report owner reviews — no
                  /admin access needed. */}
              <DailyReport
                branchName={branchId !== null ? BRANCH_NAME_BY_ID[branchId] ?? null : null}
                staffName={staff?.name ?? null}
              />
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
              {/* Branch — switcher for owner/manager, locked badge for lane/cashier */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Branch
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {canSwitchBranch ? (
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
                  ) : (
                    <div
                      className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                      data-testid="text-locked-branch"
                    >
                      {branchId !== null
                        ? BRANCH_NAME_BY_ID[branchId] ?? `Branch ${branchId}`
                        : "No branch assigned"}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Package picker */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Package</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {catalog?.packages.map((p) => (
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
                  {activePackage?.description && (
                    <p className="text-sm text-gray-500">
                      {activePackage.description}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Plate + customer */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">License Plate</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Hidden inputs for camera + gallery. The Camera button
                      uses capture="environment" so mobile opens the back
                      camera; on desktop both fall back to a file picker. */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) recognizePlate(f);
                    }}
                    data-testid="input-lpr-camera"
                  />
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) recognizePlate(f);
                    }}
                    data-testid="input-lpr-upload"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={lprBusy || branchId === null}
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1"
                      data-testid="button-lpr-camera"
                    >
                      {lprBusy ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4 mr-1" />
                      )}
                      {lprBusy ? "Reading…" : "Camera"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={lprBusy || branchId === null}
                      onClick={() => uploadInputRef.current?.click()}
                      className="flex-1"
                      data-testid="button-lpr-upload"
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      Upload
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      ref={plateInputRef}
                      value={plate}
                      onChange={(e) => {
                        setPlate(e.target.value.toUpperCase());
                        // Editing the plate clears any prior match so the
                        // order won't accidentally tag the wrong vehicle.
                        if (matchedVehicleId !== null) setMatchedVehicleId(null);
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
                          <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                              <History className="w-3 h-3" />
                              {vehicleHistory.total_visits} prior visit{vehicleHistory.total_visits === 1 ? "" : "s"}
                            </span>
                            {vehicleHistory.total_visits > 0 && (
                              <span>
                                Spent {formatBND(vehicleHistory.total_spent_cents)}
                              </span>
                            )}
                            {vehicleHistory.favourite_branch_id && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {BRANCH_NAME_BY_ID[vehicleHistory.favourite_branch_id] ??
                                  `Branch ${vehicleHistory.favourite_branch_id}`}
                              </span>
                            )}
                          </div>
                          {vehicleHistory.recent_orders[0] && (
                            <div className="text-xs text-gray-500 mt-1">
                              Last: {vehicleHistory.recent_orders[0].package_name}
                              {" · "}
                              {formatBND(vehicleHistory.recent_orders[0].total_cents)}
                              {" · "}
                              {formatRelative(vehicleHistory.recent_orders[0].created_at)}
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

                  {!showCustomerForm && (
                    <button
                      type="button"
                      onClick={() => setShowCustomerForm(true)}
                      className="text-xs text-cuci-primary hover:underline inline-flex items-center gap-1"
                      data-testid="button-show-customer-form"
                    >
                      <User className="w-3 h-3" />
                      + Add customer info (optional)
                    </button>
                  )}

                  {showCustomerForm && (
                    <div className="space-y-2 pt-1 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-gray-600">
                          Customer (optional)
                        </Label>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCustomerForm(false);
                              setCustomerPhone("");
                              setCustomerName("");
                            }}
                            className="text-xs text-gray-400 hover:text-gray-700"
                            data-testid="button-hide-customer-form"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="Phone"
                          inputMode="tel"
                          data-testid="input-customer-phone"
                        />
                        <Input
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Name"
                          data-testid="input-customer-name"
                        />
                      </div>
                      {vehicleHistory?.customer && (
                        <p className="text-xs text-gray-500">
                          {vehicleHistory.total_visits ?? 0} previous visit{vehicleHistory.total_visits === 1 ? "" : "s"}
                          {vehicleHistory.total_spent_cents ? ` · B$${(vehicleHistory.total_spent_cents / 100).toFixed(2)} lifetime` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Addons */}
              {catalog && catalog.addons.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Addons</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {catalog?.addons.map((a) => {
                        const isSelected = selectedAddons.has(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAddon(a.id)}
                            data-testid={`button-addon-${a.id}`}
                            className={`flex items-center justify-between rounded-md border p-3 transition-all
                              ${isSelected
                                ? "border-cuci-primary bg-cuci-primary/10 ring-2 ring-cuci-primary"
                                : "border-gray-200 hover:border-gray-300"}`}
                          >
                            <span className="font-medium">{a.name}</span>
                            <span className="text-sm text-gray-700">
                              +{formatBND(a.price_cents)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment + notes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="payment-method">Method</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                    >
                      <SelectTrigger id="payment-method" data-testid="select-payment-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {catalog?.payment_methods.map((pm) => (
                          <SelectItem key={pm} value={pm}>
                            {PAYMENT_LABELS[pm]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="payment-ref">
                      Reference{" "}
                      <span className="text-gray-400 text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="payment-ref"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      placeholder="Last 4 digits / txn id"
                      data-testid="input-payment-ref"
                    />
                  </div>
                  <div>
                    <Label htmlFor="item-notes">
                      Car notes{" "}
                      <span className="text-gray-400 text-xs">(optional)</span>
                    </Label>
                    <Input
                      id="item-notes"
                      value={itemNotes}
                      onChange={(e) => setItemNotes(e.target.value)}
                      placeholder="e.g. silver Mini Cooper"
                      data-testid="input-item-notes"
                    />
                  </div>
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
                    {Array.from(selectedAddons).map((id) => {
                      const a = catalog?.addons.find((x) => x.id === id);
                      if (!a) return null;
                      return (
                        <div key={id} className="flex justify-between text-gray-600">
                          <span>+ {a.name}</span>
                          <span>{formatBND(a.price_cents)}</span>
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

              {/* Phase 12d: Lane control. Shows the queued + washing
                  cars for this branch with two buttons each so lane
                  staff can advance them through the wash lifecycle.
                  Reads from the same /api/pos/orders/today query the
                  Today panel below uses, then filters client-side. */}
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

              {/* Today's orders */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Today</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                  {!todayData || todayData.orders.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No orders yet today.
                    </p>
                  ) : (
                    todayData.orders.map((o) => {
                      const isRefunded = o.status === "refunded";
                      return (
                        <div
                          key={o.id}
                          className={`flex items-center justify-between text-sm border-b last:border-b-0 py-2 gap-2 ${
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
                              {o.plate} · {formatTime(o.created_at)}
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
                      );
                    })
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
          />
        </DialogContent>
      </Dialog>
    </div>
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

  const queued = orders.filter((o) => o.status === "queued");
  const washing = orders.filter((o) => o.status === "washing");

  const advance = async (orderId: string, to: "washing" | "done") => {
    setPendingId(orderId);
    try {
      const r = await apiRequest("PATCH", `/api/pos/orders/${orderId}/status`, { to });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `${r.status}`);
      }
      onChanged();
      toast({
        title: to === "washing" ? "Wash started" : "Marked done",
        description: to === "washing"
          ? "Car moved to the washing lane."
          : "Car checked out — counted in today's total.",
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
      <CardContent className="space-y-4">
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
                  className="flex items-center justify-between gap-2 border-2 border-cuci-secondary/40 bg-cuci-secondary/5 rounded-lg px-3 py-2"
                  data-testid={`row-washing-${o.id}`}
                >
                  <div className="min-w-0">
                    <p className="font-mono font-bold text-sm">{o.ticket_code}</p>
                    <p className="text-xs text-gray-600 truncate">
                      {o.plate} · {o.package_name}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={pendingId === o.id}
                    onClick={() => advance(o.id, "done")}
                    data-testid={`button-mark-done-${o.id}`}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {pendingId === o.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <CheckCheck className="w-3.5 h-3.5 mr-1" />
                        Mark done
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* In the queue, oldest first */}
        <div>
          <p className="cuci-eyebrow mb-2">Up next</p>
          {queued.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Queue is empty.</p>
          ) : (
            <div className="space-y-2">
              {[...queued]
                .sort((a, b) => a.created_at.localeCompare(b.created_at))
                .map((o, i) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2"
                    data-testid={`row-queued-${o.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-sm">{o.ticket_code}</p>
                        <p className="text-xs text-gray-600 truncate">
                          {o.plate} · {o.package_name}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={pendingId === o.id}
                      onClick={() => advance(o.id, "washing")}
                      data-testid={`button-start-wash-${o.id}`}
                      className="bg-cuci-primary hover:bg-cuci-primary/90"
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
      </CardContent>
    </Card>
  );
}
