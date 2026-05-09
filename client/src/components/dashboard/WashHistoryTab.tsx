import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Filter as FilterIcon,
  MapPin,
  Sparkles,
  Calendar,
  TrendingUp,
  Banknote,
  QrCode,
  CreditCard,
  Receipt as ReceiptIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  OrderRow,
  formatBND,
  formatBNDFull,
  formatDateTime,
  packageBadgeClass,
  shortReceiptId,
} from "./types";

interface Props {
  orders: OrderRow[];
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function payIcon(method: string) {
  if (method === "cash") return Banknote;
  if (method === "qr_code") return QrCode;
  return CreditCard;
}

function packageGradient(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("premium")) return "from-amber-400 to-orange-500";
  if (lower.includes("basic")) return "from-slate-400 to-slate-600";
  return "from-violet-500 to-purple-600";
}

export function WashHistoryTab({ orders }: Props) {
  const [filter, setFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.plate.toLowerCase().includes(q) ||
        o.package_name.toLowerCase().includes(q) ||
        (o.branch_name ?? "").toLowerCase().includes(q),
    );
  }, [orders, filter]);

  const total = filtered.reduce((acc, o) => acc + o.total_cents, 0);

  // Build a 6-month bar chart of wash count + spend
  const monthly = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; count: number; spend: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: MONTH_LABELS[d.getMonth()],
        count: 0,
        spend: 0,
      });
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]));
    for (const o of orders) {
      const d = new Date(o.created_at);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      const i = idx.get(k);
      if (i !== undefined) {
        buckets[i].count += 1;
        buckets[i].spend += o.total_cents;
      }
    }
    return buckets;
  }, [orders]);

  const peakCount = Math.max(1, ...monthly.map((m) => m.count));

  // Favorite branch / package
  const favorites = useMemo(() => {
    const branchTally = new Map<string, number>();
    const pkgTally = new Map<string, number>();
    for (const o of orders) {
      if (o.branch_name) branchTally.set(o.branch_name, (branchTally.get(o.branch_name) ?? 0) + 1);
      pkgTally.set(o.package_name, (pkgTally.get(o.package_name) ?? 0) + 1);
    }
    const topBranch = Array.from(branchTally.entries()).sort((a, b) => b[1] - a[1])[0];
    const topPkg = Array.from(pkgTally.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      branch: topBranch?.[0] ?? "—",
      branchCount: topBranch?.[1] ?? 0,
      pkg: topPkg?.[0] ?? "—",
      pkgCount: topPkg?.[1] ?? 0,
    };
  }, [orders]);

  // Group filtered orders by Month YYYY for the timeline
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; orders: OrderRow[] }>();
    for (const o of [...filtered].sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    )) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
      if (!map.has(key)) map.set(key, { label, orders: [] });
      map.get(key)!.orders.push(o);
    }
    return Array.from(map.values());
  }, [filtered]);

  const exportCsv = () => {
    const header = ["ID", "Date", "Branch", "Package", "Vehicle", "Status", "Amount"];
    const rows = filtered.map((o) => [
      shortReceiptId(o.id),
      formatDateTime(o.created_at),
      o.branch_name ?? "",
      o.package_name,
      o.plate,
      o.status,
      formatBNDFull(o.total_cents),
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wash-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const last30 = monthly[monthly.length - 1]?.count ?? 0;
  const prev30 = monthly[monthly.length - 2]?.count ?? 0;
  const trendPct = prev30 === 0 ? (last30 > 0 ? 100 : 0) : Math.round(((last30 - prev30) / prev30) * 100);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900">
            Wash history
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} wash{filtered.length === 1 ? "" : "es"} ·{" "}
            <span className="font-bold text-gray-700">
              {formatBND(total)} total
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen((v) => !v)}
            data-testid="button-history-filter"
          >
            <FilterIcon className="w-4 h-4 mr-1.5" /> Filter
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            data-testid="button-history-export"
          >
            <Download className="w-4 h-4 mr-1.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Stats hero card with mini chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 via-violet-500 to-orange-500 text-white p-6 md:p-8 shadow-xl"
      >
        {/* decorative blobs */}
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-20 -left-10 w-64 h-64 bg-amber-300/20 rounded-full blur-3xl" />

        <div className="relative grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-white/70">
              Total washes
            </p>
            <p className="text-5xl font-black leading-none mt-2">{orders.length}</p>
            <p className="mt-2 text-sm text-white/80 inline-flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              {trendPct >= 0 ? "+" : ""}{trendPct}% vs last month
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-white/70">
              Lifetime spend
            </p>
            <p className="text-5xl font-black leading-none mt-2">
              {formatBND(orders.reduce((a, o) => a + o.total_cents, 0))}
            </p>
            <p className="mt-2 text-sm text-white/80 inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {favorites.pkg} fan ({favorites.pkgCount}×)
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-bold text-white/70">
              Home branch
            </p>
            <p className="text-2xl font-black leading-tight mt-2">
              {favorites.branch}
            </p>
            <p className="mt-2 text-sm text-white/80 inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {favorites.branchCount} visit{favorites.branchCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* 6-month bar chart */}
        <div className="relative mt-6 pt-6 border-t border-white/20">
          <p className="text-[11px] uppercase tracking-widest font-bold text-white/70 mb-3">
            Last 6 months
          </p>
          <div className="flex items-stretch gap-2 md:gap-3 h-32">
            {monthly.map((m, i) => {
              const h = (m.count / peakCount) * 100;
              return (
                <div key={m.key} className="flex-1 h-full flex flex-col items-center gap-1.5">
                  <div className="w-full flex-1 flex items-end min-h-0">
                    <motion.div
                      initial={{ height: "0%" }}
                      animate={{ height: `${Math.max(h, 4)}%` }}
                      transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 110 }}
                      className={
                        "w-full rounded-t-md " +
                        (i === monthly.length - 1
                          ? "bg-white"
                          : "bg-white/40")
                      }
                      title={`${m.count} washes · ${formatBND(m.spend)}`}
                    />
                  </div>
                  <span className="text-[10px] uppercase font-bold text-white/70">
                    {m.label}
                  </span>
                  <span className="text-xs font-black">{m.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {filterOpen && (
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <Input
            placeholder="Filter by plate, package, or branch…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="input-history-filter"
          />
        </div>
      )}

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center">
          <ReceiptIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">
            {orders.length === 0
              ? "No washes yet — your first ride through Cuci Xpress will show up here."
              : "No washes match your filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-black uppercase tracking-widest text-gray-500">
                  {g.label}
                </h2>
                <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent" />
                <span className="text-xs font-bold text-gray-400">
                  {g.orders.length} wash{g.orders.length === 1 ? "" : "es"}
                </span>
              </div>

              <div className="relative pl-6">
                {/* vertical line */}
                <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gradient-to-b from-purple-200 via-violet-100 to-orange-100" />

                <ul className="space-y-3">
                  {g.orders.map((o, i) => {
                    const PIcon = payIcon(o.payment_method);
                    const d = new Date(o.created_at);
                    return (
                      <motion.li
                        key={o.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="relative"
                      >
                        {/* dot */}
                        <span
                          className={`absolute -left-[18px] top-5 w-3.5 h-3.5 rounded-full bg-gradient-to-br ${packageGradient(o.package_name)} ring-4 ring-white`}
                        />
                        <div
                          className="bg-white rounded-2xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition overflow-hidden flex"
                          data-testid={`row-history-${o.id}`}
                        >
                          {/* color stripe */}
                          <div
                            className={`w-1.5 bg-gradient-to-b ${packageGradient(o.package_name)}`}
                          />
                          {/* date column */}
                          <div className="px-4 py-4 text-center w-20 border-r border-gray-100 shrink-0">
                            <p className="text-[10px] uppercase font-bold text-gray-400">
                              {MONTH_LABELS[d.getMonth()]}
                            </p>
                            <p className="text-2xl font-black text-gray-900 leading-none">
                              {d.getDate()}
                            </p>
                            <p className="text-[10px] font-mono text-gray-400 mt-1">
                              {d.toTimeString().slice(0, 5)}
                            </p>
                          </div>
                          {/* main */}
                          <div className="flex-1 px-4 py-3 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${packageBadgeClass(o.package_name)}`}
                              >
                                {o.package_name}
                              </span>
                              <span className="text-[11px] font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                                {o.plate}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm text-gray-700 truncate">
                              <MapPin className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                              {o.branch_name ?? "—"}
                            </p>
                          </div>
                          {/* amount */}
                          <div className="px-4 py-3 text-right shrink-0 flex flex-col justify-center items-end">
                            <p className="font-black text-gray-900 whitespace-nowrap">
                              {formatBND(o.total_cents)}
                            </p>
                            <p className="text-[10px] uppercase font-bold text-gray-400 inline-flex items-center gap-1 mt-0.5">
                              <PIcon className="w-3 h-3" />
                              {o.payment_method === "qr_code" ? "QR" : o.payment_method}
                            </p>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
