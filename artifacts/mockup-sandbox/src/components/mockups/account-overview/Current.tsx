import "./_group.css";
import {
  ArrowRight,
  Crown,
  Droplet,
  QrCode,
  Sparkles,
  Gift,
  Check,
  Lock,
  Car,
  Trophy,
  Calendar,
  Flame,
  Star,
  Clock,
  Award,
} from "lucide-react";

const BRANCHES = [
  { id: 1, name: "Gadong", dot: "bg-amber-500", wait: "~12 min", waitColor: "text-amber-600", sub: "4 in queue · 2 washing", home: true, open: true },
  { id: 2, name: "Kiulap", dot: "bg-emerald-500", wait: "Drive in", waitColor: "text-emerald-600", sub: "0 in queue · 1 washing", home: false, open: true },
  { id: 3, name: "Rimba", dot: "bg-red-500", wait: "~24 min", waitColor: "text-red-500", sub: "8 in queue · 2 washing", home: false, open: true },
  { id: 4, name: "Mata-Mata", dot: "bg-amber-500", wait: "~8 min", waitColor: "text-amber-600", sub: "2 in queue · 1 washing", home: false, open: true },
  { id: 5, name: "Sengkurong", dot: "bg-gray-300", wait: "Closed", waitColor: "text-gray-400", sub: "", home: false, open: false },
];

const RECENT = [
  { id: 1, pkg: "Premium Wash + Wax", branch: "Gadong", plate: "BBG 2629", date: "2026-05-30", method: "QR", amount: "B$18.00" },
  { id: 2, pkg: "Express Wash", branch: "Kiulap", plate: "BBG 2629", date: "2026-05-22", method: "Cash", amount: "B$12.00" },
  { id: 3, pkg: "Premium Wash + Wax", branch: "Gadong", plate: "BBG 2629", date: "2026-05-14", method: "QR", amount: "B$18.00" },
  { id: 4, pkg: "Interior Detail", branch: "Rimba", plate: "BBG 2629", date: "2026-05-03", method: "Cash", amount: "B$35.00" },
];

const BADGES = [
  { id: "early", label: "Early Bird", desc: "Washed before 9am", icon: Clock, unlocked: true, tone: "from-amber-400 to-orange-500" },
  { id: "loyal", label: "Loyalist", desc: "10 washes done", icon: Star, unlocked: true, tone: "from-purple-500 to-violet-600" },
  { id: "century", label: "Centurion", desc: "100 washes", icon: Award, unlocked: false, progress: { current: 42, target: 100 } },
  { id: "streak", label: "On a Roll", desc: "3-week streak", icon: Flame, unlocked: false, progress: { current: 2, target: 3 } },
  { id: "vip", label: "VIP", desc: "Unlimited member", icon: Crown, unlocked: true, tone: "from-fuchsia-500 to-purple-600" },
];

function heatColor(n: number) {
  if (n < 0) return "bg-transparent";
  if (n === 0) return "bg-gray-100";
  if (n === 1) return "bg-purple-200";
  if (n === 2) return "bg-purple-400";
  if (n === 3) return "bg-violet-500";
  return "bg-gradient-to-br from-purple-600 to-orange-500";
}

// Deterministic pseudo-random grid so the heatmap looks lived-in.
function buildGrid() {
  const weeks: number[][] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let w = 0; w < 53; w++) {
    const col: number[] = [];
    for (let d = 0; d < 7; d++) {
      const r = rand();
      col.push(r > 0.82 ? Math.ceil(rand() * 4) : 0);
    }
    weeks.push(col);
  }
  return weeks;
}
const GRID = buildGrid();
const MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May"];

export function Current() {
  return (
    <div className="cuci-page-bg min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <p className="text-sm text-gray-500">Welcome back,</p>
          <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-tight mt-1">
            Aisyah <span className="inline-block">👋</span>
          </h1>
        </div>

        {/* Active subscription hero */}
        <article
          className="relative overflow-hidden rounded-2xl text-white p-6"
          style={{
            background: "linear-gradient(135deg, #7C5CE7 0%, #B47CF7 45%, #FF9500 100%)",
            boxShadow: "0 0 50px rgba(255,149,0,0.4), 0 0 90px rgba(124,92,231,0.3)",
          }}
        >
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center text-[10px] uppercase font-extrabold px-2 py-0.5 rounded"
                  style={{ background: "#FF9500", color: "#1a1208", border: "1.5px solid rgba(0,0,0,0.6)", letterSpacing: 1.1 }}
                >
                  Unlimited · Active
                </span>
                <Crown className="w-5 h-5" style={{ color: "#FFE89E" }} />
              </div>
              <h2 className="text-2xl md:text-3xl font-black mt-2 tracking-tight" style={{ textShadow: "0 2px 14px rgba(0,0,0,0.25)" }}>
                Unlimited Xpress
              </h2>
              <p className="text-xs md:text-sm mt-1 inline-flex items-center gap-1.5 font-bold" style={{ color: "#FFE89E" }}>
                <span className="opacity-80 uppercase tracking-widest text-[10px]">For plate</span>
                <span className="font-mono tracking-wider px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.25)" }}>BBG 2629</span>
              </p>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>Renews 15 Jul 2026</p>
              <p className="text-sm mt-2 font-semibold" style={{ color: "#FFE89E" }}>
                Thank you for being a VIP member — unlimited washes at every Cuci Xpress branch.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end shrink-0">
              <button className="inline-flex items-center justify-center gap-1.5 px-5 py-3 bg-white text-gray-900 rounded-xl font-bold border-2 border-black whitespace-nowrap">
                <QrCode className="w-4 h-4" /> Show wash QR
              </button>
              <button className="text-xs font-bold" style={{ color: "#FFE89E" }}>Manage subscription →</button>
            </div>
          </div>
        </article>

        {/* Live queue strip */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 text-emerald-600 text-xs font-semibold">
                <span className="cuci-live-dot" /> LIVE · 14:32
              </span>
              <h2 className="text-base font-bold text-gray-900 ml-2">Queue right now</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] bg-gray-900 text-white px-2.5 py-1 rounded-full font-semibold">Today · 73 washed</span>
              <a href="#" className="text-sm text-cuci-primary hover:underline inline-flex items-center gap-1">
                See full <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {BRANCHES.map((b) => (
              <div
                key={b.id}
                className={
                  "relative flex flex-col gap-1 p-3 rounded-lg " +
                  (b.home
                    ? "border-2 border-cuci-secondary bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm"
                    : "border border-gray-100 bg-gray-50")
                }
              >
                {b.home && (
                  <span className="absolute -top-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-cuci-secondary text-white text-[9px] font-black uppercase tracking-wider shadow">
                    ★ Your home
                  </span>
                )}
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                  <span className="text-xs font-semibold truncate text-gray-800">{b.name}</span>
                </div>
                <span className={`text-sm font-black ${b.waitColor}`}>{b.wait}</span>
                {b.open && <span className="text-[10px] text-gray-500">{b.sub}</span>}
              </div>
            ))}
          </div>
        </section>

        {/* Loyalty card */}
        <section className="cuci-card-soft p-5 border-2 border-black">
          <div className="flex items-center gap-2 text-cuci-secondary">
            <Sparkles className="w-4 h-4" />
            <p className="text-[11px] uppercase tracking-wider font-bold">Loyalty reward</p>
          </div>
          <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-1">
            Collect 4 × B$12 receipts → 1 free wash (per car)
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Every paid <strong>Express Wash</strong> earns a stamp for that plate.
          </p>
          <div className="mt-5">
            <div className="rounded-xl border-2 border-gray-200 p-4 bg-white">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Car className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="font-mono font-extrabold text-base tracking-wider">BBG 2629</span>
                    <span className="text-xs text-gray-500 truncate">· Toyota Corolla</span>
                  </div>
                  <p className="text-[12px] text-gray-600 mt-1">2 more paid B$12 washes to unlock.</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 flex-wrap">
                <ProgressRing stamps={2} required={4} />
                <div className="flex-1 min-w-[160px]">
                  <div className="grid grid-cols-4 gap-2 max-w-[220px]">
                    {Array.from({ length: 4 }).map((_, i) => {
                      const filled = i < 2;
                      return (
                        <div
                          key={i}
                          className={
                            "aspect-square rounded-lg border-2 flex items-center justify-center " +
                            (filled
                              ? "bg-gradient-to-br from-purple-600 to-orange-500 text-white border-transparent shadow"
                              : "bg-white text-gray-300 border-dashed border-gray-300")
                          }
                        >
                          {filled ? <Check className="w-5 h-5" /> : <Lock className="w-3 h-3" />}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">2 / 4 stamps on this plate</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Achievements row */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 text-purple-600">
              <Trophy className="w-4 h-4" />
              <p className="text-[11px] uppercase tracking-widest font-bold">Achievements</p>
              <h2 className="text-base font-bold text-gray-900 ml-2">Your badges</h2>
            </div>
            <span className="text-xs font-bold bg-gradient-to-r from-purple-600 to-orange-500 text-white px-3 py-1 rounded-full">
              3 / 5 unlocked
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
            {BADGES.map((a) => {
              const Icon = a.unlocked ? a.icon : Lock;
              const pct = a.progress ? (a.progress.current / a.progress.target) * 100 : 100;
              return (
                <div
                  key={a.id}
                  className={
                    "shrink-0 w-32 rounded-xl p-3 border-2 text-center " +
                    (a.unlocked
                      ? "border-transparent bg-gradient-to-br " + a.tone + " text-white shadow-md"
                      : "border-dashed border-gray-200 bg-gray-50 text-gray-400")
                  }
                >
                  <div className={"w-10 h-10 rounded-full grid place-items-center mx-auto mb-2 " + (a.unlocked ? "bg-white/25 backdrop-blur" : "bg-gray-200")}>
                    <Icon className={"w-5 h-5 " + (a.unlocked ? "text-white" : "text-gray-400")} />
                  </div>
                  <p className={"text-[11px] uppercase font-black tracking-wider leading-tight " + (a.unlocked ? "text-white" : "text-gray-500")}>
                    {a.label}
                  </p>
                  <p className={"text-[9px] mt-0.5 leading-tight " + (a.unlocked ? "text-white/80" : "text-gray-400")}>{a.desc}</p>
                  {a.progress && (
                    <>
                      <div className="mt-2 h-1 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-orange-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[9px] font-mono text-gray-400 mt-1">{a.progress.current}/{a.progress.target}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Wash heatmap */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2 text-purple-600">
                <Calendar className="w-4 h-4" />
                <p className="text-[11px] uppercase tracking-widest font-bold">Wash habit</p>
              </div>
              <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-1">Last 12 months</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-full">
                <Flame className="w-3.5 h-3.5" /> Best streak: 4 days
              </span>
              <span className="hidden sm:inline-flex text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full">28 wash days · 8%</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <div className="grid mb-1 ml-6 text-[10px] uppercase font-bold text-gray-400" style={{ gridTemplateColumns: `repeat(53, 12px)`, columnGap: "3px" }}>
                {GRID.map((_, idx) => {
                  const label = idx % 4 === 0 ? MONTHS[Math.floor(idx / 4) % 12] : "";
                  return <span key={idx} className="col-span-1 whitespace-nowrap">{label}</span>;
                })}
              </div>
              <div className="flex gap-[3px]">
                <div className="grid grid-rows-7 gap-[3px] mr-1 text-[9px] text-gray-400 font-bold pt-px">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <span key={i} className="h-3 w-3 grid place-items-center">{i % 2 === 1 ? d : ""}</span>
                  ))}
                </div>
                {GRID.map((week, wi) => (
                  <div key={wi} className="grid grid-rows-7 gap-[3px]">
                    {week.map((n, di) => (
                      <div key={di} className={"h-3 w-3 rounded-[3px] " + heatColor(n)} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 text-[11px] text-gray-500">
                <span className="font-medium">Hover a square for details</span>
                <div className="flex items-center gap-1.5">
                  <span>Less</span>
                  <span className="h-3 w-3 rounded-[3px] bg-gray-100" />
                  <span className="h-3 w-3 rounded-[3px] bg-purple-200" />
                  <span className="h-3 w-3 rounded-[3px] bg-purple-400" />
                  <span className="h-3 w-3 rounded-[3px] bg-violet-500" />
                  <span className="h-3 w-3 rounded-[3px] bg-gradient-to-br from-purple-600 to-orange-500" />
                  <span>More</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <KpiTile label="Washes this month" value="6" color="text-cuci-primary" sub="↑ 2 vs last month" />
          <KpiTile label="Saved with subscription" value="B$84.00" color="text-emerald-600" sub="vs pay-as-you-go" />
          <KpiTile label="Lifetime washes" value="142" color="text-gray-900" sub="since Mar 2024" />
        </div>

        {/* Recent washes */}
        <section className="cuci-card-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Recent washes</h2>
            <button className="text-sm text-cuci-primary hover:underline inline-flex items-center gap-1">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {RECENT.map((o) => (
              <div key={o.id} className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-gray-50">
                <div className="w-10 h-10 rounded-[10px] bg-cuci-primary/10 grid place-items-center shrink-0">
                  <Droplet className="w-4 h-4 text-cuci-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-gray-900 truncate">{o.pkg}</p>
                  <p className="text-xs text-gray-500 truncate">{o.branch} · {o.plate} · {o.date}</p>
                </div>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{o.method}</span>
                <span className="font-bold text-sm whitespace-nowrap">{o.amount}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ProgressRing({ stamps, required }: { stamps: number; required: number }) {
  const pct = Math.min(1, stamps / required);
  const size = 90;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const remaining = Math.max(0, required - stamps);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="loyaltyRing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#f3f4f6" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="url(#loyaltyRing)" strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-xl font-black bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent leading-none">
            {stamps}<span className="text-sm text-gray-400">/{required}</span>
          </p>
          <p className="text-[9px] uppercase font-bold text-gray-500 mt-1 tracking-wider">{remaining} to go</p>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className="cuci-kpi">
      <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500">{label}</p>
      <p className={`text-2xl md:text-3xl font-black mt-1 ${color}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-1">{sub}</p>
    </div>
  );
}
