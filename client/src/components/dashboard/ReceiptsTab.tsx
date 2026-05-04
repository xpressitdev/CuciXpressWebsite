import { useState } from "react";
import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface Props {
  orders: OrderRow[];
}

export function ReceiptsTab({ orders }: Props) {
  const [open, setOpen] = useState<OrderRow | null>(null);

  return (
    <div className="space-y-5">
      <h1 className="text-3xl md:text-4xl font-black text-gray-900">Receipts</h1>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm text-gray-500">
            Once you've paid for a wash, your receipts will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {orders.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50/60"
              data-testid={`row-receipt-${o.id}`}
            >
              <div className="min-w-0">
                <p className="font-bold text-sm text-gray-900">
                  Receipt {shortReceiptId(o.id)}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {formatDateTime(o.created_at)} · {o.branch_name ?? "—"} ·{" "}
                  {o.package_name}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-bold text-sm">
                  {formatBND(o.total_cents)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(o)}
                  data-testid={`button-receipt-view-${o.id}`}
                >
                  <Download className="w-3.5 h-3.5 mr-1" /> PDF
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-sm">
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
  return (
    <div className="space-y-4">
      <div id="cuci-receipt-print" className="bg-white p-1">
        <p className="text-center text-xl font-black bg-gradient-to-r from-cuci-primary to-cuci-secondary bg-clip-text text-transparent">
          CuciXpress
        </p>
        <p className="text-center text-[11px] text-gray-500">
          Brunei drive-thru car wash
        </p>

        <div className="border-t border-dashed border-gray-300 my-3" />

        <p className="text-center font-mono text-sm">
          Receipt {shortReceiptId(order.id)}
        </p>
        <p className="text-center text-xs text-gray-500">
          {formatDateTime(order.created_at)}
        </p>

        <div className="border-t border-dashed border-gray-300 my-3" />

        <dl className="text-sm space-y-1.5">
          <Row label="Branch" value={order.branch_name ?? "—"} />
          <Row label="Vehicle" value={order.plate} />
          <Row label="Package" value={order.package_name} />
          <Row
            label="Payment"
            value={
              order.payment_method === "qr_code"
                ? "QR Code"
                : order.payment_method === "cash"
                  ? "Cash"
                  : order.payment_method
            }
          />
          <Row label="Status" value={order.status} />
        </dl>

        <div className="border-t border-dashed border-gray-300 my-3" />

        <div className="flex items-center justify-between text-base font-black">
          <span>TOTAL</span>
          <span>{formatBNDFull(order.total_cents)}</span>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Thank you for choosing CuciXpress!
        </p>
      </div>

      <div className="flex gap-2 print:hidden">
        <Button
          variant="outline"
          className="flex-1"
          onClick={print}
          data-testid="button-receipt-print"
        >
          <Printer className="w-4 h-4 mr-1.5" /> Print
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900 text-right">{value}</dd>
    </div>
  );
}
