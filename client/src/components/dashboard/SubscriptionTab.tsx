import { Crown } from "lucide-react";
import { Link } from "wouter";
import { MembershipRow, CarRow, formatBND, formatBNDFull } from "./types";

interface Props {
  memberships: MembershipRow[];
  cars: CarRow[];
  washesThisMonth: number;
  washesLastMonth: number;
}

export function SubscriptionTab({
  memberships,
  cars,
  washesThisMonth,
  washesLastMonth,
}: Props) {
  const active = memberships.find((m) => m.status === "active");
  const past = memberships.filter((m) => m.status !== "active");

  const avgPerWeek = (() => {
    if (washesThisMonth + washesLastMonth === 0) return "0";
    const avg = (washesThisMonth + washesLastMonth) / (4.34 * 2);
    return avg.toFixed(1);
  })();

  // Rough savings estimate: assume each wash on the plan would have cost
  // BND 8 pay-as-you-go (basic). Replace with real package prices later.
  const PAY_AS_YOU_GO_CENTS = 800;
  const savingsCents = Math.max(
    0,
    washesThisMonth * PAY_AS_YOU_GO_CENTS -
      (active ? Math.round(active.price_cents) : 0),
  );

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
            savingsCents={savingsCents}
          />
        ) : (
          <NoPlanCard />
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

  return (
    <article
      className="rounded-2xl bg-gray-900 text-white p-6"
      data-testid="card-subscription-active"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold bg-amber-500 text-white px-2 py-0.5 rounded">
          {membership.kind === "unlimited" ? "Unlimited" : "Pack"} · Active
        </span>
        <Crown className="w-5 h-5 text-amber-400" />
      </div>
      <h2 className="text-3xl font-black mt-3">
        {membership.kind === "unlimited" ? "Unlimited Xpress" : "Wash Pack"}
      </h2>
      <p className="text-sm text-gray-400 mt-1">
        {formatBNDFull(membership.price_cents)}/mo · Renews {renewLabel}
      </p>

      <div className="border-t border-gray-700 my-5" />

      <p className="text-[11px] uppercase font-bold tracking-wider text-gray-400 mb-3">
        This billing cycle
      </p>
      <div className="grid grid-cols-3 gap-4">
        <Stat top="Washes" value={String(washesThisMonth)} />
        <Stat top="Avg per week" value={avgPerWeek} />
        <Stat
          top="Saved"
          value={formatBND(savingsCents)}
          accent="text-emerald-400"
        />
      </div>

      <div className="flex gap-2 mt-6">
        <button
          className="px-4 py-2 rounded-lg bg-gray-800 text-sm font-bold hover:bg-gray-700"
          data-testid="button-manage-payment"
        >
          Manage payment
        </button>
        <button
          className="px-4 py-2 rounded-lg border border-gray-600 text-sm font-bold hover:bg-gray-800"
          data-testid="button-cancel-plan"
        >
          Cancel plan
        </button>
      </div>
    </article>
  );
}

function NoPlanCard() {
  return (
    <article
      className="rounded-2xl border-2 border-dashed border-gray-300 p-6 bg-white flex flex-col"
      data-testid="card-subscription-empty"
    >
      <h2 className="text-2xl font-black text-gray-900">No active plan</h2>
      <p className="text-sm text-gray-500 mt-1">
        Subscribe to unlimited or a wash pack to lock in savings.
      </p>
      <Link
        href="/#subscriptions"
        className="mt-auto self-start mt-6 px-4 py-2.5 bg-cuci-primary text-white rounded-lg font-bold border-2 border-black"
      >
        See plans
      </Link>
    </article>
  );
}

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
        <h3 className="text-lg font-bold text-gray-900">
          Why subscribe?
        </h3>
        <ul className="mt-4 space-y-2 text-sm text-gray-700">
          <li>• Wash as often as you want — no per-wash payment</li>
          <li>• Skip the queue with priority lane</li>
          <li>• Cancel anytime, no contracts</li>
        </ul>
      </article>
    );
  }

  if (!showFamilyOffer) {
    return (
      <article className="rounded-2xl border border-gray-200 p-6 bg-white">
        <h3 className="text-lg font-bold text-gray-900">
          Add a second car?
        </h3>
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
  accent,
}: {
  top: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase font-semibold text-gray-400">{top}</p>
      <p className={`text-2xl font-black mt-0.5 ${accent ?? "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
