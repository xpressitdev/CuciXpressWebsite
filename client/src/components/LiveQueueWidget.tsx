import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight } from "lucide-react";

interface QueueBranch {
  id: number;
  name: string;
  is_open: boolean;
  queued_count: number;
  washing_count: number;
  today_total: number;
  est_wait_minutes: number;
}
interface Snap {
  branches: QueueBranch[];
  server_time: string;
}

const shortBranchName = (name: string) => name.replace(/^Cuci Xpress\s+/i, "");

export default function LiveQueueWidget() {
  const { data, isLoading } = useQuery<Snap>({
    queryKey: ["/api/queue/snapshot"],
    refetchInterval: 15_000,
  });
  const branches = data?.branches ?? [];
  const totalToday = branches.reduce((s, b) => s + b.today_total, 0);
  const openOnly = branches.filter((b) => b.is_open);
  const shortest = [...openOnly].sort((a, b) => a.est_wait_minutes - b.est_wait_minutes)[0];
  const maxWait = Math.max(20, ...branches.map((b) => b.est_wait_minutes));
  const time = new Date(data?.server_time ?? Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div
        className="bg-white rounded-2xl border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.9)] p-5 md:p-6 max-w-3xl mx-auto"
        data-testid="widget-live-queue"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 text-emerald-600 text-sm font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            LIVE · {time}
          </span>
        </div>
        <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4">
          Queue across all branches
        </h3>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : branches.length === 0 ? (
          <p className="text-sm text-gray-500">No branches yet.</p>
        ) : (
          <div className="space-y-2">
            {branches.map((b) => {
              const pct = Math.min(100, (b.est_wait_minutes / maxWait) * 100);
              const quiet = b.queued_count === 0;
              const busy = b.est_wait_minutes >= 20;
              const color = quiet
                ? "bg-emerald-500"
                : busy
                ? "bg-red-500"
                : b.est_wait_minutes >= 10
                ? "bg-amber-500"
                : "bg-emerald-500";
              const label = !b.is_open ? "Closed" : quiet ? "Open" : `~${b.est_wait_minutes}m`;
              const labelColor = !b.is_open
                ? "text-gray-400"
                : quiet
                ? "text-emerald-600"
                : busy
                ? "text-red-500"
                : "text-gray-700";
              return (
                <div
                  key={b.id}
                  className="grid grid-cols-[100px_1fr_60px] md:grid-cols-[140px_1fr_70px] items-center gap-3"
                  data-testid={`row-widget-branch-${b.id}`}
                >
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {shortBranchName(b.name)}
                  </span>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${color} transition-all`}
                      style={{ width: b.is_open ? `${Math.max(pct, 6)}%` : "0%" }}
                    />
                  </div>
                  <span className={`text-sm font-bold text-right ${labelColor}`}>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between mt-5 pt-4 border-t flex-wrap gap-2">
          {shortest && shortest.queued_count > 0 ? (
            <span className="text-sm text-gray-600">
              Shortest wait:{" "}
              <span className="text-cuci-primary font-semibold">
                {shortBranchName(shortest.name)}
              </span>{" "}
              · drive in
            </span>
          ) : shortest ? (
            <span className="text-sm text-gray-600">
              <span className="text-emerald-600 font-semibold">All quiet</span> — drive in any branch
            </span>
          ) : (
            <span className="text-sm text-gray-500">No open branches.</span>
          )}
          <Link
            href="/queue"
            className="inline-flex items-center gap-1 text-sm font-semibold text-cuci-primary hover:underline"
            data-testid="link-see-live-queue"
          >
            See live queue <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
