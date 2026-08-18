import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tag, Plus, Pencil, Percent, BadgeDollarSign, ShoppingBag, Save, Trash2, Power,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type DiscountKind = "percent" | "fixed";

interface DiscountRow {
  id: string;
  name: string;
  kind: DiscountKind;
  value: number;
  only_package_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  order_count: number;
}

interface CatalogPackage {
  id: string;
  name: string;
  price_cents: number;
}

interface DiscountListResp {
  rows: DiscountRow[];
}

interface DiscountForm {
  name: string;
  kind: DiscountKind;
  value: string;
  only_package_id: string; // "" = any package
  is_active: boolean;
  sort_order: string;
}

const EMPTY_FORM: DiscountForm = {
  name: "",
  kind: "percent",
  value: "",
  only_package_id: "",
  is_active: true,
  sort_order: "0",
};

const formatBND = (cents: number) => `B$${(cents / 100).toFixed(2)}`;

export default function DiscountsTab() {
  const { data, isLoading, error } = useQuery<DiscountListResp>({
    queryKey: ["/api/admin/discounts"],
  });

  const rows = data?.rows ?? [];
  const [editing, setEditing] = useState<DiscountRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="cuci-card border-2 border-black">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="cuci-eyebrow">Checkout</div>
              <CardTitle className="text-2xl font-extrabold tracking-tight">
                <span className="text-cuci-primary">Discounts</span>
              </CardTitle>
              <p className="text-sm text-gray-600">
                Manage the checkout discounts that drive the POS — percentage or fixed B$ amounts.
              </p>
            </div>
            <Button
              className="cuci-cta border-2 border-black"
              onClick={() => setCreating(true)}
              data-testid="button-new-discount"
            >
              <Plus className="w-4 h-4 mr-1" /> New discount
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600">Failed to load discounts.</p>}
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-6 text-center">
              No discounts yet. Click "New discount" to add one.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {rows.map((d) => (
                <DiscountCard
                  key={d.id}
                  discount={d}
                  onEdit={() => setEditing(d)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editing && (
        <DiscountEditDialog
          discount={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Create dialog */}
      {creating && (
        <DiscountEditDialog
          discount={null}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function DiscountCard({
  discount,
  onEdit,
}: {
  discount: DiscountRow;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const d = discount;
  const canHardDelete = !d.is_active && d.order_count === 0;

  const softDelete = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/discounts/${d.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discounts"] });
      toast({ title: "Discount deactivated" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to deactivate",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    },
  });

  const hardDelete = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/discounts/${d.id}?force=1`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discounts"] });
      toast({ title: "Discount permanently deleted" });
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      if (msg.startsWith("409")) {
        toast({
          title: "Cannot delete",
          description: "This discount is in use by existing orders and can't be permanently removed.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Failed to delete",
        description: err?.message ?? "Try again",
        variant: "destructive",
      });
    },
  });

  return (
    <div
      className={`border-2 border-black rounded-lg p-4 bg-white space-y-3 ${d.is_active ? "" : "opacity-70"}`}
      data-testid={`discount-card-${d.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-extrabold text-lg tracking-tight flex items-center gap-2">
            <Tag className="w-4 h-4 text-cuci-primary" />
            <span className="truncate">{d.name}</span>
          </div>
          <div className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
            {d.kind === "percent" ? (
              <><Percent className="w-3 h-3" /> Percentage</>
            ) : (
              <><BadgeDollarSign className="w-3 h-3" /> Fixed amount</>
            )}
          </div>
        </div>
        <Badge className={d.is_active ? "bg-green-600 text-white" : "bg-gray-400 text-white"}>
          {d.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
          {d.kind === "percent" ? (
            <Percent className="w-3 h-3 text-gray-500" />
          ) : (
            <BadgeDollarSign className="w-3 h-3 text-gray-500" />
          )}
          <span>
            <strong>{d.kind === "percent" ? `${d.value}%` : formatBND(d.value)}</strong>
          </span>
        </div>
        <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
          <ShoppingBag className="w-3 h-3 text-gray-500" />
          <span><strong>{d.order_count.toLocaleString()}</strong> orders</span>
        </div>
      </div>
      {d.only_package_id && (
        <div className="text-xs text-gray-600 border border-gray-200 rounded p-2 flex items-center gap-2">
          <Tag className="w-3 h-3 text-gray-500" />
          <span>Locked to one package — cashiers can't apply it elsewhere.</span>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-2 border-black"
          onClick={onEdit}
          data-testid={`button-edit-discount-${d.id}`}
        >
          <Pencil className="w-3 h-3 mr-1" /> Edit
        </Button>
        {d.is_active && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-2 border-black"
            disabled={softDelete.isPending}
            onClick={() => softDelete.mutate()}
            data-testid={`button-deactivate-discount-${d.id}`}
          >
            <Power className="w-3 h-3 mr-1" /> Deactivate
          </Button>
        )}
        {canHardDelete && (
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 border-2 border-black"
            disabled={hardDelete.isPending}
            onClick={() => hardDelete.mutate()}
            data-testid={`button-delete-discount-${d.id}`}
          >
            <Trash2 className="w-3 h-3 mr-1" /> Delete permanently
          </Button>
        )}
      </div>
    </div>
  );
}

function DiscountEditDialog({
  discount,
  onClose,
}: {
  discount: DiscountRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCreate = discount === null;
  const [form, setForm] = useState<DiscountForm>(
    discount
      ? {
          name: discount.name,
          kind: discount.kind,
          value:
            discount.kind === "percent"
              ? String(discount.value)
              : (discount.value / 100).toFixed(2),
          only_package_id: discount.only_package_id ?? "",
          is_active: discount.is_active,
          sort_order: String(discount.sort_order),
        }
      : EMPTY_FORM,
  );

  // Package list for the "restrict to package" picker. Unfiltered catalog =
  // all active packages (branch filter only kicks in with a branch_id).
  const { data: catalogData } = useQuery<{ packages: CatalogPackage[] }>({
    queryKey: ["/api/pos/catalog"],
  });
  const catalogPackages = catalogData?.packages ?? [];

  const set = <K extends keyof DiscountForm>(k: K, v: DiscountForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const value =
        form.kind === "percent"
          ? Math.round(Number(form.value))
          : Math.round(Number(form.value) * 100);
      const body = {
        name: form.name.trim(),
        kind: form.kind,
        value,
        only_package_id: form.only_package_id || null,
        is_active: form.is_active,
        sort_order: Math.round(Number(form.sort_order)) || 0,
      };
      if (isCreate) {
        return apiRequest("POST", "/api/admin/discounts", body);
      }
      return apiRequest("PATCH", `/api/admin/discounts/${discount!.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discounts"] });
      toast({ title: isCreate ? "Discount created" : "Discount updated" });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save",
        description: err?.message ?? "Check the form values",
        variant: "destructive",
      });
    },
  });

  const numValue = Number(form.value);
  const valid =
    form.name.trim().length > 0 &&
    form.value.trim().length > 0 &&
    !Number.isNaN(numValue) &&
    (form.kind === "percent"
      ? numValue >= 1 && numValue <= 100
      : numValue >= 0);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {isCreate ? "New discount" : `Edit ${discount!.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Staff discount"
              data-testid="input-discount-name"
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select
              value={form.kind}
              onValueChange={(v) => set("kind", v as DiscountKind)}
            >
              <SelectTrigger data-testid="select-discount-kind">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent" data-testid="select-discount-kind-percent">
                  Percent
                </SelectItem>
                <SelectItem value="fixed" data-testid="select-discount-kind-fixed">
                  Fixed amount
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              {form.kind === "percent" ? "Value (%)" : "Amount (B$)"}
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              min={form.kind === "percent" ? 1 : 0}
              max={form.kind === "percent" ? 100 : undefined}
              step={form.kind === "percent" ? 1 : 0.01}
              value={form.value}
              onChange={(e) => set("value", e.target.value)}
              placeholder={form.kind === "percent" ? "20" : "5.00"}
              data-testid="input-discount-value"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              {form.kind === "percent"
                ? "Whole percent between 1 and 100."
                : "Amount in B$ — converted to cents when saved."}
            </p>
          </div>
          <div>
            <Label>Restrict to package</Label>
            <Select
              value={form.only_package_id || "any"}
              onValueChange={(v) => set("only_package_id", v === "any" ? "" : v)}
            >
              <SelectTrigger data-testid="select-discount-only-package">
                <SelectValue placeholder="Any package" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any package</SelectItem>
                {catalogPackages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-500 mt-1">
              When set, cashiers can only apply this discount to that exact package (e.g. a partner promo locked to one wash).
            </p>
          </div>
          <div>
            <Label>Sort order</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={form.sort_order}
              onChange={(e) => set("sort_order", e.target.value)}
              placeholder="0"
              data-testid="input-discount-sort-order"
            />
            <p className="text-[10px] text-gray-500 mt-1">Lower numbers appear first at checkout.</p>
          </div>
          <div className="flex items-center justify-between border-2 border-black rounded p-3">
            <div>
              <Label className="text-base">Active</Label>
              <p className="text-xs text-gray-500">Inactive discounts stay saved but won't show at checkout.</p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
              data-testid="switch-discount-active"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-2 border-black" onClick={onClose}>Cancel</Button>
          <Button
            className="cuci-cta border-2 border-black"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-save-discount"
          >
            <Save className="w-4 h-4 mr-1" />
            {save.isPending ? "Saving…" : isCreate ? "Create discount" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
