import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import QRCodeLib from "qrcode";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

export interface MembershipVoucher {
  order_id: string;
  payment_ref: string;
  branch_id: number | null;
  branch_name: string | null;
  plate: string;
  package_name: string;
  expires_at: string | null;
  qr_payload: string;
}

export function MembershipWashQrDialog({
  open, onClose, voucher,
}: {
  open: boolean;
  onClose: () => void;
  voucher: MembershipVoucher;
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
        console.error("[membership.wash] QR generation failed:", err);
      });
    return () => { cancelled = true; };
  }, [open, voucher.qr_payload]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="border-2 border-black sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-cuci-secondary" />
            Your Unlimited wash QR
          </DialogTitle>
          <DialogDescription>
            Show this code to staff at any Cuci Xpress branch. They'll
            scan it and queue your <strong>{voucher.package_name}</strong> wash
            for <strong className="font-mono">{voucher.plate}</strong> — free
            under your membership.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-4 min-h-[280px] items-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Unlimited wash QR code"
              width={280}
              height={280}
              className="rounded-md"
              data-testid="img-membership-qr"
            />
          ) : (
            <div className="text-xs text-gray-400">Generating QR…</div>
          )}
        </div>
        <div className="text-center text-xs text-gray-600 space-y-1">
          <div><strong>Plan:</strong> {voucher.package_name}</div>
          <div><strong>Plate:</strong> {voucher.plate}</div>
          <div data-testid="text-membership-validity">
            <strong>Valid until:</strong>{" "}
            {voucher.expires_at
              ? new Date(voucher.expires_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "No expiry"}
          </div>
          <div className="text-[10px] text-gray-400">
            ref {voucher.payment_ref}
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
