import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ShieldCheck,
  AlertCircle,
  FlaskConical,
  Plus,
  Trash2,
  Zap,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Unified Checkout exposes a global `Accept` factory once its client library
// (named in the capture-context JWT) has loaded.
declare global {
  interface Window {
    Accept?: (captureContext: string) => Promise<any>;
  }
}

const PLAN_OPTIONS = [
  { id: "unlimited", label: "Unlimited Xpress · B$39/mo" },
  { id: "family", label: "Multi-Car Family · B$99/mo" },
];

type TestInvoice = {
  id: string;
  status: string;
  amount_cents: number;
  currency: string;
  cybersource_payment_id: string | null;
  period_end: string | null;
  error_message: string | null;
  created_at: string;
};

type TestSubscription = {
  id: string;
  plan_id: string;
  status: string;
  price_cents: number;
  currency: string;
  card_brand: string | null;
  card_last4: string | null;
  current_period_end: string;
  next_billing_at: string;
  cancel_at_period_end: boolean;
  failed_attempts: number;
  created_at: string;
  invoices: TestInvoice[];
};

const formatBND = (cents: number) =>
  `B$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Brunei",
      })
    : "—";

const statusColor = (status: string) => {
  switch (status) {
    case "active":
    case "paid":
      return "bg-green-100 text-green-800 border-green-300";
    case "past_due":
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "cancelled":
    case "failed":
      return "bg-red-100 text-red-700 border-red-300";
    default:
      return "bg-gray-100 text-gray-700 border-gray-300";
  }
};

// --- Decode a base64url JWT payload (non-sensitive boot fields only). --------
function decodeJwtPayload(jwt: string): any {
  const part = jwt.split(".")[1] ?? "";
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

function loadCheckoutLibrary(src: string, integrity?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    document
      .querySelectorAll('script[data-uc-lib-test="1"]')
      .forEach((el) => el.remove());
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.ucLibTest = "1";
    if (integrity) {
      s.integrity = integrity;
      s.crossOrigin = "anonymous";
    }
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error("Could not load the secure payment form."));
    document.head.appendChild(s);
  });
}

// --- Inline checkout widget that hits the OWNER test endpoints. --------------
function TestCheckout({
  planId,
  onSuccess,
}: {
  planId: string;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState<
    "loading" | "ready" | "processing" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const ctxRes = await apiRequest(
          "POST",
          "/api/admin/subscription-test/capture-context",
          { plan_id: planId },
        );
        const { captureContext } = await ctxRes.json();

        const payload = decodeJwtPayload(captureContext);
        const data = payload?.ctx?.[0]?.data ?? {};
        if (!data.clientLibrary) {
          throw new Error("Secure checkout is temporarily unavailable.");
        }
        await loadCheckoutLibrary(
          data.clientLibrary,
          data.clientLibraryIntegrity,
        );
        if (!window.Accept) {
          throw new Error("Secure checkout failed to start.");
        }

        const accept = await window.Accept(captureContext);
        const unifiedPayments = await accept.unifiedPayments();
        setStatus("ready");

        const transientToken: string = await unifiedPayments.show({
          containers: {
            paymentSelection: "#uc-test-payment-selection",
            paymentScreen: "#uc-test-payment-screen",
          },
        });

        setStatus("processing");
        await apiRequest("POST", "/api/admin/subscription-test/confirm", {
          plan_id: planId,
          transientToken,
        });
        onSuccess();
      } catch (err: any) {
        const raw = err?.message ?? "Payment could not be completed.";
        const friendly = raw.includes("402")
          ? "Test card was declined. Try another test card."
          : raw.replace(/^\d+:\s*/, "");
        setStatus("error");
        setMessage(friendly || "Payment could not be completed.");
      }
    })();
  }, [planId, onSuccess]);

  return (
    <div className="space-y-4" data-testid="test-subscription-checkout">
      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-gray-600 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading secure checkout…
        </div>
      )}

      {status === "error" ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="test-checkout-error"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{message}</span>
        </div>
      ) : (
        <>
          <div id="uc-test-payment-selection" />
          <div id="uc-test-payment-screen" />
        </>
      )}

      {status === "processing" && (
        <div className="flex items-center gap-2 text-sm text-gray-600 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Charging test card & storing token…
        </div>
      )}

      {status !== "error" && (
        <p className="flex items-center gap-1.5 text-xs text-gray-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          TEST gateway — no real money moves. Use CyberSource test card numbers.
        </p>
      )}
    </div>
  );
}

export default function SubscriptionTestTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [planId, setPlanId] = useState("unlimited");
  const [checkoutKey, setCheckoutKey] = useState(0);

  const { data, isLoading, error } = useQuery<{
    subscriptions: TestSubscription[];
  }>({
    queryKey: ["/api/admin/subscription-test/list"],
  });

  const chargeNow = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/admin/subscription-test/${id}/charge-now`, {}),
    onSuccess: async (res: any) => {
      const body = await res.json().catch(() => ({}));
      toast({
        title: "Renewal charged",
        description: body?.paymentId
          ? `Payment ${body.paymentId} · next period ends ${formatDateTime(body.period_end)}`
          : "Test renewal processed.",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/subscription-test/list"] });
    },
    onError: (err: any) => {
      toast({
        title: "Charge failed",
        description:
          err?.message?.replace(/^\d+:\s*/, "") ||
          "Could not charge the test subscription.",
        variant: "destructive",
      });
      qc.invalidateQueries({ queryKey: ["/api/admin/subscription-test/list"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/admin/subscription-test/${id}`, {}),
    onSuccess: () => {
      toast({ title: "Test subscription deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/subscription-test/list"] });
    },
    onError: (err: any) => {
      toast({
        title: "Delete failed",
        description: err?.message?.replace(/^\d+:\s*/, "") || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const openDialog = () => {
    setCheckoutKey((k) => k + 1); // remount the widget fresh each open
    setDialogOpen(true);
  };

  const onCheckoutSuccess = () => {
    setDialogOpen(false);
    toast({
      title: "Test subscription created",
      description: "First month charged on the test gateway & card stored.",
    });
    queryClient.invalidateQueries({
      queryKey: ["/api/admin/subscription-test/list"],
    });
  };

  const subs = data?.subscriptions ?? [];

  return (
    <div className="space-y-6" data-testid="subscription-test-tab">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-cuci-primary" />
                CyberSource Subscription Sandbox
              </CardTitle>
              <p className="text-sm text-gray-600 mt-1 max-w-2xl">
                Owner-only. Walk the full recurring flow end-to-end against the
                CyberSource <span className="font-semibold">TEST</span> gateway:
                enter a test card → first charge → card stored → auto-renew. These
                test subscriptions are isolated — they create no membership and
                never appear in live reports, POS, or customer accounts.
              </p>
            </div>
            <Button onClick={openDialog} data-testid="button-new-test-subscription">
              <Plus className="w-4 h-4 mr-1" />
              New test subscription
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading test subscriptions…
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-600 py-6 justify-center">
              <AlertCircle className="w-4 h-4" />
              Could not load test subscriptions.
            </div>
          ) : subs.length === 0 ? (
            <div className="text-center py-10">
              <FlaskConical className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">No test subscriptions yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Create one to verify the CyberSource recurring auto-charge.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {subs.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0_0_rgba(0,0,0,0.12)]"
                  data-testid={`test-sub-${s.id}`}
                >
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 capitalize">
                          {s.plan_id}
                        </span>
                        <Badge
                          variant="outline"
                          className={`${statusColor(s.status)} capitalize`}
                        >
                          {s.status}
                        </Badge>
                        <span className="text-sm font-semibold text-gray-700">
                          {formatBND(s.price_cents)}/mo
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5" />
                        {s.card_brand
                          ? `${s.card_brand} ···· ${s.card_last4 ?? "----"}`
                          : "No card on file"}
                        {s.failed_attempts > 0 && (
                          <span className="text-red-600 font-medium">
                            · {s.failed_attempts} failed attempt(s)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        Period ends {formatDateTime(s.current_period_end)} · Next
                        billing {formatDateTime(s.next_billing_at)}
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono">
                        {s.id}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          chargeNow.isPending ||
                          !["active", "past_due"].includes(s.status)
                        }
                        onClick={() => chargeNow.mutate(s.id)}
                        data-testid={`button-charge-now-${s.id}`}
                      >
                        {chargeNow.isPending &&
                        chargeNow.variables === s.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Zap className="w-4 h-4 mr-1" />
                        )}
                        Charge renewal now
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(s.id)}
                        data-testid={`button-delete-test-sub-${s.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {s.invoices.length > 0 && (
                    <div className="mt-3 border-t pt-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Invoices ({s.invoices.length})
                      </div>
                      <div className="space-y-1.5">
                        {s.invoices.map((inv) => (
                          <div
                            key={inv.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={`${statusColor(inv.status)} capitalize`}
                              >
                                {inv.status}
                              </Badge>
                              <span className="text-gray-700">
                                {formatBND(inv.amount_cents)}
                              </span>
                              <span className="text-gray-400">
                                {formatDateTime(inv.created_at)}
                              </span>
                            </span>
                            <span className="text-gray-400 font-mono truncate max-w-[40%]">
                              {inv.error_message ||
                                inv.cybersource_payment_id ||
                                ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New test subscription</DialogTitle>
            <DialogDescription>
              Charges the first month on the CyberSource test gateway and stores
              the card for auto-renew. No real money moves.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Plan
              </label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger data-testid="select-test-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <TestCheckout
              key={`${planId}-${checkoutKey}`}
              planId={planId}
              onSuccess={onCheckoutSuccess}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
