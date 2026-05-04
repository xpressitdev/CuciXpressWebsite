import { Home, Clock, Car, Crown, Receipt, LogOut, ChevronUp } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DashTab =
  | "overview"
  | "history"
  | "vehicles"
  | "subscription"
  | "receipts";

interface Props {
  active: DashTab;
  onChange: (tab: DashTab) => void;
  fullName: string;
  membershipLabel: string;
  onLogout: () => void;
  loggingOut: boolean;
}

const items: { id: DashTab; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "history", label: "Wash history", icon: Clock },
  { id: "vehicles", label: "My vehicles", icon: Car },
  { id: "subscription", label: "Subscription", icon: Crown },
  { id: "receipts", label: "Receipts", icon: Receipt },
];

export function DashSidebar({
  active,
  onChange,
  fullName,
  membershipLabel,
  onLogout,
  loggingOut,
}: Props) {
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="hidden md:flex w-60 shrink-0 bg-white border-r border-gray-200 flex-col h-screen sticky top-0">
      <div className="px-6 pt-6 pb-8">
        <Link href="/" className="block">
          <span
            className="text-2xl font-black bg-gradient-to-r from-cuci-primary to-cuci-secondary bg-clip-text text-transparent"
            data-testid="link-dash-brand"
          >
            CuciXpress
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              data-testid={`nav-dash-${it.id}`}
              className={
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors " +
                (isActive
                  ? "bg-cuci-primary/10 text-cuci-primary"
                  : "text-gray-700 hover:bg-gray-50")
              }
            >
              <Icon className="w-4 h-4" />
              {it.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-200">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-left"
              data-testid="button-dash-account"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cuci-primary to-cuci-secondary text-white grid place-items-center font-bold text-xs shrink-0">
                {initials || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[13px] font-bold text-gray-900 truncate"
                  data-testid="text-dash-username"
                >
                  {fullName}
                </p>
                <p className="text-[11px] text-gray-500 truncate">{membershipLabel}</p>
              </div>
              <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel>My account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              disabled={loggingOut}
              className="text-red-600 focus:text-red-600"
              data-testid="button-dash-logout"
            >
              <LogOut className="w-3.5 h-3.5 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

export function DashTopbar({
  active,
  onChange,
}: {
  active: DashTab;
  onChange: (tab: DashTab) => void;
}) {
  return (
    <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-3 py-2 overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {items.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.id;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              data-testid={`nav-dash-mobile-${it.id}`}
              className={
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap " +
                (isActive
                  ? "bg-cuci-primary/10 text-cuci-primary"
                  : "text-gray-600")
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {it.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
