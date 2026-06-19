import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle, Clock, Home, LayoutDashboard, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";

type SubscriptionMe = {
  subscription: {
    id: string;
    plan_id: string;
    status: string;
    price_cents: number;
    currency: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
};

const PLAN_LABELS: Record<string, string> = {
  unlimited: "Unlimited",
  family: "Multi-Car Family",
};

// Returning customers land here after paying on Pocket Pay. The payment callback
// activates the membership server-side, so we poll /api/subscriptions/me until
// the subscription flips to 'active' (or we give up after ~40s and ask them to
// check their dashboard).
export default function SubscriptionSuccess() {
  const [, setLocation] = useLocation();
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 20; // ~40s at 2s intervals

  const { data } = useQuery<SubscriptionMe>({
    queryKey: ["/api/subscriptions/me"],
    refetchInterval: (query) => {
      const sub = (query.state.data as SubscriptionMe | undefined)?.subscription;
      if (sub && (sub.status === "active" || sub.status === "past_due")) return false;
      return 2000;
    },
  });

  const sub = data?.subscription ?? null;
  const isActive = !!sub && (sub.status === "active" || sub.status === "past_due");

  useEffect(() => {
    if (isActive) return;
    const t = setInterval(() => setAttempts((a) => a + 1), 2000);
    return () => clearInterval(t);
  }, [isActive]);

  const gaveUp = !isActive && attempts >= MAX_ATTEMPTS;

  const periodEnd = useMemo(() => {
    if (!sub?.current_period_end) return null;
    const d = new Date(sub.current_period_end);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [sub?.current_period_end]);

  if (gaveUp) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full"
        >
          <Card className="shadow-xl border-0">
            <CardHeader className="text-center pb-4">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-amber-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-amber-800">
                Still confirming your payment
              </CardTitle>
              <p className="text-gray-600 mt-2">
                Your payment may still be processing. This can take a minute. Check
                your dashboard shortly — if your plan isn't active, no charge was
                completed and you can try again.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full bg-cuci-primary hover:bg-cuci-primary/90"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-go-dashboard"
              >
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Go to my dashboard
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocation("/")}
              >
                <Home className="w-4 h-4 mr-2" />
                Back home
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <Card className="shadow-xl border-0">
            <CardContent className="py-12">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full border-4 border-cuci-primary/30 border-t-cuci-primary animate-spin" />
              <h1 className="text-xl font-bold text-gray-800 mb-2">
                Confirming your payment…
              </h1>
              <p className="text-gray-600">
                Hang tight — we're activating your unlimited plan. This only takes a
                moment.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full"
      >
        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle className="w-10 h-10 text-green-600" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-green-800">
              You're all set! 🎉
            </CardTitle>
            <p className="text-gray-600 mt-2">
              Your {PLAN_LABELS[sub!.plan_id] ?? "unlimited"} plan is active. Drive
              into any branch any time for unlimited washes.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-gray-600">Plan</span>
                <span className="font-semibold">
                  {PLAN_LABELS[sub!.plan_id] ?? sub!.plan_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-gray-600">Valid until</span>
                <span className="font-semibold">{periodEnd ?? "—"}</span>
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
              This is a one-time month — there's no auto-renewal. When it ends,
              just subscribe again to keep your unlimited washes going.
            </div>
            <div className="space-y-3">
              <Button
                className="w-full bg-cuci-primary hover:bg-cuci-primary/90"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-go-dashboard"
              >
                <LayoutDashboard className="w-4 h-4 mr-2" />
                Go to my dashboard
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setLocation("/")}
              >
                <Home className="w-4 h-4 mr-2" />
                Back home
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
