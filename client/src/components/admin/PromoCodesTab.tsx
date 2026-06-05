import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tag, Plus, Pencil, Percent, DollarSign, Save, Trash2, CalendarClock, Hash,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PromoKind = "percent" | "fixed";

interface PromoRow {
  id: string;
  code: string;
  kind: PromoKind;
  value: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  created_at: string;
}

interface PromoListResp {
  rows: PromoRow[];
}

interface PromoForm {
  code: string;
  kind: PromoKind;
  value: string;
  is_active: boolean;
  starts_at: string;
  expires_at: string;
  max_uses: string;
}

const EMPTY_FORM: PromoForm = {
  code: "",
  kind: "percent",
  value: "",
  is_active: true,
  starts_at: "",
  expires_at: "",
  max_uses: "",
};

const formatBND = (cents: number) => `B$${(cents / 100).toFixed(2)}`;

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatWindow(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function promoValueLabel(row: PromoRow): string {
  return row.kind === "percent" ? `${row.value}% off` : `${formatBND(row.value)} off`;
}

export default function PromoCodesTab() {
  const { data, isLoading, error } = useQuery<PromoListResp>({
    queryKey: ["/api/admin/promo-codes"],
  });

  const rows = data?.rows ?? [];
  const [editing, setEditing] = useState<PromoRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="cuci-card border-2 border-black">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="cuci-eyebrow">Checkout</div>
              <CardTitle className="text-2xl font-extrabold tracking-tight">
                <span className="text-cuci-primary">Promo codes</span>
              </CardTitle>
              <p className="text-sm text-gray-600">
                Codes customers enter at POS checkout — percentage or fixed discounts, optional active window and usage cap.
              </p>
            </div>
            <Button
              className="cuci-cta border-2 border-black"
              onClick={() => setCreating(true)}
              data-testid="button-new-promo"
            >
              <Plus className="w-4 h-4 mr-1" /> New promo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600">Failed to load promo codes.</p>}
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-6 text-center">
              No promo codes yet. Click "New promo" to add one.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {rows.map((p) => (
                <PromoCard
                  key={p.id}
                  promo={p}
                  onEdit={() => setEditing(p)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editing && (
        <PromoEditDialog
          promo={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Create dialog */}
      {creating && (
        <PromoEditDialog
          promo={null}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function PromoCard({
  promo,
  onEdit,
}: {
  promo: PromoRow;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const usageLabel = promo.max_uses == null
    ? `${promo.used_count} used`
    : `${promo.used_count} / ${promo.max_uses} used`;

  const canForceDelete = !promo.is_active && promo.used_count === 0;

  const del = useMutation({
    mutationFn: async (force: boolean) => {
      const url = force
        ? `/api/admin/promo-codes/${promo.id}?force=1`
        : `/api/admin/promo-codes/${promo.id}`;
      return apiRequest("DELETE", url);
    },
    onSuccess: (_res, force) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: force ? "Promo permanently deleted" : "Promo deactivated" });
    },
    onError: (err: any) => {
      const msg: string = err?.message ?? "";
      if (msg.includes("in_use")) {
        let orderCount: number | undefined;
        try {
          const json = JSON.parse(msg.slice(msg.indexOf("{")));
          orderCount = json?.order_count;
        } catch {
          /* ignore */
        }
        toast({
          title: "Can't delete this promo",
          description: orderCount != null
            ? `It's been used on ${orderCount} order(s). Deactivate it instead.`
            : "It's already been used on orders. Deactivate it instead.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Failed to delete",
        description: msg || "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div
      className={`border-2 border-black rounded-lg p-4 bg-white space-y-3 ${promo.is_active ? "" : "opacity-70"}`}
      data-testid={`promo-card-${promo.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-extrabold text-lg tracking-tight flex items-center gap-2">
            <Tag className="w-4 h-4 text-cuci-primary" />
            <span className="font-mono">{promo.code}</span>
          </div>
          <div className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
            {promo.kind === "percent" ? (
              <Percent className="w-3 h-3" />
            ) : (
              <DollarSign className="w-3 h-3" />
            )}
            <span>{promoValueLabel(promo)}</span>
          </div>
        </div>
        <Badge className={promo.is_active ? "bg-green-600 text-white" : "bg-gray-400 text-white"}>
          {promo.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
          <CalendarClock className="w-3 h-3 text-gray-500" />
          <span className="truncate">Starts {formatWindow(promo.starts_at)}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
          <CalendarClock className="w-3 h-3 text-gray-500" />
          <span className="truncate">Ends {formatWindow(promo.expires_at)}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 flex items-center gap-2 col-span-2">
          <Hash className="w-3 h-3 text-gray-500" />
          <span><strong>{usageLabel}</strong></span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-2 border-black"
          onClick={onEdit}
          data-testid={`button-edit-promo-${promo.id}`}
        >
          <Pencil className="w-3 h-3 mr-1" /> Edit
        </Button>
        {promo.is_active ? (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-2 border-black"
            disabled={del.isPending}
            onClick={() => del.mutate(false)}
            data-testid={`button-deactivate-promo-${promo.id}`}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Deactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-2 border-black text-red-600 hover:text-red-700"
            disabled={!canForceDelete || del.isPending}
            onClick={() => del.mutate(true)}
            data-testid={`button-delete-promo-${promo.id}`}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function PromoEditDialog({
  promo,
  onClose,
}: {
  promo: PromoRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCreate = promo === null;
  const [form, setForm] = useState<PromoForm>(
    promo
      ? {
          code: promo.code,
          kind: promo.kind,
          value: promo.kind === "percent"
            ? String(promo.value)
            : (promo.value / 100).toFixed(2),
          is_active: promo.is_active,
          starts_at: isoToLocalInput(promo.starts_at),
          expires_at: isoToLocalInput(promo.expires_at),
          max_uses: promo.max_uses == null ? "" : String(promo.max_uses),
        }
      : EMPTY_FORM,
  );

  const set = <K extends keyof PromoForm>(k: K, v: PromoForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const valueNum = form.kind === "percent"
        ? Math.round(Number(form.value))
        : Math.round(Number(form.value) * 100);
      const maxUses = form.max_uses.trim() === ""
        ? null
        : Math.round(Number(form.max_uses));
      const body = {
        code: form.code.trim().toUpperCase(),
        kind: form.kind,
        value: valueNum,
        is_active: form.is_active,
        starts_at: localInputToIso(form.starts_at),
        expires_at: localInputToIso(form.expires_at),
        max_uses: maxUses,
      };
      if (isCreate) {
        return apiRequest("POST", "/api/admin/promo-codes", body);
      }
      return apiRequest("PATCH", `/api/admin/promo-codes/${promo!.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      toast({ title: isCreate ? "Promo created" : "Promo updated" });
      onClose();
    },
    onError: (err: any) => {
      const msg: string = err?.message ?? "";
      if (msg.includes("code_taken")) {
        toast({
          title: "Code already in use",
          description: "Pick a different promo code.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Failed to save",
        description: msg || "Check the form values",
        variant: "destructive",
      });
    },
  });

  const valueNum = Number(form.value);
  const valueValid = form.kind === "percent"
    ? Number.isFinite(valueNum) && valueNum >= 1 && valueNum <= 100
    : Number.isFinite(valueNum) && valueNum > 0;
  const maxUsesValid = form.max_uses.trim() === ""
    || (Number.isFinite(Number(form.max_uses)) && Number(form.max_uses) > 0);
  const windowValid = !form.starts_at || !form.expires_at
    || new Date(form.starts_at).getTime() <= new Date(form.expires_at).getTime();

  const valid =
    form.code.trim().length > 0 &&
    valueValid &&
    maxUsesValid &&
    windowValid;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {isCreate ? "New promo" : `Edit ${promo!.code}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Code</Label>
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              className="font-mono"
              data-testid="input-promo-code"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => set("kind", v as PromoKind)}
              >
                <SelectTrigger data-testid="select-promo-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent" data-testid="select-promo-kind-percent">Percent (%)</SelectItem>
                  <SelectItem value="fixed" data-testid="select-promo-kind-fixed">Fixed (B$)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.kind === "percent" ? "Percent off" : "Amount off (B$)"}</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={form.kind === "percent" ? 1 : 0}
                max={form.kind === "percent" ? 100 : undefined}
                step={form.kind === "percent" ? 1 : 0.01}
                value={form.value}
                onChange={(e) => set("value", e.target.value)}
                placeholder={form.kind === "percent" ? "10" : "5.00"}
                data-testid="input-promo-value"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Starts at</Label>
              <Input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => set("starts_at", e.target.value)}
                data-testid="input-promo-starts-at"
              />
            </div>
            <div>
              <Label>Expires at</Label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => set("expires_at", e.target.value)}
                data-testid="input-promo-expires-at"
              />
            </div>
          </div>
          {!windowValid && (
            <p className="text-[10px] text-red-600">Expiry must be after the start time.</p>
          )}
          <div>
            <Label>Max uses</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.max_uses}
              onChange={(e) => set("max_uses", e.target.value)}
              placeholder="Leave blank for unlimited"
              data-testid="input-promo-max-uses"
            />
            <p className="text-[10px] text-gray-500 mt-1">Blank = unlimited uses.</p>
          </div>
          <div className="flex items-center justify-between border-2 border-black rounded p-3">
            <div>
              <Label className="text-base">Active</Label>
              <p className="text-xs text-gray-500">Inactive promos are rejected at checkout but keep their history.</p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
              data-testid="switch-promo-active"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-2 border-black" onClick={onClose}>Cancel</Button>
          <Button
            className="cuci-cta border-2 border-black"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-save-promo"
          >
            <Save className="w-4 h-4 mr-1" />
            {save.isPending ? "Saving…" : isCreate ? "Create promo" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
