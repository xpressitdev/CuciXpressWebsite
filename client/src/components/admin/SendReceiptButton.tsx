import { useState } from "react";
import { SiWhatsapp } from "react-icons/si";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { receiptCaption, normalizeWaPhone } from "@/lib/receipt";
import type { OrderRow } from "@/components/dashboard/types";

interface ReceiptResponse {
  order: OrderRow;
  customer: { name: string | null; phone: string | null };
}

// WhatsApp "send receipt to customer" button for the admin tabs. Fetches the
// full receipt for the order, then opens a wa.me chat — addressed straight to
// the customer's number when we have one — pre-filled with the text receipt.
//
// We open a blank tab synchronously on click BEFORE the await so the popup
// survives the browser's non-user-gesture blocker, then point it at the
// wa.me URL once the receipt has loaded.
export function SendReceiptButton({
  orderId,
  size = "sm",
  variant = "outline",
  className,
}: {
  orderId: string;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default";
  className?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onClick = () => {
    if (loading) return;
    const win = window.open("about:blank", "_blank");
    setLoading(true);
    fetch(`/api/admin/orders/${orderId}/receipt`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as ReceiptResponse;
      })
      .then((data) => {
        const caption = receiptCaption(data.order);
        const intl = normalizeWaPhone(data.customer?.phone);
        const url = intl
          ? `https://wa.me/${intl}?text=${encodeURIComponent(caption)}`
          : `https://wa.me/?text=${encodeURIComponent(caption)}`;
        if (win) win.location.href = url;
        else window.open(url, "_blank", "noopener,noreferrer");
        if (!intl) {
          toast({
            title: "No phone on file",
            description:
              "Opened WhatsApp without a recipient — pick the customer's chat to send.",
          });
        }
      })
      .catch(() => {
        win?.close();
        toast({
          title: "Couldn't load receipt",
          description: "Please try again.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={onClick}
      disabled={loading}
      className={className}
      title="Send receipt to customer on WhatsApp"
      data-testid={`button-send-receipt-${orderId}`}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <SiWhatsapp className="w-4 h-4 text-emerald-600" />
      )}
      {size !== "icon" && <span className="ml-1.5">Receipt</span>}
    </Button>
  );
}
