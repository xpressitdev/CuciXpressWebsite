import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles, ArrowLeft, Car, Clock, Timer, Activity } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

interface QueueCar {
  plate: string;
  package_name: string;
  position?: number;
}
interface QueueBranch {
  id: number;
  name: string;
  location: string | null;
  is_open: boolean;
  status?: string | null;
  status_note?: string | null;
  washing_count: number;
  queued_count: number;
  today_total: number;
  avg_wash_minutes: number | null;
  est_wait_minutes: number;
  washing: QueueCar[];
  queued: QueueCar[];
}
interface QueueSnapshot {
  branches: QueueBranch[];
  server_time: string;
}

const shortBranchName = (name: string) => name.replace(/^Cuci Xpress\s+/i, "");
const fmtWait = (m: number) =>
  m === 0 ? "Open" : m < 60 ? `~${m}m` : `~${Math.round(m / 60)}h`;

// Resolve a branch's effective live status. Falls back to the legacy is_open
// flag for older snapshots that don't carry an explicit status.
type BranchStatus = "open" | "closed" | "maintenance" | "busy";
const branchStatusOf = (b: { is_open: boolean; status?: string | null }): BranchStatus => {
  const s = (b.status ?? "") as BranchStatus;
  if (s === "open" || s === "closed" || s === "maintenance" || s === "busy") return s;
  return b.is_open ? "open" : "closed";
};
const STATUS_LABEL: Record<BranchStatus, string> = {
  open: "Open",
  busy: "Busy",
  maintenance: "Maintenance",
  closed: "Closed",
};

export default function QueuePage() {
  const { data, isLoading } = useQuery<QueueSnapshot>({
    queryKey: ["/api/queue/snapshot"],
    refetchInterval: 15_000,
  });
  const branches = data?.branches ?? [];
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected =
    branches.find((b) => b.id === selectedId) ?? branches[0] ?? null;
  const time = new Date(data?.server_time ?? Date.now()).toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit" },
  );
  const totalQueued = branches.reduce((s, b) => s + b.queued_count, 0);
  const totalWashing = branches.reduce((s, b) => s + b.washing_count, 0);
  const avgWashValues = branches
    .map((b) => b.avg_wash_minutes)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const networkAvgWash =
    avgWashValues.length > 0
      ? Math.round(avgWashValues.reduce((s, v) => s + v, 0) / avgWashValues.length)
      : null;

  return (
    <div className="cuci-page-bg">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-cuci-primary inline-flex items-center gap-1 mb-3"
          data-testid="link-queue-back"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>

        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <p className="cuci-eyebrow">CuciXpress · Live Network</p>
            <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-tight mt-1">
              Queue across all{" "}
              <span className="text-cuci-primary">branches</span>
            </h1>
            <p className="text-sm md:text-base text-gray-600 mt-2 max-w-xl">
              Real-time look at every Cuci Xpress lane. Pick the shortest
              wait and drive in.
            </p>
          </div>
          <span
            className="inline-flex items-center gap-2 bg-white border-2 border-black rounded-full px-4 py-2 text-sm font-bold shadow-[3px_3px_0px_0px_rgba(0,0,0,0.9)]"
            data-testid="badge-queue-live"
          >
            <span className="cuci-live-dot" /> LIVE · {time}
          </span>
        </div>

        {/* Top-line KPI strip */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <NetworkKpi
            icon={<Car className="w-5 h-5 text-cuci-primary" />}
            label="In queue now"
            value={totalQueued}
          />
          <NetworkKpi
            icon={<Activity className="w-5 h-5 text-cuci-secondary" />}
            label="Currently washing"
            value={totalWashing}
          />
          <NetworkKpi
            icon={<Timer className="w-5 h-5 text-emerald-600" />}
            label="Avg wash time"
            value={networkAvgWash !== null ? `${networkAvgWash}m` : "—"}
          />
        </div>

        {isLoading && (
          <div className="cuci-card p-6">
            <p className="text-sm text-gray-500">Loading live queue…</p>
          </div>
        )}

        {!isLoading && branches.length === 0 && (
          <div className="cuci-card p-6">
            <p className="text-sm text-gray-500">No branches configured yet.</p>
          </div>
        )}

        {!isLoading && branches.length > 0 && (
          <div className="grid lg:grid-cols-[300px_1fr] gap-5">
            {/* Branch list */}
            <div className="space-y-2">
              <p className="cuci-eyebrow mb-1">Choose a branch</p>
              {branches.map((b) => {
                const active = selected?.id === b.id;
                const st = branchStatusOf(b);
                const open = st === "open" || st === "busy";
                const quiet = b.queued_count === 0;
                const busy = st === "busy" || b.est_wait_minutes >= 20;
                const waitColor = !open
                  ? "text-gray-400"
                  : busy
                  ? "text-red-500"
                  : quiet
                  ? "text-emerald-600"
                  : "text-amber-600";
                const waitLabel = !open
                  ? STATUS_LABEL[st]
                  : st === "busy"
                  ? "Busy"
                  : fmtWait(b.est_wait_minutes);
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    data-testid={`button-queue-branch-${b.id}`}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all duration-150 ${
                      active
                        ? "border-black bg-white shadow-[3px_3px_0px_0px_rgba(0,0,0,0.9)]"
                        : "border-gray-200 bg-white/70 hover:border-black hover:bg-white"
                    }`}
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <span
                        className={`font-bold truncate ${
                          active ? "text-cuci-primary" : "text-gray-900"
                        }`}
                      >
                        {shortBranchName(b.name)}
                      </span>
                      <span className={`text-sm font-black ${waitColor}`}>
                        {waitLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {b.queued_count} in queue · {b.washing_count} washing
                    </p>
                    {b.status_note && (
                      <p className="text-[11px] text-amber-700 mt-1 italic truncate" data-testid={`text-branch-note-${b.id}`}>
                        {b.status_note}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected branch detail */}
            {selected && <BranchDetail branch={selected} />}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function NetworkKpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="cuci-kpi" data-testid={`kpi-net-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-2 cuci-eyebrow">
        {icon}
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{label.split(" ")[0]}</span>
      </div>
      <p className="text-2xl md:text-3xl font-black text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function BranchDetail({ branch }: { branch: QueueBranch }) {
  type LaneCar = QueueCar & { kind: "washing" | "queued"; label: string };
  const lane: LaneCar[] = [
    ...branch.washing.map((c) => ({ ...c, kind: "washing" as const, label: "Washing" })),
    ...branch.queued.map((c) => ({
      ...c,
      kind: "queued" as const,
      label: `#${c.position} Queued`,
    })),
  ];

  const st = branchStatusOf(branch);
  const open = st === "open" || st === "busy";
  const headerText =
    st === "open" ? "● Open now"
    : st === "busy" ? "● Open · busy"
    : st === "maintenance" ? "Under maintenance"
    : "Closed";
  const headerColor =
    st === "open" ? "text-cuci-primary"
    : st === "busy" ? "text-amber-600"
    : "text-gray-400";

  return (
    <div className="cuci-card p-5 md:p-7 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className={`cuci-eyebrow ${headerColor}`}>{headerText}</p>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 mt-1">
            {branch.name}
          </h2>
          {branch.location && (
            <p className="text-sm text-gray-500 mt-1">{branch.location}</p>
          )}
          {branch.status_note && (
            <p
              className="text-sm text-amber-700 mt-2 italic border-l-2 border-amber-400 pl-2"
              data-testid={`text-branch-detail-note-${branch.id}`}
            >
              {branch.status_note}
            </p>
          )}
        </div>
        {open && (
          <div className="text-right">
            <p className="cuci-eyebrow">Est. wait</p>
            <p className="text-3xl md:text-4xl font-black text-cuci-secondary">
              {st === "busy" ? "Long" : fmtWait(branch.est_wait_minutes)}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <BranchKpi label="In queue" value={String(branch.queued_count)} />
        <BranchKpi label="Washing" value={String(branch.washing_count)} accent />
        <BranchKpi
          label="Avg wash"
          value={branch.avg_wash_minutes ? `${branch.avg_wash_minutes}m` : "—"}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="cuci-eyebrow inline-flex items-center gap-1.5">
            <Clock className="w-3 h-3" /> Wash lane · live
          </p>
          {lane.length > 0 && (
            <p className="text-xs text-gray-500">
              {lane.length} car{lane.length === 1 ? "" : "s"} in lane
            </p>
          )}
        </div>
        {lane.length === 0 ? (
          <div className="rounded-xl bg-emerald-50 border-2 border-emerald-200 p-6 text-center">
            <Sparkles className="w-7 h-7 text-emerald-600 mx-auto mb-2" />
            <p className="font-bold text-emerald-800">
              {st === "maintenance"
                ? "This branch is under maintenance."
                : st === "closed"
                ? "This branch is currently closed."
                : "This branch is quiet right now."}
            </p>
            {open && (
              <p className="text-sm text-emerald-700 mt-1">
                {st === "busy"
                  ? "Open, but expect a longer wait."
                  : "Drive straight in — no waiting."}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-black bg-gradient-to-br from-gray-900 to-gray-800 p-4 overflow-x-auto shadow-[3px_3px_0px_0px_rgba(0,0,0,0.9)]">
            <div className="flex gap-3 min-w-max items-stretch text-xs">
              <div className="flex items-center text-gray-400 px-2 font-bold tracking-wider">
                ENTRY →
              </div>
              {lane.map((car, i) => (
                <div
                  key={i}
                  data-testid={`lane-car-${i}`}
                  className={`px-3 py-2 rounded-md border-2 min-w-[150px] ${
                    car.kind === "washing"
                      ? "border-cuci-secondary bg-cuci-primary/40 text-white shadow-[2px_2px_0px_0px_rgba(255,255,255,0.15)]"
                      : "border-gray-700 bg-gray-800 text-gray-200"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-wider opacity-80 font-bold">
                    {car.label}
                  </p>
                  <p className="font-black text-sm">{car.plate}</p>
                  <p className="text-[10px] opacity-80 truncate max-w-[130px]">
                    {car.package_name}
                  </p>
                </div>
              ))}
              <div className="flex items-center text-gray-400 px-2 font-bold tracking-wider">
                → EXIT
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BranchKpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="cuci-eyebrow">{label}</p>
      <p
        className={`text-2xl md:text-3xl font-black mt-1 ${
          accent ? "text-cuci-secondary" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
