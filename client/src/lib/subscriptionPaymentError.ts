/** apiRequest throws "HTTP status: JSON", not an error.response object. */
export function subscriptionPaymentError(error: unknown): string {
  let body: any;
  try {
    const message = error instanceof Error ? error.message : "";
    body = JSON.parse(message.replace(/^\d{3}:\s*/, ""));
  } catch {}
  switch (body?.error) {
    case "checkout_in_progress": {
      const seconds = Number(body.retry_after_seconds);
      const minutes = Math.max(1, Math.ceil((Number.isFinite(seconds) ? seconds : 900) / 60));
      return `A payment attempt is already pending. If you still have its payment page open, continue there. Otherwise, wait ${minutes} minute${minutes === 1 ? "" : "s"} before trying again. If payment was already deducted, do not pay again; contact Cuci Xpress.`;
    }
    case "already_subscribed": return "You already have an active subscription. Refresh your dashboard to view it.";
    case "phone_in_use": return "That phone number is linked to another account.";
    case "plate_in_use": return "That vehicle is linked to another account. Please contact Cuci Xpress for help.";
    default: return "We couldn't start payment. Please try again shortly. If payment was already deducted, do not pay again; contact Cuci Xpress.";
  }
}
