import { useMemo, useState } from "react";
import { Download, Filter as FilterIcon, MoreHorizontal } from "lucide-react";
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

  return (
    <div className="space-y-5">
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
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

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

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No washes match your filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider font-semibold text-gray-500 border-b border-gray-200">
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Package</th>
                  <th className="py-3 px-4">Vehicle</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60"
                    data-testid={`row-history-${o.id}`}
                  >
                    <td className="py-3 px-4 font-mono text-xs text-gray-500">
                      {shortReceiptId(o.id)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-xs">
                      {formatDateTime(o.created_at)}
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {o.branch_name ?? "—"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${packageBadgeClass(o.package_name)}`}
                      >
                        {o.package_name}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">{o.plate}</td>
                    <td className="py-3 px-4 text-right font-bold whitespace-nowrap">
                      {formatBND(o.total_cents)}
                    </td>
                    <td className="py-3 px-2 text-gray-300">
                      <MoreHorizontal className="w-4 h-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
