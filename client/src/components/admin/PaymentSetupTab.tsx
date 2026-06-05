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
  { value: "qr_code", label: "QR code" },
  { value: "baiduri_pay", label: "Baiduri Pay" },
  { value: "quick_pay", label: "Quick Pay" },
  { value: "subscription", label: "Subscription" },
  { value: "voucher", label: "Voucher" },
];

const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((o) => [o.value, o.label]),
);

const RESERVED_PROVIDER = "pocket_pay";

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

function describeError(err: any): string {
  const msg: string = err?.message ?? "";
  if (msg.includes("provider_required_for_qr")) return "A QR provider is required when the method is QR code.";
  if (msg.includes("method_provider_taken")) return "That method + provider combination already exists.";
  if (msg.includes("invalid_method")) return "That payment method type is not allowed.";
  if (msg.includes("pocket_pay")) return "The provider value 'pocket_pay' is reserved. Try pocket_pay_qr or pocket_pay_invoice.";
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

  const providerBlocked = isQr && form.qr_provider.trim() === RESERVED_PROVIDER;
  const valid =
    form.label.trim().length > 0 &&
    (!isQr || (form.qr_provider.trim().length > 0 && !providerBlocked));

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
              onChange={(e) => set("label", e.target.value)}
              placeholder="Cash, Baiduri Transfer, Pocket Pay QR…"
              data-testid="input-payment-label"
            />
          </div>

          <div>
            <Label>Method type</Label>
            <Select
              value={form.method}
              onValueChange={(v) => set("method", v)}
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
              <Label>QR provider</Label>
              <Input
                value={form.qr_provider}
                onChange={(e) => set("qr_provider", e.target.value)}
                placeholder="pocket_pay_qr, pocket_pay_invoice, baiduri_ms…"
                disabled={isSystem}
                data-testid="input-payment-qr-provider"
              />
              {providerBlocked ? (
                <p className="text-[10px] text-red-600 mt-1">
                  "pocket_pay" is reserved. Use pocket_pay_qr, pocket_pay_invoice, or baiduri_ms.
                </p>
              ) : (
                <p className="text-[10px] text-gray-500 mt-1">
                  Required for QR. Suggestions: pocket_pay_qr, pocket_pay_invoice, baiduri_ms.
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
