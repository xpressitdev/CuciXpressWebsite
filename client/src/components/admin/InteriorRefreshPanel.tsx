import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, Loader2, Settings2, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  InteriorRefreshAppointment,
  InteriorRefreshStatus,
} from "@/components/dashboard/types";

interface PromotionConfig {
  enabled: boolean;
  starts_on: string | null;
  ends_on: string | null;
  branch_id: number;
  branch_name: string;
  duration_minutes: number;
  capacity: number;
  opens_at: string;
  final_start_at: string;
}

interface UsageMetrics {
  totals: {
    bookings: number;
    checked_in: number;
    completed: number;
    cancellations: number;
    no_shows: number;
  };
  cycles: {
    paid_cycles: number;
    available: number;
    used: number;
    expired: number;
  };
}

const todayInBrunei = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Brunei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const actionLabels: Partial<Record<InteriorRefreshStatus, string>> = {
  checked_in: "Check in",
  completed: "Complete",
  cancelled: "Cancel",
  no_show: "No-show",
};

function appointmentTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Brunei",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function allowedActions(status: InteriorRefreshAppointment["status"]) {
  if (status === "booked") return ["checked_in", "cancelled", "no_show"] as const;
  if (status === "checked_in") return ["completed", "cancelled"] as const;
  return [] as const;
}

export function InteriorRefreshPanel({
  role,
}: {
  role: string;
}) {
  const owner = role === "owner";
  const accessQuery = useQuery<{
    can_manage: boolean;
    branch: { id: number; name: string };
  }>({
    queryKey: ["/api/staff/interior-refresh/access"],
  });
  const canManageSchedule = accessQuery.data?.can_manage === true;
  const branchName = accessQuery.data?.branch.name ?? "Tungku Link";

  return (
    <div className="space-y-4">
      {owner && <PromotionAdmin />}
      {canManageSchedule && <DailySchedule />}
      {!accessQuery.isLoading && !canManageSchedule && (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="p-4 text-sm text-gray-600">
            Interior Refresh appointments are managed at {branchName} only.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PromotionAdmin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<PromotionConfig | null>(null);

  const configQuery = useQuery<{ promotion: PromotionConfig }>({
    queryKey: ["/api/admin/interior-refresh/config"],
  });
  const config = draft ?? configQuery.data?.promotion ?? null;

  const metricsQuery = useQuery<UsageMetrics>({
    queryKey: ["/api/admin/interior-refresh/report"],
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!config) throw new Error("missing_config");
      const response = await apiRequest("PUT", "/api/admin/interior-refresh/config", {
        enabled: config.enabled,
        starts_on: config.starts_on || null,
        ends_on: config.ends_on || null,
      });
      return response.json();
    },
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/interior-refresh/config"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/interior-refresh/report"] });
      toast({ title: "Promotion settings saved" });
    },
    onError: () =>
      toast({
        title: "Could not save promotion",
        description: "Check that the end date is not before the start date.",
        variant: "destructive",
      }),
  });

  const metrics = metricsQuery.data;

  return (
    <Card className="border-2 border-purple-200" data-testid="panel-interior-refresh-admin">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-purple-600" />
          Interior Refresh promotion
          <Badge variant="outline" className="ml-auto">Owner only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {configQuery.isLoading || !config ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading promotion…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <div className="flex h-10 items-center gap-3">
              <Switch
                id="refresh-enabled"
                checked={config.enabled}
                onCheckedChange={(enabled) => setDraft({ ...config, enabled })}
              />
              <Label htmlFor="refresh-enabled" className="font-bold">
                {config.enabled ? "Accepting bookings" : "New bookings off"}
              </Label>
            </div>
            <div>
              <Label htmlFor="refresh-start">Optional start date</Label>
              <Input id="refresh-start" className="mt-1" type="date" value={config.starts_on ?? ""} onChange={(e) => setDraft({ ...config, starts_on: e.target.value || null })} />
            </div>
            <div>
              <Label htmlFor="refresh-end">Optional end date</Label>
              <Input id="refresh-end" className="mt-1" type="date" value={config.ends_on ?? ""} onChange={(e) => setDraft({ ...config, ends_on: e.target.value || null })} />
            </div>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !draft} data-testid="button-save-refresh-config">
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
        {config && (
          <p className="mt-3 text-xs text-gray-500">
            Server controlled: {config.branch_name}, {config.duration_minutes} minutes, capacity {config.capacity}, {config.opens_at}–{config.final_start_at} final start. Turning bookings off does not cancel confirmed appointments.
          </p>
        )}
        {metrics && (
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-9">
            {[
              ["Bookings", metrics.totals.bookings],
              ["Check-ins", metrics.totals.checked_in],
              ["Completed", metrics.totals.completed],
              ["Cancelled", metrics.totals.cancellations],
              ["No-shows", metrics.totals.no_shows],
              ["Paid cycles", metrics.cycles.paid_cycles],
              ["Available", metrics.cycles.available],
              ["Used", metrics.cycles.used],
              ["Expired", metrics.cycles.expired],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-gray-50 p-3">
                <p className="text-[10px] font-bold uppercase text-gray-500">{label}</p>
                <p className="text-xl font-black text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        )}
        {metricsQuery.isError && (
          <p className="mt-4 text-sm text-red-700">Promotion usage metrics could not be loaded.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DailySchedule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(todayInBrunei);

  const schedule = useQuery<{
    bookings: Array<{
      id: string;
      status: InteriorRefreshAppointment["status"];
      slot_start: string;
      slot_end: string;
      branch_name?: string;
      vehicle_id: number;
      license_plate: string;
      brand: string | null;
      model: string | null;
      first_name: string | null;
      last_name: string | null;
      phone_number: string | null;
    }>;
  }>({
    queryKey: ["/api/staff/interior-refresh/schedule", date],
    queryFn: async () => {
      const response = await fetch(
        `/api/staff/interior-refresh/schedule?date=${encodeURIComponent(date)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "checked_in" | "completed" | "cancelled" | "no_show";
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/staff/interior-refresh/bookings/${id}/status`,
        { status },
      );
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/staff/interior-refresh/schedule", date] });
      qc.invalidateQueries({ queryKey: ["/api/admin/interior-refresh/report"] });
      toast({ title: "Appointment updated" });
    },
    onError: () =>
      toast({
        title: "Could not update appointment",
        description: "Its status may have changed on another device. The schedule will refresh.",
        variant: "destructive",
      }),
  });

  const appointments: InteriorRefreshAppointment[] = (schedule.data?.bookings ?? []).map((booking) => ({
    id: booking.id,
    status: booking.status,
    starts_at: booking.slot_start,
    ends_at: booking.slot_end,
    branch_name: booking.branch_name ?? "Tungku Link",
    vehicle_id: booking.vehicle_id,
    vehicle_plate: booking.license_plate,
    vehicle_label: [booking.brand, booking.model].filter(Boolean).join(" ") || null,
    customer_name: [booking.first_name, booking.last_name].filter(Boolean).join(" ") || null,
    customer_phone: booking.phone_number,
  }));

  return (
    <Card data-testid="panel-interior-refresh-schedule">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><CalendarCheck2 className="h-5 w-5 text-cuci-primary" />Tungku Interior Refresh schedule</CardTitle>
          <Input aria-label="Schedule date" type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </CardHeader>
      <CardContent>
        {schedule.isLoading && <p className="text-sm text-gray-500">Loading schedule…</p>}
        {schedule.isError && <p className="text-sm text-red-700">The schedule could not be loaded.</p>}
        {!schedule.isLoading && !schedule.isError && appointments.length === 0 && (
          <div className="rounded-lg bg-gray-50 p-5 text-center text-sm text-gray-500">No Interior Refresh appointments for this date.</div>
        )}
        <div className="divide-y">
          {appointments.map((appointment) => (
            <div key={appointment.id} className="grid gap-3 py-4 md:grid-cols-[90px_1fr_auto] md:items-center">
              <p className="text-xl font-black">{appointmentTime(appointment.starts_at)}</p>
              <div>
                <p className="font-bold">{appointment.customer_name ?? "Subscriber"} · {appointment.vehicle_plate}</p>
                <p className="text-sm text-gray-500">
                  {appointment.vehicle_label ?? "Covered vehicle"}
                  {appointment.customer_phone ? ` · ${appointment.customer_phone}` : ""}
                </p>
                <Badge variant="outline" className="mt-1 capitalize">{appointment.status.replace("_", " ")}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {allowedActions(appointment.status).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={status === "checked_in" || status === "completed" ? "default" : "outline"}
                    disabled={update.isPending}
                    onClick={() => {
                      const destructive = status === "cancelled" || status === "no_show";
                      if (!destructive || window.confirm(`Mark this appointment ${actionLabels[status]?.toLowerCase()}?`)) {
                        update.mutate({ id: appointment.id, status });
                      }
                    }}
                    data-testid={`button-refresh-${status}-${appointment.id}`}
                  >
                    {actionLabels[status]}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-gray-500"><Sparkles className="h-3 w-3" />Check-in and no-show permanently consume the cycle benefit. Cancellation releases it unless already checked in.</p>
      </CardContent>
    </Card>
  );
}