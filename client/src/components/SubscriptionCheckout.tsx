import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Unified Checkout exposes a global `Accept` factory once its client library
// (named in the capture-context JWT) has loaded.
declare global {
  interface Window {
    Accept?: (captureContext: string) => Promise<any>;
  }
}

type Props = {
  planId: string;
  phone: string;
  /** Comma-separated covered plates; the server normalises and validates them. */
  carPlate: string;
  onSuccess: (result: any) => void;
};

// Decode a base64url JWT payload without verifying it. We only read the
// non-sensitive clientLibrary / integrity fields the widget needs to boot.
function decodeJwtPayload(jwt: string): any {
  const part = jwt.split(".")[1] ?? "";
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

function loadCheckoutLibrary(src: string, integrity?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Reload fresh each time so a stale Accept binding from a prior attempt
    // (different capture context) can't leak across dialog opens.
    document
      .querySelectorAll('script[data-uc-lib="1"]')
      .forEach((el) => el.remove());
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.ucLib = "1";
    if (integrity) {
      s.integrity = integrity;
      s.crossOrigin = "anonymous";
    }
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the secure payment form."));
    document.head.appendChild(s);
  });
}

export function SubscriptionCheckout({
  planId,
  phone,
  carPlate,
  onSuccess,
}: Props) {
  const [status, setStatus] = useState<
    "loading" | "ready" | "processing" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  // StrictMode mounts effects twice in dev; guard so we only run the flow once.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const ctxRes = await apiRequest(
          "POST",
          "/api/subscriptions/capture-context",
          { plan_id: planId },
        );
        const { captureContext } = await ctxRes.json();

        const payload = decodeJwtPayload(captureContext);
        const data = payload?.ctx?.[0]?.data ?? {};
        if (!data.clientLibrary) {
          throw new Error("Secure checkout is temporarily unavailable.");
        }
        await loadCheckoutLibrary(data.clientLibrary, data.clientLibraryIntegrity);
        if (!window.Accept) {
          throw new Error("Secure checkout failed to start.");
        }

        const accept = await window.Accept(captureContext);
        const unifiedPayments = await accept.unifiedPayments();
        setStatus("ready");

        // Resolves with a transient token once the customer finishes entering
        // their card (including any 3-D Secure challenge handled in-widget).
        const transientToken: string = await unifiedPayments.show({
          containers: {
            paymentSelection: "#uc-payment-selection",
            paymentScreen: "#uc-payment-screen",
          },
        });

        setStatus("processing");
        const confirmRes = await apiRequest(
          "POST",
          "/api/subscriptions/confirm",
          {
            plan_id: planId,
            transientToken,
            phone,
            car_plate: carPlate,
          },
        );
        const result = await confirmRes.json();
        onSuccess(result);
      } catch (err: any) {
        const raw = err?.message ?? "Payment could not be completed.";
        // apiRequest throws "<status>: <body>"; surface a friendlier line.
        const friendly = raw.includes("402")
          ? "Your card was declined. Please try another card."
          : raw.replace(/^\d+:\s*/, "");
        setStatus("error");
        setMessage(friendly || "Payment could not be completed.");
      }
    })();
  }, [planId, phone, carPlate, onSuccess]);

  return (
    <div className="space-y-4" data-testid="subscription-checkout">
      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading secure checkout…
        </div>
      )}

      {status === "error" ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="checkout-error"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{message}</span>
        </div>
      ) : (
        <>
          {/* Unified Checkout renders its method list + card form into these. */}
          <div id="uc-payment-selection" />
          <div id="uc-payment-screen" />
        </>
      )}

      {status === "processing" && (
        <div className="flex items-center gap-2 text-sm text-gray-600 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Confirming your subscription…
        </div>
      )}

      {status !== "error" && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          Card details are handled securely by CyberSource. We never see your full
          card number.
        </p>
      )}
    </div>
  );
}
