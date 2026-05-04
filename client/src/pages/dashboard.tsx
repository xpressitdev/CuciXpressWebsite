import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { DashSidebar, DashTopbar, type DashTab } from "@/components/dashboard/Sidebar";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { WashHistoryTab } from "@/components/dashboard/WashHistoryTab";
import { VehiclesTab } from "@/components/dashboard/VehiclesTab";
import { SubscriptionTab } from "@/components/dashboard/SubscriptionTab";
import { ReceiptsTab } from "@/components/dashboard/ReceiptsTab";
import {
  Whoami,
  MeResp,
  OrderRow,
  MembershipRow,
  CarRow,
} from "@/components/dashboard/types";

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<DashTab>("overview");

  // Auth gate
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
      <div className="min-h-screen bg-gray-50 grid place-items-center">
        <p className="text-sm text-gray-500">Loading your dashboard…</p>
      </div>
    );
  }

  const orders = ordersData?.orders ?? [];
  const memberships = memData?.memberships ?? [];
  const cars = carsData?.cars ?? [];
  const activeMembership = memberships.find((m) => m.status === "active");

  const fullName =
    `${me.profile.first_name} ${me.profile.last_name}`.trim() ||
    me.profile.customer_name ||
    "Customer";

  const membershipLabel = activeMembership
    ? activeMembership.kind === "unlimited"
      ? "Unlimited member"
      : `${activeMembership.remaining_washes} washes left`
    : "Pay-as-you-go";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <DashSidebar
        active={tab}
        onChange={setTab}
        fullName={fullName}
        membershipLabel={membershipLabel}
        onLogout={() => logout.mutate()}
        loggingOut={logout.isPending}
      />
      <div className="flex-1 min-w-0">
        <DashTopbar active={tab} onChange={setTab} />
        <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
          {tab === "overview" && (
            <OverviewTab
              me={me}
              orders={orders}
              memberships={memberships}
              fullName={fullName}
              onChangeTab={(t) => setTab(t)}
            />
          )}
          {tab === "history" && <WashHistoryTab orders={orders} />}
          {tab === "vehicles" && <VehiclesTab cars={cars} />}
          {tab === "subscription" && (
            <SubscriptionTab
              memberships={memberships}
              cars={cars}
              washesThisMonth={me.stats.washes_this_month}
              washesLastMonth={me.stats.washes_last_month}
            />
          )}
          {tab === "receipts" && <ReceiptsTab orders={orders} />}
        </main>
      </div>
    </div>
  );
}
