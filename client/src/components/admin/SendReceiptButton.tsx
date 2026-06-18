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
// Sending the actual PDF over WhatsApp is only possible through the device's
// native share sheet — a wa.me link can ONLY carry text, never an attachment.
//
//   • On phones/tablets (and Macs) that support file sharing we go STRAIGHT to
//     navigator.share with the PDF — exactly like the customer dashboard. We do
//     NOT open any tab first: window.open() consumes the user-gesture that
//     navigator.share needs, which would make the share fail and wrongly fall
//     back to a download + wa.me tab.
//   • On desktops that can't share files we reserve a tab synchronously from
//     the click (popup-safe), download the PDF, and open the customer's wa.me
//     chat pre-filled with the text receipt so the PDF can be attached manually.
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

    // Only reserve a popup for the desktop text-fallback. Crucially we do NOT
    // open a tab on the native-share path (it would consume the user gesture
    // and break navigator.share).
    const win = canShareFiles ? null : window.open("about:blank", "_blank");

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
      const chatUrl = intl
        ? `https://wa.me/${intl}?text=${encodeURIComponent(caption)}`
        : `https://wa.me/?text=${encodeURIComponent(caption)}`;
      const blob = await buildReceiptPdfBlob(order);

      if (canShareFiles) {
        // Mirror the customer dashboard exactly: attach the real PDF via the
        // native share sheet, where the sender picks the customer's chat.
        try {
          const file = new File([blob], filename, { type: "application/pdf" });
          await nav.share({
            files: [file],
            title: "CuciXpress receipt",
            text: caption,
          });
        } catch (err: any) {
          // Sender dismissed the share sheet — respect that.
          if (err?.name === "AbortError") return;
          // Genuine share failure — best-effort: save the PDF and open a chat.
          downloadBlob(blob, filename);
          window.open(chatUrl, "_blank", "noopener,noreferrer");
        }
        return;
      }

      // Desktop: download the PDF and open the chat for manual attachment.
      downloadBlob(blob, filename);
      if (win && !win.closed) win.location.href = chatUrl;
      else window.open(chatUrl, "_blank", "noopener,noreferrer");
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
