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
import { Label } from "@/components/ui/label";
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
  /** Pre-fill values for the "Edit Profile" dialog. When omitted, the dialog
   *  is hidden — pages without a `me` profile loaded shouldn't try to
   *  expose profile editing. */
  profile?: EditableProfile;
}

const editProfileSchema = z.object({
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
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email")
    .max(160, "Keep it under 160 characters"),
  phone_number: z
    .string()
    .trim()
    .max(40, "Keep it under 40 characters")
    .optional(),
});
type EditProfileValues = z.infer<typeof editProfileSchema>;

type EditableProfile = {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
};

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
  profile?: EditableProfile;
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
              Edit Profile
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
        <EditProfileDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={profile}
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

function EditProfileDialog({
  open,
  onOpenChange,
  profile,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  profile: EditableProfile;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const defaults: EditProfileValues = {
    first_name: profile.first_name,
    last_name: profile.last_name,
    email: profile.email,
    phone_number: profile.phone_number ?? "",
  };
  const form = useForm<EditProfileValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: defaults,
  });

  // Sync the form whenever the dialog re-opens or the upstream profile
  // changes (e.g. after a successful save the cached `me` updates).
  useEffect(() => {
    if (open) {
      form.reset({
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        phone_number: profile.phone_number ?? "",
      });
    }
  }, [open, profile.first_name, profile.last_name, profile.email, profile.phone_number, form]);

  // Two-step flow: edit the fields, then confirm with a one-time code sent to
  // the customer's CURRENT email. `step` toggles which view is shown.
  const [step, setStep] = useState<"form" | "code">("form");
  const [emailHint, setEmailHint] = useState("");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  // Reset to the editing step whenever the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setStep("form");
      setCode("");
      setCodeError(null);
    }
  }, [open]);

  // Step 1: send the code to the on-record email, then advance to step 2.
  const startMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/customer/me/change/start");
      return r.json() as Promise<{ ok: boolean; email_hint: string }>;
    },
    onSuccess: (data) => {
      setEmailHint(data.email_hint ?? "");
      setCode("");
      setCodeError(null);
      setStep("code");
    },
    onError: (err: any) => {
      const msg = String(err?.message ?? "");
      toast({
        title: "Could not send code",
        description: msg.startsWith("429")
          ? "Too many attempts. Please wait a few minutes and try again."
          : "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // Step 2: submit the edited values together with the code.
  const saveMutation = useMutation({
    mutationFn: async (values: EditProfileValues & { code: string }) => {
      const r = await apiRequest("PATCH", "/api/customer/me", values);
      return r.json() as Promise<{ profile: MeResp["profile"] }>;
    },
    onSuccess: (data) => {
      qc.setQueryData<MeResp | undefined>(["/api/customer/me"], (prev) =>
        prev ? { ...prev, profile: { ...prev.profile, ...data.profile } } : prev,
      );
      qc.invalidateQueries({ queryKey: ["/api/customer/me"] });
      toast({ title: "Profile updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      // apiRequest throws Error("<status>: <body text>"). A 400 here means the
      // code was wrong/expired (stay on the code step so they can retry); a 409
      // is a field conflict (send them back to fix it, with a fresh code).
      const msg = String(err?.message ?? "");
      let field: string | undefined;
      if (msg.includes("{")) {
        try {
          field = JSON.parse(msg.slice(msg.indexOf("{")))?.field;
        } catch {
          field = undefined;
        }
      }
      if (msg.startsWith("409")) {
        setStep("form");
        setCode("");
        toast({
          title: "Could not update profile",
          description:
            field === "email"
              ? "That email is already in use by another account."
              : field === "phone"
                ? "That phone number is already in use by another account."
                : "Please try again.",
          variant: "destructive",
        });
        return;
      }
      // Otherwise treat as a bad/expired code.
      setCodeError(
        msg.startsWith("429")
          ? "Too many incorrect attempts. Request a new code."
          : "That code is incorrect or has expired.",
      );
    },
  });

  const busy = startMutation.isPending || saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]" data-testid="dialog-edit-name">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            {step === "form"
              ? "Update your name, email and phone number. These details appear on your receipts and in your dashboard."
              : "For your security, enter the 6-digit code we just emailed you to confirm these changes."}
          </DialogDescription>
        </DialogHeader>
        {step === "code" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We sent a code to{" "}
              <span className="font-medium text-foreground">{emailHint}</span>.
              Enter it below to save your changes.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="profile-otp-code">Verification code</Label>
              <Input
                id="profile-otp-code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setCodeError(null);
                }}
                data-testid="input-otp-code"
              />
              {codeError && (
                <p className="text-sm font-medium text-destructive">
                  {codeError}
                </p>
              )}
            </div>
            <button
              type="button"
              className="text-sm text-cuci-primary underline-offset-2 hover:underline disabled:opacity-50"
              onClick={() => startMutation.mutate()}
              disabled={busy}
              data-testid="button-otp-resend"
            >
              Resend code
            </button>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("form");
                  setCode("");
                  setCodeError(null);
                }}
                disabled={busy}
                data-testid="button-otp-back"
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={busy || code.length !== 6}
                onClick={() =>
                  saveMutation.mutate({ ...form.getValues(), code })
                }
                data-testid="button-otp-confirm"
              >
                {saveMutation.isPending && (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                )}
                Confirm changes
              </Button>
            </DialogFooter>
          </div>
        ) : (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(() => startMutation.mutate())}
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
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      inputMode="email"
                      maxLength={160}
                      data-testid="input-email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone number</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      inputMode="tel"
                      maxLength={40}
                      placeholder="e.g. +673 1234567"
                      data-testid="input-phone"
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
                disabled={busy}
                data-testid="button-edit-name-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={busy || !form.formState.isDirty}
                data-testid="button-edit-name-save"
              >
                {startMutation.isPending && (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                )}
                Continue
              </Button>
            </DialogFooter>
          </form>
        </Form>
        )}
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
  profile?: EditableProfile;
}) {
  const initials = initialsOf(fullName);
  const [editOpen, setEditOpen] = useState(false);
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

      <div className="flex items-center gap-1.5">
        {profile && (
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border border-cuci-primary/30 bg-white/80 px-2.5 py-1.5 text-xs font-bold text-cuci-primary shadow-sm"
            data-testid="button-dash-edit-profile-mobile-visible"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit profile
          </button>
        )}
        <AccountMenu
          fullName={fullName}
          onLogout={onLogout}
          loggingOut={loggingOut}
          profile={profile}
          side="bottom"
          align="end"
          trigger={
            <button
              className="flex items-center gap-2 rounded-full p-1 hover:bg-white/70"
              aria-label="Open account menu"
              data-testid="button-dash-account-mobile"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cuci-primary to-cuci-secondary text-white grid place-items-center font-bold text-xs shrink-0">
                {initials || "?"}
              </div>
            </button>
          }
        />
        {profile && (
          <EditProfileDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            profile={profile}
          />
        )}
      </div>
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
