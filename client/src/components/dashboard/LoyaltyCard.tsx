import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Gift, Check, Lock } from "lucide-react";
import QRCodeLib from "qrcode";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CarRow } from "./types";

interface LoyaltyResp {
  package_id: string;
  package_name: string;
  required: number;
  stamps: number;
  can_redeem: boolean;
  eligible_orders: Array<{
    id: string; created_at: string; plate: string;
    total_cents: number; branch_name: string | null;
  }>;
  pending_voucher: null | {
    order_id: string;
    payment_ref: string;
    created_at: string;
    plate: string;
    branch_name: string | null;
    qr_payload: string;
  };
}

interface Props {
  cars: CarRow[];
}

export function LoyaltyCard({ cars }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showVoucher, setShowVoucher] = useState(false);
  const [plate, setPlate] = useState<string>("");

  const { data, isLoading } = useQuery<LoyaltyResp>({
    queryKey: ["/api/customer/loyalty"],
    refetchInterval: 60_000,
  });

  const redeem = useMutation({
    mutationFn: async (body: { plate: string }) => {
      const r = await apiRequest("POST", "/api/customer/loyalty/redeem", body);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "redeem_failed");
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customer/loyalty"] });
      qc.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      toast({
        title: "Free wash unlocked!",
        description: "Show the QR code at the lane to redeem.",
      });
      setOpen(false);
      setShowVoucher(true);
    },
    onError: (e: any) => {
      toast({
        title: "Could not redeem",
        description: e?.message ?? "Try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !data) return null;

  const stamps  = Math.min(data.stamps, data.required);
  const remain  = Math.max(0, data.required - data.stamps);
  const hasVoucher = data.pending_voucher != null;

  return (
    <>
      <section
        className="cuci-card-soft p-5 border-2 border-black"
        data-testid="card-loyalty"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-cuci-secondary">
              <Sparkles className="w-4 h-4" />
              <p className="text-[11px] uppercase tracking-wider font-bold">
                Loyalty reward
              </p>
            </div>
            <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-1">
              Collect 4 × B$12 receipts → 1 free wash
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Every paid <strong>{data.package_name}</strong> counts as a stamp.
              {remain > 0 && (
                <> {remain} more to unlock your free wash.</>
              )}
              {remain === 0 && !hasVoucher && (
                <> You've earned a free wash — claim it now!</>
              )}
              {hasVoucher && (
                <> Your free-wash QR is ready to scan at the lane.</>
              )}
            </p>
          </div>

          {hasVoucher ? (
            <Button
              onClick={() => setShowVoucher(true)}
              className="bg-cuci-secondary hover:bg-cuci-secondary/90 text-white border-2 border-black font-bold"
              data-testid="button-show-voucher"
            >
              <Gift className="w-4 h-4 mr-2" /> Show free-wash QR
            </Button>
          ) : data.can_redeem ? (
            <Button
              onClick={() => {
                setPlate(cars[0]?.license_plate ?? "");
                setOpen(true);
              }}
              className="bg-cuci-primary hover:bg-cuci-primary/90 text-white border-2 border-black font-bold"
              data-testid="button-redeem-loyalty"
            >
              <Gift className="w-4 h-4 mr-2" /> Redeem free wash
            </Button>
          ) : null}
        </div>

        {/* Stamps row */}
        <div className="mt-4 grid grid-cols-4 gap-2 max-w-md">
          {Array.from({ length: data.required }).map((_, i) => {
            const filled = i < stamps;
            return (
              <div
                key={i}
                className={[
                  "aspect-square rounded-lg border-2 flex items-center justify-center transition-colors",
                  filled
                    ? "bg-cuci-primary text-white border-cuci-primary"
                    : "bg-white text-gray-300 border-dashed border-gray-300",
                ].join(" ")}
                data-testid={`loyalty-stamp-${i}`}
              >
                {filled ? <Check className="w-7 h-7" /> : <Lock className="w-5 h-5" />}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {stamps} / {data.required} stamps · receipts never expire
        </p>
      </section>

      {/* Redeem modal */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-2 border-black">
          <DialogHeader>
            <DialogTitle>Redeem your free wash</DialogTitle>
            <DialogDescription>
              We'll consume 4 of your B$12 receipts and issue a QR voucher.
              Show the QR at the lane on your next visit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-gray-600">
                Vehicle
              </label>
              <Select value={plate} onValueChange={setPlate}>
                <SelectTrigger
                  className="border-2 border-black"
                  data-testid="select-redeem-plate"
                >
                  <SelectValue placeholder="Pick a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {cars.map((c) => (
                    <SelectItem key={c.id} value={c.license_plate}>
                      {c.license_plate}
                      {c.brand ? ` · ${c.brand}${c.model ? ` ${c.model}` : ""}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-500 mt-2">
                Drive into any Cuci Xpress branch and show the QR — the lane
                that scans you adds your free wash to its queue.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="border-2 border-black"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!plate || redeem.isPending}
              onClick={() => redeem.mutate({ plate })}
              className="bg-cuci-primary text-white border-2 border-black font-bold"
              data-testid="button-confirm-redeem"
            >
              {redeem.isPending ? "Issuing…" : "Confirm & get QR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voucher viewer */}
      {data.pending_voucher && (
        <VoucherDialog
          open={showVoucher}
          onClose={() => setShowVoucher(false)}
          voucher={data.pending_voucher}
          packageName={data.package_name}
        />
      )}
    </>
  );
}

function VoucherDialog({
  open, onClose, voucher, packageName,
}: {
  open: boolean;
  onClose: () => void;
  voucher: NonNullable<LoyaltyResp["pending_voucher"]>;
  packageName: string;
}) {
  // Render QR as a data-URL <img> instead of drawing into a canvas ref.
  // Radix Dialog mounts its content through a portal after a tick, so the
  // canvasRef-based approach silently no-op'd on first open (the effect
  // fired before the canvas was in the DOM, and never re-ran).
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCodeLib.toDataURL(voucher.qr_payload, {
      width: 280,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => { if (!cancelled) setQrDataUrl(url); })
      .catch((err) => {
        console.error("[loyalty.voucher] QR generation failed:", err);
      });
    return () => { cancelled = true; };
  }, [open, voucher.qr_payload]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="border-2 border-black sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-cuci-secondary" />
            Your free wash QR
          </DialogTitle>
          <DialogDescription>
            Show this code to staff at the lane. They'll scan it and queue
            your <strong>{packageName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4 min-h-[280px] items-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Free wash QR code"
              width={280}
              height={280}
              className="rounded-md"
              data-testid="img-voucher-qr"
            />
          ) : (
            <div className="text-xs text-gray-400">Generating QR…</div>
          )}
        </div>
        <div className="text-center text-xs text-gray-600 space-y-1">
          <div><strong>Plate:</strong> {voucher.plate}</div>
          <div><strong>Issued at:</strong> {voucher.branch_name ?? "—"}</div>
          <div className="text-[10px] text-gray-400">
            Valid until used · ref {voucher.payment_ref}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="border-2 border-black w-full"
            onClick={onClose}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
