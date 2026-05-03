import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank Transfer",
  card: "Card",
  qr_code: "QR Code",
  baiduri_pay: "Baiduri Pay",
  quick_pay: "Quick Pay",
  subscription: "Subscription",
  voucher: "Voucher",
};

const formatBND = (cents: number) =>
  `B$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Brunei",
  });
};

interface ShiftDetailResp {
  shift: {
    id: number;
    branch_name: string;
    opened_by_name: string;
    closed_by_name: string | null;
    opening_float_cents: number;
    opening_note: string | null;
    closing_counted_cents: number | null;
    closing_expected_cents: number | null;
    closing_variance_cents: number | null;
    closing_note: string | null;
    status: "open" | "closed";
    opened_at: string;
    closed_at: string | null;
  };
  totals: {
    breakdown: Array<{
      payment_method: string;
      sales_cents: number;
      sales_count: number;
      refund_cents: number;
      refund_count: number;
    }>;
    sales_cents: number;
    sales_count: number;
    refund_cents: number;
    refund_count: number;
    net_sales_cents: number;
    cash_sales_cents: number;
    cash_refund_cents: number;
    expected_cash_cents: number;
  };
}

export default function AdminShiftPrint() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, error } = useQuery<ShiftDetailResp>({
    queryKey: ["/api/admin/shifts", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/shifts/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("detail_failed");
      return res.json();
    },
  });

  // Auto-open the print dialog once data is loaded.
  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (isLoading) {
    return <div className="p-10 font-sans text-sm">Loading shift report…</div>;
  }
  if (error || !data) {
    return (
      <div className="p-10 font-sans text-sm text-red-700">
        Failed to load shift. You may not have access, or the shift does not exist.
      </div>
    );
  }

  const { shift, totals } = data;
  const variance = shift.closing_variance_cents;

  return (
    <div className="bg-white text-black font-sans">
      <style>{`
        @media print {
          @page { margin: 12mm; size: A4; }
          .no-print { display: none !important; }
        }
        .receipt { max-width: 720px; margin: 0 auto; padding: 24px; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .row.total { border-top: 1.5px solid #000; padding-top: 6px; margin-top: 6px; font-weight: 700; }
        .row.grand { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 6px 0; margin-top: 6px; font-weight: 800; font-size: 15px; }
        h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
        h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin: 18px 0 6px; }
        .meta { font-size: 12px; color: #444; }
        .box { border: 1.5px solid #000; padding: 10px 12px; border-radius: 4px; }
        .signature { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
        .sig-line { border-top: 1px solid #000; margin-top: 48px; padding-top: 4px; font-size: 11px; text-align: center; color: #444; }
        .variance-ok { color: #166534; }
        .variance-bad { color: #991b1b; }
      `}</style>

      <div className="receipt">
        <div className="no-print" style={{ marginBottom: 16, display: "flex", gap: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ padding: "8px 14px", border: "2px solid #000", borderRadius: 6, fontWeight: 700, background: "#fff", cursor: "pointer" }}
            data-testid="button-print"
          >
            Print
          </button>
          <button
            onClick={() => window.close()}
            style={{ padding: "8px 14px", border: "2px solid #000", borderRadius: 6, fontWeight: 700, background: "#fff", cursor: "pointer" }}
          >
            Close
          </button>
        </div>

        <header style={{ borderBottom: "2px solid #000", paddingBottom: 10, marginBottom: 14 }}>
          <h1>Cuci Xpress — End of Day</h1>
          <p className="meta">{shift.branch_name} · Shift #{shift.id}</p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
          <div>
            <div className="row"><span>Cashier</span><strong>{shift.opened_by_name}</strong></div>
            <div className="row"><span>Opened</span><span>{formatDateTime(shift.opened_at)}</span></div>
            <div className="row"><span>Closed</span><span>{formatDateTime(shift.closed_at)}</span></div>
            {shift.closed_by_name && (
              <div className="row"><span>Closed by</span><span>{shift.closed_by_name}</span></div>
            )}
          </div>
          <div>
            <div className="row"><span>Status</span><strong style={{ textTransform: "uppercase" }}>{shift.status}</strong></div>
            <div className="row"><span>Transactions</span><span>{totals.sales_count}</span></div>
            <div className="row"><span>Refunds</span><span>{totals.refund_count}</span></div>
          </div>
        </div>

        <h2>Sales by payment method</h2>
        <div className="box" style={{ fontSize: 13 }}>
          {totals.breakdown.length === 0 ? (
            <p style={{ fontStyle: "italic", color: "#666", margin: 0 }}>No orders.</p>
          ) : (
            <>
              {totals.breakdown.map((r) => (
                <div key={r.payment_method} className="row">
                  <span>
                    {PAYMENT_LABEL[r.payment_method] ?? r.payment_method}
                    <span style={{ color: "#666", marginLeft: 6 }}>
                      ({r.sales_count} sale{r.sales_count !== 1 ? "s" : ""}
                      {r.refund_count > 0 ? `, ${r.refund_count} refund${r.refund_count !== 1 ? "s" : ""}` : ""})
                    </span>
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatBND(r.sales_cents - r.refund_cents)}
                  </span>
                </div>
              ))}
              <div className="row total">
                <span>Net sales</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatBND(totals.net_sales_cents)}</span>
              </div>
            </>
          )}
        </div>

        <h2>Cash drawer</h2>
        <div className="box" style={{ fontSize: 13 }}>
          <div className="row"><span>Opening float</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{formatBND(shift.opening_float_cents)}</span></div>
          <div className="row"><span>+ Cash sales</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{formatBND(totals.cash_sales_cents)}</span></div>
          <div className="row"><span>− Cash refunds</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{formatBND(totals.cash_refund_cents)}</span></div>
          <div className="row total">
            <span>Expected cash</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatBND(totals.expected_cash_cents)}</span>
          </div>
          {shift.closing_counted_cents !== null && (
            <>
              <div className="row"><span>Counted cash</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{formatBND(shift.closing_counted_cents)}</span></div>
              <div className={`row grand ${variance === 0 ? "variance-ok" : "variance-bad"}`}>
                <span>Variance (over / short)</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {variance === 0
                    ? "B$0.00"
                    : variance! > 0
                      ? `+${formatBND(variance!)}`
                      : `−${formatBND(-variance!)}`}
                </span>
              </div>
            </>
          )}
        </div>

        {(shift.opening_note || shift.closing_note) && (
          <>
            <h2>Notes</h2>
            <div className="box" style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>
              {shift.opening_note && (
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ display: "block", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.06 }}>Opening</strong>
                  {shift.opening_note}
                </div>
              )}
              {shift.closing_note && (
                <div>
                  <strong style={{ display: "block", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.06 }}>Closing</strong>
                  {shift.closing_note}
                </div>
              )}
            </div>
          </>
        )}

        <div className="signature">
          <div>
            <div className="sig-line">Cashier signature</div>
          </div>
          <div>
            <div className="sig-line">Manager signature</div>
          </div>
        </div>

        <footer style={{ marginTop: 24, fontSize: 10, color: "#777", textAlign: "center" }}>
          Generated {new Date().toLocaleString("en-GB", { timeZone: "Asia/Brunei" })} (Asia/Brunei) · Cuci Xpress
        </footer>
      </div>
    </div>
  );
}
