import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Crown, ArrowRight, TrendingUp } from "lucide-react";
import { MeResp, OrderRow, MembershipRow, formatBND } from "./types";

interface Props {
  me: MeResp;
  orders: OrderRow[];
  memberships: MembershipRow[];
}

const UNLIMITED_PRICE_CENTS = 4500; // BND 45 / month — see /subscriptions catalog.
const BREAK_EVEN_WASHES = 5;        // ≥5 paid washes/month → Unlimited usually wins.

// Average per-wash spend across the customer's recent pay-as-you-go orders.
// We exclude voucher / loyalty / membership-redemption rows because they're
// effectively zero-priced and would drag the average down.
function avgWashSpendCents(orders: OrderRow[]): number {
  const cash = orders.filter(
    (o) =>
      o.total_cents > 0 &&
      o.payment_method !== "voucher" &&
      o.payment_method !== "membership",
  );
  if (cash.length === 0) return 1200; // Sensible default = Basic + Tyre + Wax B$12
  const sum = cash.reduce((s, o) => s + o.total_cents, 0);
  return Math.round(sum / cash.length);
}

export function MembershipRecommendation({ me, orders, memberships }: Props) {
  // Hide entirely when the customer already has an active plan — the
  // ActiveSubscriptionHero at the top of Overview already does that job.
  const hasActive = memberships.some((m) => m.status === "active");
  if (hasActive) return null;

  const avgCents = useMemo(() => avgWashSpendCents(orders), [orders]);

  // Forecast monthly washes: blend this month + last month (the bigger of
  // the two wins, then average them in). Avoids "0 last month" hiding a
  // newly heavy user, and avoids "1 this month, mid-month" overstating.
  const forecastWashes = useMemo(() => {
    const a = me.stats.washes_this_month;
    const b = me.stats.washes_last_month;
    return Math.round((Math.max(a, b) + (a + b) / 2) / 2);
  }, [me]);

  const projectedSpendCents = forecastWashes * avgCents;
  const savingsCents = projectedSpendCents - UNLIMITED_PRICE_CENTS;
  const willSave = forecastWashes >= BREAK_EVEN_WASHES && savingsCents > 0;
  const washesToBreakEven = Math.max(
    0,
    Math.ceil(UNLIMITED_PRICE_CENTS / avgCents) - forecastWashes,
  );

  // Don't show anything if the customer barely washes — Unlimited would
  // be a bad recommendation and we don't want to feel pushy.
  if (forecastWashes < 2 && !willSave) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border-2 border-black bg-white"
      data-testid="card-membership-recommendation"
    >
      {/* gradient stripe down the side for visual flag */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-purple-600 via-violet-500 to-orange-500" />

      <div className="p-5 md:p-6 pl-6 md:pl-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-purple-600">
            <TrendingUp className="w-4 h-4" />
            <p className="text-[11px] uppercase tracking-widest font-bold">
              Smart suggestion
            </p>
          </div>

          {willSave ? (
            <>
              <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-1">
                You'd save{" "}
                <span className="bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent">
                  {formatBND(savingsCents)}/month
                </span>{" "}
                on Unlimited Xpress
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                You wash about <strong>{forecastWashes}× / month</strong> at{" "}
                <strong>{formatBND(avgCents)}</strong> average. That's{" "}
                <strong>{formatBND(projectedSpendCents)}</strong>{" "}
                pay-as-you-go vs <strong>BND 45</strong> on Unlimited — for the
                same car, all 5 branches.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-1">
                You're{" "}
                <span className="text-cuci-secondary">
                  {washesToBreakEven} wash{washesToBreakEven === 1 ? "" : "es"}
                </span>{" "}
                from breaking even on Unlimited
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Right now you wash about <strong>{forecastWashes}×/month</strong>.
                Once you hit ~{Math.ceil(UNLIMITED_PRICE_CENTS / avgCents)} a
                month, Unlimited Xpress at <strong>BND 45/mo</strong> starts
                paying for itself.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 md:items-end shrink-0">
          <Link
            href="/subscriptions"
            className="inline-flex items-center justify-center gap-1.5 px-5 py-3 bg-gradient-to-r from-purple-600 to-orange-500 text-white rounded-xl font-black border-2 border-black shadow hover:translate-y-[-1px] transition-transform whitespace-nowrap"
            data-testid="button-recommend-subscribe"
          >
            <Crown className="w-4 h-4" /> See plans <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-[10px] text-gray-400 text-right">
            Cancel anytime · rain re-wash included
          </p>
        </div>
      </div>
    </motion.section>
  );
}
