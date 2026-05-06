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

  // 5 twinkles tuned for the dashboard's wider/shorter active card.
  const TWINKLES = [
    { top: 14,  left: "62%", size: 13, delay: "0s"   },
    { top: 96,  left: "20%", size: 10, delay: "0.3s" },
    { top: 60,  left: "88%", size: 9,  delay: "0.6s" },
    { top: 200, left: "78%", size: 12, delay: "1.2s" },
    { top: 250, left: "12%", size: 11, delay: "1.8s" },
  ];

  return (
    <article
      className="relative overflow-hidden flex flex-col"
      style={{
        background:
          "linear-gradient(135deg, #7C5CE7 0%, #B47CF7 45%, #FF9500 100%)",
        borderRadius: 20,
        padding: 28,
        minHeight: 320,
        color: "#fff",
        boxShadow:
          "0 0 60px rgba(255,149,0,0.45), 0 0 100px rgba(124,92,231,0.35)",
      }}
      data-testid="card-subscription-active"
    >
      {/* Glossy highlight + diagonal shimmer + twinkle stars — same
          treatment as the Most Picked card on /subscriptions. */}
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

      {/* Foreground content sits above the overlays. */}
      <div className="relative flex flex-col flex-1" style={{ zIndex: 1 }}>
        <div className="flex items-start justify-between">
          <span
            className="inline-flex items-center text-[11px] uppercase font-extrabold px-2.5 py-1 rounded"
            style={{
              background: "#FF9500",
              color: "#1a1208",
              border: "1.5px solid rgba(0,0,0,0.6)",
              letterSpacing: 1.2,
            }}
          >
            {isUnlimited ? "Unlimited" : "Pack"} · Active
          </span>
          <Crown className="w-6 h-6" style={{ color: "#FFE89E" }} />
        </div>

        <h2
          className="text-3xl font-black mt-5 text-white tracking-tight"
          style={{ textShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
        >
          {planName}
        </h2>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>
          {formatBNDFull(membership.price_cents)}/mo · Renews {renewLabel}
        </p>

        <div
          className="my-5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.25)" }}
        />

        <p
          className="text-[11px] uppercase font-bold mb-3"
          style={{ color: "#FFE89E", letterSpacing: 1.4 }}
        >
          This billing cycle
        </p>
        <div className="grid grid-cols-3 gap-4">
          <Stat top="Washes" value={String(washesThisMonth)} />
          <Stat top="Avg per week" value={avgPerWeek} />
          <Stat
            top="Saved"
            value={formatBND(savingsCents)}
            accentColor="#FFE89E"
          />
        </div>

        <div className="flex gap-2 mt-auto pt-6">
          <button
            className="px-4 py-2.5 rounded-lg text-sm font-bold"
            style={{
              background: "rgba(0,0,0,0.55)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.25)",
            }}
            data-testid="button-manage-payment"
          >
            Manage payment
          </button>
          <button
            className="px-4 py-2.5 rounded-lg text-sm font-bold"
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.4)",
            }}
            data-testid="button-cancel-plan"
          >
            Cancel plan
          </button>
        </div>
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
      <article
        className="rounded-2xl border border-gray-200 p-6 bg-white flex flex-col"
        data-testid="card-subscription-add-car"
      >
        <h3 className="text-lg font-bold text-gray-900">
          Cover the whole family for BND 150/mo
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Family plan covers up to 3 vehicles on one membership. Add a second
          car to your account first, then we'll show you the upgrade.
        </p>
        <div className="mt-4 bg-purple-50 rounded-lg p-3">
          <p className="text-[11px] uppercase font-bold text-purple-700">
            What you'd save
          </p>
          <p className="text-2xl font-black text-cuci-primary">
            ~BND 30/mo per extra car
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            vs. running two separate Unlimited plans
          </p>
        </div>
        <Link
          href="/dashboard?tab=vehicles"
          className="mt-auto pt-4"
          data-testid="link-add-vehicle-from-upsell"
        >
          <button
            className="w-full py-3 rounded-lg font-extrabold text-base cuci-cta"
            style={{ background: "#FF9500", color: "#1a1208" }}
          >
            Add a second car
          </button>
        </Link>
      </article>
    );
  }

  return (
    <article
      className="rounded-2xl border border-gray-200 p-6 bg-white flex flex-col"
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
        className="mt-auto pt-4 w-full"
        data-testid="button-upgrade-plan"
      >
        <span
          className="block w-full py-3 rounded-lg font-extrabold text-base cuci-cta"
          style={{ background: "#FF9500", color: "#1a1208" }}
        >
          Upgrade plan
        </span>
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
