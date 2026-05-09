import { motion } from "framer-motion";
import { Link } from "wouter";
import { Trophy, Lock, ArrowRight } from "lucide-react";
import { OrderRow, MembershipRow } from "./types";
import { computeAchievements, TONES } from "./achievementsData";

interface Props {
  orders: OrderRow[];
  memberships: MembershipRow[];
}

export function AchievementsRow({ orders, memberships }: Props) {
  const achievements = computeAchievements(orders, memberships);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <section
      className="bg-white rounded-2xl border border-gray-200 p-5"
      data-testid="card-achievements"
    >
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-purple-600">
          <Trophy className="w-4 h-4" />
          <p className="text-[11px] uppercase tracking-widest font-bold">
            Achievements
          </p>
          <h2 className="text-base font-bold text-gray-900 ml-2">
            Your badges
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold bg-gradient-to-r from-purple-600 to-orange-500 text-white px-3 py-1 rounded-full">
            {unlockedCount} / {achievements.length} unlocked
          </span>
          <Link
            href="/achievements"
            className="text-xs font-bold text-purple-600 hover:text-purple-800 inline-flex items-center gap-1"
            data-testid="link-achievements-all"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {achievements.map((a, i) => {
          const Icon = a.unlocked ? a.icon : Lock;
          const pct = a.progress
            ? (a.progress.current / a.progress.target) * 100
            : a.unlocked
              ? 100
              : 0;
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={
                "snap-start shrink-0 w-32 rounded-xl p-3 border-2 text-center " +
                (a.unlocked
                  ? "border-transparent bg-gradient-to-br " + TONES[a.tone] + " text-white shadow-md"
                  : "border-dashed border-gray-200 bg-gray-50 text-gray-400")
              }
              data-testid={`badge-${a.id}`}
              title={a.desc}
            >
              <div
                className={
                  "w-10 h-10 rounded-full grid place-items-center mx-auto mb-2 " +
                  (a.unlocked ? "bg-white/25 backdrop-blur" : "bg-gray-200")
                }
              >
                <Icon className={"w-5 h-5 " + (a.unlocked ? "text-white" : "text-gray-400")} />
              </div>
              <p
                className={
                  "text-[11px] uppercase font-black tracking-wider leading-tight " +
                  (a.unlocked ? "text-white" : "text-gray-500")
                }
              >
                {a.label}
              </p>
              <p
                className={
                  "text-[9px] mt-0.5 leading-tight " +
                  (a.unlocked ? "text-white/80" : "text-gray-400")
                }
              >
                {a.desc}
              </p>
              {a.progress && !a.unlocked && (
                <div className="mt-2 h-1 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-orange-500"
                    style={{ width: `${pct}%`, transition: "width 600ms ease-out" }}
                  />
                </div>
              )}
              {a.progress && !a.unlocked && (
                <p className="text-[9px] font-mono text-gray-400 mt-1">
                  {a.progress.current}/{a.progress.target}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
