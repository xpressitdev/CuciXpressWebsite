import { Crown, Lock, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { MembershipRow, CarRow, formatBND, formatBNDFull } from "./types";

interface Props {
  memberships: MembershipRow[];
  cars: CarRow[];
  washesThisMonth: number;
  washesLastMonth: number;
  savedThisCycleCents: number;
}

export function SubscriptionTab({
  memberships,
  cars,
  washesThisMonth,
  washesLastMonth,
  savedThisCycleCents,
}: Props) {
  const active = memberships.find((m) => m.status === "active");
  const past = memberships.filter((m) => m.status !== "active");

  const avgPerWeek = (() => {
    if (washesThisMonth + washesLastMonth === 0) return "0";
    const avg = (washesThisMonth + washesLastMonth) / (4.34 * 2);
    return avg.toFixed(1);
  })();

  return (
    <div className="space-y-5">
      <h1 className="text-3xl md:text-4xl font-black text-gray-900">
        Subscription
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {active ? (
          <ActiveCard
            membership={active}
            washesThisMonth={washesThisMonth}
            avgPerWeek={avgPerWeek}
            savingsCents={savedThisCycleCents}
          />
        ) : (
          <InactiveUnlimitedCard />
        )}

        <UpsellCard cars={cars} hasActive={!!active} />
      </div>

      {past.length > 0 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-3">
            Past plans
          </h2>
          <ul className="divide-y divide-gray-100">
            {past.map((m) => (
              <li
                key={m.id}
                className="py-2.5 flex items-center justify-between text-sm"
                data-testid={`row-past-${m.id}`}
              >
                <div>
                  <p className="font-bold text-gray-900">
                    {m.kind === "unlimited"
                      ? "Unlimited Xpress"
                      : `${m.total_washes}-wash pack`}
                  </p>
                  <p className="text-xs text-gray-500">
                    Started {new Date(m.created_at).toLocaleDateString("en-GB")}
                    {m.expires_at &&
                      ` · ended ${new Date(m.expires_at).toLocaleDateString("en-GB")}`}
                  </p>
                </div>
                <span className="text-xs uppercase font-semibold text-gray-500">
                  {m.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// Shared card chrome — flat, deep-black "physical card" look used by
// both ActiveCard and InactiveUnlimitedCard so the silhouette stays
// identical and the only thing that "lights up" on activation is the
// orange pill and content. Matches the design sample.
const CARD_BASE: React.CSSProperties = {
  background: "#0F0F12",
  borderRadius: 20,
  padding: 28,
  minHeight: 320,
  color: "#fff",
};

// ----------------------------------------------------------------------
// ActiveCard — black "physical card" shown when the customer has a
// paid membership in `active` state. Mirrors the attached design
// sample: orange UNLIMITED · ACTIVE pill, big white plan name, BND
// price + renewal, hairline divider, billing-cycle stats, then dark
// Manage / outlined Cancel buttons.
// ----------------------------------------------------------------------
function ActiveCard({
  membership,
  washesThisMonth,
  avgPerWeek,
  savingsCents,
}: {
  membership: MembershipRow;
  washesThisMonth: number;
  avgPerWeek: string;
  savingsCents: number;
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

  return (
    <article
      className="relative flex flex-col"
      style={CARD_BASE}
      data-testid="card-subscription-active"
    >
      <div className="flex items-start justify-between">
        <span
          className="inline-flex items-center text-[11px] uppercase font-extrabold px-2.5 py-1 rounded"
          style={{
            background: "#FF9500",
            color: "#1a1208",
            letterSpacing: 1.2,
          }}
        >
          {isUnlimited ? "Unlimited" : "Pack"} · Active
        </span>
        <Crown className="w-6 h-6" style={{ color: "#FF9500" }} />
      </div>

      <h2 className="text-3xl font-black mt-5 text-white tracking-tight">
        {planName}
      </h2>
      <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
        {formatBNDFull(membership.price_cents)}/mo · Renews {renewLabel}
      </p>

      <div
        className="my-5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
      />

      <p
        className="text-[11px] uppercase font-bold mb-3"
        style={{ color: "rgba(255,255,255,0.5)", letterSpacing: 1.4 }}
      >
        This billing cycle
      </p>
      <div className="grid grid-cols-3 gap-4">
        <Stat top="Washes" value={String(washesThisMonth)} />
        <Stat top="Avg per week" value={avgPerWeek} />
        <Stat
          top="Saved"
          value={formatBND(savingsCents)}
          accentColor="#34D399"
        />
      </div>

      <div className="flex gap-2 mt-auto pt-6">
        <button
          className="px-4 py-2.5 rounded-lg text-sm font-bold"
          style={{
            background: "#1f1f24",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          data-testid="button-manage-payment"
        >
          Manage payment
        </button>
        <button
          className="px-4 py-2.5 rounded-lg text-sm font-bold"
          style={{
            background: "transparent",
            color: "#F87171",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
          data-testid="button-cancel-plan"
        >
          Cancel plan
        </button>
      </div>
    </article>
  );
}

// ----------------------------------------------------------------------
// InactiveUnlimitedCard — same "physical card" silhouette as the
// active version, but with a muted gray pill, a locked crown, and a
// white Subscribe CTA. Same minHeight + padding as ActiveCard so the
// page doesn't reflow when membership flips on.
// ----------------------------------------------------------------------
function InactiveUnlimitedCard() {
  const features = [
    "Unlimited exterior washes",
    "1 registered vehicle",
    "All 5 branches included",
    "Rain re-wash on us",
  ];

  return (
    <article
      className="relative flex flex-col"
      style={CARD_BASE}
      data-testid="card-subscription-empty"
    >
      <div className="flex items-start justify-between">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] uppercase font-extrabold px-2.5 py-1 rounded"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.55)",
            letterSpacing: 1.2,
          }}
        >
          <Lock className="w-3 h-3" /> Unlimited · Not active
        </span>
        <Crown
          className="w-6 h-6"
          style={{ color: "rgba(255,255,255,0.18)" }}
        />
      </div>

      <h2 className="text-3xl font-black mt-5 text-white tracking-tight">
        Unlimited Xpress
      </h2>
      <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
        BND 60/mo · Single car · all branches
      </p>

      <div
        className="my-5"
        style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
      />

      <ul className="space-y-2 mb-5">
        {features.map((f) => (
          <li
            key={f}
            className="flex items-center gap-2.5 text-sm"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            <span
              className="text-[#FF9500] font-bold"
              style={{ fontSize: 14 }}
            >
              ✓
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        <Link
          href="/subscriptions"
          className="inline-flex w-full items-center justify-center gap-2 px-4 py-3 rounded-lg font-extrabold text-sm transition-colors"
          style={{
            background: "#FF9500",
            color: "#1a1208",
          }}
          data-testid="link-see-plans"
        >
          Subscribe — BND 60/mo
          <ArrowRight className="w-4 h-4" />
        </Link>
        <p
          className="text-[11px] text-center mt-2"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Pays for itself after 4 washes · cancel anytime
        </p>
      </div>
    </article>
  );
}

// ----------------------------------------------------------------------
// UpsellCard — Family upgrade pitch (when active + 2+ cars), or a
// secondary teaser when the customer hasn't upgraded yet / only has
// one car.
// ----------------------------------------------------------------------
function UpsellCard({
  cars,
  hasActive,
}: {
  cars: CarRow[];
  hasActive: boolean;
}) {
  const carsCount = cars.length;
  const showFamilyOffer = hasActive && carsCount >= 2;

  if (!hasActive) {
    return (
      <article className="rounded-2xl border border-gray-200 p-6 bg-white">
        <h3 className="text-lg font-bold text-gray-900">Why subscribe?</h3>
        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          <li>• Wash as often as you want — no per-wash payment</li>
          <li>• One QR works at every Cuci Xpress branch</li>
          <li>• Cancel anytime, no contracts</li>
          <li>• Rain re-wash on us</li>
        </ul>
        <Link
          href="/subscriptions"
          className="inline-flex items-center gap-1 mt-5 text-sm font-bold text-cuci-primary hover:underline"
        >
          Compare plans <ArrowRight className="w-4 h-4" />
        </Link>
      </article>
    );
  }

  if (!showFamilyOffer) {
    return (
      <article className="rounded-2xl border border-gray-200 p-6 bg-white">
        <h3 className="text-lg font-bold text-gray-900">Add a second car?</h3>
        <p className="text-sm text-gray-500 mt-1">
          Family plans cover up to 3 vehicles. Add another car to your account
          first, then upgrade.
        </p>
      </article>
    );
  }

  return (
    <article
      className="rounded-2xl border border-gray-200 p-6 bg-white"
      data-testid="card-subscription-upsell"
    >
      <h3 className="text-lg font-bold text-gray-900">
        Upgrade to Multi-Car Family
      </h3>
      <p className="text-sm text-gray-500 mt-1">
        You have {carsCount} vehicles registered. Family plan covers up to 3
        cars for BND 150/mo.
      </p>
      <div className="mt-4 bg-purple-50 rounded-lg p-3">
        <p className="text-[11px] uppercase font-bold text-purple-700">
          Difference
        </p>
        <p className="text-2xl font-black text-cuci-primary">+BND 90/mo</p>
        <p className="text-[11px] text-gray-500 mt-1">
          Adds {cars[1]?.brand ?? "another car"} to your plan
        </p>
      </div>
      <button
        className="mt-4 w-full py-3 bg-cuci-secondary text-gray-900 rounded-lg font-bold border-2 border-black"
        data-testid="button-upgrade-plan"
      >
        Upgrade plan
      </button>
    </article>
  );
}

function Stat({
  top,
  value,
  accentColor,
}: {
  top: string;
  value: string;
  accentColor?: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] uppercase font-bold"
        style={{ color: "rgba(255,255,255,0.5)", letterSpacing: 1.2 }}
      >
        {top}
      </p>
      <p
        className="text-2xl font-black mt-0.5"
        style={{ color: accentColor ?? "#fff" }}
      >
        {value}
      </p>
    </div>
  );
}
