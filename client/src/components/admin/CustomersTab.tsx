import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Search, Phone, Car as CarIcon, Receipt, ChevronLeft, ChevronRight,
  Pencil, Save, X, MapPin, Globe, Clock, AlertTriangle, CheckCircle2, Mail,
  Download, Crown, AlertCircle, Building2, Sparkles, Users, History,
  TrendingUp, Award, Medal, UserPlus, Trash2, ArrowUp, ArrowDown, ArrowUpDown,
  Loader2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SendReceiptButton } from "@/components/admin/SendReceiptButton";

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

type VipTier = "gold" | "silver" | "bronze";

interface CustomerRow {
  id: number;
  kind: "customer" | "ghost";
  has_account: boolean;
  phone: string | null;
  name: string;
  notes: string | null;
  created_at: string;
  vehicle_count: number;
  visits: number;
  total_spent_cents: number;
  last_visit_at: string | null;
  vip_tier: VipTier | null;
  favourite_branch: string | null;
  branches_visited: number;
  has_legacy: boolean;
  is_online: boolean;
  plates: string | null;
}

interface CustomerStats {
  total_customers: number;
  active_customers: number;
  registered_count: number;
  ghost_count: number;
  has_account_count: number;
  gold_count: number;
  silver_count: number;
  bronze_count: number;
  spend_vip_count: number;
  at_risk_count: number;
  new_count: number;
  legacy_count: number;
  online_count: number;
  total_spent_cents: number;
  avg_spend_cents: number;
}

const VIP_STYLES: Record<VipTier, { label: string; bg: string; text: string; border: string; icon: typeof Crown }> = {
  gold:   { label: "Gold",   bg: "bg-amber-100",   text: "text-amber-900",  border: "border-amber-500",  icon: Crown },
  silver: { label: "Silver", bg: "bg-slate-100",   text: "text-slate-800",  border: "border-slate-400",  icon: Award },
  bronze: { label: "Bronze", bg: "bg-orange-100",  text: "text-orange-900", border: "border-orange-500", icon: Medal },
};

function VipBadge({ tier, rank }: { tier: VipTier; rank?: number | null }) {
  const s = VIP_STYLES[tier];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-2 ${s.border} ${s.bg} ${s.text} px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide`}
      title={rank ? `Rank #${rank} customer` : `${s.label} VIP`}
      data-testid={`badge-vip-${tier}`}
    >
      <Icon className="w-3 h-3" />
      {s.label}{rank ? ` · #${rank}` : ""}
    </span>
  );
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
  { value: "vip",          label: "VIPs (spend)",      icon: Crown,        hint: "Lifetime spend ≥ B$500" },
  { value: "gold",         label: "Gold tier",         icon: Crown,        hint: "Top-ranked loyal customers" },
  { value: "silver",       label: "Silver tier",       icon: Award,        hint: "Strong repeat customers" },
  { value: "bronze",       label: "Bronze tier",       icon: Medal,        hint: "Regular returning customers" },
  { value: "at_risk",      label: "At-risk",           icon: AlertCircle,  hint: "2+ visits, none in 30 days" },
  { value: "online",       label: "Online customers",  icon: Globe,        hint: "Has paid via web checkout" },
  { value: "multi_branch", label: "Multi-branch",      icon: Building2,    hint: "Visited 2+ branches" },
  { value: "new",          label: "New (14 days)",     icon: Sparkles,     hint: "Joined in last 14 days" },
  { value: "legacy",       label: "Legacy customers",  icon: History,      hint: "Has imported historical visits" },
  { value: "no_account",   label: "Not signed up",     icon: Users,        hint: "Walk-in / legacy plate, no account yet" },
] as const;

interface CustomerDetailResp {
  customer: {
    id: number; phone: string | null; name: string; notes: string | null;
    user_id: number | null; created_at: string; email: string | null;
    kind?: "customer" | "ghost"; has_account?: boolean;
  };
  vehicles: Array<{
    id: number; license_plate: string; brand: string | null; model: string | null;
    color: string | null; type: string | null; last_seen_at: string | null;
    visit_count: number; spent_cents: number;
    vip_tier: VipTier | null; vip_rank: number | null; cached_total_visits: number;
  }>;
  orders: Array<{
    id: string; ticket_code: string | null; plate: string; created_at: string;
    payment_method: string; package_name: string; total_cents: number;
    status: string; refunded_at: string | null;
    qr_provider: string | null;
    branch_name: string | null; staff_name: string | null;
  }>;
  branch_split: Array<{
    branch_id: number; branch_name: string; visits: number; spent_cents: number;
  }>;
  stats: {
    visits: number; refund_count: number; spent_cents: number;
    first_visit_at: string | null; last_visit_at: string | null; branch_count: number;
    legacy_visits: number; native_visits: number;
    favourite_branch_id: number | null; favourite_branch_name: string | null;
    vip_tier: VipTier | null;
  };
}

export default function CustomersTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  // Debounced copy of `search` — this is what actually drives the query so we
  // don't fire a network request on every keystroke. Typing feels instant
  // (the input is controlled by `search`), but the list only refetches ~300ms
  // after the user stops typing.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [branch, setBranch] = useState("all");
  const [segment, setSegment] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string>("last_visit_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (col: string) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      // Text columns read best ascending; numbers/dates read best descending.
      setSortDir(col === "name" || col === "favourite_branch" ? "asc" : "desc");
    }
    setPage(1);
  };

  // POS Control Room: walk-in customer create.
  const [newOpen, setNewOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const createCustomer = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/admin/customers", {
        phone: newPhone.trim(),
        name: newName.trim(),
        notes: newNotes.trim() || null,
      }),
    onSuccess: async (res) => {
      const created = (await res.json()) as { customer?: { id: number } };
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers/stats"] });
      toast({ title: "Customer added", description: newName.trim() });
      setNewOpen(false);
      setNewPhone("");
      setNewName("");
      setNewNotes("");
      if (created?.customer?.id) setSelectedId(created.customer.id);
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? err);
      toast({
        title: "Could not add customer",
        description: msg.includes("phone_taken")
          ? "A customer with this phone number already exists."
          : msg.includes("invalid")
            ? "Please enter a valid name and phone number."
            : msg,
        variant: "destructive",
      });
    },
  });

  const qs = new URLSearchParams();
  if (debouncedSearch.trim().length >= 2) qs.set("search", debouncedSearch.trim());
  if (branch !== "all") qs.set("branch_id", branch);
  if (segment !== "all") qs.set("segment", segment);
  qs.set("page", String(page));
  qs.set("per_page", "25");
  qs.set("sort", sortKey);
  qs.set("dir", sortDir);

  const { data, isLoading, isFetching, error } = useQuery<CustomerListResp>({
    queryKey: ["/api/admin/customers", debouncedSearch, branch, segment, page, sortKey, sortDir],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers?${qs.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("list_failed");
      return res.json();
    },
    // Keep the previous page/filter's rows on screen while the next result
    // loads, so paging and filtering don't flash an empty "Loading…" state.
    placeholderData: keepPreviousData,
  });

  // Aggregate header stats (independent of filters — show overall CRM health).
  const { data: stats } = useQuery<CustomerStats>({
    queryKey: ["/api/admin/customers/stats"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers/stats`, { credentials: "include" });
      if (!res.ok) throw new Error("stats_failed");
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  const exportQs = new URLSearchParams();
  if (debouncedSearch.trim().length >= 2) exportQs.set("search", debouncedSearch.trim());
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
      {stats && <CustomerStatsHeader stats={stats} onSegment={(s) => { setSegment(s); setPage(1); }} /> }
      <div className="grid lg:grid-cols-3 gap-6">
      {/* Left: list */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="cuci-card border-2 border-black">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="cuci-eyebrow">Relationship management</div>
                <CardTitle className="text-2xl font-extrabold tracking-tight">
                  <span className="text-cuci-primary">Customers</span>
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Search by name, phone, or plate. Click a row to see full profile, visit history, and lifetime spend.
                </p>
              </div>
              <Button
                className="cuci-cta border-2 border-black shrink-0 gap-1.5"
                onClick={() => setNewOpen(true)}
                data-testid="button-new-customer"
              >
                <UserPlus className="w-4 h-4" /> New customer
              </Button>
            </div>
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
                    onChange={(e) => setSearch(e.target.value)}
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
              <div className="text-xs text-gray-600 flex items-center gap-2">
                <span>
                  {segmentMeta && segmentMeta.value !== "all" && (
                    <span className="italic">{segmentMeta.hint} · </span>
                  )}
                  <span className="font-semibold tabular-nums">{data?.total_count ?? 0}</span> match{(data?.total_count ?? 0) === 1 ? "" : "es"}
                </span>
                {isFetching && !isLoading && (
                  <span className="inline-flex items-center gap-1 text-cuci-primary" data-testid="text-customers-updating">
                    <Loader2 className="w-3 h-3 animate-spin" /> Updating…
                  </span>
                )}
              </div>
              <a href={exportHref} download data-testid="link-export-csv">
                <Button size="sm" variant="outline" className="border-2 border-black gap-1.5">
                  <Download className="w-4 h-4" /> Export CSV
                </Button>
              </a>
            </div>

            {error && <p className="text-sm text-red-600">Failed to load customers.</p>}

            {isLoading ? (
              <div className="border-2 border-black rounded-md overflow-hidden" data-testid="customers-skeleton">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 last:border-b-0"
                  >
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-1/3 rounded bg-gray-100 animate-pulse" />
                      <div className="h-2.5 w-1/4 rounded bg-gray-100 animate-pulse" />
                    </div>
                    <div className="h-4 w-14 rounded-full bg-gray-100 animate-pulse" />
                    <div className="h-3 w-10 rounded bg-gray-100 animate-pulse" />
                    <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-6 text-center">
                No customers match these filters.
              </p>
            ) : (
              <div className={`border-2 border-black rounded-md overflow-x-auto transition-opacity ${isFetching ? "opacity-60" : ""}`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {([
                        { key: "name",              label: "Customer",        align: "left" },
                        { key: "vip_tier",          label: "Tier",            align: "left" },
                        { key: "has_account",       label: "Account",         align: "left" },
                        { key: "favourite_branch",  label: "Favourite branch", align: "left" },
                        { key: "vehicle_count",     label: "Vehicles",        align: "center" },
                        { key: "visits",            label: "Visits",          align: "center" },
                        { key: "total_spent_cents", label: "Lifetime spend",  align: "right" },
                        { key: "last_visit_at",     label: "Last visit",      align: "left" },
                      ] as const).map((h) => {
                        const active = sortKey === h.key;
                        const justify = h.align === "center" ? "justify-center" : h.align === "right" ? "justify-end" : "justify-start";
                        return (
                          <TableHead
                            key={h.key}
                            className={h.align === "center" ? "text-center" : h.align === "right" ? "text-right" : ""}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(h.key)}
                              className={`inline-flex items-center gap-1 w-full ${justify} font-semibold hover:text-cuci-primary transition-colors ${active ? "text-cuci-primary" : ""}`}
                              data-testid={`sort-${h.key}`}
                              title={`Sort by ${h.label}`}
                            >
                              {h.label}
                              {active ? (
                                sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 opacity-30" />
                              )}
                            </button>
                          </TableHead>
                        );
                      })}
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
                        <TableCell>
                          <div className="font-semibold leading-tight flex items-center gap-1.5 flex-wrap">
                            {c.kind === "ghost" ? (
                              <span className="font-mono">{c.name}</span>
                            ) : (
                              c.name
                            )}
                            {c.kind === "ghost" && (
                              <span
                                title="Legacy plate — no customer record yet"
                                className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-gray-700 bg-gray-100 border border-gray-300 rounded px-1 py-0.5"
                              >
                                Walk-in
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                            {c.phone ? (
                              <><Phone className="w-3 h-3" /> {c.phone}</>
                            ) : (
                              <span className="italic">no phone on file</span>
                            )}
                            {c.has_legacy && (
                              <span title="Has imported historical visits" className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-purple-700 font-semibold">
                                <History className="w-3 h-3" /> legacy
                              </span>
                            )}
                          </div>
                          {c.kind === "customer" && c.plates && (
                            <div className="text-[11px] text-gray-600 flex items-center gap-1 mt-0.5" title="Vehicle plate(s)">
                              <CarIcon className="w-3 h-3 text-gray-400" />
                              <span className="font-mono font-semibold">{c.plates}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.vip_tier ? <VipBadge tier={c.vip_tier} /> : <span className="text-[11px] text-gray-400">—</span>}
                        </TableCell>
                        <TableCell>
                          {c.has_account ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-green-800 bg-green-100 border-2 border-green-500 rounded-full px-2 py-0.5">
                              <CheckCircle2 className="w-3 h-3" /> Signed in
                            </span>
                          ) : c.kind === "customer" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-800 bg-amber-50 border-2 border-amber-400 rounded-full px-2 py-0.5">
                              Walk-in
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-gray-700 bg-gray-100 border-2 border-gray-400 rounded-full px-2 py-0.5">
                              No account
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {c.favourite_branch ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              {c.favourite_branch}
                              {c.branches_visited > 1 && (
                                <span className="text-[10px] text-gray-500">+{c.branches_visited - 1}</span>
                              )}
                            </span>
                          ) : (
                            <span className="italic text-gray-400">—</span>
                          )}
                        </TableCell>
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
              <CustomerDetail id={selectedId} key={selectedId} onDeleted={() => setSelectedId(null)} />
            )}
          </CardContent>
        </Card>
      </div>
      </div>

      {/* New customer dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="border-2 border-black">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-cuci-primary" /> New customer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Name</label>
              <Input
                placeholder="Customer name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="input-new-customer-name"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Phone</label>
              <Input
                placeholder="e.g. 7123456"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                data-testid="input-new-customer-phone"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1 block">Notes (optional)</label>
              <textarea
                className="w-full border-2 border-black rounded-md p-2 text-sm"
                rows={2}
                placeholder="Notes visible to staff only"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                data-testid="input-new-customer-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-2 border-black" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              className="cuci-cta border-2 border-black"
              disabled={createCustomer.isPending || newName.trim().length === 0 || newPhone.trim().length === 0}
              onClick={() => createCustomer.mutate()}
              data-testid="button-save-new-customer"
            >
              <UserPlus className="w-4 h-4 mr-1" /> {createCustomer.isPending ? "Adding…" : "Add customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
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

interface LiabilityResp {
  outstanding_qrs: {
    rows: Array<{
      id: string; plate: string; created_at: string; total_cents: number;
      package_name: string; age_seconds: number; branch_name: string | null;
      customer_id: number | null; customer_name: string | null; customer_phone: string | null;
    }>;
    count: number; total_cents: number;
  };
  active_packs: {
    rows: Array<{
      id: string; customer_name: string | null; customer_phone: string | null;
      plate: string | null; total_washes: number; remaining_washes: number;
      price_cents: number; per_wash_cents: number; deferred_cents: number;
      created_at: string; expires_at: string | null; sold_at_branch_name: string | null;
    }>;
    count: number; deferred_cents: number;
  };
  active_unlimited: {
    rows: Array<{
      id: string; customer_name: string | null; customer_phone: string | null;
      plate: string | null; price_cents: number; deferred_cents: number;
      earned_cents: number; days_left: number; created_at: string;
      expires_at: string; sold_at_branch_name: string | null;
    }>;
    count: number; deferred_cents: number;
  };
  grand_liability_cents: number;
}

export function LiabilitiesPanel() {
  const { data, isLoading } = useQuery<LiabilityResp>({
    queryKey: ["/api/admin/liabilities"],
    queryFn: async () => {
      const res = await fetch("/api/admin/liabilities", { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="cuci-card border-2 border-black">
        <CardContent className="py-3 text-sm text-gray-500">Loading liabilities…</CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const { outstanding_qrs, active_packs, active_unlimited, grand_liability_cents } = data;
  const isClear =
    outstanding_qrs.count === 0 && active_packs.count === 0 && active_unlimited.count === 0;

  return (
    <Card className="cuci-card border-2 border-black" data-testid="card-liabilities">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="cuci-eyebrow">Accounting · service still owed</div>
            <CardTitle className="text-xl font-extrabold tracking-tight">
              Outstanding service liability
            </CardTitle>
            <p className="text-xs text-gray-600 mt-1 max-w-xl">
              Money you've already collected for washes you haven't delivered yet.
              For monthly P&amp;L, this is what you must <em>defer</em> from revenue —
              it earns out as customers redeem.
            </p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Total liability now
            </div>
            <div className="text-2xl font-extrabold tabular-nums" data-testid="text-grand-liability">
              {formatBND(grand_liability_cents)}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {isClear && (
          <div className="text-sm text-gray-600 bg-green-50 border-2 border-green-600 rounded-md py-3 px-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-700" />
            All clear — no unredeemed prepaid service on the books.
          </div>
        )}

        {/* === Outstanding prepaid QRs === */}
        {outstanding_qrs.count > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Outstanding prepaid QRs
                <Badge variant="outline" className="border-2 border-black">
                  {outstanding_qrs.count}
                </Badge>
              </h3>
              <div className="text-sm font-bold tabular-nums">
                {formatBND(outstanding_qrs.total_cents)}
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              Customer paid online via Pocket Pay, has a valid QR, hasn't shown up yet.
              Liability = full ticket price (1-for-1).
            </p>
            <div className="border-2 border-black rounded-md overflow-x-auto bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paid</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plate</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead className="text-right">Owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outstanding_qrs.rows.map((o) => (
                    <TableRow key={o.id} data-testid={`liability-qr-${o.id}`}>
                      <TableCell className="text-xs">
                        <div className="font-semibold">{formatAge(o.age_seconds)} ago</div>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {/* === Active wash packs === */}
        {active_packs.count > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <CarIcon className="w-4 h-4" />
                Active wash packs
                <Badge variant="outline" className="border-2 border-black">
                  {active_packs.count}
                </Badge>
              </h3>
              <div className="text-sm font-bold tabular-nums">
                {formatBND(active_packs.deferred_cents)}
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              Liability per pack = remaining washes × (price ÷ total washes).
            </p>
            <div className="border-2 border-black rounded-md overflow-x-auto bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sold</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plate</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Per wash</TableHead>
                    <TableHead className="text-right">Deferred</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active_packs.rows.map((m) => (
                    <TableRow key={m.id} data-testid={`liability-pack-${m.id}`}>
                      <TableCell className="text-xs">
                        <div>{formatDate(m.created_at)}</div>
                        <div className="text-gray-500">{m.sold_at_branch_name ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.customer_name ? (
                          <>
                            <div className="font-semibold">{m.customer_name}</div>
                            <div className="text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {m.customer_phone}
                            </div>
                          </>
                        ) : (
                          <span className="italic text-gray-400">unknown</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold">
                        {m.plate ?? <span className="text-gray-400 italic">any car</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {m.remaining_washes} / {m.total_washes}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatBND(m.per_wash_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-xs">
                        {formatBND(m.deferred_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}

        {/* === Active unlimited memberships === */}
        {active_unlimited.count > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Crown className="w-4 h-4" />
                Active unlimited memberships
                <Badge variant="outline" className="border-2 border-black">
                  {active_unlimited.count}
                </Badge>
              </h3>
              <div className="text-sm font-bold tabular-nums">
                {formatBND(active_unlimited.deferred_cents)}
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              Straight-line deferred = price × (days remaining ÷ total days).
              Earned portion already counts toward this period's revenue.
            </p>
            <div className="border-2 border-black rounded-md overflow-x-auto bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sold</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Plate</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Days left</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Earned</TableHead>
                    <TableHead className="text-right">Deferred</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {active_unlimited.rows.map((m) => (
                    <TableRow key={m.id} data-testid={`liability-unlimited-${m.id}`}>
                      <TableCell className="text-xs">
                        <div>{formatDate(m.created_at)}</div>
                        <div className="text-gray-500">{m.sold_at_branch_name ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.customer_name ? (
                          <>
                            <div className="font-semibold">{m.customer_name}</div>
                            <div className="text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {m.customer_phone}
                            </div>
                          </>
                        ) : (
                          <span className="italic text-gray-400">unknown</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold">
                        {m.plate ?? <span className="text-gray-400 italic">any car</span>}
                      </TableCell>
                      <TableCell className="text-xs">{formatDate(m.expires_at)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{m.days_left}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {formatBND(m.price_cents)}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-green-700">
                        {formatBND(m.earned_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold text-xs">
                        {formatBND(m.deferred_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function CustomerDetail({ id, onDeleted }: { id: number; onDeleted?: () => void }) {
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
  const [editEmail, setEditEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const update = useMutation({
    mutationFn: async (body: { name?: string; notes?: string | null; email?: string }) => {
      return apiRequest("PATCH", `/api/admin/customers/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      toast({ title: "Saved", description: "Customer updated." });
      setEditing(false);
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? err);
      toast({
        title: "Failed to save",
        description: msg.includes("email_taken")
          ? "That email is already used by another account."
          : msg.includes("no_account")
          ? "This customer has no account yet, so an email can't be set."
          : undefined,
        variant: "destructive",
      });
    },
  });

  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/admin/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/customers/stats"] });
      toast({ title: "Customer deleted" });
      setConfirmDelete(false);
      onDeleted?.();
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? err);
      toast({
        title: "Could not delete customer",
        description: msg.includes("has_memberships")
          ? "This customer has active wash packs. Refund or expire those first."
          : msg,
        variant: "destructive",
      });
      setConfirmDelete(false);
    },
  });

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error || !data) return <p className="text-sm text-red-600">Failed to load profile.</p>;

  const { customer, vehicles, orders, stats } = data;
  const isGhost = customer.kind === "ghost" || id < 0;

  const startEdit = () => {
    setEditName(customer.name);
    setEditNotes(customer.notes ?? "");
    setEditEmail(customer.email ?? "");
    setEditing(true);
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Header */}
      <div className="space-y-2">
        {editing ? (
          <>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" data-testid="input-edit-name" />
            {customer.user_id != null && (
              <div className="space-y-1">
                <Input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Login email"
                  data-testid="input-edit-email"
                />
                <p className="text-xs text-gray-500">
                  Login email — sign-in codes are sent here. Only change this if the
                  customer confirms it's their address.
                </p>
              </div>
            )}
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
                onClick={() => {
                  const payload: { name: string; notes: string | null; email?: string } = {
                    name: editName.trim(),
                    notes: editNotes.trim() || null,
                  };
                  const nextEmail = editEmail.trim();
                  if (
                    customer.user_id != null &&
                    nextEmail &&
                    nextEmail.toLowerCase() !== (customer.email ?? "").toLowerCase()
                  ) {
                    payload.email = nextEmail;
                  }
                  update.mutate(payload);
                }}
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
              <div className="min-w-0">
                <div className={`text-xl font-extrabold tracking-tight truncate ${isGhost ? "font-mono" : ""}`}>
                  {customer.name}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  {customer.phone ? (
                    <><Phone className="w-3 h-3" /> {customer.phone}</>
                  ) : (
                    <span className="italic">No phone on file — legacy plate only</span>
                  )}
                </div>
                {customer.user_id != null && (
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                    <Mail className="w-3 h-3 shrink-0" />
                    {customer.email ? (
                      <span className="truncate">{customer.email}</span>
                    ) : (
                      <span className="italic">No email on file</span>
                    )}
                  </div>
                )}
              </div>
              {!isGhost && (
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="border-2 border-black h-8" onClick={startEdit} data-testid="button-edit-customer">
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-2 border-red-500 text-red-600 hover:bg-red-50 h-8"
                    onClick={() => setConfirmDelete(true)}
                    data-testid="button-delete-customer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>

            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <DialogContent className="border-2 border-black">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" /> Delete customer?
                  </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-gray-700">
                  This permanently removes <span className="font-semibold">{customer.name}</span> and
                  unlinks their vehicles. Past orders and visit history are kept. This cannot be undone.
                </p>
                <DialogFooter>
                  <Button variant="outline" className="border-2 border-black" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white border-2 border-black"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                    data-testid="button-confirm-delete-customer"
                  >
                    <Trash2 className="w-4 h-4 mr-1" /> {remove.isPending ? "Deleting…" : "Delete"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <div className="flex flex-wrap gap-1.5">
              {stats.vip_tier && <VipBadge tier={stats.vip_tier} />}
              {customer.user_id ? (
                <Badge className="bg-green-600 text-white text-[10px] gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Signed in
                </Badge>
              ) : isGhost ? (
                <Badge variant="outline" className="border-2 border-gray-400 text-gray-700 text-[10px]">
                  No account yet
                </Badge>
              ) : (
                <Badge variant="outline" className="border-2 border-amber-400 text-amber-800 text-[10px]">
                  Walk-in
                </Badge>
              )}
              {stats.legacy_visits > 0 && (
                <Badge variant="outline" className="border-2 border-purple-500 text-purple-800 text-[10px] gap-1">
                  <History className="w-3 h-3" /> {stats.legacy_visits} legacy
                </Badge>
              )}
              {stats.favourite_branch_name && (
                <Badge variant="outline" className="border-2 border-black text-[10px] gap-1">
                  <MapPin className="w-3 h-3" /> {stats.favourite_branch_name}
                </Badge>
              )}
            </div>
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
          {stats.legacy_visits > 0 && (
            <div className="text-[10px] text-gray-500 mt-0.5">
              {stats.native_visits} new · {stats.legacy_visits} legacy
            </div>
          )}
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

      {/* Per-branch breakdown */}
      {data.branch_split.length > 1 && (
        <>
          <Separator />
          <div>
            <div className="cuci-eyebrow mb-2">By branch</div>
            <div className="space-y-1">
              {data.branch_split.map((b) => (
                <div key={b.branch_id} className="flex items-center justify-between text-xs border-2 border-gray-200 rounded px-2 py-1">
                  <span className="font-semibold flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-gray-400" /> {b.branch_name}
                  </span>
                  <span className="tabular-nums text-gray-600">
                    {b.visits} visit{b.visits !== 1 ? "s" : ""} · <span className="font-semibold text-gray-900">{formatBND(b.spent_cents)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

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
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-bold tracking-wide flex items-center gap-1 flex-wrap">
                      <CarIcon className="w-3 h-3" /> {v.license_plate}
                      {v.vip_tier && <VipBadge tier={v.vip_tier} rank={v.vip_rank} />}
                    </div>
                    <div className="text-gray-600">
                      {[v.color, v.brand, v.model].filter(Boolean).join(" ") || <span className="italic">no details</span>}
                    </div>
                  </div>
                  <div className="text-right tabular-nums shrink-0">
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
                  {!isPending && !isVoided && (
                    <div className="mt-2 flex justify-end">
                      <SendReceiptButton orderId={o.id} size="sm" variant="ghost" className="h-7 px-2 text-emerald-700" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CustomerStatsHeader — at-a-glance CRM tiles above the customer list.
// Each tile is clickable and applies the matching segment filter.
// ----------------------------------------------------------------------------
function CustomerStatsHeader({
  stats,
  onSegment,
}: {
  stats: CustomerStats;
  onSegment: (seg: string) => void;
}) {
  type Tile = {
    label: string;
    value: string;
    sub?: string;
    icon: typeof Users;
    seg?: string;
    accent: string;
    testId: string;
  };

  const tiles: Tile[] = [
    {
      label: "Total customers",
      value: stats.total_customers.toLocaleString(),
      sub: `${stats.active_customers.toLocaleString()} active`,
      icon: Users,
      seg: "all",
      accent: "border-black bg-white",
      testId: "tile-cust-total",
    },
    {
      label: "Gold tier",
      value: stats.gold_count.toLocaleString(),
      sub: "Top loyalty rank",
      icon: Crown,
      seg: "gold",
      accent: "border-amber-500 bg-amber-50",
      testId: "tile-cust-gold",
    },
    {
      label: "Silver tier",
      value: stats.silver_count.toLocaleString(),
      sub: "Strong repeats",
      icon: Award,
      seg: "silver",
      accent: "border-slate-400 bg-slate-50",
      testId: "tile-cust-silver",
    },
    {
      label: "Bronze tier",
      value: stats.bronze_count.toLocaleString(),
      sub: "Regular returns",
      icon: Medal,
      seg: "bronze",
      accent: "border-orange-500 bg-orange-50",
      testId: "tile-cust-bronze",
    },
    {
      label: "At risk",
      value: stats.at_risk_count.toLocaleString(),
      sub: "Lapsed 30+ days",
      icon: AlertCircle,
      seg: "at_risk",
      accent: "border-red-500 bg-red-50",
      testId: "tile-cust-at-risk",
    },
    {
      label: "New (14 days)",
      value: stats.new_count.toLocaleString(),
      sub: "Recent sign-ups",
      icon: Sparkles,
      seg: "new",
      accent: "border-green-500 bg-green-50",
      testId: "tile-cust-new",
    },
    {
      label: "Legacy history",
      value: stats.legacy_count.toLocaleString(),
      sub: "Imported visits",
      icon: History,
      seg: "legacy",
      accent: "border-purple-500 bg-purple-50",
      testId: "tile-cust-legacy",
    },
    {
      label: "Not signed up",
      value: (stats.total_customers - stats.has_account_count).toLocaleString(),
      sub: `${stats.has_account_count} signed in`,
      icon: Users,
      seg: "no_account",
      accent: "border-gray-400 bg-gray-50",
      testId: "tile-cust-no-account",
    },
    {
      label: "Avg spend",
      value: formatBND(stats.avg_spend_cents),
      sub: `Lifetime ${formatBND(stats.total_spent_cents)}`,
      icon: TrendingUp,
      accent: "border-black bg-cuci-primary/5",
      testId: "tile-cust-avg-spend",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {tiles.map((t) => {
        const Icon = t.icon;
        const clickable = Boolean(t.seg);
        return (
          <button
            key={t.label}
            type="button"
            onClick={() => clickable && onSegment(t.seg!)}
            disabled={!clickable}
            className={`text-left border-2 ${t.accent} rounded-lg p-3 transition ${
              clickable ? "hover:shadow-[3px_3px_0_0_rgba(0,0,0,1)] cursor-pointer" : "cursor-default"
            }`}
            data-testid={t.testId}
          >
            <div className="flex items-center justify-between">
              <span className="cuci-eyebrow text-[10px]">{t.label}</span>
              <Icon className="w-4 h-4 text-gray-700" />
            </div>
            <div className="text-2xl font-extrabold tabular-nums leading-tight mt-1">{t.value}</div>
            {t.sub && <div className="text-[10px] text-gray-600 mt-0.5">{t.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}
