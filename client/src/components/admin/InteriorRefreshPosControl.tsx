import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  const { canManage, branchName, bookings, isLoading, isError } = useInteriorToday();

  if (!canManage) return null;
  const visibleBookings = bookings.filter((booking) => booking.status !== "cancelled");
  const activeCount = visibleBookings.filter((booking) => booking.status === "booked").length;

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
          {!isLoading && !isError && visibleBookings.length === 0 && (
            <div className="rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500">
              No Interior Refresh bookings today.
            </div>
          )}
          <div className="space-y-3">
            {visibleBookings.map((booking) => {
              const claimed = booking.status !== "booked";
              const name = [booking.first_name, booking.last_name].filter(Boolean).join(" ") || "Subscriber";
              return (
                <div
                  key={booking.id}
                  className="rounded-xl border border-purple-200 bg-white p-4"
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
                    <Badge
                      variant="outline"
                      className={claimed ? "border-green-300 bg-green-50 text-green-700" : "border-amber-300 bg-amber-50 text-amber-700"}
                    >
                      {claimed ? "Claimed" : "Waiting"}
                    </Badge>
                  </div>

                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="h-4 w-4" />
                      {claimed ? "One-time QR has been claimed" : "Scan the customer's one-time QR to claim"}
                    </p>
                    <p className="mt-1 text-xs">
                      Complimentary benefit for billing period {periodLabel(booking.benefit_period_start, booking.benefit_period_end)}.
                    </p>
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