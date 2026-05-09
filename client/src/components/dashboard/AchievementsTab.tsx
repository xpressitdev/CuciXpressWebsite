import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Trophy,
  Lock,
  CheckCircle2,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderRow, MembershipRow } from "./types";
import { computeAchievements, TONES } from "./achievementsData";

interface Props {
  orders: OrderRow[];
  memberships: MembershipRow[];
}

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AchievementsTab({ orders, memberships }: Props) {
  const achievements = computeAchievements(orders, memberships);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const overallPct = (unlockedCount / achievements.length) * 100;

  return (
    <div className="space-y-6">
      {/* Hero strip — matches the visual weight of other tabs' heroes
          (gradient + decorative blobs + overall progress). */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-700 via-violet-600 to-orange-500 text-white p-6 md:p-8 shadow-xl">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-20 -left-10 w-64 h-64 bg-amber-300/20 rounded-full blur-3xl" />

        <div className="relative flex items-start gap-4 md:gap-6 flex-wrap">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/15 backdrop-blur grid place-items-center shrink-0">
            <Trophy className="w-7 h-7 md:w-8 md:h-8 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-widest font-bold text-white/70">
              Cuci Xpress · Loyalty
            </p>
            <h1 className="text-3xl md:text-4xl font-black mt-1 leading-tight">
              Achievements
            </h1>
            <p className="text-sm text-white/80 mt-2 max-w-xl">
              Earn badges as you wash. Each one tells a little story about
              how you use Cuci Xpress.
            </p>
          </div>
        </div>

        <div className="relative mt-6 bg-white/15 backdrop-blur rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-widest font-bold text-white/80">
              Your collection
            </p>
            <p className="text-sm font-black">
              {unlockedCount} / {achievements.length}
            </p>
          </div>
          <div className="h-2.5 rounded-full bg-white/20 overflow-hidden">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: `${overallPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-amber-300 to-yellow-400"
            />
          </div>
          <p className="text-[11px] text-white/70 mt-2">
            {unlockedCount === achievements.length
              ? "Full set! You've collected every Cuci Xpress badge."
              : `${achievements.length - unlockedCount} badge${achievements.length - unlockedCount === 1 ? "" : "s"} left to discover.`}
          </p>
        </div>
      </section>

      {/* Badge grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {achievements.map((a, i) => {
          const Icon = a.unlocked ? a.icon : Lock;
          const pct = a.progress
            ? (a.progress.current / a.progress.target) * 100
            : a.unlocked
              ? 100
              : 0;
          return (
            <motion.article
              key={a.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={
                "rounded-2xl border-2 overflow-hidden flex flex-col " +
                (a.unlocked
                  ? "border-transparent shadow-md"
                  : "border-dashed border-gray-200 bg-white")
              }
              data-testid={`achievement-${a.id}`}
            >
              <div
                className={
                  "relative p-5 flex items-center gap-4 " +
                  (a.unlocked
                    ? "bg-gradient-to-br " + TONES[a.tone] + " text-white"
                    : "bg-gray-50 text-gray-400")
                }
              >
                {a.unlocked && (
                  <div className="absolute top-3 right-3 inline-flex items-center gap-1 bg-white/20 backdrop-blur text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Unlocked
                  </div>
                )}
                <div
                  className={
                    "w-12 h-12 rounded-2xl grid place-items-center shrink-0 " +
                    (a.unlocked ? "bg-white/25 backdrop-blur" : "bg-gray-200")
                  }
                >
                  <Icon
                    className={
                      "w-6 h-6 " +
                      (a.unlocked ? "text-white" : "text-gray-400")
                    }
                  />
                </div>
                <div className="min-w-0">
                  <p
                    className={
                      "text-[10px] uppercase tracking-widest font-bold " +
                      (a.unlocked ? "text-white/80" : "text-gray-400")
                    }
                  >
                    {a.rewardLabel}
                  </p>
                  <h3 className="text-base font-black leading-tight mt-0.5 truncate">
                    {a.label}
                  </h3>
                </div>
              </div>

              <div className="p-4 bg-white flex-1 flex flex-col">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {a.longDesc}
                </p>

                <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] uppercase font-black tracking-wider text-amber-700">
                      How to earn
                    </p>
                    <p className="text-xs text-amber-900 mt-0.5">
                      {a.howTo}
                    </p>
                  </div>
                </div>

                {a.progress && !a.unlocked && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 mb-1.5">
                      <span>Progress</span>
                      <span className="font-mono text-gray-700">
                        {a.progress.current} / {a.progress.target}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <motion.div
                        initial={{ width: "0%" }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className={
                          "h-full rounded-full bg-gradient-to-r " +
                          TONES[a.tone]
                        }
                      />
                    </div>
                  </div>
                )}

                {a.unlocked && a.unlockedAt && (
                  <p className="mt-3 text-[11px] text-gray-500 inline-flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-purple-500" />
                    Unlocked {formatDate(a.unlockedAt)}
                  </p>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* Footer CTA */}
      <div className="rounded-2xl bg-white border border-gray-200 p-5 md:p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base md:text-lg font-black text-gray-900">
            Closer to the next badge?
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Drive in for a wash and watch your collection grow.
          </p>
        </div>
        <Link href="/checkout">
          <Button
            className="bg-gradient-to-r from-purple-600 to-orange-500 text-white font-black"
            data-testid="button-achievements-pay-queue"
          >
            Pay & Queue Now
          </Button>
        </Link>
      </div>
    </div>
  );
}
