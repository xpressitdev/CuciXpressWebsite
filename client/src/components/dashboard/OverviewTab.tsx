import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowRight, Crown, Droplet, QrCode } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MeResp,
  OrderRow,
  MembershipRow,
  CarRow,
  QueueBranch,
  formatBND,
} from "./types";
import { LoyaltyCard } from "./LoyaltyCard";
import { WashHeatmap } from "./WashHeatmap";
import { MembershipRecommendation } from "./MembershipRecommendation";
import { AchievementsRow } from "./AchievementsRow";
import { MembershipWashQrDialog, type MembershipVoucher } from "./MembershipWashQrDialog";

interface Props {
  me: MeResp;
  orders: OrderRow[];
  memberships: MembershipRow[];
  cars: CarRow[];
  fullName: string;
  onChangeTab: (tab: "activity" | "subscription") => void;
}

export function OverviewTab({ me, orders, memberships, cars, fullName, onChangeTab }: Props) {
  const firstName = fullName.split(" ")[0];
  // Hero priority: when a customer has both an Unlimited subscription
  // and a wash Pack active, Unlimited wins. Otherwise pick whichever
  // active membership exists. This avoids a gifted/legacy pack hijacking
  // the hero away from the customer's "real" subscription.
  const activeMembership =
    memberships.find((m) => m.status === "active" && m.kind === "unlimited") ??
    memberships.find((m) => m.status === "active");

  // One-tap wash banner: pick the OPEN branch with the shortest queue.
  const { data: queueData } = useQuery<{ branches: QueueBranch[]; server_time?: string }>({
    queryKey: ["/api/queue/snapshot"],
    refetchInterval: 30_000,
  });
  const bestBranch = (queueData?.branches ?? [])
    .filter((b) => b.is_open)
    .sort((a, b) => a.queued_count - b.queued_count)[0];

  const monthDelta = me.stats.washes_this_month - me.stats.washes_last_month;
  const memberSinceLabel = me.stats.member_since
    ? new Date(me.stats.member_since).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      })
    : "—";

  const recent = orders.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-gray-500">Welcome back,</p>
        <h1
          className="text-3xl md:text-5xl font-black text-gray-900 leading-tight mt-1"
          data-testid="heading-dash-welcome"
        >
          {firstName} <span className="inline-block">👋</span>
        </h1>
      </div>

      {/* Hero: subscription card if active, otherwise one-tap CTA. */}
      {activeMembership ? (
        <ActiveSubscriptionHero
          membership={activeMembership}
          bestBranch={bestBranch}
          onManage={() => onChangeTab("subscription")}
        />
      ) : (
        <div
          className="cuci-cta rounded-2xl p-5 md:p-6 text-white relative overflow-hidden"
          style={{
            background:
              "linear-gradient(120deg, hsl(257, 74%, 50%) 0%, hsl(36, 100%, 55%) 100%)",
          }}
          data-testid="banner-onetap"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-white/90">
                One-tap wash
              </p>
              <h2 className="text-xl md:text-2xl font-black mt-1">
                {bestBranch
                  ? `Drive to ${bestBranch.name}, queue is ${
                      bestBranch.queued_count <= 2 ? "short" : "moving"
                    }.`
                  : "Pick a branch and pre-pay your wash."}
              </h2>
              <p className="text-sm text-white/90 mt-1">
                {bestBranch ? (
                  <>
                    {bestBranch.queued_count} cars in queue · ~{bestBranch.est_wait_minutes} min
                    wait
                  </>
                ) : (
                  "All branches are currently closed. Try again during opening hours."
                )}
              </p>
            </div>
            <Link
              href="/checkout"
              className="inline-flex items-center justify-center gap-1 px-5 py-3 bg-white text-gray-900 rounded-xl font-bold border-2 border-black whitespace-nowrap hover:translate-x-[-1px] hover:translate-y-[-1px] transition-transform"
              data-testid="button-onetap-pay"
            >
              Pay &amp; Queue <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Smart subscription suggestion — only renders when there's no active
          plan AND the customer's wash frequency makes Unlimited a good deal
          (or they're close to break-even). Returns null otherwise. */}
      <MembershipRecommendation me={me} orders={orders} memberships={memberships} />

      {/* Live queue strip — inline, reuses queueData already fetched above.
          The customer's most-visited branch gets a "Your home" highlight so
          they can spot it without us repeating the hero card. */}
      <LiveQueueStrip
        branches={queueData?.branches ?? []}
        serverTime={(queueData as any)?.server_time}
        homeBranchName={pickHomeBranchName(orders)}
      />

      {/* Loyalty punch card (now with progress ring) */}
      <LoyaltyCard cars={cars} />

      {/* Achievements — gamified badges row, computed from orders + plans. */}
      <AchievementsRow orders={orders} memberships={memberships} />

      {/* 12-month wash heatmap */}
      <WashHeatmap orders={orders} />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiTile
          label="Washes this month"
          value={String(me.stats.washes_this_month)}
          color="text-cuci-primary"
          sub={
            monthDelta === 0
              ? "Same as last month"
              : monthDelta > 0
                ? `↑ ${monthDelta} vs last month`
                : `↓ ${Math.abs(monthDelta)} vs last month`
          }
          testId="kpi-washes-month"
        />
        <KpiTile
          label="Saved with subscription"
          value={
            activeMembership
              ? formatBND(me.stats.saved_this_cycle_cents)
              : formatBND(0)
          }
          color="text-emerald-600"
          sub={activeMembership ? "vs pay-as-you-go" : "no active plan"}
          testId="kpi-saved"
        />
        <KpiTile
          label="Lifetime washes"
          value={String(me.stats.total_done)}
          color="text-gray-900"
          sub={`since ${memberSinceLabel}`}
          testId="kpi-lifetime"
        />
      </div>

      {/* Recent washes — full width now that subscription is the hero. */}
      <section className="cuci-card-soft p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Recent washes</h2>
          <button
            onClick={() => onChangeTab("activity")}
            className="text-sm text-cuci-primary hover:underline inline-flex items-center gap-1"
            data-testid="link-view-all-history"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recent.length === 0 ? (
          <EmptyRow text="No washes on your account yet." />
        ) : (
          <div className="space-y-1">
            {recent.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-gray-50"
                data-testid={`row-recent-${o.id}`}
              >
                <div className="w-10 h-10 rounded-[10px] bg-cuci-primary/10 grid place-items-center shrink-0">
                  <Droplet className="w-4 h-4 text-cuci-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-gray-900 truncate">
                    {o.package_name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {o.branch_name ?? "—"} · {o.plate} ·{" "}
                    {new Date(o.created_at).toLocaleDateString("en-CA")}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="hidden sm:inline-flex text-[10px] uppercase font-semibold border-0"
                >
                  {o.payment_method === "qr_code"
                    ? "QR"
                    : o.payment_method === "cash"
                      ? "Cash"
                      : o.payment_method}
                </Badge>
                <span className="font-bold text-sm whitespace-nowrap">
                  {formatBND(o.total_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ----------------------------------------------------------------------
// ActiveSubscriptionHero — full-width hero shown at the top of Overview
// when the customer has an active membership. Same gradient + twinkles
// as the SubscriptionTab ActiveCard so the brand feels consistent, but
// laid out wide with a Pay & Queue CTA on the right that picks the
// shortest open branch from the same /api/queue/snapshot fetch.
// ----------------------------------------------------------------------
export function ActiveSubscriptionHero({
  membership,
  bestBranch,
  onManage,
}: {
  membership: MembershipRow;
  bestBranch: QueueBranch | undefined;
  onManage: () => void;
}) {
  const renewLabel = membership.expires_at
    ? new Date(membership.expires_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Ongoing";
  const isUnlimited = membership.kind === "unlimited";
  const planName = isUnlimited ? "Unlimited Xpress" : "Wash Pack";

  // An active unlimited plan ALWAYS keeps the "Show wash QR" action — the
  // member is paid up until expires_at and must be able to wash. When the
  // plan is within 7 days of expiry we ADD a "Renew" button alongside the
  // QR (never replace it — see the July 2026 "no QR option" complaint).
  const isExpiringSoon =
    !!membership.expires_at &&
    new Date(membership.expires_at).getTime() - Date.now() <=
      7 * 24 * 60 * 60 * 1000;
  const showWashQr = isUnlimited;
  const showRenew = isUnlimited && isExpiringSoon;

  const { toast } = useToast();
  const [qrVoucher, setQrVoucher] = useState<MembershipVoucher | null>(null);

  const checkin = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/customer/membership/checkin", {});
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "checkin_failed");
      return j as { ok: true; voucher: MembershipVoucher };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      setQrVoucher(data.voucher);
    },
    onError: (e: any) => {
      toast({
        title: "Could not create wash QR",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const TWINKLES = [
    { top: 12, left: "30%", size: 11, delay: "0s" },
    { top: 70, left: "55%", size: 8, delay: "0.4s" },
    { top: 40, left: "82%", size: 9, delay: "0.8s" },
    { top: 110, left: "10%", size: 10, delay: "1.2s" },
  ];

  return (
    <article
      className="relative overflow-hidden rounded-2xl text-white"
      style={{
        background:
          "linear-gradient(135deg, #7C5CE7 0%, #B47CF7 45%, #FF9500 100%)",
        padding: "24px 24px",
        boxShadow:
          "0 0 50px rgba(255,149,0,0.4), 0 0 90px rgba(124,92,231,0.3)",
      }}
      data-testid="hero-subscription-active"
    >
      <div className="cuci-gloss" aria-hidden />
      <div className="cuci-shimmer-wrap" aria-hidden />
      {TWINKLES.map((t, ti) => (
        <svg
          key={ti}
          className="cuci-twinkle"
          width={t.size}
          height={t.size}
          viewBox="0 0 24 24"
          style={{ top: t.top, left: t.left, animationDelay: t.delay }}
          aria-hidden
        >
          <path
            d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"
            fill="#fff"
          />
        </svg>
      ))}

      <div
        className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4"
        style={{ zIndex: 1 }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center text-[10px] uppercase font-extrabold px-2 py-0.5 rounded"
              style={{
                background: "#FF9500",
                color: "#1a1208",
                border: "1.5px solid rgba(0,0,0,0.6)",
                letterSpacing: 1.1,
              }}
            >
              {isUnlimited ? "Unlimited" : "Pack"} · Active
            </span>
            <Crown className="w-5 h-5" style={{ color: "#FFE89E" }} />
          </div>
          <h2
            className="text-2xl md:text-3xl font-black mt-2 tracking-tight"
            style={{ textShadow: "0 2px 14px rgba(0,0,0,0.25)" }}
            data-testid="hero-plan-name"
          >
            {planName}
          </h2>
          {membership.vehicle_plate ? (
            <p
              className="text-xs md:text-sm mt-1 inline-flex items-center gap-1.5 font-bold"
              style={{ color: "#FFE89E" }}
              data-testid="hero-plan-plate"
            >
              <span className="opacity-80 uppercase tracking-widest text-[10px]">
                For plate
              </span>
              <span
                className="font-mono tracking-wider px-1.5 py-0.5 rounded"
                style={{ background: "rgba(0,0,0,0.25)" }}
              >
                {membership.vehicle_plate}
              </span>
            </p>
          ) : (
            <p
              className="text-xs md:text-sm mt-1 font-semibold"
              style={{ color: "rgba(255,255,255,0.7)" }}
              data-testid="hero-plan-no-plate"
            >
              Not linked to a specific vehicle
            </p>
          )}
          <p
            className="text-sm mt-1"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            Renews {renewLabel}
            {!isUnlimited &&
              ` · ${membership.remaining_washes}/${membership.total_washes} washes left`}
          </p>
          <p
            className="text-sm mt-2 font-semibold"
            style={{ color: "#FFE89E" }}
          >
            {isUnlimited
              ? "Thank you for being a VIP member — unlimited washes at every Cuci Xpress branch."
              : bestBranch
                ? `Your wash pack covers a wash at ${bestBranch.name} now (~${bestBranch.est_wait_minutes} min).`
                : "All branches are currently closed."}
          </p>
        </div>
        <div className="flex flex-col gap-2 md:items-end shrink-0">
          {showWashQr && (
            <button
              onClick={() => checkin.mutate()}
              disabled={checkin.isPending}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-3 bg-white text-gray-900 rounded-xl font-bold border-2 border-black whitespace-nowrap hover:translate-x-[-1px] hover:translate-y-[-1px] transition-transform disabled:opacity-70"
              data-testid="button-hero-wash-qr"
            >
              <QrCode className="w-4 h-4" />
              {checkin.isPending ? "Preparing…" : "Show wash QR"}
            </button>
          )}
          {(showRenew || !isUnlimited) && (
            <Link
              href={isUnlimited ? "/subscriptions" : "/checkout"}
              className={
                showWashQr
                  ? "inline-flex items-center justify-center gap-1 px-5 py-2 rounded-xl font-bold border-2 border-white/70 text-white whitespace-nowrap hover:bg-white/10 transition-colors text-sm"
                  : "inline-flex items-center justify-center gap-1 px-5 py-3 bg-white text-gray-900 rounded-xl font-bold border-2 border-black whitespace-nowrap hover:translate-x-[-1px] hover:translate-y-[-1px] transition-transform"
              }
              data-testid="button-hero-pay"
            >
              {isUnlimited ? "Renew" : "Use my plan"} <ArrowRight className="w-4 h-4" />
            </Link>
          )}
          <button
            onClick={onManage}
            className="text-xs font-bold hover:underline"
            style={{ color: "#FFE89E" }}
            data-testid="link-hero-manage"
          >
            Manage subscription →
          </button>
        </div>
      </div>

      {qrVoucher && (
        <MembershipWashQrDialog
          open={!!qrVoucher}
          onClose={() => setQrVoucher(null)}
          voucher={qrVoucher}
        />
      )}
    </article>
  );
}

// ----------------------------------------------------------------------
// MembershipWashQrDialog — shows the Unlimited Xpress wash QR. Staff
// scan it at the lane (same scanner as the loyalty free-wash voucher),
// which queues the wash for free under the membership. Mirrors the
// VoucherDialog in LoyaltyCard.tsx.
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// LiveQueueStrip — compact horizontal queue read-out for the Overview
// tab. Same data source as the public /queue page (no extra fetch — we
// reuse the snapshot the parent already pulled for the hero CTA).
// ----------------------------------------------------------------------
// Most-visited branch name from order history. Used to badge the matching
// tile in LiveQueueStrip — keeps the "home branch" cue without a second hero.
function pickHomeBranchName(orders: OrderRow[]): string | null {
  const tally = new Map<string, number>();
  for (const o of orders) {
    if (o.branch_name) tally.set(o.branch_name, (tally.get(o.branch_name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [name, n] of Array.from(tally.entries())) {
    if (n > bestN) {
      best = name;
      bestN = n;
    }
  }
  return best;
}

function LiveQueueStrip({
  branches,
  serverTime,
  homeBranchName,
}: {
  branches: QueueBranch[];
  serverTime: string | undefined;
  homeBranchName: string | null;
}) {
  const time = new Date(serverTime ?? Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const totalToday = branches.reduce((s, b) => s + (b.today_total ?? 0), 0);
  const shortName = (n: string) => n.replace(/^Cuci Xpress\s+/i, "");

  return (
    <section
      className="bg-white rounded-2xl border border-gray-200 p-5"
      data-testid="strip-live-queue"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 text-emerald-600 text-xs font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            LIVE · {time}
          </span>
          <h2 className="text-base font-bold text-gray-900 ml-2">
            Queue right now
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {totalToday > 0 && (
            <span className="text-[11px] bg-gray-900 text-white px-2.5 py-1 rounded-full font-semibold">
              Today · {totalToday} washed
            </span>
          )}
          <Link
            href="/queue"
            className="text-sm text-cuci-primary hover:underline inline-flex items-center gap-1"
            data-testid="link-strip-see-queue"
          >
            See full <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {branches.length === 0 ? (
        <p className="text-sm text-gray-500">Loading queue…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {branches.map((b) => {
            const closed = !b.is_open;
            const quiet = b.queued_count === 0;
            const busy = b.est_wait_minutes >= 20;
            const isHome = homeBranchName != null && b.name === homeBranchName;
            const dot = closed
              ? "bg-gray-300"
              : quiet
                ? "bg-emerald-500"
                : busy
                  ? "bg-red-500"
                  : "bg-amber-500";
            const waitLabel = closed
              ? "Closed"
              : quiet
                ? "Drive in"
                : `~${b.est_wait_minutes} min`;
            const waitColor = closed
              ? "text-gray-400"
              : quiet
                ? "text-emerald-600"
                : busy
                  ? "text-red-500"
                  : "text-amber-600";
            return (
              <div
                key={b.id}
                className={
                  "relative flex flex-col gap-1 p-3 rounded-lg " +
                  (isHome
                    ? "border-2 border-cuci-secondary bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm"
                    : "border border-gray-100 bg-gray-50")
                }
                data-testid={`strip-branch-${b.id}`}
              >
                {isHome && (
                  <span
                    className="absolute -top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cuci-secondary text-white text-[9px] font-black uppercase tracking-wider shadow"
                    data-testid={`strip-home-badge-${b.id}`}
                  >
                    ★ Your home
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className={`text-xs font-semibold truncate ${isHome ? "text-gray-900" : "text-gray-800"}`}>
                    {shortName(b.name)}
                  </span>
                </div>
                <span className={`text-sm font-black ${waitColor}`}>
                  {waitLabel}
                </span>
                {!closed && (
                  <span className="text-[10px] text-gray-500">
                    {b.queued_count} in queue · {b.washing_count} washing
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function KpiTile({
  label,
  value,
  sub,
  color,
  testId,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
  testId: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid={testId}>
      <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
        {label}
      </p>
      <p className={`text-3xl font-black mt-1 ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-dashed border-gray-300 p-5 text-center">
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}
