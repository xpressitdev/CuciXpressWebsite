import "./_group.css";
import "./BoldBlocks.css";
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
  { id: "early", label: "Early Bird", desc: "Washed before 9am", icon: Clock, unlocked: true, tone: "bg-amber-400" },
  { id: "loyal", label: "Loyalist", desc: "10 washes done", icon: Star, unlocked: true, tone: "bg-purple-500" },
  { id: "century", label: "Centurion", desc: "100 washes", icon: Award, unlocked: false, progress: { current: 42, target: 100 } },
  { id: "streak", label: "On a Roll", desc: "3-week streak", icon: Flame, unlocked: false, progress: { current: 2, target: 3 } },
  { id: "vip", label: "VIP", desc: "Unlimited member", icon: Crown, unlocked: true, tone: "bg-fuchsia-500" },
];

function heatColor(n: number) {
  if (n < 0) return "bg-transparent";
  if (n === 0) return "bg-gray-100 border-2 border-transparent";
  if (n === 1) return "bg-purple-200 border-2 border-black";
  if (n === 2) return "bg-purple-400 border-2 border-black";
  if (n === 3) return "bg-purple-600 border-2 border-black";
  return "bg-orange-500 border-2 border-black";
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

export function BoldBlocks() {
  return (
    <div className="bold-blocks-bg min-h-screen text-black font-sans selection:bg-black selection:text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12 space-y-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xl font-black uppercase tracking-widest border-2 border-black inline-block px-3 py-1 bg-white shadow-[4px_4px_0px_0px_#000] mb-4">Welcome back</p>
            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none">
              Aisyah <span className="inline-block hover:animate-bounce">👋</span>
            </h1>
          </div>
        </header>

        {/* Active subscription hero */}
        <article className="bold-card bg-cuci-primary text-white overflow-hidden">
          <div className="bold-card-header bg-black text-white p-4 flex justify-between items-center flex-wrap gap-4">
            <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-widest px-3 py-1 bg-cuci-secondary text-black border-2 border-white shadow-[2px_2px_0px_0px_#fff]">
              Unlimited · Active
            </span>
            <span className="font-mono text-xl tracking-widest font-bold">BBG 2629</span>
          </div>
          <div className="p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
                Unlimited Xpress
              </h2>
              <p className="text-lg font-bold mt-2 border-l-4 border-black pl-3 py-1 bg-white/20 text-black">
                Renews 15 Jul 2026
              </p>
              <p className="mt-4 font-bold text-lg max-w-md">
                Unlimited washes at every Cuci Xpress branch. You're a VIP!
              </p>
            </div>
            <div className="flex flex-col gap-4 shrink-0 w-full md:w-auto">
              <button className="bold-btn bold-btn-secondary text-xl font-black uppercase flex items-center justify-center gap-3 px-6 py-4 w-full">
                <QrCode className="w-6 h-6" /> Show Wash QR
              </button>
              <button className="text-sm font-black uppercase tracking-widest underline decoration-2 underline-offset-4 hover:text-cuci-secondary text-center">
                Manage subscription →
              </button>
            </div>
          </div>
        </article>

        {/* Live queue strip */}
        <section className="bold-card">
          <div className="bold-card-header bg-black text-white p-4 flex flex-wrap justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 text-emerald-400 font-black tracking-widest uppercase">
                <span className="cuci-live-dot" /> LIVE · 14:32
              </span>
              <h2 className="text-xl font-black uppercase">Queue Right Now</h2>
            </div>
            <div className="flex items-center gap-4">
              <span className="bg-white text-black px-3 py-1 font-black uppercase tracking-widest text-sm border-2 border-black shadow-[2px_2px_0px_0px_#000]">
                Today: 73 washed
              </span>
              <a href="#" className="font-black uppercase tracking-widest underline decoration-2 underline-offset-4 hover:text-cuci-primary">
                See full →
              </a>
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 lg:grid-cols-5 gap-4">
            {BRANCHES.map((b) => (
              <div
                key={b.id}
                className={`p-3 border-4 border-black ${b.home ? 'bg-cuci-secondary shadow-[4px_4px_0px_0px_#000]' : 'bg-gray-100'} relative`}
              >
                {b.home && (
                  <span className="absolute -top-3 -right-3 bg-black text-white px-2 py-1 text-[10px] font-black uppercase tracking-widest rotate-3">
                    ★ Home
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-3 h-3 border-2 border-black ${b.dot}`} />
                  <span className="font-black uppercase tracking-wide">{b.name}</span>
                </div>
                <div className={`text-xl font-black ${b.wait === "Closed" ? "text-gray-500" : "text-black"}`}>
                  {b.wait}
                </div>
                {b.open && <div className="text-xs font-bold mt-1">{b.sub}</div>}
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Loyalty card */}
          <section className="bold-card flex flex-col">
            <div className="bold-card-header bg-cuci-secondary p-4 border-b-4 border-black flex items-center gap-3">
              <Sparkles className="w-6 h-6" />
              <h2 className="text-xl font-black uppercase tracking-widest">Loyalty Reward</h2>
            </div>
            <div className="p-6 flex-1 flex flex-col justify-center">
              <h3 className="text-2xl font-black uppercase leading-tight mb-4">
                Collect 4 × B$12 receipts<br/>→ 1 FREE WASH
              </h3>
              <div className="border-4 border-black p-4 bg-white shadow-[4px_4px_0px_0px_#000]">
                <div className="flex justify-between items-start mb-4 border-b-4 border-black pb-4">
                  <div>
                    <div className="flex items-center gap-2 font-mono font-black text-2xl">
                      <Car className="w-6 h-6" /> BBG 2629
                    </div>
                    <p className="text-sm font-bold uppercase mt-1">Toyota Corolla</p>
                  </div>
                  <div className="bg-black text-white font-black text-2xl px-3 py-1">
                    2/4
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => {
                    const filled = i < 2;
                    return (
                      <div
                        key={i}
                        className={`aspect-square border-4 border-black flex items-center justify-center
                          ${filled ? "bg-cuci-primary shadow-[4px_4px_0px_0px_#000]" : "bg-gray-100"}`}
                      >
                        {filled ? <Check className="w-8 h-8 text-white" strokeWidth={4} /> : <Lock className="w-6 h-6 text-gray-400" strokeWidth={3} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Wash heatmap */}
          <section className="bold-card flex flex-col">
            <div className="bold-card-header bg-cuci-primary p-4 border-b-4 border-black flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <Calendar className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase tracking-widest">Wash Habit</h2>
              </div>
              <span className="bg-white text-black px-3 py-1 font-black text-sm uppercase shadow-[2px_2px_0px_0px_#000]">
                Last 12 Mo
              </span>
            </div>
            <div className="p-6 flex-1 flex flex-col justify-center">
              <div className="flex gap-3 mb-6">
                <span className="inline-flex items-center gap-2 font-black uppercase text-sm border-4 border-black px-3 py-1 bg-cuci-secondary shadow-[4px_4px_0px_0px_#000]">
                  <Flame className="w-5 h-5" /> Best streak: 4 days
                </span>
              </div>
              <div className="overflow-x-auto pb-4">
                <div className="inline-block min-w-full">
                  <div className="grid mb-2 ml-8 text-xs font-black uppercase" style={{ gridTemplateColumns: `repeat(53, 14px)`, columnGap: "4px" }}>
                    {GRID.map((_, idx) => {
                      const label = idx % 4 === 0 ? MONTHS[Math.floor(idx / 4) % 12] : "";
                      return <span key={idx} className="col-span-1 whitespace-nowrap">{label}</span>;
                    })}
                  </div>
                  <div className="flex gap-[4px]">
                    <div className="grid grid-rows-7 gap-[4px] mr-2 text-xs font-black uppercase pt-px">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <span key={i} className="h-3.5 w-3.5 flex items-center justify-center">{i % 2 === 1 ? d : ""}</span>
                      ))}
                    </div>
                    {GRID.map((week, wi) => (
                      <div key={wi} className="grid grid-rows-7 gap-[4px]">
                        {week.map((n, di) => (
                          <div key={di} className={"h-3.5 w-3.5 " + heatColor(n)} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-2 text-xs font-black uppercase">
                <span>Less</span>
                <span className="h-3.5 w-3.5 bg-gray-100 border-2 border-transparent" />
                <span className="h-3.5 w-3.5 bg-purple-200 border-2 border-black" />
                <span className="h-3.5 w-3.5 bg-purple-400 border-2 border-black" />
                <span className="h-3.5 w-3.5 bg-purple-600 border-2 border-black" />
                <span className="h-3.5 w-3.5 bg-orange-500 border-2 border-black" />
                <span>More</span>
              </div>
            </div>
          </section>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <KpiTile label="Washes this month" value="6" sub="↑ 2 vs last month" bg="bg-white" textColor="text-black" />
          <KpiTile label="Saved with sub" value="B$84.00" sub="vs pay-as-you-go" bg="bg-cuci-secondary" textColor="text-black" />
          <KpiTile label="Lifetime washes" value="142" sub="since Mar 2024" bg="bg-cuci-primary" textColor="text-white" />
        </div>

        {/* Achievements row */}
        <section className="bold-card">
          <div className="bold-card-header bg-black text-white p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6" />
              <h2 className="text-xl font-black uppercase tracking-widest">Achievements</h2>
            </div>
            <span className="bg-white text-black px-3 py-1 font-black text-sm uppercase shadow-[2px_2px_0px_0px_#000]">
              3 / 5 unlocked
            </span>
          </div>
          <div className="p-6">
            <div className="flex gap-6 overflow-x-auto pb-4">
              {BADGES.map((a) => {
                const Icon = a.unlocked ? a.icon : Lock;
                const pct = a.progress ? (a.progress.current / a.progress.target) * 100 : 100;
                return (
                  <div
                    key={a.id}
                    className={`shrink-0 w-40 border-4 border-black p-4 flex flex-col items-center justify-center text-center
                      ${a.unlocked ? `${a.tone} shadow-[6px_6px_0px_0px_#000]` : "bg-gray-100 opacity-70"}`}
                  >
                    <div className="w-14 h-14 bg-white border-4 border-black flex items-center justify-center mb-3 shadow-[2px_2px_0px_0px_#000]">
                      <Icon className="w-6 h-6 text-black" strokeWidth={3} />
                    </div>
                    <p className="font-black uppercase text-sm mb-1">{a.label}</p>
                    <p className="font-bold text-xs">{a.desc}</p>
                    {a.progress && (
                      <div className="w-full mt-3">
                        <div className="h-3 border-2 border-black bg-white w-full relative">
                          <div className="h-full bg-black" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="font-mono font-black text-xs mt-1">{a.progress.current}/{a.progress.target}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Recent washes */}
        <section className="bold-card">
          <div className="bold-card-header bg-black text-white p-4 flex justify-between items-center">
            <h2 className="text-xl font-black uppercase tracking-widest">Recent Washes</h2>
            <button className="font-black uppercase tracking-widest underline decoration-2 underline-offset-4 hover:text-cuci-secondary">
              View all →
            </button>
          </div>
          <div className="p-0">
            {RECENT.map((o, i) => (
              <div key={o.id} className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 ${i !== RECENT.length - 1 ? "border-b-4 border-black" : ""}`}>
                <div className="w-12 h-12 bg-cuci-primary border-4 border-black flex items-center justify-center shrink-0 shadow-[2px_2px_0px_0px_#000]">
                  <Droplet className="w-6 h-6 text-white" strokeWidth={3} />
                </div>
                <div className="flex-1">
                  <p className="font-black text-lg uppercase">{o.pkg}</p>
                  <p className="font-bold uppercase text-sm mt-1 border-l-4 border-cuci-secondary pl-2">
                    {o.branch} · <span className="font-mono">{o.plate}</span> · {o.date}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2">
                  <span className="font-black text-2xl">{o.amount}</span>
                  <span className="border-2 border-black px-2 py-1 text-xs font-black uppercase bg-gray-100 shadow-[2px_2px_0px_0px_#000]">
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

function KpiTile({ label, value, sub, bg, textColor }: { label: string; value: string; sub: string; bg: string; textColor: string }) {
  return (
    <div className={`bold-kpi ${bg} ${textColor} p-6 flex flex-col justify-between`}>
      <p className="font-black uppercase tracking-widest text-sm border-b-4 border-black pb-2 mb-4">{label}</p>
      <p className="text-5xl md:text-6xl font-black mb-2 bold-kpi-val tracking-tighter">{value}</p>
      <p className="font-bold uppercase text-xs inline-block bg-black text-white px-2 py-1 self-start">{sub}</p>
    </div>
  );
}
