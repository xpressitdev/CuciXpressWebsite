import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Printer,
  Receipt as ReceiptIcon,
  Search,
  MapPin,
  Banknote,
  QrCode,
  CreditCard,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  OrderRow,
  formatBNDFull,
  formatBND,
  formatDateTime,
  shortReceiptId,
} from "./types";
import {
  DateRangeFilter,
  DateRange,
  resolveRange,
} from "./DateRangeFilter";

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

export function ReceiptsTab({ orders }: Props) {
  const [open, setOpen] = useState<OrderRow | null>(null);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<DateRange>({ preset: "all" });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const { from, to } = resolveRange(range);
    const sorted = [...orders].sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    );
    return sorted.filter((o) => {
      const ts = +new Date(o.created_at);
      if (from && ts < +from) return false;
      if (to && ts > +to) return false;
      if (!t) return true;
      return (
        o.plate.toLowerCase().includes(t) ||
        o.package_name.toLowerCase().includes(t) ||
        (o.branch_name ?? "").toLowerCase().includes(t) ||
        shortReceiptId(o.id).toLowerCase().includes(t)
      );
    });
  }, [orders, q, range]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900">
            Receipts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Tap any receipt to view, print, or share.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search receipts…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 w-56"
              data-testid="input-receipt-search"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-100 to-orange-100 grid place-items-center mb-4">
            <ReceiptIcon className="w-8 h-8 text-purple-500" strokeWidth={1.5} />
          </div>
          <p className="text-base font-bold text-gray-700 mb-1">
            {orders.length === 0 ? "No receipts yet" : "Nothing matches that search"}
          </p>
          <p className="text-sm text-gray-500">
            {orders.length === 0
              ? "Once you've paid for a wash, your receipts will appear here."
              : "Try the plate, branch, or package name."}
          </p>
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
                onClick={() => setOpen(o)}
                className="group relative text-left bg-white rounded-2xl shadow-sm hover:shadow-xl transition border border-gray-200 hover:border-purple-300 overflow-hidden"
                data-testid={`row-receipt-${o.id}`}
                style={{
                  WebkitMaskImage:
                    "radial-gradient(circle at 0 92%, transparent 8px, #000 9px), radial-gradient(circle at 100% 92%, transparent 8px, #000 9px)",
                  WebkitMaskComposite: "source-in" as any,
                }}
              >
                {/* Coloured top stripe */}
                <div className={`h-2 bg-gradient-to-r ${grad}`} />

                {/* Header */}
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

                {/* Dashed perforation */}
                <div className="relative px-5">
                  <div className="border-t-2 border-dashed border-gray-200" />
                  <span className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-gray-100" />
                  <span className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-gray-100" />
                </div>

                {/* Body */}
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

                {/* Total */}
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

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-sm p-0 overflow-hidden bg-transparent border-none shadow-none">
          <DialogHeader>
            <DialogTitle className="sr-only">Receipt</DialogTitle>
          </DialogHeader>
          {open && <ReceiptView order={open} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReceiptView({ order }: { order: OrderRow }) {
  const print = () => window.print();
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
          onClick={print}
          data-testid="button-receipt-print"
        >
          <Printer className="w-4 h-4 mr-1.5" /> Print
        </Button>
        <Button
          className="flex-1 bg-gradient-to-r from-purple-600 to-orange-500 text-white"
          onClick={print}
          data-testid="button-receipt-download"
        >
          <Download className="w-4 h-4 mr-1.5" /> Save PDF
        </Button>
      </div>
    </div>
  );
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
