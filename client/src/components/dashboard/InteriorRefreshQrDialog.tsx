import { useEffect, useState } from "react";
import QRCodeLib from "qrcode";
import { CalendarCheck2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface InteriorRefreshVoucher {
  booking_id: string;
  plate: string;
  appointment_at: string;
  branch_name: string;
  period_end: string;
  claimed: boolean;
  qr_payload: string;
}

export function InteriorRefreshQrDialog({
  voucher,
  onClose,
}: {
  voucher: InteriorRefreshVoucher;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCodeLib.toDataURL(voucher.qr_payload, {
      width: 280,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((error) => console.error("[interior-refresh.qr] generation failed:", error));
    return () => {
      cancelled = true;
    };
  }, [voucher.qr_payload]);

  const appointment = new Date(voucher.appointment_at).toLocaleString("en-GB", {
    timeZone: "Asia/Brunei",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-2 border-black sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cuci-secondary" />
            Complimentary Interior Refresh
          </DialogTitle>
          <DialogDescription>
            Show this one-time code to the cashier at {voucher.branch_name} on your booked appointment day.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[280px] items-center justify-center py-4">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="One-time Interior Refresh QR code"
              width={280}
              height={280}
              className="rounded-md"
              data-testid="img-interior-refresh-qr"
            />
          ) : (
            <div className="text-xs text-gray-400">Generating QR…</div>
          )}
        </div>
        <div className="space-y-1 rounded-xl bg-purple-50 p-3 text-center text-sm text-gray-700">
          <p className="font-black tracking-wide">{voucher.plate}</p>
          <p className="flex items-center justify-center gap-1.5">
            <CalendarCheck2 className="h-4 w-4 text-cuci-primary" />
            {appointment}
          </p>
          <p className="text-xs text-gray-500">Single use · B$0 voucher</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="w-full border-2 border-black" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}