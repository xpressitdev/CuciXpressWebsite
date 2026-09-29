import { useMutation, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Crown, Medal, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface LeaderboardEntry {
  rank: number;
  masked_name: string;
  plate: string | null;
  wash_count: number;
  is_me: boolean;
}

interface LeaderboardResp {
  total_ranked: number;
  my_rank: number | null;
  my_washes: number;
  show_full_plate_on_leaderboard: boolean;
  entries: LeaderboardEntry[];
}

function rankBadge(rank: number) {
  if (rank === 1) return { Icon: Crown, cls: "text-amber-500", bg: "bg-amber-100" };
  if (rank === 2) return { Icon: Medal, cls: "text-slate-400", bg: "bg-slate-100" };
  if (rank === 3) return { Icon: Medal, cls: "text-orange-400", bg: "bg-orange-100" };
  return null;
}

export function Leaderboard() {
  const { data, isLoading, error } = useQuery<LeaderboardResp>({
    queryKey: ["/api/customer/leaderboard"],
  });
  const preference = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("PATCH", "/api/customer/leaderboard/preference", {
        show_full_plate_on_leaderboard: enabled,
      });
      return response.json() as Promise<{ show_full_plate_on_leaderboard: boolean }>;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<LeaderboardResp>(["/api/customer/leaderboard"], (old) =>
        old ? { ...old, show_full_plate_on_leaderboard: result.show_full_plate_on_leaderboard } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["/api/customer/leaderboard"] });
    },
  });

  if (isLoading) {
    return (
      <section className="bg-white border border-gray-200 rounded-3xl p-8 grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </section>
    );
  }

  if (!data) {
    return (
      <section className="bg-white border border-gray-200 rounded-3xl p-8 text-center">
        <p className="text-sm text-red-600">{error instanceof Error ? error.message : "Could not load leaderboard."}</p>
      </section>
    );
  }

  return (
    <section
      className="bg-white border border-gray-200 rounded-3xl overflow-hidden"
      data-testid="section-leaderboard"
    >
      <header className="px-5 md:px-6 pt-5 pb-4 bg-gradient-to-r from-purple-50 via-violet-50 to-orange-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-orange-500 grid place-items-center text-white shadow-md">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-black text-gray-900">
              Leaderboard
            </h2>
            <p className="text-[11px] text-gray-500">
              Lifetime washes · 10 above & 10 below you
            </p>
          </div>
        </div>
        {data.my_rank !== null && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
              Your rank
            </p>
            <p className="text-lg font-black text-gray-900">
              #{data.my_rank}
              <span className="text-xs font-bold text-gray-400 ml-1">
                / {data.total_ranked}
              </span>
            </p>
          </div>
        )}
      </header>

      {data.entries.length === 0 && (
        <p className="p-6 text-sm text-gray-500 text-center">The leaderboard fills up once a few customers get washing.</p>
      )}
      <ul className="divide-y divide-gray-100">
        {data.entries.map((e, i) => {
          const badge = rankBadge(e.rank);
          return (
            <motion.li
              key={e.rank}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className={
                "flex items-center gap-3 px-4 md:px-6 py-3 " +
                (e.is_me
                  ? "bg-gradient-to-r from-purple-50 via-violet-50 to-orange-50 border-l-4 border-purple-500"
                  : "")
              }
              data-testid={`row-leaderboard-${e.rank}`}
            >
              {/* Rank pill */}
              <div className="w-10 shrink-0 text-center">
                {badge ? (
                  <div
                    className={`inline-grid place-items-center w-9 h-9 rounded-full ${badge.bg}`}
                  >
                    <badge.Icon className={`w-5 h-5 ${badge.cls}`} />
                  </div>
                ) : (
                  <span
                    className={
                      "font-mono font-black text-sm " +
                      (e.is_me ? "text-purple-700" : "text-gray-400")
                    }
                  >
                    #{e.rank}
                  </span>
                )}
              </div>

              {/* Plates are primary; names arrive already censored by the server. */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p
                    className={
                      "text-sm font-mono font-bold truncate " +
                      (e.is_me ? "text-purple-900" : "text-gray-900")
                    }
                  >
                    {e.plate ?? "No plate"}
                  </p>
                  {e.is_me && <span className="shrink-0 text-[10px] font-bold text-purple-700">Your car</span>}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5 truncate">{e.masked_name}</p>
              </div>

              {/* Wash count */}
              <div className="text-right shrink-0">
                <p
                  className={
                    "font-black text-base leading-none " +
                    (e.is_me ? "text-purple-700" : "text-gray-900")
                  }
                >
                  {e.wash_count}
                </p>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mt-0.5">
                  washes
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>

      <footer className="px-5 md:px-6 py-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500">
        <label className="flex items-center justify-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={data.show_full_plate_on_leaderboard}
            disabled={preference.isPending}
            onChange={(event) => preference.mutate(event.target.checked)}
            className="accent-purple-600"
          />
          Show my full plate on the leaderboard
        </label>
        <p className="text-center mt-1">On by default. Turn off to mask your plate for others. Names are always censored.</p>
        {preference.isPending && <p role="status" className="text-center mt-1">Saving preference…</p>}
        {preference.isError && <p role="alert" className="text-center text-red-600 mt-1">Could not save preference. Please try again.</p>}
      </footer>
    </section>
  );
}
