import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Sparkles, ArrowLeft, Activity } from "lucide-react";
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
  washing_count: number;
  queued_count: number;
  today_total: number;
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-cuci-primary inline-flex items-center gap-1 mb-2"
              data-testid="link-queue-back"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
              CuciXpress · Live
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Queue across all branches
            </h1>
          </div>
          <span className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-sm font-medium">
            <Activity className="w-4 h-4" />
            Live · {time}
          </span>
        </div>

        {isLoading && <p className="text-sm text-gray-500">Loading live queue…</p>}

        {!isLoading && branches.length === 0 && (
          <p className="text-sm text-gray-500">No branches configured yet.</p>
        )}

        {!isLoading && branches.length > 0 && (
          <div className="grid lg:grid-cols-[280px_1fr] gap-6">
            {/* Branch list */}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
                Choose a branch
              </p>
              {branches.map((b) => {
                const active = selected?.id === b.id;
                const quiet = b.queued_count === 0;
                const busy = b.est_wait_minutes >= 20;
                const waitColor = !b.is_open
                  ? "text-gray-400"
                  : quiet
                  ? "text-emerald-600"
                  : busy
                  ? "text-red-500"
                  : "text-amber-600";
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    data-testid={`button-queue-branch-${b.id}`}
                    className={`w-full text-left p-3 rounded-lg border-2 transition ${
                      active
                        ? "border-cuci-primary bg-cuci-primary/5"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <span
                        className={`font-semibold truncate ${
                          active ? "text-cuci-primary" : "text-gray-900"
                        }`}
                      >
                        {shortBranchName(b.name)}
                      </span>
                      <span className={`text-sm font-bold ${waitColor}`}>
                        {b.is_open ? fmtWait(b.est_wait_minutes) : "Closed"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {b.queued_count} in queue · {b.washing_count} washing
                    </p>
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

  return (
    <div className="bg-white rounded-xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)] p-5 md:p-6 space-y-5">
      <div>
        <p className="text-xs uppercase tracking-wider text-cuci-primary font-semibold">
          {branch.is_open ? "Open" : "Closed"}
        </p>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">{branch.name}</h2>
        {branch.location && (
          <p className="text-sm text-gray-500">{branch.location}</p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile label="Cars in queue" value={String(branch.queued_count)} />
        <KpiTile
          label="Estimated wait"
          value={branch.is_open ? fmtWait(branch.est_wait_minutes) : "—"}
          accent
        />
        <KpiTile label="Washing now" value={String(branch.washing_count)} />
        <KpiTile label="Today total" value={String(branch.today_total)} />
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          Wash lane · live
        </p>
        {lane.length === 0 ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-6 text-center">
            <Sparkles className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
            <p className="font-semibold text-emerald-800">
              {branch.is_open
                ? "This branch is quiet right now."
                : "This branch is currently closed."}
            </p>
            {branch.is_open && (
              <p className="text-sm text-emerald-700">Drive straight in — no waiting.</p>
            )}
          </div>
        ) : (
          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <div className="flex gap-3 min-w-max items-stretch text-xs">
              <div className="flex items-center text-gray-500 px-2 font-semibold">
                ENTRY →
              </div>
              {lane.map((car, i) => (
                <div
                  key={i}
                  data-testid={`lane-car-${i}`}
                  className={`px-3 py-2 rounded-md border-2 min-w-[150px] ${
                    car.kind === "washing"
                      ? "border-cuci-primary bg-cuci-primary/30 text-white"
                      : "border-gray-700 bg-gray-800 text-gray-200"
                  }`}
                >
                  <p className="text-[10px] uppercase tracking-wider opacity-80">
                    {car.label}
                  </p>
                  <p className="font-bold text-sm">{car.plate}</p>
                  <p className="text-[10px] opacity-80 truncate max-w-[130px]">
                    {car.package_name}
                  </p>
                </div>
              ))}
              <div className="flex items-center text-gray-500 px-2 font-semibold">
                → EXIT
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${
          accent ? "text-cuci-secondary" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
