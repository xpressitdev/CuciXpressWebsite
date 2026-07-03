import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertTriangle, Phone } from "lucide-react";

const formatBND = (cents: number) =>
  `B$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Brunei",
  });
};

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

interface PendingOrder {
  id: string;
  plate: string;
  created_at: string;
  total_cents: number;
  package_name: string;
  payment_ref: string | null;
  qr_provider: string | null;
  age_seconds: number;
  branch_name: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
}

export function PendingPaymentsPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ rows: PendingOrder[]; count: number }>({
    queryKey: ["/api/admin/orders/pending-payments"],
    queryFn: async () => {
      const res = await fetch("/api/admin/orders/pending-payments", { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const voidOrder = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/orders/${id}/void-pending`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders/pending-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      toast({ title: "Voided", description: "Pending payment marked as voided." });
      setConfirmingId(null);
    },
    onError: () => toast({ title: "Failed to void", variant: "destructive" }),
  });

  const rows = data?.rows ?? [];
  const count = data?.count ?? 0;

  // Quiet when there's nothing to act on — this panel now lives on the
  // dashboard as an alert, and the auto-void sweep clears stale rows for us.
  if (isLoading || count === 0) return null;

  return (
    <Card className="cuci-card border-2 border-amber-500 bg-amber-50">
      <CardHeader className="pb-3">
        <div className="cuci-eyebrow text-amber-800">Operations · reconciliation</div>
        <CardTitle className="text-xl font-extrabold tracking-tight flex items-center gap-2 text-amber-900">
          <AlertTriangle className="w-5 h-5" />
          {count} pending web payment{count !== 1 ? "s" : ""}
        </CardTitle>
        <p className="text-xs text-amber-800">
          These customers started a Pocket Pay checkout but their payment hasn't confirmed yet.
          Orders auto-void after 72 hours, so you only need to void one manually if the customer
          told you they cancelled.
        </p>
      </CardHeader>
      <CardContent>
        <div className="border-2 border-black rounded-md overflow-x-auto bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Plate</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => {
                const isStale = o.age_seconds > 86400;
                return (
                  <TableRow key={o.id} data-testid={`pending-order-${o.id}`}>
                    <TableCell className="text-xs">
                      <div className={`font-semibold ${isStale ? "text-red-700" : "text-amber-800"}`}>
                        {formatAge(o.age_seconds)} ago
                      </div>
                      <div className="text-gray-500">{formatDateTime(o.created_at)}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.customer_name ? (
                        <>
                          <div className="font-semibold">{o.customer_name}</div>
                          <div className="text-gray-500 flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {o.customer_phone}
                          </div>
                        </>
                      ) : (
                        <span className="italic text-gray-400">unknown</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono font-bold">{o.plate}</TableCell>
                    <TableCell className="text-xs">{o.package_name}</TableCell>
                    <TableCell className="text-xs">{o.branch_name ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-xs">
                      {formatBND(o.total_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {confirmingId === o.id ? (
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-[11px]"
                            disabled={voidOrder.isPending}
                            onClick={() => voidOrder.mutate(o.id)}
                            data-testid={`button-confirm-void-${o.id}`}
                          >
                            Confirm void
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] border-2 border-black"
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] border-2 border-black"
                          onClick={() => setConfirmingId(o.id)}
                          data-testid={`button-void-${o.id}`}
                        >
                          Void
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
