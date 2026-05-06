import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Droplet } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  MeResp,
  OrderRow,
  MembershipRow,
  CarRow,
  QueueBranch,
  formatBND,
  formatBNDFull,
  packageBadgeClass,
} from "./types";
import { LoyaltyCard } from "./LoyaltyCard";

interface Props {
  me: MeResp;
  orders: OrderRow[];
  memberships: MembershipRow[];
  cars: CarRow[];
  fullName: string;
  onChangeTab: (tab: "history" | "subscription") => void;
}

export function OverviewTab({ me, orders, memberships, cars, fullName, onChangeTab }: Props) {
  const firstName = fullName.split(" ")[0];
  const activeMembership = memberships.find((m) => m.status === "active");

  // One-tap wash banner: pick the OPEN branch with the shortest queue.
  const { data: queueData } = useQuery<{ branches: QueueBranch[] }>({
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

      {/* One-tap wash banner */}
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
                  {activeMembership ? " · Your subscription covers this wash." : ""}
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

      {/* Loyalty punch card */}
      <LoyaltyCard cars={cars} />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
        <KpiTile
          label="Loyalty points"
          value={me.stats.loyalty_points.toLocaleString()}
          color="text-cuci-secondary"
          sub={
            me.stats.loyalty_points >= 1300
              ? "Free Premium unlocked!"
              : `${1300 - me.stats.loyalty_points} to free Premium`
          }
          testId="kpi-loyalty"
        />
      </div>

      {/* Recent washes + Subscription side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 cuci-card-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Recent washes</h2>
            <button
              onClick={() => onChangeTab("history")}
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

        <section className="lg:col-span-1">
          {activeMembership ? (
            <ActiveSubscriptionMini
              membership={activeMembership}
              onManage={() => onChangeTab("subscription")}
            />
          ) : (
            <NoSubscriptionMini onSeePlans={() => onChangeTab("subscription")} />
          )}
        </section>
      </div>
    </div>
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

function ActiveSubscriptionMini({
  membership,
  onManage,
}: {
  membership: MembershipRow;
  onManage: () => void;
}) {
  // Compact twinkles tuned for the smaller overview-tab card.
  const TWINKLES = [
    { top: 10,  left: "55%", size: 11, delay: "0s"   },
    { top: 70,  left: "12%", size: 8,  delay: "0.3s" },
    { top: 40,  left: "85%", size: 8,  delay: "0.6s" },
    { top: 180, left: "75%", size: 10, delay: "1.2s" },
    { top: 230, left: "20%", size: 9,  delay: "1.8s" },
  ];

  return (
    <div
      className="relative overflow-hidden rounded-2xl text-white p-5 h-full flex flex-col"
      style={{
        background:
          "linear-gradient(135deg, #7C5CE7 0%, #B47CF7 45%, #FF9500 100%)",
        boxShadow:
          "0 0 40px rgba(255,149,0,0.35), 0 0 70px rgba(124,92,231,0.3)",
      }}
      data-testid="card-subscription-mini"
    >
      {/* Same gloss + shimmer + twinkles as the SubscriptionTab active card. */}
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

      <div className="relative flex flex-col flex-1" style={{ zIndex: 1 }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-bold">Your subscription</h3>
          <span style={{ color: "#FFE89E" }} className="text-lg">👑</span>
        </div>
        <span
          className="self-start text-[10px] uppercase font-extrabold px-2 py-0.5 rounded"
          style={{
            background: "#FF9500",
            color: "#1a1208",
            border: "1.5px solid rgba(0,0,0,0.6)",
            letterSpacing: 1.1,
          }}
        >
          {membership.kind === "unlimited" ? "Unlimited" : "Wash Pack"}
        </span>
        <p
          className="text-xs mt-3"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          Active until
        </p>
        <p
          className="text-xl font-black"
          style={{ textShadow: "0 2px 12px rgba(0,0,0,0.2)" }}
        >
          {membership.expires_at
            ? new Date(membership.expires_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })
            : "Ongoing"}
        </p>
        <div
          className="my-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.25)" }}
        />
        <dl className="text-xs space-y-1.5">
          <Stat
            label="Plan"
            value={
              membership.kind === "unlimited" ? "Unlimited Xpress" : "Wash Pack"
            }
          />
          <Stat label="Price" value={formatBNDFull(membership.price_cents)} />
          <Stat
            label="Remaining"
            value={
              membership.kind === "unlimited"
                ? "Unlimited"
                : `${membership.remaining_washes} / ${membership.total_washes}`
            }
          />
        </dl>
        <button
          onClick={onManage}
          className="mt-auto pt-4 text-xs font-bold hover:underline self-start"
          style={{ color: "#FFE89E" }}
          data-testid="link-manage-subscription"
        >
          Manage →
        </button>
      </div>
    </div>
  );
}

function NoSubscriptionMini({ onSeePlans }: { onSeePlans: () => void }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed border-gray-300 p-5 h-full flex flex-col"
      data-testid="card-subscription-empty"
    >
      <h3 className="text-base font-bold text-gray-900">No subscription yet</h3>
      <p className="text-sm text-gray-500 mt-1">
        Save up to BND 32/mo by switching from pay-as-you-go.
      </p>
      <button
        onClick={onSeePlans}
        className="mt-auto self-start px-3 py-1.5 text-sm font-bold text-cuci-primary hover:underline"
        data-testid="link-see-plans"
      >
        See plans →
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  // Used inside the gradient subscription mini-card — styled for the
  // light-on-gradient context (white-ish label, bright white value).
  return (
    <div className="flex items-center justify-between">
      <dt style={{ color: "rgba(255,255,255,0.75)" }}>{label}</dt>
      <dd className="font-bold text-white">{value}</dd>
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
