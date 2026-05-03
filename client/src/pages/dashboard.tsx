import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Car,
  CreditCard,
  Sparkles,
  History,
  LogOut,
  Loader2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const formatBND = (cents: number) => `BND ${(cents / 100).toFixed(2)}`;

interface Whoami {
  authenticated: boolean;
  user?: { id: string; firstName: string; lastName: string; email: string };
}
interface MeResp {
  profile: {
    id: number;
    first_name: string;
    last_name: string;
    phone_number: string | null;
    email: string;
    customer_id: number | null;
    customer_name: string | null;
    customer_phone: string | null;
  };
  stats: {
    total_done: number;
    total_spent_cents: number;
    remaining_washes: number;
  };
}
interface OrderRow {
  id: string;
  branch_name: string | null;
  plate: string;
  package_name: string;
  total_cents: number;
  status: string;
  created_at: string;
  payment_method: string;
}
interface MembershipRow {
  id: string;
  kind: "pack" | "unlimited";
  total_washes: number;
  remaining_washes: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  price_cents: number;
  sold_at_branch_name: string | null;
}
interface CarRow {
  id: number;
  license_plate: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  last_seen_at: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  done: "border-emerald-300 text-emerald-700 bg-emerald-50",
  washing: "border-blue-300 text-blue-700 bg-blue-50",
  paid: "border-amber-300 text-amber-700 bg-amber-50",
  queued: "border-amber-300 text-amber-700 bg-amber-50",
  voided: "border-gray-300 text-gray-500 bg-gray-50",
  refunded: "border-red-300 text-red-700 bg-red-50",
};

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Gate: must be signed in.
  const { data: who, isLoading: whoLoading } = useQuery<Whoami>({
    queryKey: ["/api/auth/whoami"],
  });
  useEffect(() => {
    if (!whoLoading && who && !who.authenticated) navigate("/login");
  }, [who, whoLoading, navigate]);

  const { data: me } = useQuery<MeResp>({
    queryKey: ["/api/customer/me"],
    enabled: !!who?.authenticated,
  });
  const { data: ordersData } = useQuery<{ orders: OrderRow[] }>({
    queryKey: ["/api/customer/orders"],
    enabled: !!who?.authenticated,
  });
  const { data: memData } = useQuery<{ memberships: MembershipRow[] }>({
    queryKey: ["/api/customer/memberships"],
    enabled: !!who?.authenticated,
  });
  const { data: carsData } = useQuery<{ cars: CarRow[] }>({
    queryKey: ["/api/customer/cars"],
    enabled: !!who?.authenticated,
  });

  const logout = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/auth/lucia/logout", {});
      return r.json();
    },
    onSuccess: () => {
      qc.clear();
      toast({ title: "Signed out" });
      navigate("/");
    },
    onError: () => {
      toast({ title: "Could not sign out", variant: "destructive" });
    },
  });

  if (whoLoading || !who?.authenticated || !me) {
    return (
      <div className="cuci-page-bg">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
          <p className="text-sm text-gray-500">Loading your dashboard…</p>
        </main>
        <Footer />
      </div>
    );
  }

  const orders = ordersData?.orders ?? [];
  const memberships = memData?.memberships ?? [];
  const cars = carsData?.cars ?? [];
  const activeMemberships = memberships.filter((m) => m.status === "active");
  const fullName =
    `${me.profile.first_name} ${me.profile.last_name}`.trim() ||
    me.profile.customer_name ||
    "Customer";
  const firstName = fullName.split(" ")[0];

  return (
    <div className="cuci-page-bg">
      <Navigation />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="cuci-eyebrow">My account · CuciXpress</p>
            <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-tight mt-1">
              Hi, <span className="text-cuci-primary">{firstName}</span>
              <span className="text-cuci-secondary">.</span>
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              {me.profile.phone_number ?? me.profile.customer_phone ?? me.profile.email}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="border-2 border-black hover:bg-gray-50"
            data-testid="button-dashboard-logout"
          >
            {logout.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1" />
            ) : (
              <LogOut className="w-4 h-4 mr-1" />
            )}
            Sign out
          </Button>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiTile
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            label="Washes completed"
            value={String(me.stats.total_done)}
          />
          <KpiTile
            icon={<CreditCard className="w-5 h-5 text-cuci-primary" />}
            label="Total spent"
            value={formatBND(me.stats.total_spent_cents)}
          />
          <KpiTile
            icon={<Sparkles className="w-5 h-5 text-cuci-secondary" />}
            label="Washes remaining"
            value={String(me.stats.remaining_washes)}
            accent
          />
        </div>

        {/* Active memberships */}
        <Card title="Active memberships" icon={<Sparkles className="w-4 h-4 text-cuci-secondary" />}>
          {activeMemberships.length === 0 ? (
            <Empty>You don't have an active membership yet.</Empty>
          ) : (
            <div className="space-y-2">
              {activeMemberships.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between border-2 border-black rounded-xl p-3 bg-gradient-to-r from-cuci-primary/5 to-cuci-secondary/5"
                  data-testid={`row-membership-${m.id}`}
                >
                  <div>
                    <p className="font-bold text-gray-900">
                      {m.kind === "unlimited" ? "Unlimited washes" : `${m.total_washes}-wash pack`}
                    </p>
                    <p className="text-xs text-gray-500">
                      {m.sold_at_branch_name ?? "—"}
                      {m.expires_at && ` · expires ${new Date(m.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="text-right">
                    {m.kind === "unlimited" ? (
                      <Badge className="bg-cuci-secondary text-white border-2 border-black font-bold">
                        Unlimited
                      </Badge>
                    ) : (
                      <p className="text-2xl font-black text-cuci-primary">
                        {m.remaining_washes}
                        <span className="text-xs text-gray-500 font-normal">
                          {" "}
                          / {m.total_washes}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Vehicles */}
        <Card title="My vehicles" icon={<Car className="w-4 h-4 text-cuci-primary" />}>
          {cars.length === 0 ? (
            <Empty>No vehicles linked yet — they'll show up after your first wash.</Empty>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2">
              {cars.map((c) => (
                <div
                  key={c.id}
                  className="border-2 border-gray-200 hover:border-black rounded-xl p-3 transition-colors bg-white"
                  data-testid={`row-car-${c.id}`}
                >
                  <p className="font-black text-gray-900 tracking-wide">{c.license_plate}</p>
                  <p className="text-xs text-gray-500">
                    {[c.brand, c.model, c.color].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {c.last_seen_at && (
                    <p className="text-[11px] text-gray-400 mt-1 inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Last wash{" "}
                      {new Date(c.last_seen_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* History */}
        <Card title="Recent washes" icon={<History className="w-4 h-4 text-gray-700" />}>
          {orders.length === 0 ? (
            <Empty>No washes on your account yet.</Empty>
          ) : (
            <div className="overflow-x-auto -mx-5 md:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left cuci-eyebrow border-b-2 border-black">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Branch</th>
                    <th className="py-2 px-3">Plate</th>
                    <th className="py-2 px-3">Package</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      className="border-b border-gray-100 hover:bg-cuci-primary/5 transition-colors"
                      data-testid={`row-order-${o.id}`}
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-3">{o.branch_name ?? "—"}</td>
                      <td className="py-2.5 px-3 font-mono font-bold">{o.plate}</td>
                      <td className="py-2.5 px-3 truncate max-w-[200px]">
                        {o.package_name}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={`font-bold ${STATUS_STYLES[o.status] ?? ""}`}
                        >
                          {o.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold">
                        {formatBND(o.total_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
      <Footer />
    </div>
  );
}

function KpiTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="cuci-kpi" data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-2 cuci-eyebrow">
        {icon} {label}
      </div>
      <p
        className={`text-2xl md:text-3xl font-black mt-1 ${
          accent ? "text-cuci-secondary" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="cuci-card p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
        {icon}
        <h2 className="font-bold text-gray-900 text-lg">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-dashed border-gray-300 p-5 text-center">
      <p className="text-sm text-gray-500">{children}</p>
    </div>
  );
}
