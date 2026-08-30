import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Car, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export interface CorrectableOrder {
  id: string;
  plate: string;
  customerName: string | null;
  createdAt: string;
  branchName: string;
  ticketCode: string;
  packageName: string;
}

interface VehicleSuggestion {
  id: number;
  license_plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  customer: { id: number; name: string; phone?: string } | null;
}

interface CorrectionPreview {
  order?: {
    plate?: string;
    vehicle_id?: number | null;
    customer_name?: string | null;
    customer_name_walkin?: string | null;
    created_at?: string;
    branch_name?: string | null;
    ticket_code?: string;
    package_name?: string;
  };
  old_plate?: string;
  customer?: { name?: string | null } | null;
  customer_name?: string | null;
  order_date?: string;
  branch?: { name?: string } | string | null;
  ticket?: string;
  package?: string;
  destination?: {
    license_plate?: string;
    customer_name?: string | null;
    customer_phone?: string | null;
  };
  customer_effect?: {
    old_customer_name?: string | null;
    new_customer_name?: string | null;
  };
  loyalty_effect?: {
    eligible_order_moves?: boolean;
    source_stamp_delta?: number;
    destination_stamp_delta?: number;
  };
  blocked?: {
    unsupported_status?: boolean;
    digitally_consumed?: boolean;
    active_physical_transfer?: boolean;
    membership_redemption?: boolean;
  };
}

interface CorrectionAudit {
  id: number;
  old_plate: string;
  new_plate: string;
  corrected_by_staff_name?: string | null;
  reason: string;
  corrected_at: string;
}

class CorrectionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function errorMessage(status: number, body: any): string {
  const detail = body?.message ?? body?.error?.message ?? body?.error ?? body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (status === 409) return "That plate conflicts with an existing vehicle. Select the existing car from the search results.";
  if (status === 400) return "The correction could not be applied. Check the plate and reason.";
  return "Could not correct the plate. Please try again.";
}

export function CorrectPlateDialog({ order }: { order: CorrectableOrder }) {
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState("");
  const [reason, setReason] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleSuggestion | null>(null);
  const [searchResults, setSearchResults] = useState<VehicleSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchedPlate, setSearchedPlate] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const normalizedPlate = plate.trim().toUpperCase();

  useEffect(() => {
    if (!open) return;
    setPlate("");
    setReason("");
    setSelectedVehicle(null);
    setSearchResults([]);
    setSearchedPlate("");
    setSubmitError(null);
  }, [open]);

  const exactMatch = useMemo(
    () => searchResults.find((vehicle) => vehicle.license_plate.trim().toUpperCase() === normalizedPlate),
    [searchResults, normalizedPlate],
  );
  const isNewPlate = !selectedVehicle && searchedPlate === normalizedPlate && !exactMatch;
  const previewTarget = selectedVehicle
    ? `vehicle_id=${selectedVehicle.id}`
    : isNewPlate
      ? `new_plate=${encodeURIComponent(normalizedPlate)}`
      : "";
  const preview = useQuery<CorrectionPreview>({
    queryKey: ["/api/admin/orders", order.id, "plate-correction-preview", previewTarget],
    enabled: open && previewTarget.length > 0,
    queryFn: async () => {
      const response = await fetch(`/api/admin/orders/${order.id}/plate-correction/preview?${previewTarget}`, {
        credentials: "include",
      });
      if (!response.ok) {
        let body: any = null;
        try { body = await response.json(); } catch { /* keep generic error */ }
        throw new CorrectionError(response.status, errorMessage(response.status, body));
      }
      return response.json();
    },
  });
  const audit = useQuery<{ corrections: CorrectionAudit[] }>({
    queryKey: ["/api/admin/orders", order.id, "plate-correction-audit"],
    enabled: open,
    queryFn: async () => {
      const response = await fetch(`/api/admin/orders/${order.id}/plate-correction`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not load correction history.");
      return response.json();
    },
  });

  useEffect(() => {
    if (!open || selectedVehicle || normalizedPlate.length < 1) {
      setSearchResults([]);
      setSearchedPlate("");
      return;
    }
    const requestedPlate = normalizedPlate;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/pos/vehicles/search?q=${encodeURIComponent(requestedPlate)}`,
          { credentials: "include" },
        );
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { vehicles?: VehicleSuggestion[] };
        setSearchResults(body.vehicles ?? []);
        setSearchedPlate(requestedPlate);
      } catch {
        setSearchResults([]);
        setSearchedPlate("");
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, normalizedPlate, selectedVehicle]);

  const unchanged = normalizedPlate === order.plate.trim().toUpperCase();

  const mutation = useMutation({
    mutationFn: async () => {
      const body = selectedVehicle
        ? {
            vehicle_id: selectedVehicle.id,
            reason: reason.trim(),
            expected_vehicle_id: preview.data?.order?.vehicle_id ?? null,
            expected_plate: preview.data?.order?.plate ?? order.plate,
          }
        : {
            new_plate: normalizedPlate,
            reason: reason.trim(),
            expected_vehicle_id: preview.data?.order?.vehicle_id ?? null,
            expected_plate: preview.data?.order?.plate ?? order.plate,
          };
      const response = await fetch(`/api/admin/orders/${order.id}/plate-correction`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        let responseBody: any = null;
        try { responseBody = await response.json(); } catch { /* keep status-specific error */ }
        throw new CorrectionError(response.status, errorMessage(response.status, responseBody));
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders", order.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/orders/${order.id}/receipt`] });
      toast({ title: "Plate corrected", description: `${order.plate} → ${normalizedPlate}` });
      setOpen(false);
    },
    onError: (error) => {
      setSubmitError(
        error instanceof CorrectionError
          ? error.message
          : "Could not correct the plate. Please try again.",
      );
    },
  });

  const details = preview.data;
  const detailOrder = details?.order;
  const branch = typeof details?.branch === "string" ? details.branch : details?.branch?.name;
  const displayDate = detailOrder?.created_at ?? details?.order_date ?? order.createdAt;
  const effect = details?.loyalty_effect?.eligible_order_moves
    ? "This qualifying wash moves from the old car's loyalty card to the new car's card (−1 old, +1 new). Its dashboard and visit history move with it."
    : "This order's dashboard and visit history move to the selected car. It does not currently contribute an available loyalty stamp.";
  const blocked = details?.blocked && Object.entries(details.blocked).some(([, value]) => value);
  const canSubmit =
    reason.trim().length >= 3 &&
    normalizedPlate.length > 0 &&
    !unchanged &&
    (selectedVehicle !== null || isNewPlate) &&
    !mutation.isPending &&
    !blocked;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-amber-700"
        onClick={() => setOpen(true)}
        data-testid={`button-correct-plate-${order.id}`}
      >
        <Pencil className="w-3.5 h-3.5 mr-1" />
        Correct plate
      </Button>

      <Dialog open={open} onOpenChange={(next) => !mutation.isPending && setOpen(next)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Correct order plate</DialogTitle>
            <DialogDescription>
              Search for the correct car, or enter a genuinely new plate. Review the history effect before confirming.
            </DialogDescription>
          </DialogHeader>

          {previewTarget && preview.isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : previewTarget && preview.error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {preview.error instanceof Error ? preview.error.message : "Could not load correction details."}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-gray-50 p-3 text-sm">
                <Detail label="Old plate" value={details?.old_plate ?? detailOrder?.plate ?? order.plate} mono />
                <Detail label="New plate" value={(selectedVehicle?.license_plate ?? normalizedPlate) || "—"} mono />
                <Detail
                  label="Current customer"
                  value={details?.customer_effect?.old_customer_name ?? details?.customer?.name ??
                    details?.customer_name ?? detailOrder?.customer_name ?? detailOrder?.customer_name_walkin ??
                    order.customerName ?? "Walk-in"}
                />
                <Detail
                  label="New customer"
                  value={details?.destination?.customer_name ?? details?.customer_effect?.new_customer_name ??
                    selectedVehicle?.customer?.name ?? "Walk-in / unregistered"}
                />
                <Detail label="Order date" value={new Date(displayDate).toLocaleString("en-GB", { timeZone: "Asia/Brunei" })} />
                <Detail label="Branch" value={branch ?? detailOrder?.branch_name ?? order.branchName} />
                <Detail label="Ticket" value={details?.ticket ?? detailOrder?.ticket_code ?? order.ticketCode} mono />
                <Detail label="Package" value={details?.package ?? detailOrder?.package_name ?? order.packageName} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`correct-plate-${order.id}`}>Correct plate</Label>
                <div className="relative">
                  <Input
                    id={`correct-plate-${order.id}`}
                    value={plate}
                    onChange={(event) => {
                      setPlate(event.target.value.toUpperCase());
                      setSelectedVehicle(null);
                      setSubmitError(null);
                    }}
                    placeholder="Search existing cars or type a new plate"
                    autoComplete="off"
                    data-testid="input-correct-plate"
                  />
                  {searching && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-gray-400" />}
                </div>
                {!selectedVehicle && searchResults.length > 0 && (
                  <div className="rounded-md border divide-y max-h-40 overflow-y-auto">
                    {searchResults.map((vehicle) => (
                      <button
                        type="button"
                        key={vehicle.id}
                        className="w-full p-2 text-left hover:bg-gray-50 text-sm"
                        onClick={() => {
                          setSelectedVehicle(vehicle);
                          setPlate(vehicle.license_plate);
                        }}
                        data-testid={`correct-plate-vehicle-${vehicle.id}`}
                      >
                        <span className="font-mono font-semibold">{vehicle.license_plate}</span>
                        <span className="ml-2 text-gray-500">
                          {[vehicle.brand, vehicle.model, vehicle.customer?.name].filter(Boolean).join(" · ") || "Car on file"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedVehicle && (
                  <p className="text-xs text-emerald-700 flex items-center gap-1">
                    <Car className="w-3 h-3" /> Existing car selected; history will be joined to this car.
                  </p>
                )}
                {isNewPlate && normalizedPlate && (
                  <p className="text-xs text-blue-700">No exact existing car found. A new plate record will be used.</p>
                )}
                {exactMatch && !selectedVehicle && (
                  <p className="text-xs text-amber-700">This plate already exists. Select it from the results instead of creating a duplicate.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`correct-reason-${order.id}`}>Reason (required)</Label>
                <Textarea
                  id={`correct-reason-${order.id}`}
                  value={reason}
                  onChange={(event) => { setReason(event.target.value); setSubmitError(null); }}
                  placeholder="Why is this correction needed?"
                  data-testid="input-correct-plate-reason"
                />
              </div>

              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Loyalty/history effect
                </div>
                <p className="mt-1 text-gray-700">{effect}</p>
                {blocked && (
                  <p className="mt-2 font-medium text-red-700">
                    This correction is blocked because its loyalty or membership state has already been consumed.
                  </p>
                )}
              </div>
              {submitError && (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {submitError}
                </p>
              )}
              {audit.data?.corrections && audit.data.corrections.length > 0 && (
                <div className="rounded-md border p-3">
                  <div className="text-sm font-semibold">Previous plate corrections</div>
                  <div className="mt-2 space-y-2">
                    {audit.data.corrections.map((entry) => (
                      <div key={entry.id} className="text-xs text-gray-700 border-t pt-2 first:border-t-0 first:pt-0">
                        <div>
                          <span className="font-mono font-semibold">{entry.old_plate}</span>
                          {" → "}
                          <span className="font-mono font-semibold">{entry.new_plate}</span>
                          {" · "}
                          {new Date(entry.corrected_at).toLocaleString("en-GB", { timeZone: "Asia/Brunei" })}
                        </div>
                        <div>{entry.corrected_by_staff_name ?? "Staff"} · {entry.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
            <Button
              onClick={() => { setSubmitError(null); mutation.mutate(); }}
              disabled={!canSubmit || !previewTarget || preview.isLoading || !!preview.error}
              data-testid="button-confirm-correct-plate"
            >
              {mutation.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Correcting…</> : "Confirm correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className={mono ? "font-mono font-medium" : "font-medium"}>{value || "—"}</div>
    </div>
  );
}