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

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  LogOut,
  Plus,
  ReceiptText,
  ShieldCheck,
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
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type VehicleSize = "small" | "medium" | "large" | "xlarge";
type PaymentMethod =
  | "cash" | "bank_transfer" | "card" | "qr_code"
  | "baiduri_pay" | "quick_pay" | "subscription" | "voucher";

interface CatalogPackage {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number | null;
  sort_order: number;
  prices_by_size: Partial<Record<VehicleSize, number>>;
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
  vehicle_sizes: readonly VehicleSize[];
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

const SIZE_LABELS: Record<VehicleSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xlarge: "XL",
};

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

export default function POS() {
  const { staff, isAuthenticated, isLoading: authLoading, login, logout } = useStaffAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state
  const [packageId, setPackageId] = useState<string>("");
  const [vehicleSize, setVehicleSize] = useState<VehicleSize>("small");
  const [plate, setPlate] = useState<string>("");
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentRef, setPaymentRef] = useState<string>("");
  const [itemNotes, setItemNotes] = useState<string>("");

  // Confirmation state
  const [lastOrder, setLastOrder] = useState<CreatedOrder | null>(null);

  const branchId = staff?.branchId ?? null;

  const { data: catalog, isLoading: catalogLoading } = useQuery<CatalogResponse>({
    queryKey: ["/api/pos/catalog"],
    enabled: isAuthenticated,
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

  const packagePrice = activePackage?.prices_by_size[vehicleSize] ?? null;

  const addonsTotal = useMemo(() => {
    if (!catalog) return 0;
    return catalog.addons
      .filter((a) => selectedAddons.has(a.id))
      .reduce((s, a) => s + a.price_cents, 0);
  }, [catalog, selectedAddons]);

  const total = (packagePrice ?? 0) + addonsTotal;

  const canSubmit =
    !!activePackage &&
    packagePrice !== null &&
    plate.trim().length > 0 &&
    branchId !== null;

  const createOrder = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pos/orders", {
        package_id: packageId,
        vehicle_size: vehicleSize,
        plate: plate.trim(),
        addon_ids: Array.from(selectedAddons),
        payment_method: paymentMethod,
        payment_ref: paymentRef.trim() || null,
        branch_id: branchId,
        item_notes: itemNotes.trim() || null,
      });
      return (await res.json()) as { ok: true; order: CreatedOrder };
    },
    onSuccess: (data) => {
      setLastOrder(data.order);
      queryClient.invalidateQueries({
        queryKey: ["/api/pos/orders/today", branchId],
      });
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
    // Keep packageId, vehicleSize, paymentMethod sticky for fast successive orders.
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cuci-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50">
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
      <div className="min-h-screen bg-gray-50">
        <main className="pt-12 pb-16">
          <div className="max-w-2xl mx-auto px-4">
            <Card className="shadow-lg" data-testid="card-order-confirmation">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-9 h-9 text-green-600" />
                </div>
                <CardTitle className="text-2xl">Order Confirmed</CardTitle>
                <p className="text-gray-600">Ticket issued — hand to lane</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-5xl font-bold tracking-wider text-cuci-primary"
                       data-testid="text-ticket-code">
                    {lastOrder.ticket_code}
                  </div>
                  <div className="mt-2 text-lg font-semibold text-gray-900"
                       data-testid="text-ticket-plate">
                    {lastOrder.plate}
                  </div>
                </div>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{lastOrder.package_name}</span>
                    <span>{formatBND(lastOrder.package_price_cents)}</span>
                  </div>
                  {lastOrder.addons.map((a) => (
                    <div key={a.id} className="flex justify-between text-gray-600">
                      <span>+ {a.name}</span>
                      <span>{formatBND(a.price_cents)}</span>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span data-testid="text-ticket-total">
                      {formatBND(lastOrder.total_cents)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Paid via</span>
                    <span className="capitalize">
                      {PAYMENT_LABELS[lastOrder.payment_method]}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={resetForNew}
                  className="w-full"
                  size="lg"
                  data-testid="button-new-order"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Order
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // ---- Catalog still loading -----------------------------------------------

  if (catalogLoading || !catalog) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-cuci-primary mx-auto mb-3" />
          <p className="text-gray-600">Loading catalog…</p>
        </div>
      </div>
    );
  }

  if (catalog.packages.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
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
    <div className="min-h-screen bg-gray-50">
      <main className="pt-6 pb-16">
        <div className="max-w-6xl mx-auto px-4 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="space-y-1">
              <Link href="/" className="inline-block">
                <button className="flex items-center text-sm text-gray-600 hover:text-cuci-primary transition-colors">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </button>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Point of Sale</h1>
            </div>
            <div className="flex items-center gap-3">
              {staff && (
                <div className="inline-flex items-center gap-2 text-sm text-gray-700 bg-cuci-primary/5 border border-cuci-primary/20 rounded-full px-3 py-1">
                  <ShieldCheck className="w-4 h-4 text-cuci-primary" />
                  <span data-testid="text-staff-name">{staff.name}</span>
                  <span className="text-gray-400">·</span>
                  <span className="capitalize" data-testid="text-staff-role">
                    {staff.role}
                  </span>
                  {staff.branchId !== null && (
                    <>
                      <span className="text-gray-400">·</span>
                      <span data-testid="text-staff-branch">
                        Branch {staff.branchId}
                      </span>
                    </>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                data-testid="button-staff-logout"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </Button>
            </div>
          </div>

          {branchId === null && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="p-4 text-amber-900 text-sm">
                Your staff account isn't tied to a branch yet. Ask the owner
                to set <code>staff.branch_id</code> before taking orders.
              </CardContent>
            </Card>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* --- Left: Order builder ----------------------------------- */}
            <div className="lg:col-span-2 space-y-4">
              {/* Package picker */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Package</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {catalog.packages.map((p) => (
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

              {/* Vehicle size picker */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Vehicle Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {catalog.vehicle_sizes.map((s) => {
                      const price = activePackage?.prices_by_size[s];
                      const isSelected = s === vehicleSize;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setVehicleSize(s)}
                          disabled={price === undefined}
                          data-testid={`button-size-${s}`}
                          className={`rounded-md border p-3 text-left transition-all
                            ${isSelected
                              ? "border-cuci-primary bg-cuci-primary/10 ring-2 ring-cuci-primary"
                              : "border-gray-200 hover:border-gray-300"}
                            ${price === undefined ? "opacity-40 cursor-not-allowed" : ""}`}
                        >
                          <div className="font-semibold">{SIZE_LABELS[s]}</div>
                          <div className="text-sm text-gray-600">
                            {price !== undefined ? formatBND(price) : "—"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Plate */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">License Plate</CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    value={plate}
                    onChange={(e) => setPlate(e.target.value.toUpperCase())}
                    placeholder="BB1234"
                    autoCapitalize="characters"
                    data-testid="input-plate"
                  />
                </CardContent>
              </Card>

              {/* Addons */}
              {catalog.addons.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Addons</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {catalog.addons.map((a) => {
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
                        {catalog.payment_methods.map((pm) => (
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
                        {activePackage?.name ?? "—"}{" "}
                        <span className="text-gray-400">
                          ({SIZE_LABELS[vehicleSize]})
                        </span>
                      </span>
                      <span>
                        {packagePrice !== null
                          ? formatBND(packagePrice)
                          : "—"}
                      </span>
                    </div>
                    {Array.from(selectedAddons).map((id) => {
                      const a = catalog.addons.find((x) => x.id === id);
                      if (!a) return null;
                      return (
                        <div key={id} className="flex justify-between text-gray-600">
                          <span>+ {a.name}</span>
                          <span>{formatBND(a.price_cents)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span data-testid="text-summary-total">
                      {formatBND(total)}
                    </span>
                  </div>
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
                    todayData.orders.map((o) => (
                      <div
                        key={o.id}
                        className="flex items-center justify-between text-sm border-b last:border-b-0 py-2"
                        data-testid={`row-today-${o.id}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-mono font-semibold">
                            {o.ticket_code}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {o.plate} · {formatTime(o.created_at)}
                          </span>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="font-medium">
                            {formatBND(o.total_cents)}
                          </span>
                          <Badge variant="outline" className="text-xs capitalize">
                            {o.status}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
