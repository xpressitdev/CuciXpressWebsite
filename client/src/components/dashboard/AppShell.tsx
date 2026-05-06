import { ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashSidebar, DashTopbar, type DashTab } from "./Sidebar";
import { Whoami, MeResp } from "./types";

interface Props {
  children: ReactNode;
  /**
   * Which sidebar item should be highlighted. Pass `null` for pages that
   * don't correspond to a sidebar tab (e.g. /checkout). Pass a `DashTab`
   * value for pages that map onto one (e.g. "subscription" for /subscriptions).
   */
  activeTab: DashTab | null;
}

/**
 * Shared dashboard shell — sidebar + mobile topbar + main content area.
 *
 * Used by /dashboard (where sidebar clicks change tab in-place via the URL
 * `?tab=` param) and by /checkout + /subscriptions (where sidebar clicks
 * navigate back to /dashboard with the right tab pre-selected).
 *
 * If the user isn't authenticated, this returns `null` — callers (the
 * page components) decide whether to show a public layout or redirect.
 */
export function AppShell({ children, activeTab }: Props) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: who } = useQuery<Whoami>({ queryKey: ["/api/auth/whoami"] });
  const { data: me } = useQuery<MeResp>({
    queryKey: ["/api/customer/me"],
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

  if (!who?.authenticated || !me) {
    return (
      <div className="min-h-screen bg-gray-50 grid place-items-center">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const fullName =
    `${me.profile.first_name} ${me.profile.last_name}`.trim() ||
    me.profile.customer_name ||
    "Customer";

  // Cheap label — full computation lives in dashboard.tsx, this is just for
  // the sidebar footer chip on shell pages where we don't have memberships
  // loaded.
  const membershipLabel = "Pay-as-you-go";

  // Sidebar tab clicks on non-dashboard pages → take the user to the
  // dashboard with that tab pre-selected. Falls back to "overview".
  const handleTabChange = (tab: DashTab) => {
    navigate(`/dashboard?tab=${tab}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <DashSidebar
        active={activeTab ?? ("overview" as DashTab)}
        onChange={handleTabChange}
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
        <DashTopbar
          active={activeTab ?? ("overview" as DashTab)}
          onChange={handleTabChange}
        />
        <main className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
          {children}
        </main>
      </div>
    </div>
  );
}
