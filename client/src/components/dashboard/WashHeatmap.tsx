import { useMemo, useState } from "react";
import { Flame, Calendar } from "lucide-react";
import { OrderRow } from "./types";

interface Props {
  orders: OrderRow[];
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface Cell {
  date: Date;
  key: string;
  count: number;
}

// Build a full year grid (53 weeks × 7 days) ending today.
function buildGrid(orders: OrderRow[]) {
  const counts = new Map<string, number>();
  for (const o of orders) {
    const d = new Date(o.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Walk back 53 weeks * 7 days = 371 days, then snap start to a Sunday so each
  // column is a clean Sun→Sat week.
  const start = new Date(todayMid);
  start.setDate(start.getDate() - 370);
  start.setDate(start.getDate() - start.getDay());

  const weeks: Cell[][] = [];
  const cur = new Date(start);
  while (cur <= todayMid) {
    const week: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
      week.push({
        date: new Date(cur),
        key,
        count: counts.get(key) ?? 0,
      });
      cur.setDate(cur.getDate() + 1);
      if (cur > todayMid) break;
    }
    while (week.length < 7) {
      // Pad future cells of the current week with empty placeholders so
      // the column always renders 7 rows.
      week.push({ date: new Date(0), key: `empty-${weeks.length}-${week.length}`, count: -1 });
    }
    weeks.push(week);
  }
  return weeks;
}

function intensityClass(count: number): string {
  if (count < 0) return "bg-transparent";
  if (count === 0) return "bg-gray-100 hover:bg-gray-200";
  if (count === 1) return "bg-purple-200 hover:bg-purple-300";
  if (count === 2) return "bg-purple-400 hover:bg-purple-500";
  if (count === 3) return "bg-violet-500 hover:bg-violet-600";
  return "bg-gradient-to-br from-purple-600 to-orange-500";
}

// Compute the longest run of consecutive days that have ≥1 wash, using
// the same orders array. Used for the "longest streak" pill.
function longestStreak(orders: OrderRow[]): number {
  if (orders.length === 0) return 0;
  const days = new Set<string>();
  for (const o of orders) {
    const d = new Date(o.created_at);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  const sorted = Array.from(days)
    .map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(y, m, d).getTime();
    })
    .sort((a, b) => a - b);
  let best = 1;
  let cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (sorted[i] - sorted[i - 1]) / (24 * 60 * 60 * 1000);
    if (diff === 1) {
      cur++;
      if (cur > best) best = cur;
    } else {
      cur = 1;
    }
  }
  return best;
}

export function WashHeatmap({ orders }: Props) {
  const [hover, setHover] = useState<Cell | null>(null);
  const weeks = useMemo(() => buildGrid(orders), [orders]);
  const streak = useMemo(() => longestStreak(orders), [orders]);

  // Build month labels positioned above the first column of each month.
  const monthHeaders: { label: string; col: number }[] = [];
  let lastMonth = -1;
  weeks.forEach((w, idx) => {
    const firstReal = w.find((c) => c.count >= 0);
    if (!firstReal) return;
    const m = firstReal.date.getMonth();
    if (m !== lastMonth) {
      monthHeaders.push({ label: MONTH_LABELS[m], col: idx });
      lastMonth = m;
    }
  });

  const totalCells = weeks.reduce(
    (s, w) => s + w.filter((c) => c.count >= 0).length,
    0,
  );
  const washDays = weeks.reduce(
    (s, w) => s + w.filter((c) => c.count > 0).length,
    0,
  );
  const consistencyPct = totalCells === 0 ? 0 : Math.round((washDays / totalCells) * 100);

  return (
    <section
      className="bg-white rounded-2xl border border-gray-200 p-5"
      data-testid="card-wash-heatmap"
    >
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-purple-600">
            <Calendar className="w-4 h-4" />
            <p className="text-[11px] uppercase tracking-widest font-bold">
              Wash habit
            </p>
          </div>
          <h2 className="text-lg md:text-xl font-extrabold text-gray-900 mt-1">
            Last 12 months
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-700 bg-orange-100 px-2.5 py-1 rounded-full">
            <Flame className="w-3.5 h-3.5" />
            {streak === 0
              ? "No streak yet"
              : `Best streak: ${streak} day${streak === 1 ? "" : "s"}`}
          </span>
          <span className="hidden sm:inline-flex text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full">
            {washDays} wash day{washDays === 1 ? "" : "s"} · {consistencyPct}%
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Month label row */}
          <div
            className="grid mb-1 ml-6 text-[10px] uppercase font-bold text-gray-400"
            style={{
              gridTemplateColumns: `repeat(${weeks.length}, 12px)`,
              columnGap: "3px",
            }}
          >
            {weeks.map((_, idx) => {
              const m = monthHeaders.find((h) => h.col === idx);
              return (
                <span key={idx} className="col-span-1 whitespace-nowrap">
                  {m?.label ?? ""}
                </span>
              );
            })}
          </div>

          <div className="flex gap-[3px]">
            {/* Weekday labels column */}
            <div className="grid grid-rows-7 gap-[3px] mr-1 text-[9px] text-gray-400 font-bold pt-px">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="h-3 w-3 grid place-items-center">
                  {i % 2 === 1 ? d : ""}
                </span>
              ))}
            </div>

            {/* Week columns */}
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-rows-7 gap-[3px]">
                {week.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    aria-label={
                      cell.count < 0
                        ? "future"
                        : `${cell.date.toDateString()} — ${cell.count} wash${cell.count === 1 ? "" : "es"}`
                    }
                    onMouseEnter={() => cell.count >= 0 && setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    className={
                      "h-3 w-3 rounded-[3px] transition-colors " +
                      intensityClass(cell.count)
                    }
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Legend + tooltip readout */}
          <div className="flex items-center justify-between mt-3 text-[11px] text-gray-500">
            <span className="font-medium" data-testid="heatmap-tooltip">
              {hover
                ? `${hover.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} — ${hover.count} wash${hover.count === 1 ? "" : "es"}`
                : "Hover a square for details"}
            </span>
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
  );
}
