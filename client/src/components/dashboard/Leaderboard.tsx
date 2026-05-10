import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Crown, Medal, Loader2 } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  first_name: string;
  last_name: string;
  plate: string | null;
  total_washes: number;
  is_me: boolean;
}

interface LeaderboardResp {
  total_ranked: number;
  my_rank: number | null;
  my_washes: number;
  entries: LeaderboardEntry[];
}

// Show "Hadi A." style — full first name, last initial only. Plates are
// shown in full per the owner's call (it's a public-ish identifier and
// most customers know each other's cars anyway in Brunei).
function displayName(e: LeaderboardEntry) {
  const first = e.first_name?.trim() || "Driver";
  const lastInitial = e.last_name?.trim()?.[0];
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

function rankBadge(rank: number) {
  if (rank === 1) return { Icon: Crown, cls: "text-amber-500", bg: "bg-amber-100" };
  if (rank === 2) return { Icon: Medal, cls: "text-slate-400", bg: "bg-slate-100" };
  if (rank === 3) return { Icon: Medal, cls: "text-orange-400", bg: "bg-orange-100" };
  return null;
}

export function Leaderboard() {
  const { data, isLoading } = useQuery<LeaderboardResp>({
    queryKey: ["/api/customer/leaderboard"],
  });

  if (isLoading) {
    return (
      <section className="bg-white border border-gray-200 rounded-3xl p-8 grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </section>
    );
  }

  if (!data || data.entries.length === 0) {
    return (
      <section className="bg-white border border-gray-200 rounded-3xl p-8 text-center">
        <Trophy className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">
          The leaderboard fills up once a few customers get washing.
        </p>
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

      <ul className="divide-y divide-gray-100">
        {data.entries.map((e, i) => {
          const badge = rankBadge(e.rank);
          return (
            <motion.li
              key={`${e.rank}-${e.first_name}`}
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

              {/* Name + plate */}
              <div className="flex-1 min-w-0">
                <p
                  className={
                    "text-sm font-bold truncate " +
                    (e.is_me ? "text-purple-900" : "text-gray-900")
                  }
                >
                  {e.is_me ? "You" : displayName(e)}
                  {e.is_me && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest font-black bg-purple-600 text-white px-1.5 py-0.5 rounded">
                      You
                    </span>
                  )}
                </p>
                {e.plate && (
                  <p className="text-[11px] font-mono text-gray-500 mt-0.5 truncate">
                    {e.plate}
                  </p>
                )}
              </div>

              {/* Wash count */}
              <div className="text-right shrink-0">
                <p
                  className={
                    "font-black text-base leading-none " +
                    (e.is_me ? "text-purple-700" : "text-gray-900")
                  }
                >
                  {e.total_washes}
                </p>
                <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mt-0.5">
                  washes
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>

      <footer className="px-5 md:px-6 py-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500 text-center">
        Updated live · climb the ranks with every wash
      </footer>
    </section>
  );
}
