import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CreditCard, Plus, Pencil, Save, Trash2, Lock, QrCode, ArrowUpDown,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PaymentMethodRow {
  id: string;
  label: string;
  method: string;
  qr_provider: string | null;
  is_active: boolean;
  sort_order: number;
  is_system: boolean;
  created_at: string;
}

interface PaymentMethodListResp {
  rows: PaymentMethodRow[];
}

interface PaymentMethodForm {
  label: string;
  method: string;
  qr_provider: string;
  is_active: boolean;
  sort_order: number;
}

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "qr_code", label: "Digital wallet / QR" },
  { value: "baiduri_pay", label: "Baiduri Pay" },
  { value: "quick_pay", label: "Quick Pay" },
  { value: "subscription", label: "Subscription" },
  { value: "voucher", label: "Voucher" },
];

const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((o) => [o.value, o.label]),
);

const RESERVED_PROVIDER = "pocket_pay";

// A provider code must be lowercase letters, numbers and underscores only —
// mirrors the server-side validation so we can flag bad codes before saving.
const PROVIDER_CODE_RE = /^[a-z0-9_]+$/;

// Turn a wallet label like "Progresif Ding!" into a stable internal code
// ("progresif_ding") so owners adding a digital wallet don't have to invent
// a "QR provider" value themselves. They can still override it if their
// provider gave them a specific code.
const slugifyProvider = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const EMPTY_FORM: PaymentMethodForm = {
  label: "",
  method: "cash",
  qr_provider: "",
  is_active: true,
  sort_order: 0,
};

const formatBND = (cents: number) => `B$${(cents / 100).toFixed(2)}`;
void formatBND;

export default function PaymentSetupTab() {
  const { data, isLoading, error } = useQuery<PaymentMethodListResp>({
    queryKey: ["/api/admin/payment-methods"],
  });

  const rows = [...(data?.rows ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
  );
  const [editing, setEditing] = useState<PaymentMethodRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="cuci-card border-2 border-black">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="cuci-eyebrow">POS Control Room</div>
              <CardTitle className="text-2xl font-extrabold tracking-tight">
                <span className="text-cuci-primary">Payment setup</span>
              </CardTitle>
              <p className="text-sm text-gray-600">
                Configure which payment methods appear in the POS dropdown — label, type, QR provider, order, and active state.
              </p>
            </div>
            <Button
              className="cuci-cta border-2 border-black"
              onClick={() => setCreating(true)}
              data-testid="button-new-payment-method"
            >
              <Plus className="w-4 h-4 mr-1" /> New payment method
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600">Failed to load payment methods.</p>}
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-6 text-center">
              No payment methods yet. Click "New payment method" to add one.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {rows.map((p) => (
                <div
                  key={p.id}
                  className={`border-2 border-black rounded-lg p-4 bg-white space-y-3 ${p.is_active ? "" : "opacity-70"}`}
                  data-testid={`payment-method-card-${p.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-extrabold text-lg tracking-tight flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-cuci-primary" />
                        <span className="truncate">{p.label}</span>
                      </div>
                      <div className="text-xs text-gray-600 flex items-center gap-1.5 mt-1 flex-wrap">
                        <Badge variant="outline" className="border-black font-mono text-[10px]">
                          {p.method}
                        </Badge>
                        {p.qr_provider && (
                          <Badge variant="outline" className="border-black font-mono text-[10px] flex items-center gap-1">
                            <QrCode className="w-3 h-3" /> {p.qr_provider}
                          </Badge>
                        )}
                        {p.is_system && (
                          <Badge className="bg-amber-500 text-white text-[10px] flex items-center gap-1">
                            <Lock className="w-3 h-3" /> system
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Badge className={p.is_active ? "bg-green-600 text-white" : "bg-gray-400 text-white"}>
                      {p.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
                      <ArrowUpDown className="w-3 h-3 text-gray-500" />
                      <span>Sort <strong>{p.sort_order}</strong></span>
                    </div>
                    <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
                      <CreditCard className="w-3 h-3 text-gray-500" />
                      <span className="truncate">{METHOD_LABELS[p.method] ?? p.method}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 border-2 border-black"
                      onClick={() => setEditing(p)}
                      data-testid={`button-edit-payment-method-${p.id}`}
                    >
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <DeleteButton method={p} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FeeRatesCard />

      {editing && (
        <PaymentMethodEditDialog
          method={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {creating && (
        <PaymentMethodEditDialog
          method={null}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

interface FeeRateRow {
  id: string;
  label: string;
  payment_method: string;
  qr_provider: string | null;
  mdr_bps: number;
}
interface FeeRateListResp { rows: FeeRateRow[]; }

const bpsToPct = (bps: number) => (bps / 100).toFixed(2).replace(/\.?0+$/, "");
const pctToBps = (pct: string) => Math.round((Number(pct) || 0) * 100);

function FeeRatesCard() {
  const { data, isLoading, error } = useQuery<FeeRateListResp>({
    queryKey: ["/api/admin/fee-rates"],
  });
  const [creating, setCreating] = useState(false);
  const rows = data?.rows ?? [];

  return (
    <Card className="cuci-card border-2 border-black">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="cuci-eyebrow">POS Control Room</div>
            <CardTitle className="text-2xl font-extrabold tracking-tight">
              <span className="text-cuci-primary">Transaction fees (MDR)</span>
            </CardTitle>
            <p className="text-sm text-gray-600 max-w-2xl">
              The cut each payment provider keeps per digital transaction. Reports
              subtract these to show your <strong>net after fees</strong>. The fee is
              charged on the full amount and is <strong>not</strong> refunded when an
              order is refunded. Cash and bank transfer have no fee.
            </p>
          </div>
          <Button
            className="cuci-cta border-2 border-black"
            onClick={() => setCreating(true)}
            data-testid="button-new-fee-rate"
          >
            <Plus className="w-4 h-4 mr-1" /> New fee rate
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600">Failed to load fee rates.</p>}
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-6 text-center">
            No fee rates yet. Click "New fee rate" to add one.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {rows.map((r) => (
              <FeeRateRowCard key={r.id} rate={r} />
            ))}
          </div>
        )}
      </CardContent>

      {creating && <FeeRateEditDialog existing={rows} onClose={() => setCreating(false)} />}
    </Card>
  );
}

function FeeRateRowCard({ rate }: { rate: FeeRateRow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pct, setPct] = useState(bpsToPct(rate.mdr_bps));
  const dirty = pctToBps(pct) !== rate.mdr_bps;

  const save = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/admin/fee-rates/${rate.id}`, { mdr_bps: pctToBps(pct) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-rates"] });
      toast({ title: "Fee rate updated" });
    },
    onError: (err: any) =>
      toast({ title: "Failed to save", description: err?.message ?? "", variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/fee-rates/${rate.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-rates"] });
      toast({ title: "Fee rate removed" });
    },
    onError: (err: any) =>
      toast({ title: "Failed to delete", description: err?.message ?? "", variant: "destructive" }),
  });

  return (
    <div
      className="border-2 border-black rounded-lg p-4 bg-white space-y-3"
      data-testid={`fee-rate-card-${rate.id}`}
    >
      <div className="min-w-0">
        <div className="font-extrabold text-lg tracking-tight truncate">{rate.label}</div>
        <div className="text-xs text-gray-600 flex items-center gap-1.5 mt-1 flex-wrap">
          <Badge variant="outline" className="border-black font-mono text-[10px]">
            {rate.payment_method}
          </Badge>
          {rate.qr_provider && (
            <Badge variant="outline" className="border-black font-mono text-[10px] flex items-center gap-1">
              <QrCode className="w-3 h-3" /> {rate.qr_provider}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label className="text-xs">Fee %</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              min="0"
              max="20"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              data-testid={`input-fee-rate-${rate.id}`}
            />
            <span className="font-bold">%</span>
          </div>
        </div>
        <Button
          size="sm"
          className="cuci-cta border-2 border-black"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          data-testid={`button-save-fee-rate-${rate.id}`}
        >
          <Save className="w-3 h-3 mr-1" /> Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-2 border-black text-red-600 hover:text-red-700"
          disabled={del.isPending}
          onClick={() => del.mutate()}
          data-testid={`button-delete-fee-rate-${rate.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// Key a payment method / fee rate by its exact (method, provider) pair. This is
// the SAME key the backend rate map uses, so two rows with the same key would
// collide. Used to hide already-configured gateways from the picker.
const feeKey = (method: string, provider: string | null) =>
  `${method}|${provider ?? ""}`;

// The automated website checkout records its sales under the reserved
// qr_provider 'pocket_pay' (tied to the Pocket Pay callback idempotency index),
// which can never exist as an owner-created payment_methods row. Expose it here
// as a virtual gateway so the owner can still set its MDR fee. It self-hides
// from the picker once a rate for it exists (see takenKeys below).
const WEB_POCKET_PAY_GATEWAY: PaymentMethodRow = {
  id: "__web_pocket_pay__",
  label: "Website cucixpress.com (Web Pocket QR)",
  method: "qr_code",
  qr_provider: "pocket_pay",
  is_active: true,
  sort_order: 0,
  is_system: true,
  created_at: "",
};

function FeeRateEditDialog({ existing, onClose }: { existing: FeeRateRow[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Pull the real, configured payment gateways. Each fee rate must link to ONE
  // specific gateway (e.g. "Progresif Ding!" vs "Pocket QR" — both qr_code but
  // with different providers and different fees), so the owner picks a concrete
  // gateway here instead of a generic method type + hand-typed provider code.
  const { data: pmData, isLoading: pmLoading } = useQuery<PaymentMethodListResp>({
    queryKey: ["/api/admin/payment-methods"],
  });

  // A gateway already covered by a fee rate would just produce a duplicate, so
  // hide it. Cash / bank transfer always have no fee, so they're hidden too.
  const takenKeys = new Set(existing.map((r) => feeKey(r.payment_method, r.qr_provider)));
  const options = [WEB_POCKET_PAY_GATEWAY, ...(pmData?.rows ?? [])]
    .filter((p) => p.method !== "cash" && p.method !== "bank_transfer")
    .filter((p) => !takenKeys.has(feeKey(p.method, p.qr_provider)));

  const [selectedId, setSelectedId] = useState("");
  const [pct, setPct] = useState("");

  const selected = options.find((p) => p.id === selectedId) ?? null;

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("no_method_selected");
      return apiRequest("POST", "/api/admin/fee-rates", {
        label: selected.label,
        payment_method: selected.method,
        qr_provider: selected.qr_provider,
        mdr_bps: pctToBps(pct),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fee-rates"] });
      toast({ title: "Fee rate created" });
      onClose();
    },
    onError: (err: any) => {
      const msg: string = err?.message ?? "";
      toast({
        title: "Failed to save",
        description: msg.includes("duplicate_rate")
          ? "A fee rate for that payment method already exists."
          : msg || "Check the form values",
        variant: "destructive",
      });
    },
  });

  const valid = !!selected && pct.trim().length > 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">New fee rate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Payment method</Label>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={pmLoading}>
              <SelectTrigger data-testid="select-fee-method">
                <SelectValue placeholder={pmLoading ? "Loading…" : "Choose a payment method"} />
              </SelectTrigger>
              <SelectContent>
                {options.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                    {p.qr_provider ? ` (${p.qr_provider})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!pmLoading && options.length === 0 && (
              <p className="text-[11px] text-gray-500 mt-1">
                Every payment method already has a fee rate. Edit an existing one
                instead, or add a new payment method first.
              </p>
            )}
            <p className="text-[10px] text-gray-500 mt-1">
              Each gateway is listed separately — e.g. Progresif Ding! and Pocket
              QR are both QR but charge different fees.
            </p>
          </div>
          <div>
            <Label>Fee %</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                max="20"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="2.7"
                data-testid="input-new-fee-pct"
              />
              <span className="font-bold">%</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-2 border-black" onClick={onClose} data-testid="button-cancel-fee-rate">
            Cancel
          </Button>
          <Button
            className="cuci-cta border-2 border-black"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-create-fee-rate"
          >
            <Save className="w-4 h-4 mr-1" />
            {save.isPending ? "Saving…" : "Create rate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describeError(err: any): string {
  const msg: string = err?.message ?? "";
  if (msg.includes("provider_required_for_qr")) return "A QR provider is required when the method is QR code.";
  if (msg.includes("method_provider_taken")) return "A payment method with that exact label already exists. Give this one a different label (e.g. \"Bank Transfer Baiduri\").";
  if (msg.includes("invalid_method")) return "That payment method type is not allowed.";
  if (msg.includes("pocket_pay")) return "The provider code 'pocket_pay' is reserved by the system. Pick a different name.";
  return msg || "Check the form values";
}

function DeleteButton({ method }: { method: PaymentMethodRow }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const del = useMutation({
    mutationFn: async (force: boolean) => {
      const url = force
        ? `/api/admin/payment-methods/${method.id}?force=1`
        : `/api/admin/payment-methods/${method.id}`;
      return apiRequest("DELETE", url);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      toast({ title: "Payment method removed" });
    },
    onError: (err: any) => {
      const msg: string = err?.message ?? "";
      if (msg.includes("409")) {
        if (msg.includes("system_locked")) {
          toast({
            title: "System method is locked",
            description: "This is a built-in payment method and cannot be hard-deleted.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Payment method is in use",
          description: "It is referenced by existing orders, so it can only be deactivated — not deleted.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Failed to delete",
        description: describeError(err),
        variant: "destructive",
      });
    },
  });

  return (
    <Button
      size="sm"
      variant="outline"
      className="border-2 border-black text-red-600 hover:text-red-700"
      disabled={del.isPending}
      onClick={() => del.mutate(!method.is_system && method.is_active === false)}
      data-testid={`button-delete-payment-method-${method.id}`}
    >
      <Trash2 className="w-3 h-3 mr-1" />
      {method.is_active ? "Deactivate" : method.is_system ? "Hide" : "Delete"}
    </Button>
  );
}

function PaymentMethodEditDialog({
  method,
  onClose,
}: {
  method: PaymentMethodRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCreate = method === null;
  const isSystem = method?.is_system ?? false;
  const [form, setForm] = useState<PaymentMethodForm>(
    method
      ? {
          label: method.label,
          method: method.method,
          qr_provider: method.qr_provider ?? "",
          is_active: method.is_active,
          sort_order: method.sort_order,
        }
      : EMPTY_FORM,
  );

  const isQr = form.method === "qr_code";
  // Track whether the owner manually typed a provider code. While untouched,
  // we keep it auto-synced to the label so adding a digital wallet only needs
  // a name + the "QR code" type.
  const [providerTouched, setProviderTouched] = useState(
    !!method?.qr_provider,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (isCreate) {
        const body = {
          label: form.label.trim(),
          method: form.method,
          qr_provider: isQr ? form.qr_provider.trim() : null,
          is_active: form.is_active,
          sort_order: form.sort_order,
        };
        return apiRequest("POST", "/api/admin/payment-methods", body);
      }
      const body: Record<string, unknown> = {
        label: form.label.trim(),
        is_active: form.is_active,
        sort_order: form.sort_order,
      };
      if (!isSystem) {
        body.method = form.method;
        body.qr_provider = isQr ? form.qr_provider.trim() : null;
      }
      return apiRequest("PATCH", `/api/admin/payment-methods/${method!.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payment-methods"] });
      toast({ title: isCreate ? "Payment method created" : "Payment method updated" });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save",
        description: describeError(err),
        variant: "destructive",
      });
    },
  });

  const set = <K extends keyof PaymentMethodForm>(k: K, v: PaymentMethodForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const providerValue = form.qr_provider.trim();
  const providerBlocked = isQr && providerValue === RESERVED_PROVIDER;
  const providerBadFormat =
    isQr && providerValue.length > 0 && !PROVIDER_CODE_RE.test(providerValue);
  const valid =
    form.label.trim().length > 0 &&
    (!isQr ||
      (providerValue.length > 0 && !providerBlocked && !providerBadFormat));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {isCreate ? "New payment method" : `Edit ${method!.label}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Label</Label>
            <Input
              value={form.label}
              onChange={(e) => {
                const label = e.target.value;
                setForm((f) => ({
                  ...f,
                  label,
                  qr_provider:
                    f.method === "qr_code" && !providerTouched
                      ? slugifyProvider(label)
                      : f.qr_provider,
                }));
              }}
              placeholder="Cash, Baiduri Transfer, Progresif Ding!…"
              data-testid="input-payment-label"
            />
          </div>

          <div>
            <Label>Method type</Label>
            <Select
              value={form.method}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  method: v,
                  qr_provider:
                    v === "qr_code" && !providerTouched
                      ? slugifyProvider(f.label)
                      : f.qr_provider,
                }))
              }
              disabled={isSystem}
            >
              <SelectTrigger data-testid="select-payment-method">
                <SelectValue placeholder="Select a method" />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={o.value}
                    data-testid={`select-payment-method-option-${o.value}`}
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSystem && (
              <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" /> System method — type & provider are locked.
              </p>
            )}
          </div>

          {isQr && (
            <div>
              <Label>Provider code</Label>
              <Input
                value={form.qr_provider}
                onChange={(e) => {
                  setProviderTouched(true);
                  set("qr_provider", e.target.value);
                }}
                placeholder="progresif_ding, pocket_pay_qr, baiduri_ms…"
                disabled={isSystem}
                data-testid="input-payment-qr-provider"
              />
              {providerBlocked ? (
                <p className="text-[10px] text-red-600 mt-1">
                  "pocket_pay" is reserved by the system. Pick a different name.
                </p>
              ) : providerBadFormat ? (
                <p className="text-[10px] text-red-600 mt-1">
                  Use lowercase letters, numbers and underscores only (e.g. progresif_ding).
                </p>
              ) : (
                <p className="text-[10px] text-gray-500 mt-1">
                  Filled in for you from the label. Leave it as-is unless your wallet provider gave you a specific code.
                </p>
              )}
            </div>
          )}

          <div>
            <Label>Sort order</Label>
            <Input
              type="number"
              value={String(form.sort_order)}
              onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
              placeholder="0"
              data-testid="input-payment-sort-order"
            />
            <p className="text-[10px] text-gray-500 mt-1">Lower numbers appear first in the POS dropdown.</p>
          </div>

          <div className="flex items-center justify-between border-2 border-black rounded p-3">
            <div>
              <Label className="text-base">Active</Label>
              <p className="text-xs text-gray-500">Inactive methods are hidden from the POS dropdown.</p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
              data-testid="switch-payment-active"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-2 border-black" onClick={onClose} data-testid="button-cancel-payment-method">
            Cancel
          </Button>
          <Button
            className="cuci-cta border-2 border-black"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-save-payment-method"
          >
            <Save className="w-4 h-4 mr-1" />
            {save.isPending ? "Saving…" : isCreate ? "Create method" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
