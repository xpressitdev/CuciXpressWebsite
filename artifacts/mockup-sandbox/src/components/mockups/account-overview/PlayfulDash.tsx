import React from "react";
import "./_group.css";
import "./PlayfulDash.css";
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
  { id: "early", label: "Early Bird", desc: "Washed before 9am", icon: Clock, unlocked: true, tone: "bg-[#FFD166]" },
  { id: "loyal", label: "Loyalist", desc: "10 washes done", icon: Star, unlocked: true, tone: "bg-[#A78BFA]" },
  { id: "century", label: "Centurion", desc: "100 washes", icon: Award, unlocked: false, progress: { current: 42, target: 100 } },
  { id: "streak", label: "On a Roll", desc: "3-week streak", icon: Flame, unlocked: false, progress: { current: 2, target: 3 } },
  { id: "vip", label: "VIP", desc: "Unlimited member", icon: Crown, unlocked: true, tone: "bg-[#F472B6]" },
];

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

function heatColor(n: number) {
  if (n < 0) return "bg-transparent";
  if (n === 0) return "bg-white border-2 border-gray-200";
  if (n === 1) return "bg-[#E9D8FD] border-2 border-black";
  if (n === 2) return "bg-[#D6BCFA] border-2 border-black";
  if (n === 3) return "bg-[#B794F4] border-2 border-black";
  return "bg-[#9F7AEA] border-2 border-black";
}

export function PlayfulDash() {
  return (
    <div className="playful-bg min-h-screen font-sans">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <div className="inline-block transform -rotate-2 bg-[#FFD166] px-3 py-1 border-2 border-black rounded-lg sticker mb-2">
              <p className="text-sm font-black uppercase tracking-wider text-black">Welcome Back!</p>
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-black leading-tight">
              Aisyah <span className="inline-block animate-bounce">👋</span>
            </h1>
          </div>
          <div className="w-16 h-16 bg-[#A78BFA] border-3 border-black rounded-full sticker flex items-center justify-center">
            <span className="text-2xl font-black text-white">A</span>
          </div>
        </div>

        {/* Hero */}
        <article className="playful-card p-6 bg-[#A78BFA] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
            <Sparkles className="w-32 h-32 text-white" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="sticker bg-[#FF9500] text-black text-xs font-black uppercase px-3 py-1 rounded-full flex items-center gap-1">
                  <Crown className="w-3 h-3" /> Unlimited · Active
                </span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-white" style={{ textShadow: "2px 2px 0px black" }}>
                Unlimited Xpress
              </h2>
              <div className="flex items-center gap-2 mt-3">
                <span className="bg-white text-black font-black font-mono border-2 border-black px-2 py-1 rounded-md text-sm shadow-[2px_2px_0px_black]">
                  BBG 2629
                </span>
                <span className="text-white font-bold bg-black/20 px-2 py-1 rounded-md text-sm">
                  Renews 15 Jul 2026
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-3 md:items-end">
              <button className="playful-button px-6 py-3 bg-[#FFD166] text-black flex items-center gap-2 text-lg">
                <QrCode className="w-5 h-5" />
                Show Wash QR
              </button>
              <button className="text-sm font-black text-white underline decoration-2 underline-offset-2 hover:text-black transition-colors">
                Manage subscription →
              </button>
            </div>
          </div>
        </article>

        {/* Queue */}
        <section className="playful-card p-5">
          <div className="flex flex-wrap items-center justify-between mb-5 gap-3">
            <div className="flex items-center gap-3">
              <div className="sticker bg-black text-[#00FF66] px-3 py-1 rounded-full text-xs font-black flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#00FF66] animate-pulse" />
                LIVE · 14:32
              </div>
              <h2 className="text-xl font-black text-black">Queue status</h2>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-black uppercase text-gray-500">
                Today: 73 washed
              </span>
              <a href="#" className="text-sm font-black text-purple-600 hover:text-purple-800 flex items-center gap-1">
                See full <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {BRANCHES.map(b => (
              <div key={b.id} className={`p-3 rounded-xl border-3 border-black relative transition-transform hover:-translate-y-1 ${b.home ? 'bg-[#FFD166]' : 'bg-white'}`} style={{ boxShadow: "3px 3px 0px black" }}>
                {b.home && (
                  <span className="absolute -top-3 -right-2 bg-black text-white text-[10px] font-black px-2 py-1 rounded-lg transform rotate-6 border-2 border-white">
                    ★ HOME
                  </span>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-3 h-3 rounded-full border-2 border-black ${b.dot}`} />
                  <span className="font-black text-sm">{b.name}</span>
                </div>
                <div className={`font-black text-lg ${b.waitColor}`}>{b.wait}</div>
                {b.open && <div className="text-[10px] font-bold text-gray-600 mt-1">{b.sub}</div>}
              </div>
            ))}
          </div>
        </section>

        {/* Loyalty */}
        <section className="playful-card p-5 bg-[#F472B6]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="sticker inline-block bg-white text-black px-3 py-1 rounded-full text-xs font-black uppercase mb-3 transform -rotate-1">
                Loyalty Reward
              </div>
              <h2 className="text-2xl font-black text-white mb-2" style={{ textShadow: "2px 2px 0px black" }}>
                4 Stamps = 1 Free Wash!
              </h2>
              <p className="text-black font-bold bg-white/40 inline-block px-2 py-1 rounded-lg text-sm">
                Every B$12 receipt earns a stamp for BBG 2629
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-xl border-3 border-black shadow-[4px_4px_0px_black] flex items-center gap-4 shrink-0 transform rotate-1">
              <div className="w-20 h-20 rounded-full border-4 border-black relative flex items-center justify-center bg-gray-100">
                <div className="absolute inset-0 rounded-full border-[6px] border-[#F472B6]" style={{ clipPath: "polygon(0 0, 100% 0, 100% 50%, 0 50%)" }}></div>
                <div className="text-xl font-black">2<span className="text-sm">/4</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`w-10 h-10 rounded-lg border-3 border-black flex items-center justify-center ${i < 2 ? 'bg-[#FFD166]' : 'bg-gray-100'}`}>
                    {i < 2 ? <Check className="w-6 h-6 text-black" strokeWidth={4} /> : <Lock className="w-4 h-4 text-gray-400" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Badges */}
        <section className="playful-card p-5 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black text-black flex items-center gap-2">
              <Trophy className="w-6 h-6 text-[#A78BFA]" />
              Achievements
            </h2>
            <div className="sticker bg-black text-white font-black px-3 py-1 rounded-full text-sm">
              3/5 Unlocked
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 pt-2 px-2 -mx-2">
            {BADGES.map(b => (
              <div key={b.id} className={`playful-badge p-4 w-40 shrink-0 text-center flex flex-col items-center justify-center relative transition-transform hover:-translate-y-2 ${b.unlocked ? b.tone : 'bg-gray-100 opacity-60'}`}>
                <div className={`w-14 h-14 rounded-full border-3 border-black flex items-center justify-center mb-3 ${b.unlocked ? 'bg-white shadow-[2px_2px_0px_black]' : 'bg-gray-200'}`}>
                  <b.icon className={`w-7 h-7 ${b.unlocked ? 'text-black' : 'text-gray-400'}`} />
                </div>
                <h3 className="font-black text-black text-sm uppercase leading-tight mb-1">{b.label}</h3>
                <p className="text-xs font-bold text-black/70 leading-tight">{b.desc}</p>
                {!b.unlocked && b.progress && (
                  <div className="w-full mt-3">
                    <div className="playful-progress-bar h-3 bg-white">
                      <div className="h-full bg-black" style={{ width: `${(b.progress.current / b.progress.target) * 100}%` }} />
                    </div>
                    <div className="text-[10px] font-black mt-1 text-black text-right">
                      {b.progress.current}/{b.progress.target}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Heatmap */}
        <section className="playful-card p-5">
          <div className="flex flex-wrap items-center justify-between mb-5 gap-3">
            <h2 className="text-xl font-black text-black flex items-center gap-2">
              <Calendar className="w-6 h-6 text-[#FF9500]" />
              Wash Habit
            </h2>
            <div className="flex items-center gap-2">
              <span className="sticker bg-[#FFD166] text-black px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 transform rotate-1">
                <Flame className="w-4 h-4" /> 4 Day Streak!
              </span>
            </div>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="inline-block min-w-full">
              <div className="grid mb-2 ml-8 text-xs font-black text-gray-500" style={{ gridTemplateColumns: `repeat(53, 14px)`, columnGap: "4px" }}>
                {GRID.map((_, idx) => (
                  <span key={idx} className="col-span-1">{idx % 4 === 0 ? MONTHS[Math.floor(idx / 4) % 12] : ""}</span>
                ))}
              </div>
              <div className="flex gap-1">
                <div className="grid grid-rows-7 gap-1 mr-2 text-[10px] font-black text-gray-400 pt-1">
                  {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <span key={i} className="h-3.5 w-3.5 flex items-center justify-center">{i % 2 === 1 ? d : ""}</span>
                  ))}
                </div>
                {GRID.map((week, wi) => (
                  <div key={wi} className="grid grid-rows-7 gap-1">
                    {week.map((n, di) => (
                      <div key={di} className={`h-3.5 w-3.5 rounded-[4px] ${heatColor(n)}`} />
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs font-bold text-gray-500">Last 12 months</span>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span>Less</span>
                  <div className="h-3.5 w-3.5 rounded bg-white border-2 border-gray-200" />
                  <div className="h-3.5 w-3.5 rounded bg-[#E9D8FD] border-2 border-black" />
                  <div className="h-3.5 w-3.5 rounded bg-[#B794F4] border-2 border-black" />
                  <div className="h-3.5 w-3.5 rounded bg-[#9F7AEA] border-2 border-black" />
                  <span>More</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="playful-kpi p-4 bg-[#A78BFA] text-black">
            <p className="text-xs font-black uppercase mb-1">Month Washes</p>
            <p className="text-4xl font-black mb-1">6</p>
            <p className="text-xs font-bold bg-white/50 inline-block px-2 py-0.5 rounded-lg border-2 border-black">↑ 2 from last</p>
          </div>
          <div className="playful-kpi p-4 bg-[#00FF66] text-black">
            <p className="text-xs font-black uppercase mb-1">Saved Total</p>
            <p className="text-4xl font-black mb-1">B$84</p>
            <p className="text-xs font-bold bg-white/50 inline-block px-2 py-0.5 rounded-lg border-2 border-black">vs pay-as-you-go</p>
          </div>
          <div className="playful-kpi p-4 bg-white text-black col-span-2 md:col-span-1 flex flex-col justify-between">
            <p className="text-xs font-black uppercase mb-1 text-gray-500">Lifetime Washes</p>
            <p className="text-4xl font-black mb-1">142</p>
            <p className="text-xs font-bold text-gray-500">since Mar 2024</p>
          </div>
        </div>

        {/* Recent */}
        <section className="playful-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black text-black">Recent Activity</h2>
            <button className="playful-button px-4 py-2 text-xs">View All</button>
          </div>
          <div className="space-y-3">
            {RECENT.map(o => (
              <div key={o.id} className="flex items-center justify-between p-3 rounded-xl border-2 border-black bg-gray-50 hover:bg-white hover:-translate-y-0.5 transition-transform shadow-[2px_2px_0px_black]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#FFD166] border-2 border-black flex items-center justify-center shrink-0 transform -rotate-2">
                    <Droplet className="w-6 h-6 text-black fill-current" />
                  </div>
                  <div>
                    <p className="font-black text-sm text-black">{o.pkg}</p>
                    <p className="text-xs font-bold text-gray-500 mt-0.5">{o.branch} · {o.plate} · {o.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-lg">{o.amount}</p>
                  <span className="inline-block bg-black text-white text-[9px] font-black uppercase px-2 py-0.5 rounded border border-white transform rotate-2">{o.method}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
