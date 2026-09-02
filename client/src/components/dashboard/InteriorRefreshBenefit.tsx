import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock3, Sparkles, XCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CarRow,
  InteriorRefreshAppointment,
  InteriorRefreshStatus,
  InteriorRefreshSlot,
} from "./types";

const BENEFIT_KEY = ["/api/subscriptions/interior-refresh"] as const;

interface BenefitResponse {
  promotion: {
    enabled: boolean;
    starts_on: string | null;
    ends_on: string | null;
    branch: { id: number; name: string } | null;
    duration_minutes: number;
  } | null;
  entitlements: Array<{
    id: string;
    status: string;
    display_status: InteriorRefreshStatus;
    period_start: string;
    period_end: string;
    // Supported by newer API versions; it is the server-calculated last
    // Brunei date this entitlement may be booked for.
    bookable_through?: string | null;
    max_booking_date?: string | null;
  }>;
  vehicles: Array<{ id: number; entitlement_id?: string }>;
  bookings: Array<{
    id: string;
    entitlement_id: string;
    status: InteriorRefreshAppointment["status"];
    slot_start: string;
    slot_end: string;
    branch_name: string;
    vehicle_id: number;
    license_plate: string;
    reminder_opt_in: boolean;
    reminder_sent_at: string | null;
  }>;
  brunei_today: string;
}

function bruneiDate(iso?: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Brunei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function displayDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "Asia/Brunei",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function displayAppointment(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Brunei",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("slot_unavailable")) return "That slot was just taken. Choose another time.";
  if (raw.includes("booking_cutoff")) return "Bookings must be made by the previous day.";
  if (raw.includes("not_eligible")) return "This billing cycle is not eligible.";
  return "Please try again. Your benefit has not been changed.";
}

export function InteriorRefreshBenefit({ cars }: { cars: CarRow[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [reminderOptIn, setReminderOptIn] = useState(false);

  const { data, isLoading, isError } = useQuery<BenefitResponse>({
    queryKey: BENEFIT_KEY,
  });

  // The endpoint returns history as well as the current period. Select the
  // entitlement that is live now rather than assuming database sort order,
  // then only show a booking belonging to that entitlement.
  const entitlement = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    const active = data.entitlements
      .filter((item) => {
        const start = new Date(item.period_start).getTime();
        const end = new Date(item.period_end).getTime();
        return start <= now && now < end;
      })
      .sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime());
    if (active.length) return active.find((item) => item.display_status !== "expired") ?? active[0];
    // When there is no live cycle, deliberately select the most recently
    // ended one so expired/no-show history remains intelligible.
    return [...data.entitlements].sort(
      (a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime(),
    )[0] ?? null;
  }, [data]);
  const promotion = data?.promotion ?? null;
  const canChoose = entitlement?.display_status === "available" && promotion?.enabled === true;
  const { data: slotData, isFetching: loadingSlots, isError: slotsFailed } = useQuery<{
    slots: Array<InteriorRefreshSlot & { start_time: string; available: boolean }>;
  }>({
    queryKey: ["/api/subscriptions/interior-refresh/availability", date],
    enabled: canChoose && !!date,
    queryFn: async () => {
      const response = await fetch(
        `/api/subscriptions/interior-refresh/availability?date=${encodeURIComponent(date)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });

  const booking = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/subscriptions/interior-refresh/bookings", {
        vehicle_id: Number(vehicleId),
        date,
        start_time: slot,
        reminder_opt_in: reminderOptIn,
      });
      return response.json();
    },
    onSuccess: () => {
      setSlot("");
      setReminderOptIn(false);
      qc.invalidateQueries({ queryKey: BENEFIT_KEY });
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/interior-refresh/availability"] });
      toast({ title: "Interior Refresh booked", description: "We'll see you at Tungku Link." });
    },
    onError: (error) =>
      toast({ title: "Could not book", description: errorMessage(error), variant: "destructive" }),
  });

  const cancellation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/subscriptions/interior-refresh/bookings/${id}`);
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BENEFIT_KEY });
      qc.invalidateQueries({ queryKey: ["/api/subscriptions/interior-refresh/availability"] });
      toast({ title: "Appointment cancelled", description: "Your cycle benefit is available again." });
    },
    onError: (error) =>
      toast({ title: "Could not cancel", description: errorMessage(error), variant: "destructive" }),
  });

  const maxDate = useMemo(() => {
    if (!entitlement) return "";
    // A slot must fully fit before cycle end. This prevents offering an end
    // date whose every 45-minute start is invalid (e.g. a midnight expiry).
    const lastFittingInstant = new Date(new Date(entitlement.period_end).getTime() - 45 * 60_000);
    const periodLimit = bruneiDate(lastFittingInstant.toISOString());
    const serverLimit = entitlement.bookable_through ?? entitlement.max_booking_date;
    const entitlementLimit = serverLimit
      ? /^\d{4}-\d{2}-\d{2}$/.test(serverLimit)
        ? serverLimit
        : bruneiDate(serverLimit)
      : periodLimit;
    if (!data?.brunei_today) return entitlementLimit;
    const limit = new Date(`${data.brunei_today}T00:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() + 30);
    const thirtyDays = limit.toISOString().slice(0, 10);
    return entitlementLimit < thirtyDays ? entitlementLimit : thirtyDays;
  }, [data?.brunei_today, entitlement?.period_end]);
  const tomorrow = useMemo(() => {
    if (data?.brunei_today) {
      const day = new Date(`${data.brunei_today}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + 1);
      return day.toISOString().slice(0, 10);
    }
    const now = new Date();
    const bruneiNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Brunei" }));
    bruneiNow.setDate(bruneiNow.getDate() + 1);
    return `${bruneiNow.getFullYear()}-${String(bruneiNow.getMonth() + 1).padStart(2, "0")}-${String(bruneiNow.getDate()).padStart(2, "0")}`;
  }, [data?.brunei_today]);

  if (isLoading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading Interior Refresh benefit…</div>;
  }
  if (isError || !data) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Interior Refresh status is temporarily unavailable.</div>;
  }

  const status = entitlement?.display_status ?? "unavailable";
  const rawAppointment = entitlement
    ? [...data.bookings]
        .filter((booking) => booking.entitlement_id === entitlement.id)
        .sort((a, b) => new Date(b.slot_start).getTime() - new Date(a.slot_start).getTime())[0] ?? null
    : null;
  const appointment: InteriorRefreshAppointment | null = rawAppointment
    ? {
        id: rawAppointment.id,
        status: rawAppointment.status,
        starts_at: rawAppointment.slot_start,
        ends_at: rawAppointment.slot_end,
        branch_name: rawAppointment.branch_name,
        vehicle_id: rawAppointment.vehicle_id,
        vehicle_plate: rawAppointment.license_plate,
      }
    : null;
  const isUpcoming = appointment?.status === "booked";
  const coveredIds = data.vehicles
    .filter((vehicle) => !vehicle.entitlement_id || vehicle.entitlement_id === entitlement?.id)
    .map((vehicle) => vehicle.id);
  const coveredCars = cars.filter((car) => coveredIds.includes(car.id));

  return (
    <section className="rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-orange-50 p-5 md:p-6" data-testid="card-interior-refresh">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h2 className="text-xl font-black text-gray-900">Complimentary Interior Refresh</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">One {promotion?.duration_minutes ?? 45}-minute visit per paid billing cycle · {promotion?.branch?.name ?? "Tungku Link"} only</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold uppercase text-purple-700 shadow-sm">
          {status.replace("_", " ")}
        </span>
      </div>

      {appointment && ["booked", "checked_in"].includes(appointment.status) && (
        <div className="mt-5 rounded-xl border border-purple-200 bg-white p-4">
          <p className="font-extrabold text-gray-900">{displayAppointment(appointment.starts_at)}</p>
          <p className="mt-1 text-sm text-gray-600">{appointment.branch_name} · {appointment.vehicle_plate}</p>
          {rawAppointment?.reminder_opt_in && (
            <p className="mt-2 text-xs font-semibold text-purple-700">
              {rawAppointment.reminder_sent_at
                ? "Email reminder sent"
                : "Email reminder scheduled for about 24 hours before"}
            </p>
          )}
          {isUpcoming && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              disabled={cancellation.isPending}
              onClick={() => {
                if (window.confirm("Cancel this appointment and release the slot?")) cancellation.mutate(appointment.id);
              }}
              data-testid="button-cancel-interior-refresh"
            >
              <XCircle className="mr-2 h-4 w-4" />
              {cancellation.isPending ? "Cancelling…" : "Cancel appointment"}
            </Button>
          )}
          {appointment.status === "checked_in" && <p className="mt-3 text-sm font-semibold text-green-700">Checked in — your cycle benefit is now used.</p>}
        </div>
      )}

      {appointment && ["completed", "cancelled", "no_show"].includes(appointment.status) && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <p className="font-extrabold text-gray-900">
            {appointment.status === "completed" && "Interior Refresh completed"}
            {appointment.status === "cancelled" && "Appointment cancelled"}
            {appointment.status === "no_show" && "Appointment marked no-show"}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {displayAppointment(appointment.starts_at)} · {appointment.vehicle_plate}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            {appointment.status === "cancelled"
              ? "A cancellation before check-in restores the benefit while bookings are open."
              : "This billing cycle's benefit has been consumed."}
          </p>
        </div>
      )}

      {canChoose && (
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="refresh-vehicle">Covered vehicle</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger id="refresh-vehicle" className="mt-1 bg-white"><SelectValue placeholder="Choose vehicle" /></SelectTrigger>
              <SelectContent>
                {coveredCars.map((car) => (
                  <SelectItem key={car.id} value={String(car.id)}>
                    {car.license_plate}{car.brand ? ` · ${car.brand} ${car.model ?? ""}` : ""}
                  </SelectItem>
                ))}
                {coveredCars.length === 0 && <SelectItem value="none" disabled>No covered vehicles</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="refresh-date">Appointment date</Label>
            <Input
              id="refresh-date"
              type="date"
              className="mt-1 bg-white"
              min={tomorrow}
              max={maxDate || undefined}
              disabled={!!maxDate && maxDate < tomorrow}
              value={date}
              onChange={(event) => { setDate(event.target.value); setSlot(""); }}
            />
            {!!maxDate && maxDate < tomorrow && (
              <p className="mt-1 text-xs text-gray-600">No 45-minute appointment fits before this cycle ends.</p>
            )}
          </div>
          <div>
            <Label htmlFor="refresh-slot">Available time</Label>
            <Select value={slot} onValueChange={setSlot} disabled={!date || loadingSlots}>
              <SelectTrigger id="refresh-slot" className="mt-1 bg-white">
                <SelectValue placeholder={loadingSlots ? "Checking…" : "Choose time"} />
              </SelectTrigger>
              <SelectContent>
                {(slotData?.slots ?? []).filter((item) => item.available).map((item) => (
                  <SelectItem key={item.starts_at} value={item.start_time}>
                    {new Date(item.starts_at).toLocaleTimeString("en-GB", { timeZone: "Asia/Brunei", hour: "2-digit", minute: "2-digit" })}
                  </SelectItem>
                ))}
                {date && !loadingSlots && !(slotData?.slots.some((item) => item.available)) && <SelectItem value="none" disabled>No slots available</SelectItem>}
              </SelectContent>
            </Select>
            {slotsFailed && <p className="mt-1 text-xs text-red-700">Availability could not be loaded. Check the date and try again.</p>}
          </div>
          <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={reminderOptIn}
                  onChange={(event) => setReminderOptIn(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                  data-testid="checkbox-interior-refresh-reminder"
                />
                Email me a reminder about 24 hours before
              </label>
              <p className="mt-1 text-xs text-gray-600"><CalendarDays className="mr-1 inline h-4 w-4" />Book by the previous day. Benefit expires {displayDate(entitlement?.period_end)}.</p>
            </div>
            <Button
              className="bg-cuci-primary font-bold text-white"
              disabled={!vehicleId || !slot || booking.isPending}
              onClick={() => booking.mutate()}
              data-testid="button-book-interior-refresh"
            >
              {booking.isPending ? "Booking…" : "Confirm appointment"}
            </Button>
          </div>
        </div>
      )}

      {!canChoose && !appointment && (
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-white p-4 text-sm text-gray-700">
          {status === "completed" || status === "used" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" /> : <Clock3 className="h-5 w-5 shrink-0 text-gray-500" />}
          <p>
            {status === "expired" && "This cycle's benefit expired. A new benefit appears after a successful renewal."}
            {status === "no_show" && "This benefit was consumed when the appointment was marked no-show."}
            {(status === "completed" || status === "checked_in") && "This cycle's Interior Refresh benefit has been used."}
            {status === "cancelled" && "The previous appointment was cancelled. New bookings are currently unavailable."}
            {status === "booked" && "An appointment is reserved for this benefit. Refresh this page to see its details."}
            {status === "used" && "This billing cycle's Interior Refresh benefit has been used."}
            {status === "unavailable" && (promotion?.enabled ? "No eligible paid-cycle benefit is available." : "The promotion is not accepting new bookings. Existing appointments remain valid.")}
          </p>
        </div>
      )}
    </section>
  );
}