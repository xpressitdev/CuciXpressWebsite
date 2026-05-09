import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Award,
  Sparkles,
  Crown,
  MapPin,
  Gift,
  Flame,
  Sunrise,
  Lock,
  Medal,
} from "lucide-react";
import { OrderRow, MembershipRow } from "./types";

interface Props {
  orders: OrderRow[];
  memberships: MembershipRow[];
}

interface Achievement {
  id: string;
  label: string;
  desc: string;
  icon: typeof Trophy;
  unlocked: boolean;
  progress?: { current: number; target: number };
  tone: string; // tailwind gradient when unlocked
}

const TONES = {
  bronze:   "from-amber-700 via-orange-600 to-yellow-700",
  silver:   "from-slate-400 via-gray-400 to-slate-500",
  gold:     "from-amber-400 via-yellow-500 to-orange-500",
  platinum: "from-purple-500 via-violet-500 to-pink-500",
  diamond:  "from-cyan-400 via-sky-500 to-blue-600",
};

export function AchievementsRow({ orders, memberships }: Props) {
  const data = useMemo(() => {
    const total = orders.length;

    // Distinct branches visited.
    const branches = new Set(
      orders.map((o) => o.branch_name).filter((x): x is string => !!x),
    );

    // Did the customer ever redeem a loyalty/voucher freebie?
    const hasFreebie = orders.some(
      (o) => o.payment_method === "voucher" || o.total_cents === 0,
    );

    // Premium loyalist = most-bought package family is Premium.
    const pkgTally = new Map<string, number>();
    for (const o of orders) {
      const fam = /premium/i.test(o.package_name)
        ? "premium"
        : /full/i.test(o.package_name)
          ? "full"
          : /basic/i.test(o.package_name)
            ? "basic"
            : "other";
      pkgTally.set(fam, (pkgTally.get(fam) ?? 0) + 1);
    }
    const topFam = Array.from(pkgTally.entries()).sort((a, b) => b[1] - a[1])[0];
    const isPremiumLoyalist = topFam?.[0] === "premium" && (topFam?.[1] ?? 0) >= 5;

    // Early bird — washed before 08:00 local at least 3 times.
    const earlyCount = orders.filter((o) => {
      const h = new Date(o.created_at).getHours();
      return h < 8;
    }).length;
    const isEarlyBird = earlyCount >= 3;

    // Year-rounder — washed in 6+ distinct calendar months.
    const months = new Set(
      orders.map((o) => {
        const d = new Date(o.created_at);
        return `${d.getFullYear()}-${d.getMonth()}`;
      }),
    );
    const isYearRounder = months.size >= 6;

    // Subscriber ever?
    const everSubscribed = memberships.length > 0;

    return {
      total,
      branchesCount: branches.size,
      hasFreebie,
      isPremiumLoyalist,
      isEarlyBird,
      earlyCount,
      isYearRounder,
      monthsCount: months.size,
      everSubscribed,
    };
  }, [orders, memberships]);

  const achievements: Achievement[] = [
    {
      id: "first-wash",
      label: "First Splash",
      desc: "Complete your first wash",
      icon: Sparkles,
      unlocked: data.total >= 1,
      progress: { current: Math.min(data.total, 1), target: 1 },
      tone: TONES.bronze,
    },
    {
      id: "regular",
      label: "Regular",
      desc: "10 lifetime washes",
      icon: Award,
      unlocked: data.total >= 10,
      progress: { current: Math.min(data.total, 10), target: 10 },
      tone: TONES.silver,
    },
    {
      id: "centurion",
      label: "Centurion",
      desc: "100 lifetime washes",
      icon: Trophy,
      unlocked: data.total >= 100,
      progress: { current: Math.min(data.total, 100), target: 100 },
      tone: TONES.gold,
    },
    {
      id: "explorer",
      label: "Branch Explorer",
      desc: "Visit all 5 branches",
      icon: MapPin,
      unlocked: data.branchesCount >= 5,
      progress: { current: Math.min(data.branchesCount, 5), target: 5 },
      tone: TONES.platinum,
    },
    {
      id: "premium-loyalist",
      label: "Premium Loyalist",
      desc: "Top up Premium 5+ times",
      icon: Crown,
      unlocked: data.isPremiumLoyalist,
      tone: TONES.gold,
    },
    {
      id: "freebie-claimer",
      label: "Reward Claimer",
      desc: "Redeem a free wash",
      icon: Gift,
      unlocked: data.hasFreebie,
      tone: TONES.platinum,
    },
    {
      id: "early-bird",
      label: "Early Bird",
      desc: "3+ washes before 8 AM",
      icon: Sunrise,
      unlocked: data.isEarlyBird,
      progress: { current: Math.min(data.earlyCount, 3), target: 3 },
      tone: TONES.bronze,
    },
    {
      id: "year-rounder",
      label: "Year Rounder",
      desc: "Wash in 6 different months",
      icon: Flame,
      unlocked: data.isYearRounder,
      progress: { current: Math.min(data.monthsCount, 6), target: 6 },
      tone: TONES.silver,
    },
    {
      id: "subscriber",
      label: "VIP Member",
      desc: "Subscribe to any plan",
      icon: Medal,
      unlocked: data.everSubscribed,
      tone: TONES.diamond,
    },
  ];

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
        <span className="text-xs font-bold bg-gradient-to-r from-purple-600 to-orange-500 text-white px-3 py-1 rounded-full">
          {unlockedCount} / {achievements.length} unlocked
        </span>
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
                  ? "border-transparent bg-gradient-to-br " + a.tone + " text-white shadow-md"
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
