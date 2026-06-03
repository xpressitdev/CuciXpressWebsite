import React from "react";
import "./_group.css";
import "./CalmBrutalist.css";
import {
  ArrowRight,
  Crown,
  Droplet,
  QrCode,
  Sparkles,
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
  { id: "early", label: "Early Bird", desc: "Washed before 9am", icon: Clock, unlocked: true, tone: "text-amber-500 bg-amber-50" },
  { id: "loyal", label: "Loyalist", desc: "10 washes done", icon: Star, unlocked: true, tone: "text-purple-600 bg-purple-50" },
  { id: "century", label: "Centurion", desc: "100 washes", icon: Award, unlocked: false, progress: { current: 42, target: 100 } },
  { id: "streak", label: "On a Roll", desc: "3-week streak", icon: Flame, unlocked: false, progress: { current: 2, target: 3 } },
  { id: "vip", label: "VIP", desc: "Unlimited member", icon: Crown, unlocked: true, tone: "text-cuci-secondary bg-orange-50" },
];

function heatColor(n: number) {
  if (n < 0) return "bg-transparent";
  if (n === 0) return "bg-gray-100";
  if (n === 1) return "bg-purple-200";
  if (n === 2) return "bg-purple-400";
  if (n === 3) return "bg-purple-600";
  return "bg-cuci-secondary";
}

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

export function CalmBrutalist() {
  return (
    <div className="calm-page min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        
        {/* Header */}
        <header>
          <p className="text-sm font-medium text-gray-500 tracking-wide uppercase">Welcome back,</p>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 mt-1">
            Aisyah <span className="inline-block text-2xl">👋</span>
          </h1>
        </header>

        {/* Active subscription hero */}
        <article className="calm-hero p-6 sm:p-8">
          <div className="calm-hero-top" />
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm bg-cuci-primary text-white tracking-widest">
                  Unlimited · Active
                </span>
                <Crown className="w-4 h-4 text-cuci-secondary" />
              </div>
              <h2 className="text-2xl font-black text-gray-900">
                Unlimited Xpress
              </h2>
              <div className="mt-2 space-y-1">
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="uppercase text-[10px] font-bold tracking-widest text-gray-400">For plate</span>
                  <span className="calm-plate">BBG 2629</span>
                </p>
                <p className="text-sm text-gray-500 font-medium">Renews 15 Jul 2026</p>
              </div>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <button className="calm-btn whitespace-nowrap">
                <QrCode className="w-4 h-4 mr-2" /> Show wash QR
              </button>
              <button className="text-sm font-bold text-gray-500 hover:text-gray-900 underline underline-offset-4 decoration-gray-300">
                Manage subscription →
              </button>
            </div>
          </div>
        </article>

        {/* Live queue strip */}
        <section className="calm-card">
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                LIVE
              </div>
              <span className="text-xs font-semibold text-gray-400">14:32</span>
              <h2 className="text-sm font-bold text-gray-900 ml-2">Queue right now</h2>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-gray-500">Today: 73 washed</span>
              <a href="#" className="text-xs font-bold text-gray-900 hover:underline inline-flex items-center">
                See full <ArrowRight className="w-3 h-3 ml-1" />
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {BRANCHES.map((b) => (
              <div
                key={b.id}
                className={`p-3 rounded-lg border ${b.home ? 'border-gray-900 bg-gray-50 relative' : 'border-gray-200 bg-white'}`}
              >
                {b.home && (
                  <span className="absolute -top-2 -right-1 bg-gray-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider">
                    ★ Home
                  </span>
                )}
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                  <span className="text-xs font-bold text-gray-800">{b.name}</span>
                </div>
                <div className={`text-sm font-extrabold ${b.waitColor}`}>{b.wait}</div>
                {b.open && <div className="text-[10px] text-gray-500 font-medium mt-0.5">{b.sub}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* Loyalty card */}
        <section className="calm-card relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Sparkles className="w-24 h-24 text-cuci-secondary" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-cuci-secondary" />
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Loyalty Reward</h2>
          </div>
          <p className="text-base font-semibold text-gray-800 mb-6">
            Collect 4 × B$12 receipts → 1 free wash (per car)
          </p>
          
          <div className="flex items-center justify-between flex-wrap gap-4 border border-gray-200 rounded-lg p-4 bg-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                <Car className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <div className="calm-plate mb-1">BBG 2629</div>
                <div className="text-xs text-gray-500 font-medium">Toyota Corolla</div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => {
                  const filled = i < 2;
                  return (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded-md flex items-center justify-center border-2 ${
                        filled 
                          ? 'border-gray-900 bg-gray-900 text-white' 
                          : 'border-dashed border-gray-300 bg-white text-gray-300'
                      }`}
                    >
                      {filled ? <Check className="w-4 h-4" /> : <Lock className="w-3 h-3" />}
                    </div>
                  );
                })}
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-gray-900 leading-none">2/4</div>
                <div className="text-[10px] text-gray-500 font-semibold uppercase mt-1">Stamps</div>
              </div>
            </div>
          </div>
        </section>

        {/* Achievements row */}
        <section className="calm-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-cuci-primary" />
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Achievements</h2>
            </div>
            <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
              3 / 5 unlocked
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {BADGES.map((a) => {
              const Icon = a.unlocked ? a.icon : Lock;
              const pct = a.progress ? (a.progress.current / a.progress.target) * 100 : 100;
              return (
                <div key={a.id} className={`calm-badge-card ${a.unlocked ? 'unlocked' : 'locked'}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${a.unlocked ? a.tone : 'bg-gray-100 text-gray-400'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className={`text-xs font-bold uppercase tracking-wider mb-1 ${a.unlocked ? 'text-gray-900' : 'text-gray-500'}`}>
                    {a.label}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-medium mb-3">{a.desc}</p>
                  
                  {a.progress && (
                    <div className="w-full mt-auto">
                      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[9px] text-gray-400 font-bold mt-1.5 text-right">
                        {a.progress.current} / {a.progress.target}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Wash heatmap */}
        <section className="calm-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-600" />
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Wash Habit</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-900 bg-white border-2 border-gray-900 px-2 py-1 rounded-md shadow-[2px_2px_0px_rgba(0,0,0,0.1)]">
                <Flame className="w-3 h-3 text-orange-500" /> Best streak: 4 days
              </span>
            </div>
          </div>
          
          <div className="overflow-x-auto pb-2">
            <div className="inline-block min-w-full">
              <div className="grid mb-2 ml-6 text-[10px] font-semibold text-gray-400" style={{ gridTemplateColumns: `repeat(53, 12px)`, columnGap: "3px" }}>
                {GRID.map((_, idx) => {
                  const label = idx % 4 === 0 ? MONTHS[Math.floor(idx / 4) % 12] : "";
                  return <span key={idx} className="col-span-1 whitespace-nowrap">{label}</span>;
                })}
              </div>
              <div className="flex gap-[3px]">
                <div className="grid grid-rows-7 gap-[3px] mr-2 text-[10px] text-gray-400 font-medium">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <span key={i} className="h-3 w-3 flex items-center justify-center">{i % 2 === 1 ? d : ""}</span>
                  ))}
                </div>
                {GRID.map((week, wi) => (
                  <div key={wi} className="grid grid-rows-7 gap-[3px]">
                    {week.map((n, di) => (
                      <div key={di} className={`h-3 w-3 rounded-sm border border-black/5 ${heatColor(n)}`} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-end mt-4 text-[10px] font-medium text-gray-500 gap-2">
                <span>Less</span>
                <div className="flex gap-1">
                  <span className="h-3 w-3 rounded-sm bg-gray-100 border border-black/5" />
                  <span className="h-3 w-3 rounded-sm bg-purple-200 border border-black/5" />
                  <span className="h-3 w-3 rounded-sm bg-purple-400 border border-black/5" />
                  <span className="h-3 w-3 rounded-sm bg-purple-600 border border-black/5" />
                  <span className="h-3 w-3 rounded-sm bg-cuci-secondary border border-black/5" />
                </div>
                <span>More</span>
              </div>
            </div>
          </div>
        </section>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="calm-kpi">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Washes this month</p>
            <p className="text-3xl font-black text-gray-900">6</p>
            <p className="text-xs text-gray-500 font-medium mt-1">↑ 2 vs last month</p>
          </div>
          <div className="calm-kpi border-2 border-emerald-500 bg-emerald-50/30">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-2">Saved with subscription</p>
            <p className="text-3xl font-black text-emerald-600">B$84.00</p>
            <p className="text-xs text-emerald-600/70 font-medium mt-1">vs pay-as-you-go</p>
          </div>
          <div className="calm-kpi col-span-2 lg:col-span-1">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Lifetime washes</p>
            <p className="text-3xl font-black text-gray-900">142</p>
            <p className="text-xs text-gray-500 font-medium mt-1">since Mar 2024</p>
          </div>
        </div>

        {/* Recent washes */}
        <section className="calm-card">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Recent washes</h2>
            <button className="text-xs font-bold text-gray-500 hover:text-gray-900 inline-flex items-center transition-colors">
              View all <ArrowRight className="w-3 h-3 ml-1" />
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {RECENT.map((o) => (
              <div key={o.id} className="py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors -mx-4 px-4">
                <div className="w-10 h-10 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                  <Droplet className="w-4 h-4 text-gray-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-gray-900 truncate mb-0.5">{o.pkg}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                    <span>{o.branch}</span>
                    <span>·</span>
                    <span className="calm-plate text-[10px] py-0">{o.plate}</span>
                    <span>·</span>
                    <span>{new Date(o.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-black text-sm text-gray-900">{o.amount}</span>
                  <span className="text-[10px] font-bold text-gray-500 uppercase bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                    {o.method}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
