interface HistoryOrder {
  order_type?: string | null;
  ticket_code: string | null;
  status: string;
  qr_provider: string | null;
  claimed_at?: string | null;
}

export function customerHistoryLabel(order: HistoryOrder) {
  if (order.order_type === "counter_subscription")
    return { text: "Counter pass purchase", awaitingScan: false };
  if (order.ticket_code) return { text: order.ticket_code, awaitingScan: false };
  if (order.status === "paid" && order.claimed_at === null &&
      ["pocket_pay", "loyalty", "membership"].includes(order.qr_provider ?? ""))
    return { text: "awaiting scan", awaitingScan: true };
  const labels: Record<string, string> = {
    pending_payment: "Awaiting payment", refunded: "Refunded",
    voided: "Voided", done: "Completed",
  };
  return { text: labels[order.status] ?? "No wash ticket", awaitingScan: false };
}
