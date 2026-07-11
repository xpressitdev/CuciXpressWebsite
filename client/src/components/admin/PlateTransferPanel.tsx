// ============================================================
// PlateTransferPanel — owner-only tool inside the Customers tab.
//
// Problem it solves: a customer WhatsApps "this plate is mine" because
// the plate was claimed by someone else (often a branch shell account
// that bulk-added walk-in cars). The owner can look up who currently
// holds the plate and transfer the car — with all its wash history —
// to the right customer, or detach it back to unclaimed so the
// customer can add it themselves from their dashboard.
// ============================================================

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Search, Car as CarIcon, ArrowRightLeft, Unlink, Loader2, Mail, Phone,
  User, AlertTriangle,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PlateLookupResp {
  found: boolean;
  plate?: string;
  car?: {
    id: number;
    license_plate: string;
    brand: string | null;
    model: string | null;
    color: string | null;
    vip_tier: string | null;
    wash_count: number;
    last_visit_at: string | null;
  };
  holder?: {
    user_id: number | null;
    customer_id: number | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

interface TargetRow {
  id: number;
  kind: "customer" | "ghost";
  name: string;
  phone: string | null;
  has_account: boolean;
  plates: string | null;
}

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Brunei",
      })
    : "—";

export default function PlateTransferPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [plateInput, setPlateInput] = useState("");
  const [lookupPlate, setLookupPlate] = useState<string | null>(null);

  const [targetSearch, setTargetSearch] = useState("");
  const [debouncedTarget, setDebouncedTarget] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<TargetRow | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detachOpen, setDetachOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTarget(targetSearch), 300);
    return () => clearTimeout(t);
  }, [targetSearch]);

  const lookup = useQuery<PlateLookupResp>({
    queryKey: ["/api/admin/plate-ownership", lookupPlate],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/plate-ownership?plate=${encodeURIComponent(lookupPlate!)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Lookup failed");
      return res.json();
    },
    enabled: !!lookupPlate,
  });

  const targets = useQuery<{ rows: TargetRow[] }>({
    queryKey: ["/api/admin/customers", { search: debouncedTarget, forPlateTransfer: true }],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/customers?search=${encodeURIComponent(debouncedTarget)}&per_page=10`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: debouncedTarget.trim().length >= 2,
  });

  const car = lookup.data?.found ? lookup.data.car : undefined;
  const holder = lookup.data?.found ? lookup.data.holder : undefined;

  const resetAfterChange = () => {
    setConfirmOpen(false);
    setDetachOpen(false);
    setSelectedTarget(null);
    setTargetSearch("");
    queryClient.invalidateQueries({ queryKey: ["/api/admin/plate-ownership", lookupPlate] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/customers/stats"] });
  };

  const transfer = useMutation({
    mutationFn: async (targetCustomerId: number | null) => {
      const res = await apiRequest("POST", "/api/admin/plate-transfer", {
        car_id: car!.id,
        target_customer_id: targetCustomerId,
      });
      return res.json();
    },
    onSuccess: (_data, targetCustomerId) => {
      toast({
        title: targetCustomerId === null ? "Plate detached" : "Plate transferred",
        description:
          targetCustomerId === null
            ? `${car?.license_plate} is now unclaimed — the customer can add it from their dashboard.`
            : `${car?.license_plate} now belongs to ${selectedTarget?.name}.`,
      });
      resetAfterChange();
    },
    onError: (err: any) => {
      toast({
        title: "Transfer failed",
        description: String(err?.message ?? err),
        variant: "destructive",
      });
    },
  });

  const doLookup = () => {
    const p = plateInput.trim();
    if (!p) return;
    setSelectedTarget(null);
    setTargetSearch("");
    setLookupPlate(p);
  };

  return (
    <Card className="border-2 border-purple-300 bg-purple-50/40 dark:bg-purple-950/20 dark:border-purple-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightLeft className="w-4 h-4 text-purple-600" />
          Plate Ownership Transfer
          <Badge variant="outline" className="ml-1 text-[10px] uppercase tracking-wide border-purple-400 text-purple-700 dark:text-purple-300">
            Owner only
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Look up who currently claimed a plate, then transfer the car (wash history follows it)
          to the right customer — or detach it so they can claim it themselves.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1 — plate lookup */}
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={plateInput}
              onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && doLookup()}
              placeholder="Plate e.g. KG2151"
              className="pl-8 font-mono uppercase"
              data-testid="input-plate-lookup"
            />
          </div>
          <Button onClick={doLookup} disabled={!plateInput.trim() || lookup.isFetching} data-testid="button-plate-lookup">
            {lookup.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Look up"}
          </Button>
        </div>

        {lookup.isError && (
          <p className="text-sm text-destructive">Could not look up that plate. Try again.</p>
        )}

        {lookup.data && !lookup.data.found && (
          <p className="text-sm text-muted-foreground" data-testid="text-plate-not-found">
            No car found with plate <span className="font-mono font-semibold">{lookup.data.plate}</span>.
          </p>
        )}

        {car && (
          <div className="grid gap-3 @[700px]:grid-cols-2">
            {/* Car + current holder */}
            <div className="rounded-lg border bg-background p-3 space-y-2" data-testid="card-plate-result">
              <div className="flex items-center gap-2">
                <CarIcon className="w-4 h-4 text-muted-foreground" />
                <span className="font-mono font-bold">{car.license_plate}</span>
                <span className="text-sm text-muted-foreground">
                  {[car.brand, car.model].filter(Boolean).join(" ").trim() || "Unknown vehicle"}
                  {car.color ? ` · ${car.color}` : ""}
                </span>
                {car.vip_tier && (
                  <Badge variant="outline" className="text-[10px] uppercase">{car.vip_tier}</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {car.wash_count} wash{car.wash_count === 1 ? "" : "es"} · last visit {fmtDate(car.last_visit_at)}
              </p>
              <div className="pt-1 border-t">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Currently claimed by
                </p>
                {holder ? (
                  <div className="space-y-0.5 text-sm" data-testid="text-current-holder">
                    <p className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{holder.name || "Unnamed account"}</span>
                    </p>
                    {holder.email && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5" /> {holder.email}
                      </p>
                    )}
                    {holder.phone && (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" /> {holder.phone}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="text-unclaimed">
                    Nobody — this plate is unclaimed. The customer can add it from their own dashboard.
                  </p>
                )}
              </div>
              {holder && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={() => setDetachOpen(true)}
                  data-testid="button-detach-plate"
                >
                  <Unlink className="w-3.5 h-3.5 mr-1.5" /> Detach (make unclaimed)
                </Button>
              )}
            </div>

            {/* Transfer target */}
            <div className="rounded-lg border bg-background p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Transfer to
              </p>
              <Input
                value={targetSearch}
                onChange={(e) => {
                  setTargetSearch(e.target.value);
                  setSelectedTarget(null);
                }}
                placeholder="Search customer by name, phone or plate…"
                data-testid="input-transfer-target"
              />
              {targets.isFetching && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Searching…
                </p>
              )}
              {debouncedTarget.trim().length >= 2 && targets.data && (
                <div className="max-h-44 overflow-y-auto divide-y rounded border">
                  {targets.data.rows.filter((r) => r.kind === "customer").length === 0 && (
                    <p className="p-2 text-xs text-muted-foreground">No matching customers.</p>
                  )}
                  {targets.data.rows
                    .filter((r) => r.kind === "customer")
                    .map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedTarget(r)}
                        className={`w-full text-left p-2 text-sm hover:bg-muted/60 ${
                          selectedTarget?.id === r.id ? "bg-purple-100 dark:bg-purple-900/40" : ""
                        }`}
                        data-testid={`row-target-${r.id}`}
                      >
                        <span className="font-medium">{r.name}</span>
                        {r.has_account && (
                          <Badge variant="outline" className="ml-1.5 text-[9px] uppercase">account</Badge>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {r.phone || "no phone"}
                          {r.plates ? ` · ${r.plates}` : ""}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              <Button
                className="w-full"
                disabled={!selectedTarget || transfer.isPending}
                onClick={() => setConfirmOpen(true)}
                data-testid="button-transfer-plate"
              >
                <ArrowRightLeft className="w-4 h-4 mr-1.5" />
                Transfer {car.license_plate}
                {selectedTarget ? ` to ${selectedTarget.name}` : ""}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Confirm transfer */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Confirm transfer
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <p>
              Move <span className="font-mono font-bold">{car?.license_plate}</span>
              {car?.brand ? ` (${[car.brand, car.model].filter(Boolean).join(" ").trim()})` : ""} from{" "}
              <span className="font-medium">{holder?.name || holder?.email || "current holder"}</span> to{" "}
              <span className="font-medium">{selectedTarget?.name}</span>?
            </p>
            <p className="text-muted-foreground text-xs">
              All {car?.wash_count ?? 0} wash records and loyalty history follow the car to the new owner.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={() => transfer.mutate(selectedTarget!.id)}
              disabled={transfer.isPending}
              data-testid="button-confirm-transfer"
            >
              {transfer.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Yes, transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm detach */}
      <Dialog open={detachOpen} onOpenChange={setDetachOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Detach plate
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2">
            <p>
              Remove <span className="font-mono font-bold">{car?.license_plate}</span> from{" "}
              <span className="font-medium">{holder?.name || holder?.email || "current holder"}</span>{" "}
              and make it unclaimed?
            </p>
            <p className="text-muted-foreground text-xs">
              The rightful customer can then add this plate from their own dashboard and it will
              link automatically with all wash history intact.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetachOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => transfer.mutate(null)}
              disabled={transfer.isPending}
              data-testid="button-confirm-detach"
            >
              {transfer.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Yes, detach
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
