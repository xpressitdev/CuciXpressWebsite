import { useEffect, useState } from "react";
import { Home, Receipt, Car, Crown, LogOut, ChevronUp, Pencil, Loader2, Trophy } from "lucide-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { MeResp } from "./types";

export type DashTab =
  | "overview"
  | "activity"
  | "vehicles"
  | "subscription"
  | "achievements";

interface Props {
  active: DashTab;
  onChange: (tab: DashTab) => void;
  fullName: string;
  membershipLabel: string;
  onLogout: () => void;
  loggingOut: boolean;
  /** Pre-fill values for the "Edit name" dialog. When omitted, the dialog
   *  is hidden — pages without a `me` profile loaded shouldn't try to
   *  expose name editing. */
  profile?: { first_name: string; last_name: string };
}

const editNameSchema = z.object({
  first_name: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(80, "Keep it under 80 characters"),
  last_name: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(80, "Keep it under 80 characters"),
});
type EditNameValues = z.infer<typeof editNameSchema>;

const items: { id: DashTab; label: string; short: string; icon: any }[] = [
  { id: "overview", label: "Overview", short: "Home", icon: Home },
  { id: "activity", label: "Activity", short: "Activity", icon: Receipt },
  { id: "vehicles", label: "My vehicles", short: "Vehicles", icon: Car },
  { id: "subscription", label: "Subscription", short: "Plan", icon: Crown },
  { id: "achievements", label: "Achievements", short: "Awards", icon: Trophy },
];

function initialsOf(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

// Shared account dropdown (edit name + sign out). Both the desktop
// sidebar and the mobile top bar render their own trigger and hand it in
// so they can look different while sharing the menu + edit dialog.
function AccountMenu({
  fullName,
  onLogout,
  loggingOut,
  profile,
  trigger,
  side = "bottom",
  align = "end",
}: {
  fullName: string;
  onLogout: () => void;
  loggingOut: boolean;
  profile?: { first_name: string; last_name: string };
  trigger: React.ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
}) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align={align} side={side} className="w-56">
          <DropdownMenuLabel className="truncate">{fullName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {profile && (
            <DropdownMenuItem
              onClick={() => setEditOpen(true)}
              data-testid="button-dash-edit-name"
            >
              <Pencil className="w-3.5 h-3.5 mr-2" />
              Edit name
            </DropdownMenuItem>
          )}
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

      {profile && (
        <EditNameDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          firstName={profile.first_name}
          lastName={profile.last_name}
        />
      )}
    </>
  );
}

export function DashSidebar({
  active,
  onChange,
  fullName,
  membershipLabel,
  onLogout,
  loggingOut,
  profile,
}: Props) {
  const initials = initialsOf(fullName);

  return (
    <aside className="hidden md:flex w-60 shrink-0 cuci-dash-nav border-r border-black/10 flex-col h-screen sticky top-0">
      <div className="px-6 pt-6 pb-8">
        <Link href="/" className="block">
          <span
            className="text-2xl font-black text-cuci-primary"
            data-testid="link-dash-brand"
          >
            Cuci <span className="text-cuci-secondary">Xpress</span>
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
                  ? "bg-cuci-primary text-white"
                  : "text-gray-700 hover:bg-white/70")
              }
            >
              <Icon className="w-4 h-4" />
              {it.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-black/10">
        <AccountMenu
          fullName={fullName}
          onLogout={onLogout}
          loggingOut={loggingOut}
          profile={profile}
          side="top"
          align="end"
          trigger={
            <button
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/70 text-left"
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
                <p className="text-[11px] text-gray-600 truncate">{membershipLabel}</p>
              </div>
              <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
            </button>
          }
        />
      </div>
    </aside>
  );
}

function EditNameDialog({
  open,
  onOpenChange,
  firstName,
  lastName,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  firstName: string;
  lastName: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const form = useForm<EditNameValues>({
    resolver: zodResolver(editNameSchema),
    defaultValues: { first_name: firstName, last_name: lastName },
  });

  // Sync the form whenever the dialog re-opens or the upstream profile
  // changes (e.g. after a successful save the cached `me` updates).
  useEffect(() => {
    if (open) {
      form.reset({ first_name: firstName, last_name: lastName });
    }
  }, [open, firstName, lastName, form]);

  const mutation = useMutation({
    mutationFn: async (values: EditNameValues) => {
      const r = await apiRequest("PATCH", "/api/customer/me", values);
      return r.json() as Promise<{ profile: MeResp["profile"] }>;
    },
    onSuccess: (data) => {
      qc.setQueryData<MeResp | undefined>(["/api/customer/me"], (prev) =>
        prev ? { ...prev, profile: { ...prev.profile, ...data.profile } } : prev,
      );
      qc.invalidateQueries({ queryKey: ["/api/customer/me"] });
      toast({ title: "Name updated" });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Could not update name",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" data-testid="dialog-edit-name">
        <DialogHeader>
          <DialogTitle>Edit your name</DialogTitle>
          <DialogDescription>
            This is how you'll appear on receipts and in your dashboard.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      maxLength={80}
                      data-testid="input-first-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={80}
                      data-testid="input-last-name"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={mutation.isPending}
                data-testid="button-edit-name-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                data-testid="button-edit-name-save"
              >
                {mutation.isPending && (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                )}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Mobile top bar: home/brand on the left, profile avatar on the right —
// mirrors the native-app pattern. The actual page navigation lives in the
// bottom bar (DashMobileNav).
export function DashMobileHeader({
  fullName,
  onLogout,
  loggingOut,
  profile,
}: {
  fullName: string;
  onLogout: () => void;
  loggingOut: boolean;
  profile?: { first_name: string; last_name: string };
}) {
  const initials = initialsOf(fullName);
  return (
    <header className="md:hidden sticky top-0 z-30 cuci-dash-nav border-b border-black/10 h-14 px-4 flex items-center justify-between">
      <Link
        href="/"
        className="flex items-center gap-2"
        data-testid="link-dash-home-mobile"
      >
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cuci-primary to-cuci-secondary grid place-items-center shrink-0">
          <Home className="w-4 h-4 text-white" />
        </span>
        <span className="text-lg font-black text-cuci-primary">
          Cuci <span className="text-cuci-secondary">Xpress</span>
        </span>
      </Link>

      <AccountMenu
        fullName={fullName}
        onLogout={onLogout}
        loggingOut={loggingOut}
        profile={profile}
        side="bottom"
        align="end"
        trigger={
          <button
            className="flex items-center gap-2 rounded-full pl-1 pr-1 py-1 hover:bg-white/70"
            data-testid="button-dash-account-mobile"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cuci-primary to-cuci-secondary text-white grid place-items-center font-bold text-xs shrink-0">
              {initials || "?"}
            </div>
          </button>
        }
      />
    </header>
  );
}

// Mobile bottom navigation bar — fixed, app-style. Five equal columns.
export function DashMobileNav({
  active,
  onChange,
}: {
  active: DashTab;
  onChange: (tab: DashTab) => void;
}) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 cuci-dash-nav border-t border-black/10 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]"
      data-testid="nav-dash-mobile"
    >
      {items.map((it) => {
        const Icon = it.icon;
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            data-testid={`nav-dash-mobile-${it.id}`}
            className={
              "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors " +
              (isActive ? "text-cuci-primary" : "text-gray-600")
            }
          >
            <Icon className={"w-5 h-5 " + (isActive ? "text-cuci-primary" : "text-gray-600")} />
            {it.short}
          </button>
        );
      })}
    </nav>
  );
}
