import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { DashSidebar, DashMobileHeader, DashMobileNav, type DashTab } from "@/components/dashboard/Sidebar";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { ActivityTab } from "@/components/dashboard/ActivityTab";
import { VehiclesTab } from "@/components/dashboard/VehiclesTab";
import { SubscriptionTab } from "@/components/dashboard/SubscriptionTab";
import { AchievementsTab } from "@/components/dashboard/AchievementsTab";
import {
  Whoami,
  MeResp,
  OrderRow,
  MembershipRow,
  CarRow,
  SubscriptionRow,
} from "@/components/dashboard/types";

export default function DashboardPage() {
  const [location, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Read initial tab from ?tab= so other pages (e.g. /checkout sidebar
  // clicks) can deep-link into a specific dashboard section.
  const initialTab: DashTab = (() => {
    const valid: DashTab[] = ["overview", "activity", "vehicles", "subscription", "achievements"];
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("tab");
    // Backward-compat: the old "history" + "receipts" tabs were merged
    // into a single "activity" tab. Bookmarks still open the right page.
    if (raw === "history" || raw === "receipts") return "activity";
    const t = raw as DashTab | null;
    return t && valid.includes(t) ? t : "overview";
  })();
  const [tab, setTab] = useState<DashTab>(initialTab);

  // Keep URL in sync when the user clicks sidebar tabs on this page —
  // makes deep-link/refresh land on the same tab.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const current = params.get("tab");
    if (tab === "overview" && !current) return;
    if (current === tab) return;
    if (tab === "overview") {
      window.history.replaceState({}, "", "/dashboard");
    } else {
      window.history.replaceState({}, "", `/dashboard?tab=${tab}`);
    }
  }, [tab, location]);

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
  const { data: subData } = useQuery<{ subscription: SubscriptionRow | null }>({
    queryKey: ["/api/subscriptions/me"],
    enabled: !!who?.authenticated,
  });

  const cancelSub = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest("POST", `/api/subscriptions/${id}/cancel`, {});
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/me"] });
      toast({
        title: "Auto-renew turned off",
        description:
          "Your plan stays active until the end of the current billing period.",
      });
    },
    onError: () => {
      toast({ title: "Could not cancel", variant: "destructive" });
    },
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
      <div className="min-h-screen cuci-dash-bg grid place-items-center">
        <p className="text-sm text-gray-600">Loading your dashboard…</p>
      </div>
    );
  }

  const orders = ordersData?.orders ?? [];
  const memberships = memData?.memberships ?? [];
  const cars = carsData?.cars ?? [];
  // Unlimited beats Pack for the "what plan are you on" label, so the
  // sidebar matches the Overview hero.
  const activeMembership =
    memberships.find((m) => m.status === "active" && m.kind === "unlimited") ??
    memberships.find((m) => m.status === "active");

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
    <div className="min-h-screen cuci-dash-bg flex">
      <DashSidebar
        active={tab}
        onChange={setTab}
        fullName={fullName}
        membershipLabel={membershipLabel}
        onLogout={() => logout.mutate()}
        loggingOut={logout.isPending}
        profile={{
          first_name: me.profile.first_name ?? "",
          last_name: me.profile.last_name ?? "",
        }}
      />
      <div className="flex-1 min-w-0">
        <DashMobileHeader
          fullName={fullName}
          onLogout={() => logout.mutate()}
          loggingOut={logout.isPending}
          profile={{
            first_name: me.profile.first_name ?? "",
            last_name: me.profile.last_name ?? "",
          }}
        />
        <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 pb-24 md:pb-10 max-w-7xl">
          {tab === "overview" && (
            <OverviewTab
              me={me}
              orders={orders}
              memberships={memberships}
              cars={cars}
              fullName={fullName}
              onChangeTab={(t) => setTab(t)}
            />
          )}
          {tab === "activity" && <ActivityTab orders={orders} />}
          {tab === "vehicles" && <VehiclesTab cars={cars} memberships={memberships} />}
          {tab === "subscription" && (
            <SubscriptionTab
              memberships={memberships}
              cars={cars}
              subscription={subData?.subscription ?? null}
              onCancel={(id) => cancelSub.mutate(id)}
              cancelling={cancelSub.isPending}
              washesThisMonth={me.stats.washes_this_month}
              washesLastMonth={me.stats.washes_last_month}
              savedThisCycleCents={me.stats.saved_this_cycle_cents}
            />
          )}
          {tab === "achievements" && (
            <AchievementsTab
              orders={orders}
              memberships={memberships}
              customerName={fullName}
            />
          )}
        </main>
        <DashMobileNav active={tab} onChange={setTab} />
      </div>
    </div>
  );
}
