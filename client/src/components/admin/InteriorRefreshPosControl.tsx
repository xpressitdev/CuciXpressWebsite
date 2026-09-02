import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

type BookingStatus = "booked" | "checked_in" | "completed" | "cancelled" | "no_show";

interface StaffBooking {
  id: string;
  status: BookingStatus;
  slot_start: string;
  slot_end: string;
  license_plate: string;
  brand: string | null;
  model: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  benefit_period_start: string;
  benefit_period_end: string;
  benefit_status: string;
  plan_id: string;
}

const todayInBrunei = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Brunei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

function useInteriorToday() {
  const date = todayInBrunei();
  const access = useQuery<{
    can_manage: boolean;
    branch: { id: number; name: string };
  }>({
    queryKey: ["/api/staff/interior-refresh/access"],
  });
  const schedule = useQuery<{ bookings: StaffBooking[] }>({
    queryKey: ["/api/staff/interior-refresh/schedule", date],
    enabled: access.data?.can_manage === true,
    queryFn: async () => {
      const response = await fetch(
        `/api/staff/interior-refresh/schedule?date=${encodeURIComponent(date)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });
  return {
    canManage: access.data?.can_manage === true,
    branchName: access.data?.branch.name ?? "Tungku Link",
    date,
    bookings: schedule.data?.bookings ?? [],
    isLoading: access.isLoading || schedule.isLoading,
    isError: access.isError || schedule.isError,
  };
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Brunei",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function periodLabel(start: string, end: string) {
  const format = (value: string) =>
    new Date(value).toLocaleDateString("en-GB", {
      timeZone: "Asia/Brunei",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${format(start)}–${format(end)}`;
}

function allowedActions(status: BookingStatus) {
  if (status === "booked") return ["checked_in", "cancelled", "no_show"] as const;
  if (status === "checked_in") return ["completed", "cancelled"] as const;
  return [] as const;
}

export function InteriorRefreshTodayReminder() {
  const { canManage, bookings, isLoading } = useInteriorToday();
  const current = bookings.filter((booking) =>
    booking.status === "booked" || booking.status === "checked_in");
  if (!canManage || isLoading || current.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-950"
      data-testid="reminder-interior-refresh-today"
    >
      <CalendarCheck2 className="h-4 w-4 text-cuci-primary" />
      <strong>{current.length} Interior Refresh booking{current.length === 1 ? "" : "s"} today</strong>
      <span className="text-purple-700">
        {current.map((booking) => `${timeLabel(booking.slot_start)} · ${booking.license_plate}`).join("  |  ")}
      </span>
    </div>
  );
}

export function InteriorRefreshPosButton() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canManage, branchName, date, bookings, isLoading, isError } = useInteriorToday();

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Exclude<BookingStatus, "booked"> }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/staff/interior-refresh/bookings/${id}/status`,
        { status },
      );
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff/interior-refresh/schedule", date] });
      qc.invalidateQueries({ queryKey: ["/api/staff/interior-refresh/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/interior-refresh/report"] });
      toast({ title: "Interior Refresh appointment updated" });
    },
    onError: () => toast({
      title: "Could not update appointment",
      description: "Refresh the list and check that its status has not changed.",
      variant: "destructive",
    }),
  });

  if (!canManage) return null;
  const activeCount = bookings.filter((booking) =>
    booking.status === "booked" || booking.status === "checked_in").length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="cuci-cta bg-white text-gray-900 px-4 py-2 rounded-full inline-flex items-center gap-2 text-sm"
        data-testid="button-open-interior-refresh"
      >
        <Sparkles className="h-4 w-4" />
        Interior bookings
        {activeCount > 0 && (
          <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5">{activeCount}</Badge>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-5 w-5 text-cuci-primary" />
              Today's Interior Refresh bookings
            </DialogTitle>
            <DialogDescription>
              Verify the booked plate and its one-time benefit for the active subscription billing month before check-in at {branchName}.
            </DialogDescription>
          </DialogHeader>

          {isLoading && <p className="py-6 text-center text-sm text-gray-500">Loading bookings…</p>}
          {isError && <p className="py-6 text-center text-sm text-red-700">Today's bookings could not be loaded.</p>}
          {!isLoading && !isError && bookings.length === 0 && (
            <div className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">
              No Interior Refresh bookings today.
            </div>
          )}
          <div className="space-y-3">
            {bookings.map((booking) => {
              const cancelled = booking.status === "cancelled";
              const name = [booking.first_name, booking.last_name].filter(Boolean).join(" ") || "Subscriber";
              return (
                <div
                  key={booking.id}
                  className={`rounded-xl border p-4 ${cancelled ? "border-gray-200 bg-gray-50 opacity-70" : "border-purple-200 bg-white"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-xl font-black">
                        <Clock className="h-4 w-4 text-cuci-primary" />
                        {timeLabel(booking.slot_start)}
                        <span className="text-cuci-primary">{booking.license_plate}</span>
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        {name}
                        {[booking.brand, booking.model].filter(Boolean).length > 0
                          ? ` · ${[booking.brand, booking.model].filter(Boolean).join(" ")}`
                          : ""}
                        {booking.phone_number ? ` · ${booking.phone_number}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {booking.status.replace("_", " ")}
                    </Badge>
                  </div>

                  {!cancelled ? (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                      <p className="flex items-center gap-1.5 font-bold">
                        <CheckCircle2 className="h-4 w-4" />
                        Plate and monthly benefit verified
                      </p>
                      <p className="mt-1 text-xs">
                        Single complimentary Interior Refresh for billing period {periodLabel(booking.benefit_period_start, booking.benefit_period_end)}.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-gray-500">
                      Cancelled — this booking cannot be checked in and its benefit was released.
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {allowedActions(booking.status).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant={status === "checked_in" || status === "completed" ? "default" : "outline"}
                        disabled={update.isPending}
                        onClick={() => {
                          const destructive = status === "cancelled" || status === "no_show";
                          if (!destructive || window.confirm(`Mark this appointment ${status.replace("_", " ")}?`)) {
                            update.mutate({ id: booking.id, status });
                          }
                        }}
                      >
                        {status === "checked_in" ? "Check in" : status.replace("_", " ")}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}