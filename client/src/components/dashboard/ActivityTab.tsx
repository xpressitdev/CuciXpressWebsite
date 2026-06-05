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
  LayoutGrid,
  List,
  Printer,
  Search,
  X,
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OrderRow,
  formatBND,
  formatBNDFull,
  formatDateTime,
  packageBadgeClass,
  shortReceiptId,
} from "./types";
import {
  DateRangeFilter,
  DateRange,
  resolveRange,
} from "./DateRangeFilter";
import { PackageMixCard } from "./PackageMixCard";
import { Leaderboard } from "./Leaderboard";

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

function payLabel(method: string) {
  if (method === "cash") return "Cash";
  if (method === "qr_code") return "QR Pay";
  return method;
}

function packageGradient(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("premium")) return "from-amber-400 to-orange-500";
  if (lower.includes("basic")) return "from-slate-400 to-slate-600";
  return "from-violet-500 to-purple-600";
}

type ViewMode = "timeline" | "receipts";

// Combined "Activity" tab — merges the old Wash History and Receipts
// pages. The hero stats, 6-month chart, search/filters, package-mix
// donut and CSV export come from the history side; the receipt dialog
// (print / WhatsApp / save PDF) comes from the receipts side. A view
// toggle lets the user flip between a chronological timeline and the
// classic receipt-card grid without losing any feature.
export function ActivityTab({ orders }: Props) {
  const [view, setView] = useState<ViewMode>("timeline");
  const [filter, setFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [range, setRange] = useState<DateRange>({ preset: "all" });
  const [openReceipt, setOpenReceipt] = useState<OrderRow | null>(null);

  // Status tier — derived from lifetime wash count. Replaces the old
  // "Lifetime spend" tile so customers see a status they're proud of
  // rather than a running bill total.
  const tier = (() => {
    const n = orders.length;
    if (n >= 100) return { label: "Centurion", sub: "Hall of fame · 100+ washes", grad: "from-amber-300 to-orange-400" };
    if (n >= 50)  return { label: "Gold regular", sub: "Top-tier driver · 50+ washes", grad: "from-yellow-200 to-amber-300" };
    if (n >= 25)  return { label: "Silver regular", sub: "On a streak · 25+ washes", grad: "from-slate-200 to-slate-300" };
    if (n >= 10)  return { label: "Regular", sub: "We know your plate · 10+ washes", grad: "from-violet-200 to-fuchsia-200" };
    if (n >= 1)   return { label: "Splash starter", sub: "Welcome aboard", grad: "from-cyan-200 to-sky-300" };
    return { label: "New driver", sub: "First wash awaits", grad: "from-white to-white/70" };
  })();

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const { from, to } = resolveRange(range);
    return orders
      .filter((o) => {
        const t = +new Date(o.created_at);
        if (from && t < +from) return false;
        if (to && t > +to) return false;
        if (!q) return true;
        return (
          o.plate.toLowerCase().includes(q) ||
          o.package_name.toLowerCase().includes(q) ||
          (o.branch_name ?? "").toLowerCase().includes(q) ||
          shortReceiptId(o.id).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [orders, filter, range]);

  // Six-month bar chart of wash count
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
    for (const o of filtered) {
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
    a.download = `cucixpress-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const last30 = monthly[monthly.length - 1]?.count ?? 0;
  const prev30 = monthly[monthly.length - 2]?.count ?? 0;
  const trendPct =
    prev30 === 0 ? (last30 > 0 ? 100 : 0) : Math.round(((last30 - prev30) / prev30) * 100);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900">
            Activity
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} wash{filtered.length === 1 ? "" : "es"} · tap any
            item for the receipt
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* View toggle */}
          <div
            className="inline-flex bg-gray-100 rounded-lg p-1"
            role="tablist"
            aria-label="View mode"
          >
            <button
              onClick={() => setView("timeline")}
              className={
                "px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 transition " +
                (view === "timeline"
                  ? "bg-white text-purple-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700")
              }
              data-testid="button-view-timeline"
            >
              <List className="w-3.5 h-3.5" /> Timeline
            </button>
            <button
              onClick={() => setView("receipts")}
              className={
                "px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 transition " +
                (view === "receipts"
                  ? "bg-white text-purple-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700")
              }
              data-testid="button-view-receipts"
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Receipts
            </button>
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilterOpen((v) => !v)}
            data-testid="button-activity-filter"
          >
            <FilterIcon className="w-4 h-4 mr-1.5" /> Search
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            data-testid="button-activity-export"
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
              Member status
            </p>
            <p
              className={`text-3xl md:text-4xl font-black leading-tight mt-2 bg-gradient-to-r ${tier.grad} bg-clip-text text-transparent`}
              data-testid="text-activity-tier"
            >
              {tier.label}
            </p>
            <p className="mt-2 text-sm text-white/80 inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {tier.sub}
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
                        (i === monthly.length - 1 ? "bg-white" : "bg-white/40")
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
        <div className="bg-white border border-gray-200 rounded-xl p-3 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            placeholder="Search by plate, package, branch, or receipt #…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9"
            data-testid="input-activity-filter"
          />
        </div>
      )}

      {/* Package mix donut + per-package spend */}
      <PackageMixCard orders={filtered} />

      {/* Community leaderboard — unlocks once the customer hits 10 done washes */}
      {orders.filter((o) => o.status === "done").length >= 10 && <Leaderboard />}

      {/* Body */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center">
          <ReceiptIcon className="w-10 h-10 mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">
            {orders.length === 0
              ? "No washes yet — your first ride through Cuci Xpress will show up here."
              : "Nothing matches your filter."}
          </p>
        </div>
      ) : view === "timeline" ? (
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
                        <span
                          className={`absolute -left-[18px] top-5 w-3.5 h-3.5 rounded-full bg-gradient-to-br ${packageGradient(o.package_name)} ring-4 ring-white`}
                        />
                        <button
                          onClick={() => setOpenReceipt(o)}
                          className="w-full text-left bg-white rounded-2xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition overflow-hidden flex"
                          data-testid={`row-activity-${o.id}`}
                        >
                          <div
                            className={`w-1.5 bg-gradient-to-b ${packageGradient(o.package_name)}`}
                          />
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
                              <span className="text-[10px] font-mono text-gray-400">
                                #{shortReceiptId(o.id)}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm text-gray-700 truncate">
                              <MapPin className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                              {o.branch_name ?? "—"}
                            </p>
                          </div>
                          <div className="px-4 py-3 text-right shrink-0 flex flex-col justify-center items-end">
                            <p className="font-black text-gray-900 whitespace-nowrap">
                              {formatBND(o.total_cents)}
                            </p>
                            <p className="text-[10px] uppercase font-bold text-gray-400 inline-flex items-center gap-1 mt-0.5">
                              <PIcon className="w-3 h-3" />
                              {o.payment_method === "qr_code" ? "QR" : o.payment_method}
                            </p>
                          </div>
                        </button>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((o, i) => {
            const PIcon = payIcon(o.payment_method);
            const d = new Date(o.created_at);
            const grad = packageGradient(o.package_name);
            return (
              <motion.button
                key={o.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ y: -4 }}
                onClick={() => setOpenReceipt(o)}
                className="group relative text-left bg-white rounded-2xl shadow-sm hover:shadow-xl transition border border-gray-200 hover:border-purple-300 overflow-hidden"
                data-testid={`row-activity-card-${o.id}`}
              >
                <div className={`h-2 bg-gradient-to-r ${grad}`} />
                <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                      Receipt
                    </p>
                    <p className="font-mono text-base font-black text-gray-900">
                      {shortReceiptId(o.id)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase font-bold text-gray-400">
                      {MONTH_LABELS[d.getMonth()]} {d.getFullYear()}
                    </p>
                    <p className="text-2xl font-black text-gray-900 leading-none">
                      {d.getDate()}
                    </p>
                  </div>
                </div>
                <div className="relative px-5">
                  <div className="border-t-2 border-dashed border-gray-200" />
                  <span className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-gray-100" />
                  <span className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-gray-100" />
                </div>
                <div className="px-5 py-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold text-white bg-gradient-to-r ${grad}`}
                    >
                      {o.package_name}
                    </span>
                    <span className="text-[11px] font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                      {o.plate}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 truncate inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-gray-400" />
                    {o.branch_name ?? "—"}
                  </p>
                  <p className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                    <PIcon className="w-3 h-3" /> {payLabel(o.payment_method)} ·{" "}
                    {d.toTimeString().slice(0, 5)}
                  </p>
                </div>
                <div className="px-5 pb-4 pt-2 flex items-center justify-between border-t border-dashed border-gray-200">
                  <span className="text-[11px] uppercase tracking-widest font-bold text-gray-500">
                    Total
                  </span>
                  <span className="font-black text-lg bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent">
                    {formatBNDFull(o.total_cents)}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Shared receipt dialog (used by both timeline and receipts view) */}
      <Dialog open={!!openReceipt} onOpenChange={(v) => !v && setOpenReceipt(null)}>
        <DialogContent className="max-w-sm p-0 overflow-visible bg-transparent border-none shadow-none [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="sr-only">Receipt</DialogTitle>
          </DialogHeader>
          {openReceipt && (
            <div className="relative">
              <DialogClose
                className="absolute -right-2 -top-2 z-30 rounded-full bg-gray-900 text-white p-2 shadow-lg border-2 border-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                data-testid="button-receipt-close"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close receipt</span>
              </DialogClose>
              <div className="overflow-hidden rounded-md">
                <ReceiptView order={openReceipt} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReceiptView({ order }: { order: OrderRow }) {
  const PIcon = payIcon(order.payment_method);
  const grad = packageGradient(order.package_name);
  return (
    <div className="space-y-3">
      <div
        id="cuci-receipt-print"
        className="bg-white shadow-2xl"
        style={{
          WebkitMaskImage:
            "radial-gradient(circle at 0 100%, transparent 10px, #000 11px), radial-gradient(circle at 100% 100%, transparent 10px, #000 11px)",
        }}
      >
        <div className={`h-3 bg-gradient-to-r ${grad}`} />

        <div className="px-6 pt-5 pb-3 text-center">
          <p className="text-2xl font-black bg-gradient-to-r from-purple-600 via-violet-500 to-orange-500 bg-clip-text text-transparent">
            CuciXpress
          </p>
          <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
            Drive-thru car wash · Brunei
          </p>
        </div>

        <div className="px-6">
          <div className="border-t-2 border-dashed border-gray-200" />
        </div>

        <div className="px-6 py-4 text-center">
          <p className="text-[10px] uppercase font-bold text-gray-400">Receipt no.</p>
          <p className="font-mono text-lg font-black text-gray-900">
            {shortReceiptId(order.id)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatDateTime(order.created_at)}
          </p>
        </div>

        <div className="px-6">
          <div className="border-t-2 border-dashed border-gray-200" />
        </div>

        <dl className="px-6 py-4 text-sm space-y-2">
          <Row label="Branch" value={order.branch_name ?? "—"} />
          <Row label="Vehicle" value={order.plate} mono />
          <Row label="Package" value={order.package_name} />
          <Row
            label="Payment"
            value={payLabel(order.payment_method)}
            icon={<PIcon className="w-3.5 h-3.5 text-gray-400" />}
          />
          <Row label="Status" value={order.status} />
        </dl>

        <div className="px-6">
          <div className="border-t-2 border-dashed border-gray-200" />
        </div>

        <div className="px-6 py-4 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-widest font-black text-gray-500">
            Total
          </span>
          <span className="text-2xl font-black bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent">
            {formatBNDFull(order.total_cents)}
          </span>
        </div>

        <div className="px-6 pb-6 pt-1 text-center">
          <p className="text-[11px] text-gray-400 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Thank you for choosing CuciXpress · {formatBND(order.total_cents)} earned in loyalty
          </p>
        </div>
      </div>

      <div className="flex gap-2 print:hidden px-1">
        <Button
          variant="outline"
          className="flex-1 bg-white"
          onClick={() => printReceipt(order)}
          data-testid="button-receipt-print"
        >
          <Printer className="w-4 h-4 mr-1.5" /> Print
        </Button>
        <Button
          variant="outline"
          className="flex-1 bg-white border-emerald-500 text-emerald-700 hover:bg-emerald-50"
          onClick={() => shareToWhatsApp(order)}
          data-testid="button-receipt-share-wa"
        >
          <SiWhatsapp className="w-4 h-4 mr-1.5" /> WhatsApp
        </Button>
        <Button
          className="flex-1 bg-gradient-to-r from-purple-600 to-orange-500 text-white"
          onClick={() => printReceipt(order)}
          data-testid="button-receipt-download"
        >
          <Download className="w-4 h-4 mr-1.5" /> Save PDF
        </Button>
      </div>
    </div>
  );
}

// Prints a clean, single-page receipt via a hidden iframe. We render a
// self-contained HTML document instead of window.print() so (a) only the
// receipt prints — not the whole dashboard, which previously spilled onto 3
// pages — and (b) the title/total show as solid colours rather than the
// gradient "clip-text" that disappears when browsers drop background graphics.
let printing = false;
function printReceipt(order: OrderRow) {
  if (printing) return; // ignore rapid double-clicks while a print is in flight
  printing = true;
  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      c === "&" ? "&amp;"
        : c === "<" ? "&lt;"
        : c === ">" ? "&gt;"
        : c === '"' ? "&quot;"
        : "&#39;",
    );
  const row = (label: string, value: string) =>
    `<div class="row"><span class="lbl">${esc(label)}</span><span class="val">${esc(value)}</span></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(shortReceiptId(order.id))}</title>
<style>
  @page { margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; }
  .receipt { width: 300px; margin: 0 auto; padding: 8px 0; }
  .bar { height: 6px; background: #7c3aed; border-radius: 3px; }
  .center { text-align: center; }
  .brand { font-size: 22px; font-weight: 800; color: #7c3aed; margin: 10px 0 2px; }
  .sub { font-size: 9px; letter-spacing: 2px; text-transform: uppercase; color: #888; }
  .hr { border-top: 2px dashed #d4d4d8; margin: 12px 0; }
  .small { font-size: 9px; text-transform: uppercase; color: #999; letter-spacing: 1px; }
  .rid { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 17px; font-weight: 800; }
  .date { font-size: 11px; color: #666; margin-top: 2px; }
  .row { display: flex; justify-content: space-between; font-size: 13px; margin: 6px 0; }
  .lbl { color: #666; }
  .val { font-weight: 700; }
  .total { display: flex; justify-content: space-between; align-items: center; margin: 4px 0; }
  .total .t-lbl { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; font-weight: 800; color: #555; }
  .total .t-val { font-size: 20px; font-weight: 800; color: #7c3aed; }
  .foot { font-size: 10px; color: #999; text-align: center; margin-top: 6px; }
</style></head><body>
<div class="receipt">
  <div class="bar"></div>
  <div class="center">
    <div class="brand">CuciXpress</div>
    <div class="sub">Drive-thru car wash · Brunei</div>
  </div>
  <div class="hr"></div>
  <div class="center">
    <div class="small">Receipt no.</div>
    <div class="rid">${esc(shortReceiptId(order.id))}</div>
    <div class="date">${esc(formatDateTime(order.created_at))}</div>
  </div>
  <div class="hr"></div>
  ${row("Branch", order.branch_name ?? "—")}
  ${row("Vehicle", order.plate)}
  ${row("Package", order.package_name)}
  ${row("Payment", payLabel(order.payment_method))}
  ${row("Status", order.status)}
  <div class="hr"></div>
  <div class="total"><span class="t-lbl">Total</span><span class="t-val">${esc(formatBNDFull(order.total_cents))}</span></div>
  <div class="hr"></div>
  <div class="foot">Thank you for choosing CuciXpress · ${esc(formatBND(order.total_cents))} earned in loyalty</div>
</div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    printing = false;
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow!;
  const cleanup = () =>
    setTimeout(() => {
      iframe.remove();
      printing = false;
    }, 500);
  win.onafterprint = cleanup;
  // Give the iframe a tick to lay out before printing.
  setTimeout(() => {
    win.focus();
    win.print();
    cleanup();
  }, 150);
}

function shareToWhatsApp(order: OrderRow) {
  const lines = [
    "*CuciXpress receipt*",
    "",
    `Receipt: *${shortReceiptId(order.id)}*`,
    `Date: ${formatDateTime(order.created_at)}`,
    `Branch: ${order.branch_name ?? "—"}`,
    `Vehicle: ${order.plate}`,
    `Package: ${order.package_name}`,
    `Payment: ${payLabel(order.payment_method)}`,
    `Total: *${formatBNDFull(order.total_cents)}*`,
    "",
    "— cucixpress.com",
  ];
  const text = encodeURIComponent(lines.join("\n"));
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}

function Row({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-2 items-center">
      <dt className="text-gray-500 text-xs uppercase font-bold tracking-wider inline-flex items-center gap-1">
        {icon} {label}
      </dt>
      <dd
        className={
          "font-bold text-gray-900 text-right " + (mono ? "font-mono tracking-wider" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}
