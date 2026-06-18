// Shared digital-receipt helpers used by both the customer dashboard
// (Activity / receipts) and the admin tabs (Orders report + Customers).
// Keeping the caption + PDF + WhatsApp logic here means the receipt the
// customer sees and the one an admin sends stay byte-for-byte identical.

import {
  OrderRow,
  formatBND,
  formatBNDFull,
  formatDateTime,
  shortReceiptId,
} from "@/components/dashboard/types";

// Central business contact line — identical on every printed receipt.
export const BUSINESS_PHONE = "+673 838 7000";

// Loyalty promo footer carried over from the printed thermal receipt.
export const LOYALTY_PROMO =
  "Collect 4 receipts from the B$12 package for the same car plate and get a FREE WASH of our B$12 full package. No validity period — show all 4 receipts to claim.";

export function payLabel(method: string, qrProvider?: string | null) {
  if (method === "cash") return "Cash";
  if (method === "qr_code") {
    if (qrProvider === "pocket_pay_invoice") return "Pocket Payment Invoice";
    if (qrProvider === "baiduri_ms") return "Baiduri MS Payment Request";
    return "Pocket Payment QR";
  }
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "card") return "Card";
  if (method === "baiduri_pay") return "Baiduripay";
  if (method === "quick_pay") return "Quickpay";
  if (method === "subscription") return "Subscription";
  if (method === "voucher") return "Voucher";
  return method;
}

export type ReceiptItem = {
  name: string;
  price_cents: number | null;
  kind: "package" | "addon";
};

// Flattens an order into the printed line items: the package first, then
// each add-on. Mirrors the "Item / Amount" block on the thermal receipt.
export function receiptItems(order: OrderRow): ReceiptItem[] {
  const items: ReceiptItem[] = [
    {
      name: order.package_name,
      price_cents: order.package_price_cents ?? null,
      kind: "package",
    },
  ];
  for (const a of order.addons ?? []) {
    items.push({ name: a.name, price_cents: a.price_cents, kind: "addon" });
  }
  return items;
}

export function totalDiscount(order: OrderRow) {
  return (order.discount_cents ?? 0) + (order.promo_discount_cents ?? 0);
}

// The plain-text version of the receipt — used as the message body that
// accompanies the shared PDF, and as the text sent via a wa.me chat link.
export function receiptCaption(order: OrderRow): string {
  const items = receiptItems(order).map(
    (it) =>
      `${it.kind === "addon" ? "  + " : "• "}${it.name}${
        it.price_cents != null ? ` — ${formatBNDFull(it.price_cents)}` : ""
      }`,
  );
  const disc = totalDiscount(order);
  const lines = [
    "*CuciXpress receipt*",
    BUSINESS_PHONE,
    "",
    `Receipt: *${shortReceiptId(order.id)}*`,
    `Date: ${formatDateTime(order.created_at)}`,
    `Branch: ${order.branch_name ?? "—"}`,
    `Vehicle: ${order.plate}`,
    ...(order.cashier_name ? [`Cashier: ${order.cashier_name}`] : []),
    "",
    "Items:",
    ...items,
    ...(order.item_notes?.trim() ? [`Note: ${order.item_notes.trim()}`] : []),
    "",
    ...(order.subtotal_cents != null
      ? [`Subtotal: ${formatBNDFull(order.subtotal_cents)}`]
      : []),
    ...(disc > 0 ? [`Discount: − ${formatBNDFull(disc)}`] : []),
    `Total: *${formatBNDFull(order.total_cents)}*`,
    `Payment: ${payLabel(order.payment_method, order.qr_provider)}`,
    ...(order.paid_amount_cents != null
      ? [
          `Paid: ${formatBNDFull(order.paid_amount_cents)}`,
          `Change: ${formatBNDFull(order.change_cents ?? 0)}`,
        ]
      : []),
    "",
    LOYALTY_PROMO,
    "",
    "— cucixpress.com",
  ];
  return lines.join("\n");
}

// Builds a printable, thermal-receipt-style PDF (80mm wide, height grows
// to fit content) entirely with jsPDF text — no html2canvas, so it renders
// crisply and avoids the oklch/gradient issues html snapshotting hits.
export async function buildReceiptPdfBlob(order: OrderRow): Promise<Blob> {
  const { jsPDF } = await import("jspdf");

  const W = 80; // mm — standard thermal receipt width
  const M = 6; // side margin
  const RIGHT = W - M;
  const USABLE = W - 2 * M;
  const CENTER = W / 2;

  // Lay the receipt out once (draw=false) just to measure the final height,
  // then create the real, exactly-sized document and draw it (draw=true).
  const layout = (doc: any, draw: boolean): number => {
    let y = 9;

    const setF = (style: "normal" | "bold", size: number) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
    };
    const gray = (on: boolean) => doc.setTextColor(on ? 130 : 30);
    const centered = (s: string, gap: number) => {
      if (draw) doc.text(s, CENTER, y, { align: "center" });
      y += gap;
    };
    const lr = (label: string, value: string, gap = 5) => {
      if (draw) {
        doc.text(label, M, y);
        doc.text(value, RIGHT, y, { align: "right" });
      }
      y += gap;
    };
    const divider = () => {
      if (draw) {
        doc.setDrawColor(210);
        doc.line(M, y, RIGHT, y);
      }
      y += 4;
    };
    const wrapped = (s: string, size: number, gap: number) => {
      setF("normal", size);
      const rows: string[] = doc.splitTextToSize(s, USABLE);
      for (const r of rows) centered(r, gap);
    };

    // Header
    gray(false);
    setF("bold", 17);
    centered("CuciXpress", 6);
    gray(true);
    setF("normal", 7.5);
    centered("DRIVE-THRU CAR WASH · BRUNEI", 4);
    centered(BUSINESS_PHONE, 6);

    // Receipt number + date
    setF("normal", 6.5);
    gray(true);
    centered("RECEIPT NO.", 4);
    gray(false);
    setF("bold", 13);
    centered(shortReceiptId(order.id), 5.5);
    gray(true);
    setF("normal", 8);
    centered(formatDateTime(order.created_at), 6);

    divider();

    // Details
    gray(false);
    setF("normal", 9);
    lr("Branch", order.branch_name ?? "—");
    lr("Vehicle", order.plate);
    if (order.cashier_name) lr("Cashier", order.cashier_name);
    lr("Payment", payLabel(order.payment_method, order.qr_provider));

    divider();

    // Items
    gray(true);
    setF("bold", 6.5);
    lr("ITEM", "AMOUNT", 5);
    gray(false);
    setF("normal", 9);
    for (const it of receiptItems(order)) {
      const name = (it.kind === "addon" ? "+ " : "") + it.name;
      lr(name, it.price_cents != null ? formatBNDFull(it.price_cents) : "");
    }
    if (order.item_notes?.trim()) {
      gray(true);
      wrapped(`Note: ${order.item_notes.trim()}`, 8, 4);
      gray(false);
    }

    divider();

    // Totals
    setF("normal", 9);
    if (order.subtotal_cents != null)
      lr("Subtotal", formatBNDFull(order.subtotal_cents));
    const disc = totalDiscount(order);
    if (disc > 0) lr("Discount", `− ${formatBNDFull(disc)}`);
    setF("bold", 12);
    lr("TOTAL", formatBNDFull(order.total_cents), 6);
    if (order.paid_amount_cents != null) {
      setF("normal", 9);
      lr("Paid", formatBNDFull(order.paid_amount_cents));
      lr("Change", formatBNDFull(order.change_cents ?? 0));
    }

    divider();

    // Footer
    gray(true);
    wrapped(
      `Thank you for choosing CuciXpress · ${formatBND(order.total_cents)} earned in loyalty`,
      7.5,
      4,
    );
    y += 1;
    wrapped(LOYALTY_PROMO, 6.5, 3.5);
    y += 1;
    gray(false);
    setF("bold", 7.5);
    centered("cucixpress.com", 4);

    return y;
  };

  const measure = new jsPDF({ unit: "mm", format: [W, 1000] });
  const height = Math.ceil(layout(measure, false)) + 4;
  const doc = new jsPDF({ unit: "mm", format: [W, height] });
  layout(doc, true);
  return doc.output("blob");
}

// Normalises a stored phone number into the digits-only international form
// wa.me expects (no +, no spaces). Brunei local numbers (7 digits) get the
// 673 country code prepended. Returns null when there's nothing usable.
export function normalizeWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!d) return null;
  if (d.startsWith("673")) return d;
  if (d.length === 7) return "673" + d; // bare Brunei local number
  return d; // already carries some country code
}

export function openWhatsAppText(caption: string) {
  window.open(
    `https://wa.me/?text=${encodeURIComponent(caption)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

// Customer-dashboard share: attaches the PDF via the native share sheet on
// capable devices, falling back to a wa.me text link on desktop. No specific
// recipient — the user picks who to send to.
export async function shareReceiptToWhatsApp(order: OrderRow) {
  const caption = receiptCaption(order);
  const nav = navigator as any;

  // Probe file-share support synchronously (with a tiny dummy file) BEFORE
  // any await. On desktop / unsupported browsers we open the wa.me text link
  // straight from the click gesture — opening it after an await would get it
  // blocked as a non-user-initiated popup.
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

  if (!canShareFiles) {
    openWhatsAppText(caption);
    return;
  }

  try {
    const blob = await buildReceiptPdfBlob(order);
    const file = new File([blob], `CuciXpress-${shortReceiptId(order.id)}.pdf`, {
      type: "application/pdf",
    });
    await nav.share({
      files: [file],
      title: "CuciXpress receipt",
      text: caption,
    });
  } catch (err: any) {
    // User dismissed the native share sheet — respect that, don't reopen.
    if (err?.name === "AbortError") return;
    // Share was reported supported but failed (or the PDF build failed) —
    // last-resort text link so the sender can still send something.
    openWhatsAppText(caption);
  }
}
