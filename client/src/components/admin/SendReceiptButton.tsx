import { useState } from "react";
import { SiWhatsapp } from "react-icons/si";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  receiptCaption,
  normalizeWaPhone,
  buildReceiptPdfBlob,
} from "@/lib/receipt";
import { OrderRow, shortReceiptId } from "@/components/dashboard/types";

interface ReceiptResponse {
  order: OrderRow;
  customer: { name: string | null; phone: string | null };
}

// WhatsApp "send receipt to customer" button for the admin tabs.
//
// Sending an actual file (the PDF receipt) over WhatsApp is only possible
// through the device's native share sheet — a wa.me link can ONLY carry text,
// never an attachment. So:
//   • On phones/tablets (and Macs) that support file sharing, we build the PDF
//     and hand it to the OS share sheet, where the sender picks the customer's
//     WhatsApp chat. This sends the real PDF.
//   • On desktops that can't share files via the browser — and as a fallback
//     when the share sheet errors — we download the PDF and open the customer's
//     WhatsApp chat (pre-filled with the text receipt) so the sender can attach
//     the just-downloaded PDF.
//
// We reserve a popup tab synchronously from the click for that chat fallback,
// because a window.open() issued AFTER the fetch/PDF awaits would be blocked.
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

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

  const onClick = async () => {
    if (loading) return;

    const nav = navigator as any;
    // Probe file-share support synchronously, before any await, with a tiny
    // dummy file — this tells us whether we can hand WhatsApp the real PDF.
    let canShareFiles = false;
    try {
      canShareFiles =
        !!nav.canShare &&
        nav.canShare({
          files: [new File(["x"], "probe.pdf", { type: "application/pdf" })],
        });
    } catch {
      canShareFiles = false;
    }

    // Reserve a popup from the click gesture for the chat fallback. If the
    // native share path succeeds we close this spare tab; otherwise we point
    // it at the WhatsApp chat. Opening it now (not after the awaits) keeps it
    // clear of the popup blocker.
    const win = window.open("about:blank", "_blank");

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/receipt`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as ReceiptResponse;

      const order = data.order;
      const caption = receiptCaption(order);
      const intl = normalizeWaPhone(data.customer?.phone);
      const filename = `CuciXpress-${shortReceiptId(order.id)}.pdf`;
      const blob = await buildReceiptPdfBlob(order);

      const openChat = () => {
        const url = intl
          ? `https://wa.me/${intl}?text=${encodeURIComponent(caption)}`
          : `https://wa.me/?text=${encodeURIComponent(caption)}`;
        if (win && !win.closed) win.location.href = url;
        else window.open(url, "_blank", "noopener,noreferrer");
      };

      if (canShareFiles) {
        const file = new File([blob], filename, { type: "application/pdf" });
        try {
          await nav.share({
            files: [file],
            title: "CuciXpress receipt",
            text: caption,
          });
          // Real PDF was shared — the spare tab isn't needed.
          win?.close();
          return;
        } catch (err: any) {
          // Sender dismissed the share sheet — respect that, do nothing.
          if (err?.name === "AbortError") {
            win?.close();
            return;
          }
          // Any other error (incl. lost user activation / unsupported) falls
          // through to the guaranteed download + chat fallback below.
        }
      }

      // Fallback: download the PDF and open the chat for manual attachment.
      downloadBlob(blob, filename);
      openChat();
      toast({
        title: "Receipt PDF downloaded",
        description: intl
          ? "Attach the downloaded PDF in the WhatsApp chat that just opened."
          : "No phone on file — pick the customer's chat, then attach the downloaded PDF.",
      });
    } catch {
      win?.close();
      toast({
        title: "Couldn't load receipt",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
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
