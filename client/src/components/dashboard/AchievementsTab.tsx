import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Trophy,
  Lock,
  CheckCircle2,
  Lightbulb,
  Sparkles,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderRow, MembershipRow } from "./types";
import { Achievement, computeAchievements, TONES } from "./achievementsData";
import { BadgeShareDialog } from "./BadgeShareDialog";

interface Props {
  orders: OrderRow[];
  memberships: MembershipRow[];
  customerName: string;
}

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function AchievementsTab({ orders, memberships, customerName }: Props) {
  const achievements = computeAchievements(orders, memberships);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const overallPct = (unlockedCount / achievements.length) * 100;
  const [sharing, setSharing] = useState<Achievement | null>(null);
  const grandTrophy = achievements.find((a) => a.id === "grand-trophy");

  return (
    <div className="space-y-6">
      {/* Trophy-room hero — midnight base with a champagne-gold spotlight,
          metallic shimmer line, and a confetti dot pattern. Deliberately
          off-brand from the purple/orange used elsewhere so the
          Achievements tab feels like a "prize cabinet". */}
      <section className="relative overflow-hidden rounded-3xl text-white p-6 md:p-8 shadow-xl bg-[radial-gradient(ellipse_at_top_right,#fde68a_0%,#f59e0b_18%,#78350f_45%,#1c1917_100%)]">
        {/* subtle confetti sparkles */}
        <div
          className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, rgba(253,224,71,0.6) 0 1.5px, transparent 2px)," +
              "radial-gradient(circle at 70% 60%, rgba(255,255,255,0.5) 0 1px, transparent 2px)," +
              "radial-gradient(circle at 40% 80%, rgba(252,211,77,0.6) 0 1.2px, transparent 2px)," +
              "radial-gradient(circle at 85% 20%, rgba(255,255,255,0.4) 0 1px, transparent 2px)," +
              "radial-gradient(circle at 10% 70%, rgba(253,224,71,0.5) 0 1.2px, transparent 2px)",
            backgroundSize: "180px 180px, 220px 220px, 160px 160px, 200px 200px, 240px 240px",
          }}
        />
        {/* warm spotlight blob */}
        <div className="absolute -top-20 -right-16 w-72 h-72 bg-amber-200/30 rounded-full blur-3xl" />
        {/* thin gold shimmer divider */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />

        <div className="relative flex items-start gap-4 md:gap-6 flex-wrap">
          {/* Trophy chip — gold gradient with a glow ring */}
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-2xl bg-amber-300/40 blur-xl" />
            <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-yellow-200 via-amber-400 to-yellow-600 grid place-items-center ring-2 ring-amber-200/60 shadow-[0_0_30px_rgba(251,191,36,0.45)]">
              <Trophy className="w-7 h-7 md:w-8 md:h-8 text-amber-900 drop-shadow" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-amber-200/90">
              Cuci Xpress · Trophy room
            </p>
            <h1 className="text-3xl md:text-4xl font-black mt-1 leading-tight bg-gradient-to-r from-amber-100 via-yellow-200 to-amber-300 bg-clip-text text-transparent">
              Achievements
            </h1>
            <p className="text-sm text-amber-50/80 mt-2 max-w-xl">
              Polish your collection. Each badge tells a story about how
              you use Cuci Xpress — and a few are properly hard to earn.
            </p>
          </div>
        </div>

        <div className="relative mt-6 rounded-2xl p-4 bg-stone-900/40 backdrop-blur ring-1 ring-amber-300/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-amber-200/80">
              Your collection
            </p>
            <p className="text-sm font-black text-amber-100">
              {unlockedCount} / {achievements.length}
            </p>
          </div>
          <div className="h-2.5 rounded-full bg-stone-950/60 overflow-hidden ring-1 ring-amber-300/10">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: `${overallPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500 shadow-[0_0_12px_rgba(251,191,36,0.7)]"
            />
          </div>
          <p className="text-[11px] text-amber-100/70 mt-2">
            {unlockedCount === achievements.length
              ? "Full set! Every Cuci Xpress badge is yours — pure gold."
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

                {/* Share button only on unlocked badges. Pushes the
                    badge into the share dialog which renders the PNG. */}
                {a.unlocked && (
                  <button
                    onClick={() => setSharing(a)}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border-2 border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-black uppercase tracking-wider transition-colors"
                    data-testid={`button-share-${a.id}`}
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share badge
                  </button>
                )}
              </div>
            </motion.article>
          );
        })}
      </div>

      {/* Celebratory call-out when the legendary trophy is unlocked */}
      {grandTrophy?.unlocked && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-3xl p-6 md:p-7 text-white shadow-xl bg-gradient-to-br from-fuchsia-600 via-amber-400 to-cyan-500"
          data-testid="card-grand-trophy-callout"
        >
          <div className="absolute -top-12 -right-12 w-56 h-56 bg-white/20 rounded-full blur-3xl" />
          <div className="relative flex items-center gap-4 flex-wrap">
            <div className="text-5xl md:text-6xl">🏆</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/80">
                Legendary unlock
              </p>
              <h2 className="text-xl md:text-2xl font-black leading-tight">
                You collected the Cuci Xpress Trophy!
              </h2>
              <p className="text-sm text-white/90 mt-1">
                Only the most dedicated drivers ever see this. Time to brag.
              </p>
            </div>
            <Button
              onClick={() => setSharing(grandTrophy)}
              className="bg-white text-fuchsia-700 hover:bg-white/90 font-black"
              data-testid="button-share-grand-trophy"
            >
              <Share2 className="w-4 h-4 mr-2" /> Share trophy
            </Button>
          </div>
        </motion.div>
      )}

      <BadgeShareDialog
        achievement={sharing}
        customerName={customerName}
        onClose={() => setSharing(null)}
      />

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
