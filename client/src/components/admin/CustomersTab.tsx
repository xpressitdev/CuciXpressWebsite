import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  Search, Phone, Car as CarIcon, Receipt, ChevronLeft, ChevronRight,
  Pencil, Save, X, MapPin, Globe, Clock, AlertTriangle, CheckCircle2,
  Download, Crown, AlertCircle, Building2, Sparkles,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const formatBND = (cents: number) =>
  `B$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    timeZone: "Asia/Brunei",
  });
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Brunei",
  });
};

interface CustomerRow {
  id: number;
  phone: string;
  name: string;
  notes: string | null;
  created_at: string;
  vehicle_count: number;
  visits: number;
  total_spent_cents: number;
  last_visit_at: string | null;
}

interface CustomerListResp {
  rows: CustomerRow[];
  page: number;
  per_page: number;
  total_count: number;
  branches: Array<{ id: number; name: string }>;
  filter: { search: string; branch_id: number | null; segment: string | null };
}

const SEGMENT_OPTIONS = [
  { value: "all",          label: "All customers",     icon: null,         hint: "" },
  { value: "vip",          label: "VIPs",              icon: Crown,        hint: "Lifetime spend ≥ B$500" },
  { value: "at_risk",      label: "At-risk",           icon: AlertCircle,  hint: "2+ visits, none in 30 days" },
  { value: "online",       label: "Online customers",  icon: Globe,        hint: "Has paid via web checkout" },
  { value: "multi_branch", label: "Multi-branch",      icon: Building2,    hint: "Visited 2+ branches" },
  { value: "new",          label: "New (14 days)",     icon: Sparkles,     hint: "Joined in last 14 days" },
] as const;

interface CustomerDetailResp {
  customer: { id: number; phone: string; name: string; notes: string | null; user_id: number | null; created_at: string };
  vehicles: Array<{
    id: number; license_plate: string; brand: string | null; model: string | null;
    color: string | null; type: string | null; last_seen_at: string | null;
    visit_count: number; spent_cents: number;
  }>;
  orders: Array<{
    id: string; ticket_code: string | null; plate: string; created_at: string;
    payment_method: string; package_name: string; total_cents: number;
    status: string; refunded_at: string | null;
    qr_provider: string | null;
    branch_name: string | null; staff_name: string | null;
  }>;
  stats: {
    visits: number; refund_count: number; spent_cents: number;
    first_visit_at: string | null; last_visit_at: string | null; branch_count: number;
  };
}

export default function CustomersTab() {
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("all");
  const [segment, setSegment] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const qs = new URLSearchParams();
  if (search.trim().length >= 2) qs.set("search", search.trim());
  if (branch !== "all") qs.set("branch_id", branch);
  if (segment !== "all") qs.set("segment", segment);
  qs.set("page", String(page));
  qs.set("per_page", "25");

  const { data, isLoading, error } = useQuery<CustomerListResp>({
    queryKey: ["/api/admin/customers", search, branch, segment, page],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("list_failed");
      return res.json();
    },
  });

  const exportQs = new URLSearchParams();
  if (search.trim().length >= 2) exportQs.set("search", search.trim());
  if (branch !== "all") exportQs.set("branch_id", branch);
  if (segment !== "all") exportQs.set("segment", segment);
  const exportHref = `/api/admin/customers/export.csv${exportQs.toString() ? `?${exportQs}` : ""}`;
  const segmentMeta = SEGMENT_OPTIONS.find((s) => s.value === segment);

  const rows = data?.rows ?? [];
  const total = data?.total_count ?? 0;
  const perPage = data?.per_page ?? 25;
  const lastPage = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-6">
      <PendingPaymentsPanel />
      <div className="grid lg:grid-cols-3 gap-6">
      {/* Left: list */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="cuci-card border-2 border-black">
          <CardHeader>
            <div className="cuci-eyebrow">Relationship management</div>
            <CardTitle className="text-2xl font-extrabold tracking-tight">
              <span className="text-cuci-primary">Customers</span>
            </CardTitle>
            <p className="text-sm text-gray-600">
              Search by name, phone, or plate. Click a row to see full profile, visit history, and lifetime spend.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Search</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Name, phone, or plate (≥ 2 chars)"
                    className="pl-9"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    data-testid="input-customer-search"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Visited branch</label>
                <Select value={branch} onValueChange={(v) => { setBranch(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-customer-branch"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any branch</SelectItem>
                    {(data?.branches ?? []).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 mb-1 block">Segment</label>
                <Select value={segment} onValueChange={(v) => { setSegment(v); setPage(1); }}>
                  <SelectTrigger data-testid="select-customer-segment"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEGMENT_OPTIONS.map((s) => {
                      const Icon = s.icon;
                      return (
                        <SelectItem key={s.value} value={s.value}>
                          <span className="flex items-center gap-2">
                            {Icon && <Icon className="w-3.5 h-3.5" />}
                            {s.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs text-gray-600">
                {segmentMeta && segmentMeta.value !== "all" && (
                  <span className="italic">{segmentMeta.hint} · </span>
                )}
                <span className="font-semibold tabular-nums">{data?.total_count ?? 0}</span> match{(data?.total_count ?? 0) === 1 ? "" : "es"}
              </div>
              <a href={exportHref} download data-testid="link-export-csv">
                <Button size="sm" variant="outline" className="border-2 border-black gap-1.5">
                  <Download className="w-4 h-4" /> Export CSV
                </Button>
              </a>
            </div>

            {error && <p className="text-sm text-red-600">Failed to load customers.</p>}

            {isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-6 text-center">
                No customers match these filters.
              </p>
            ) : (
              <div className="border-2 border-black rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="text-center">Vehicles</TableHead>
                      <TableHead className="text-center">Visits</TableHead>
                      <TableHead className="text-right">Lifetime spend</TableHead>
                      <TableHead>Last visit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((c) => (
                      <TableRow
                        key={c.id}
                        className={`cursor-pointer ${selectedId === c.id ? "bg-cuci-primary/5" : ""}`}
                        onClick={() => setSelectedId(c.id)}
                        data-testid={`row-customer-${c.id}`}
                      >
                        <TableCell className="font-semibold">{c.name}</TableCell>
                        <TableCell className="text-xs text-gray-600">{c.phone}</TableCell>
                        <TableCell className="text-center tabular-nums">{c.vehicle_count}</TableCell>
                        <TableCell className="text-center tabular-nums">{c.visits}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {formatBND(c.total_spent_cents)}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {c.last_visit_at ? formatDateTime(c.last_visit_at) : <span className="italic text-gray-400">never</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {total > perPage && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-gray-600">
                  Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline" className="border-2 border-black"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="w-4 h-4" /> Prev
                  </Button>
                  <Button
                    size="sm" variant="outline" className="border-2 border-black"
                    disabled={page >= lastPage}
                    onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right: detail */}
      <div className="lg:col-span-1">
        <Card className="cuci-card border-2 border-black sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
          <CardHeader>
            <CardTitle className="text-lg">Customer profile</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedId === null ? (
              <p className="text-gray-500 italic py-4 text-center">Click a customer to view their full profile.</p>
            ) : (
              <CustomerDetail id={selectedId} key={selectedId} />
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
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

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function PendingPaymentsPanel() {
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

  if (isLoading) {
    return (
      <Card className="cuci-card border-2 border-black">
        <CardContent className="py-3 text-sm text-gray-500">Loading pending payments…</CardContent>
      </Card>
    );
  }

  if (count === 0) {
    return (
      <Card className="cuci-card border-2 border-green-600 bg-green-50">
        <CardContent className="py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-semibold">All clear.</span>
          <span>No web checkouts awaiting Pocket Pay confirmation.</span>
        </CardContent>
      </Card>
    );
  }

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
          A confirmation can still arrive — only void if the customer told you they cancelled,
          or the order is over 24 hours old.
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

function CustomerDetail({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<CustomerDetailResp>({
    queryKey: ["/api/admin/customers", id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("detail_failed");
      return res.json();
    },
  });

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const update = useMutation({
    mutationFn: async (body: { name?: string; notes?: string | null }) => {
      return apiRequest("PATCH", `/api/admin/customers/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      toast({ title: "Saved", description: "Customer updated." });
      setEditing(false);
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error || !data) return <p className="text-sm text-red-600">Failed to load profile.</p>;

  const { customer, vehicles, orders, stats } = data;

  const startEdit = () => {
    setEditName(customer.name);
    setEditNotes(customer.notes ?? "");
    setEditing(true);
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Header */}
      <div className="space-y-2">
        {editing ? (
          <>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" data-testid="input-edit-name" />
            <textarea
              className="w-full border-2 border-black rounded-md p-2 text-sm"
              rows={3}
              placeholder="Notes (visible to staff only)"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              data-testid="input-edit-notes"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="cuci-cta border-2 border-black"
                disabled={update.isPending || editName.trim().length === 0}
                onClick={() => update.mutate({ name: editName.trim(), notes: editNotes.trim() || null })}
                data-testid="button-save-customer"
              >
                <Save className="w-4 h-4 mr-1" /> Save
              </Button>
              <Button size="sm" variant="outline" className="border-2 border-black" onClick={() => setEditing(false)}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xl font-extrabold tracking-tight">{customer.name}</div>
                <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {customer.phone}
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-2 border-black h-8" onClick={startEdit} data-testid="button-edit-customer">
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
            </div>
            {customer.user_id && (
              <Badge className="bg-green-600 text-white text-[10px]">Has account</Badge>
            )}
            {customer.notes && (
              <div className="bg-yellow-50 border border-yellow-300 rounded p-2 text-xs whitespace-pre-wrap">
                {customer.notes}
              </div>
            )}
          </>
        )}
      </div>

      <Separator />

      {/* Lifetime stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="cuci-kpi p-2">
          <div className="cuci-eyebrow text-[10px]">Lifetime spend</div>
          <div className="text-lg font-extrabold tabular-nums">{formatBND(stats.spent_cents)}</div>
        </div>
        <div className="cuci-kpi p-2">
          <div className="cuci-eyebrow text-[10px]">Visits</div>
          <div className="text-lg font-extrabold tabular-nums">{stats.visits}</div>
        </div>
        <div className="cuci-kpi p-2">
          <div className="cuci-eyebrow text-[10px]">First visit</div>
          <div className="text-xs font-semibold">{formatDate(stats.first_visit_at)}</div>
        </div>
        <div className="cuci-kpi p-2">
          <div className="cuci-eyebrow text-[10px]">Branches used</div>
          <div className="text-lg font-extrabold tabular-nums">{stats.branch_count}</div>
        </div>
      </div>

      <Separator />

      {/* Vehicles */}
      <div>
        <div className="cuci-eyebrow mb-2">Vehicles ({vehicles.length})</div>
        {vehicles.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No vehicles on file yet.</p>
        ) : (
          <div className="space-y-2">
            {vehicles.map((v) => (
              <div key={v.id} className="border-2 border-black rounded p-2 text-xs" data-testid={`vehicle-${v.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold tracking-wide flex items-center gap-1">
                      <CarIcon className="w-3 h-3" /> {v.license_plate}
                    </div>
                    <div className="text-gray-600">
                      {[v.color, v.brand, v.model].filter(Boolean).join(" ") || <span className="italic">no details</span>}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-semibold">{formatBND(v.spent_cents)}</div>
                    <div className="text-gray-500">{v.visit_count} visit{v.visit_count !== 1 ? "s" : ""}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Recent orders */}
      <div>
        <div className="cuci-eyebrow mb-2">Recent visits ({orders.length})</div>
        {orders.length === 0 ? (
          <p className="text-xs text-gray-500 italic">No visits yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
            {orders.map((o) => {
              const isRefunded = o.status === "refunded";
              const isPending  = o.status === "pending_payment";
              const isVoided   = o.status === "voided";
              const isOnline   = o.qr_provider === "pocket_pay";
              const wrapperCls =
                isRefunded ? "bg-red-50 border-red-200"
                : isPending ? "bg-amber-50 border-amber-300"
                : isVoided  ? "bg-gray-100 border-gray-300"
                : "border-gray-200";
              const amountCls =
                isRefunded ? "line-through text-red-700"
                : isVoided  ? "line-through text-gray-500"
                : "";
              return (
                <div
                  key={o.id}
                  className={`border rounded p-2 text-xs ${wrapperCls}`}
                  data-testid={`order-${o.id}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-1.5">
                        {o.package_name}
                        {isOnline && (
                          <Badge className="bg-blue-600 text-white text-[9px] px-1 py-0 h-4 gap-0.5" title="Paid online via web checkout">
                            <Globe className="w-2.5 h-2.5" /> Online
                          </Badge>
                        )}
                      </div>
                      <div className="text-gray-600 flex items-center gap-1 mt-0.5">
                        <Receipt className="w-3 h-3" />
                        {o.ticket_code
                          ? <span>{o.ticket_code} · {o.plate}</span>
                          : <span className="italic text-amber-700 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> awaiting scan · {o.plate}
                            </span>}
                      </div>
                      <div className="text-gray-500 mt-0.5">
                        {formatDateTime(o.created_at)} · {o.branch_name ?? "—"}
                      </div>
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div className={`font-bold ${amountCls}`}>
                        {formatBND(o.total_cents)}
                      </div>
                      {isRefunded && (
                        <Badge variant="destructive" className="text-[9px] mt-0.5">Refunded</Badge>
                      )}
                      {isPending && (
                        <Badge className="bg-amber-500 text-white text-[9px] mt-0.5">Pending payment</Badge>
                      )}
                      {isVoided && (
                        <Badge className="bg-gray-500 text-white text-[9px] mt-0.5">Voided</Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
