import { useMemo } from "react";
import { PieChart } from "lucide-react";
import { OrderRow, formatBND } from "./types";

interface Props {
  orders: OrderRow[];
}

interface Slice {
  label: string;
  count: number;
  spend: number;
  color: string;
  from: string; // gradient start (hex)
  to: string;   // gradient end (hex)
}

// Bucket every package_name into one of 4 visual families. Anything we
// don't recognise lands in "Other" so the donut always sums to 100%.
function bucketName(name: string): "premium" | "full" | "basic" | "other" {
  const n = name.toLowerCase();
  if (n.includes("premium")) return "premium";
  if (n.includes("full")) return "full";
  if (n.includes("basic")) return "basic";
  return "other";
}

const PALETTE: Record<string, { color: string; from: string; to: string; label: string }> = {
  premium: { color: "#f59e0b", from: "#fbbf24", to: "#f97316", label: "Premium" },
  full:    { color: "#7c3aed", from: "#a855f7", to: "#7c3aed", label: "Full" },
  basic:   { color: "#64748b", from: "#94a3b8", to: "#475569", label: "Basic" },
  other:   { color: "#10b981", from: "#34d399", to: "#059669", label: "Other" },
};

export function PackageMixCard({ orders }: Props) {
  const slices = useMemo<Slice[]>(() => {
    const tally = new Map<string, { count: number; spend: number }>();
    for (const o of orders) {
      const k = bucketName(o.package_name);
      const cur = tally.get(k) ?? { count: 0, spend: 0 };
      cur.count += 1;
      cur.spend += o.total_cents;
      tally.set(k, cur);
    }
    return Array.from(tally.entries())
      .map(([key, v]) => ({ ...PALETTE[key], ...v }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  const total = slices.reduce((s, x) => s + x.count, 0);
  const totalSpend = slices.reduce((s, x) => s + x.spend, 0);

  if (total === 0) return null;

  // Build SVG arcs. Donut uses a 100-unit virtual circle so we can keep
  // strokeDasharray in simple percent terms. We rotate via an offset so
  // the slices wrap a single ring without overlap.
  const size = 160;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;

  return (
    <section
      className="bg-white rounded-2xl border border-gray-200 p-5"
      data-testid="card-package-mix"
    >
      <div className="flex items-center gap-2 text-purple-600 mb-4">
        <PieChart className="w-4 h-4" />
        <p className="text-[11px] uppercase tracking-widest font-bold">
          What you wash
        </p>
        <h2 className="text-base font-bold text-gray-900 ml-2">
          Package mix
        </h2>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Donut */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            {slices.map((s) => {
              const pct = s.count / total;
              const dash = pct * c;
              const gap = c - dash;
              const offset = -acc * c;
              acc += pct;
              return (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={offset}
                  style={{ transition: "stroke-dashoffset 600ms ease-out" }}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-3xl font-black bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent leading-none">
                {total}
              </p>
              <p className="text-[10px] uppercase font-bold text-gray-500 mt-1 tracking-wider">
                washes
              </p>
            </div>
          </div>
        </div>

        {/* Legend with bars + spend */}
        <ul className="flex-1 w-full space-y-3" data-testid="package-mix-legend">
          {slices.map((s) => {
            const pct = (s.count / total) * 100;
            const spendPct = totalSpend === 0 ? 0 : (s.spend / totalSpend) * 100;
            return (
              <li key={s.label} className="flex items-center gap-3">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: s.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-gray-900 truncate">
                      {s.label}
                    </span>
                    <span className="text-xs font-mono text-gray-500 shrink-0">
                      {s.count} · {formatBND(s.spend)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${s.from}, ${s.to})`,
                        transition: "width 600ms ease-out",
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {pct.toFixed(0)}% of washes · {spendPct.toFixed(0)}% of spend
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
