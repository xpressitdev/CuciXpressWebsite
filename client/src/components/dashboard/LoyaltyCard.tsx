import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Gift, Check, Lock, Car } from "lucide-react";
import QRCodeLib from "qrcode";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { CarRow } from "./types";

interface PendingVoucher {
  order_id: string;
  payment_ref: string;
  created_at: string;
  plate: string;
  branch_name: string | null;
  qr_payload: string;
}

interface LoyaltyPlateCard {
  vehicle_id: number;
  plate: string;
  brand: string | null;
  model: string | null;
  stamps: number;
  raw_stamps: number;
  can_redeem: boolean;
  pending_voucher: PendingVoucher | null;
}

interface LoyaltyResp {
  package_id: string;
  package_name: string;
  reward_name: string;
  required: number;
  cards: LoyaltyPlateCard[];
}

interface Props {
  cars: CarRow[];
}

export function LoyaltyCard({ cars: _cars }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [voucherPlate, setVoucherPlate] = useState<string | null>(null);

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
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/customer/loyalty"] });
      qc.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      toast({
        title: "Free wash unlocked!",
        description: "Show the QR code at the lane to redeem.",
      });
      setVoucherPlate(variables.plate);
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

  const required = data.required;
  const cards = data.cards;
  const activeVoucher =
    voucherPlate != null
      ? cards.find((c) => c.plate === voucherPlate)?.pending_voucher ?? null
      : null;

  // Empty state — no cars claimed yet
  if (cards.length === 0) {
    return (
      <section
        className="cuci-card-soft p-5 border-2 border-black"
        data-testid="card-loyalty"
      >
        <div className="flex items-center gap-2 text-cuci-secondary">
          <Sparkles className="w-4 h-4" />
          <p className="text-[11px] uppercase tracking-wider font-bold">
            Loyalty reward
          </p>
        </div>
        <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-1">
          Collect 4 × B$12 receipts → 1 free wash (per car)
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          Add a vehicle to your garage to start collecting stamps. Every paid{" "}
          <strong>{data.package_name}</strong> on that plate counts.
        </p>
      </section>
    );
  }

  return (
    <>
      <section
        className="cuci-card-soft p-5 border-2 border-black"
        data-testid="card-loyalty"
      >
        <div className="flex items-center gap-2 text-cuci-secondary">
          <Sparkles className="w-4 h-4" />
          <p className="text-[11px] uppercase tracking-wider font-bold">
            Loyalty reward
          </p>
        </div>
        <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-1">
          Collect 4 × B$12 receipts → 1 free wash (per car)
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Every paid <strong>{data.package_name}</strong> earns a stamp for
          that plate. Stamps and free washes belong to the car, not the
          account.
        </p>

        <div className="mt-5 space-y-4">
          {cards.map((card) => (
            <PlateRow
              key={card.vehicle_id}
              card={card}
              required={required}
              redeeming={redeem.isPending}
              onRedeem={() => redeem.mutate({ plate: card.plate })}
              onShowVoucher={() => setVoucherPlate(card.plate)}
            />
          ))}
        </div>

        <p className="text-[11px] text-gray-500 mt-4">
          Receipts never expire. Drive into any Cuci Xpress branch — the
          branch that scans your QR adds the free wash to its queue.
        </p>
      </section>

      {activeVoucher && (
        <VoucherDialog
          open={voucherPlate != null}
          onClose={() => setVoucherPlate(null)}
          voucher={activeVoucher}
          packageName={data.reward_name}
        />
      )}
    </>
  );
}

function PlateRow({
  card, required, redeeming, onRedeem, onShowVoucher,
}: {
  card: LoyaltyPlateCard;
  required: number;
  redeeming: boolean;
  onRedeem: () => void;
  onShowVoucher: () => void;
}) {
  const stamps = card.stamps;
  const remain = Math.max(0, required - stamps);
  const hasVoucher = card.pending_voucher != null;
  const carLabel = [card.brand, card.model].filter(Boolean).join(" ");

  return (
    <div
      className="rounded-xl border-2 border-gray-200 p-4 bg-white"
      data-testid={`loyalty-plate-${card.plate}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Car className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="font-mono font-extrabold text-base tracking-wider">
              {card.plate}
            </span>
            {carLabel && (
              <span className="text-xs text-gray-500 truncate">
                · {carLabel}
              </span>
            )}
          </div>
          <p className="text-[12px] text-gray-600 mt-1">
            {hasVoucher
              ? "Free-wash QR ready — scan at any branch."
              : remain === 0
              ? "You've earned a free wash on this plate!"
              : `${remain} more paid B$12 wash${remain === 1 ? "" : "es"} to unlock.`}
          </p>
        </div>

        {hasVoucher ? (
          <Button
            onClick={onShowVoucher}
            size="sm"
            className="bg-cuci-secondary hover:bg-cuci-secondary/90 text-white border-2 border-black font-bold"
            data-testid={`button-show-voucher-${card.plate}`}
          >
            <Gift className="w-4 h-4 mr-2" /> Show QR
          </Button>
        ) : card.can_redeem ? (
          <Button
            onClick={onRedeem}
            disabled={redeeming}
            size="sm"
            className="bg-cuci-primary hover:bg-cuci-primary/90 text-white border-2 border-black font-bold"
            data-testid={`button-redeem-${card.plate}`}
          >
            <Gift className="w-4 h-4 mr-2" />
            {redeeming ? "Issuing…" : "Redeem free wash"}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-4 flex-wrap">
        <ProgressRing stamps={stamps} required={required} />
        <div className="flex-1 min-w-[160px]">
          <div className="grid grid-cols-4 gap-2 max-w-[220px]">
            {Array.from({ length: required }).map((_, i) => {
              const filled = i < stamps;
              return (
                <div
                  key={i}
                  className={[
                    "aspect-square rounded-lg border-2 flex items-center justify-center transition-colors",
                    filled
                      ? "bg-gradient-to-br from-purple-600 to-orange-500 text-white border-transparent shadow"
                      : "bg-white text-gray-300 border-dashed border-gray-300",
                  ].join(" ")}
                  data-testid={`loyalty-stamp-${card.plate}-${i}`}
                >
                  {filled ? <Check className="w-5 h-5" /> : <Lock className="w-3 h-3" />}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            {stamps} / {required} stamps on this plate
          </p>
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ stamps, required }: { stamps: number; required: number }) {
  const pct = required === 0 ? 0 : Math.min(1, stamps / required);
  const size = 90;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const remaining = Math.max(0, required - stamps);
  const done = remaining === 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="loyaltyRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#f3f4f6"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#loyaltyRing)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 700ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-xl font-black bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent leading-none">
            {stamps}
            <span className="text-sm text-gray-400">/{required}</span>
          </p>
          <p className="text-[9px] uppercase font-bold text-gray-500 mt-1 tracking-wider">
            {done ? "Free!" : `${remaining} to go`}
          </p>
        </div>
      </div>
    </div>
  );
}

function VoucherDialog({
  open, onClose, voucher, packageName,
}: {
  open: boolean;
  onClose: () => void;
  voucher: PendingVoucher;
  packageName: string;
}) {
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
            Show this code to staff at any Cuci Xpress branch. They'll
            scan it and queue your <strong>{packageName}</strong> for{" "}
            <strong className="font-mono">{voucher.plate}</strong>.
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
