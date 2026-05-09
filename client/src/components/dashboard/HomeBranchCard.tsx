import { useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { MapPin, Clock, Car, ArrowRight, Home } from "lucide-react";
import { OrderRow, QueueBranch } from "./types";

interface Props {
  orders: OrderRow[];
  branches: QueueBranch[];
}

// Pick the branch the customer has washed at most often. Falls back to
// the open branch with the shortest queue, then to anything.
function pickHome(
  orders: OrderRow[],
  branches: QueueBranch[],
): QueueBranch | null {
  if (branches.length === 0) return null;

  const tally = new Map<string, number>();
  for (const o of orders) {
    if (o.branch_name) tally.set(o.branch_name, (tally.get(o.branch_name) ?? 0) + 1);
  }
  const ranked = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  for (const [name] of ranked) {
    const match = branches.find((b) => b.name === name);
    if (match) return match;
  }
  // No history yet — pick the friendliest open branch as a default.
  const openSorted = branches
    .filter((b) => b.is_open)
    .sort((a, b) => a.queued_count - b.queued_count);
  return openSorted[0] ?? branches[0];
}

export function HomeBranchCard({ orders, branches }: Props) {
  const home = useMemo(() => pickHome(orders, branches), [orders, branches]);
  const visitCount = useMemo(() => {
    if (!home) return 0;
    return orders.filter((o) => o.branch_name === home.name).length;
  }, [orders, home]);

  if (!home) return null;

  const closed = !home.is_open;
  const quiet = home.queued_count === 0 && !closed;
  const busy = home.est_wait_minutes >= 20 && !closed;

  // Mood gradient + tone follows queue state.
  const grad = closed
    ? "from-slate-700 via-slate-600 to-slate-800"
    : busy
      ? "from-rose-600 via-orange-500 to-amber-500"
      : quiet
        ? "from-emerald-600 via-teal-500 to-cyan-500"
        : "from-purple-600 via-violet-500 to-orange-500";

  const statusPill = closed
    ? "Closed"
    : quiet
      ? "Drive in now"
      : busy
        ? `Busy · ~${home.est_wait_minutes} min`
        : `~${home.est_wait_minutes} min wait`;

  const headline = closed
    ? "Your home branch is closed"
    : quiet
      ? "Empty lane — drive in!"
      : busy
        ? `${home.queued_count} cars ahead of you`
        : `${home.queued_count} car${home.queued_count === 1 ? "" : "s"} in queue`;

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${grad} text-white p-6 md:p-7 shadow-xl`}
      data-testid="card-home-branch"
    >
      {/* decorative blobs */}
      <div className="absolute -top-16 -right-12 w-56 h-56 bg-white/10 rounded-full blur-2xl" />
      <div className="absolute -bottom-20 -left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl" />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-white/80 text-[11px] uppercase tracking-widest font-bold">
            <Home className="w-3.5 h-3.5" />
            Your home branch
          </div>
          <h2 className="text-2xl md:text-3xl font-black mt-1.5 tracking-tight">
            {home.name}
          </h2>
          <p className="text-sm text-white/85 mt-1 inline-flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {home.location ?? "Brunei"}
            {visitCount > 0 && (
              <span className="ml-2 text-white/70">
                · {visitCount} of your {orders.length} wash{orders.length === 1 ? "" : "es"}
              </span>
            )}
          </p>

          {/* Live state row */}
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 backdrop-blur text-xs font-bold">
              <span className="relative flex h-2 w-2">
                {!closed && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
                )}
                <span
                  className={
                    "relative inline-flex rounded-full h-2 w-2 " +
                    (closed ? "bg-white/50" : "bg-white")
                  }
                />
              </span>
              LIVE
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-gray-900 text-xs font-black">
              <Clock className="w-3 h-3" />
              {statusPill}
            </span>
            {!closed && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/20 backdrop-blur text-xs font-bold">
                <Car className="w-3 h-3" />
                {home.washing_count} washing
              </span>
            )}
            {home.today_total > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/20 backdrop-blur text-xs font-bold">
                {home.today_total} done today
              </span>
            )}
          </div>

          <p className="mt-3 text-base font-semibold drop-shadow">
            {headline}
          </p>
        </div>

        <div className="flex flex-col gap-2 md:items-end shrink-0">
          <Link
            href="/checkout"
            className="inline-flex items-center justify-center gap-1.5 px-5 py-3 bg-white text-gray-900 rounded-xl font-black shadow-lg hover:translate-y-[-2px] transition-transform whitespace-nowrap"
            data-testid="button-home-pay"
          >
            Pay & queue here <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/queue"
            className="text-xs font-bold text-white/90 hover:text-white hover:underline"
            data-testid="link-home-see-queue"
          >
            See all branches →
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
