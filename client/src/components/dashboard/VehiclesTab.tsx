import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Pencil,
  Plus,
  Car as CarIcon,
  Loader2,
  Camera,
  X,
  Sparkles,
  CalendarClock,
  Star,
  Droplet,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CarRow, MembershipRow } from "./types";
import { MembershipWashQrDialog, type MembershipVoucher } from "./MembershipWashQrDialog";

interface Props {
  cars: CarRow[];
  memberships: MembershipRow[];
}

// Normalise a plate for loose matching (uppercase, alphanumerics only) so
// "BAP 4455" and "bap4455" line up with a membership's stored plate.
const normPlate = (p: string | null | undefined) =>
  (p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

interface FormState {
  license_plate: string;
  brand: string;
  model: string;
  color: string;
  photo_url: string | null;
  photo_touched: boolean;
}

const blank: FormState = {
  license_plate: "",
  brand: "",
  model: "",
  color: "",
  photo_url: null,
  photo_touched: false,
};

const relativeAgo = (iso: string | null) => {
  if (!iso) return "Never washed";
  const ms = Date.now() - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(ms / day);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? "" : "s"} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? "" : "s"} ago`;
};

// Map a colour name → tailwind gradient backdrop for the card.
function carGradient(color: string | null, idx: number): string {
  const c = (color ?? "").toLowerCase();
  if (/black|dark|charcoal/.test(c)) return "from-slate-800 via-slate-700 to-slate-900";
  if (/white|pearl|silver|grey|gray/.test(c)) return "from-slate-300 via-slate-200 to-slate-400";
  if (/red|maroon|crimson/.test(c)) return "from-rose-500 via-red-500 to-rose-700";
  if (/blue|navy|teal/.test(c)) return "from-sky-500 via-blue-500 to-indigo-700";
  if (/green|emerald|lime/.test(c)) return "from-emerald-500 via-green-500 to-teal-700";
  if (/yellow|gold|amber/.test(c)) return "from-amber-400 via-orange-400 to-yellow-600";
  if (/orange/.test(c)) return "from-orange-400 via-orange-500 to-red-500";
  if (/purple|violet|magenta/.test(c)) return "from-purple-500 via-violet-500 to-fuchsia-600";
  // fallback rotates through the brand palette
  const fallbacks = [
    "from-purple-600 via-violet-500 to-orange-500",
    "from-indigo-600 via-purple-500 to-pink-500",
    "from-amber-500 via-orange-500 to-rose-500",
  ];
  return fallbacks[idx % fallbacks.length];
}

// Browser-side resize + JPEG compress so the photo arrives at the
// server around ~100-200KB even from a 12MP phone camera. Keeps the
// orders/cars table from bloating and the data URL well under the
// 2.8MB cap on the server zod schema.
async function fileToCompressedDataUrl(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode_failed"));
    i.src = dataUrl;
  });
  const MAX = 900;
  const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unsupported");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function VehiclesTab({ cars, memberships }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [confirmingCar, setConfirmingCar] = useState<CarRow | null>(null);
  const [disputePlate, setDisputePlate] = useState<string | null>(null);
  // Counter-sold Unlimited pass claim: the server asks for the phone
  // number given at the till (409 phone_match_required) before handing
  // over a walk-in-held plate.
  const [needClaimPhone, setNeedClaimPhone] = useState(false);
  const [claimPhone, setClaimPhone] = useState("");
  const [claimPhoneError, setClaimPhoneError] = useState(false);
  const [qrVoucher, setQrVoucher] = useState<MembershipVoucher | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Active Unlimited memberships, indexed by the vehicle they cover (by id
  // and by normalised plate) so we can tell which garage cards get a free
  // wash instead of the pay-and-queue CTA.
  const unlimitedVehicleIds = new Set<number>();
  const unlimitedPlates = new Set<string>();
  for (const m of memberships) {
    if (m.status === "active" && m.kind === "unlimited") {
      if (m.vehicle_id != null) unlimitedVehicleIds.add(m.vehicle_id);
      if (m.vehicle_plate) unlimitedPlates.add(normPlate(m.vehicle_plate));
    }
  }
  const isUnlimitedCar = (c: CarRow): boolean =>
    unlimitedVehicleIds.has(c.id) || unlimitedPlates.has(normPlate(c.license_plate));

  // Generate the free Unlimited wash QR (same flow as the Overview tab):
  // the server resolves the customer's active Unlimited membership and
  // returns a B$0 voucher to show staff at the lane.
  const checkin = useMutation({
    mutationFn: async (vehicleId: number) => {
      const r = await apiRequest("POST", "/api/customer/membership/checkin", {
        vehicle_id: vehicleId,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "checkin_failed");
      return j as { ok: true; voucher: MembershipVoucher };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/customer/orders"] });
      setQrVoucher(data.voucher);
    },
    onError: (e: any) => {
      toast({
        title: "Could not create wash QR",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const reset = () => {
    setForm(blank);
    setEditingId(null);
    setNeedClaimPhone(false);
    setClaimPhone("");
    setClaimPhoneError(false);
  };

  const startAdd = () => {
    reset();
    setOpen(true);
  };
  const startEdit = (c: CarRow) => {
    setEditingId(c.id);
    setForm({
      license_plate: c.license_plate,
      brand: c.brand ?? "",
      model: c.model ?? "",
      color: c.color ?? "",
      photo_url: c.photo_url ?? null,
      photo_touched: false,
    });
    setOpen(true);
  };

  const onPickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image file", variant: "destructive" });
      return;
    }
    setPhotoBusy(true);
    try {
      const compressed = await fileToCompressedDataUrl(file);
      setForm((f) => ({ ...f, photo_url: compressed, photo_touched: true }));
    } catch {
      toast({ title: "Could not read that image", variant: "destructive" });
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clearPhoto = () => {
    setForm((f) => ({ ...f, photo_url: null, photo_touched: true }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        license_plate: form.license_plate.trim(),
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        color: form.color.trim() || null,
      };
      if (form.photo_touched) body.photo_url = form.photo_url;
      if (!editingId && claimPhone.trim()) body.phone = claimPhone.trim();
      const r = editingId
        ? await apiRequest("PATCH", `/api/customer/cars/${editingId}`, body)
        : await apiRequest("POST", "/api/customer/cars", body);
      const data = await r.json();
      if (!r.ok || !data.ok) {
        throw new Error(data.reason ?? "save_failed");
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customer/cars"] });
      qc.invalidateQueries({ queryKey: ["/api/customer/memberships"] });
      toast({ title: editingId ? "Vehicle updated" : "Vehicle added" });
      setOpen(false);
      reset();
    },
    onError: (err: any) => {
      // apiRequest throws non-2xx as `Error("STATUS: body")`. Parse out
      // the body so we can read `reason` + `plate`.
      const text = String(err?.message ?? "");
      let reason = text;
      let claimedPlate: string | null = null;
      const jsonStart = text.indexOf("{");
      if (jsonStart >= 0) {
        try {
          const body = JSON.parse(text.slice(jsonStart));
          if (body?.reason) reason = body.reason;
          if (body?.plate) claimedPlate = body.plate;
        } catch {
          /* fall through with raw text */
        }
      }
      if (reason === "phone_match_required") {
        // Plate was sold an Unlimited pass at the counter — verify with
        // the phone number the buyer gave the cashier.
        setNeedClaimPhone(true);
        setClaimPhoneError(false);
        return;
      }
      if (reason === "phone_mismatch") {
        setNeedClaimPhone(true);
        setClaimPhoneError(true);
        return;
      }
      if (reason === "too_many_attempts") {
        toast({
          title: "Too many tries",
          description:
            "Please wait 15 minutes before trying again, or contact us on WhatsApp.",
          variant: "destructive",
        });
        return;
      }
      if (reason === "plate_claimed") {
        setDisputePlate(claimedPlate ?? form.license_plate.trim().toUpperCase());
        return;
      }
      const msg =
        reason === "duplicate_plate"
          ? "You already have a car with that plate."
          : reason === "invalid_request"
            ? "Please fill in a valid license plate."
            : "Could not save vehicle.";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const canSave = form.license_plate.trim().length > 0 && !save.isPending && !photoBusy;

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiRequest("DELETE", `/api/customer/cars/${id}`, undefined);
      const data = await r.json();
      if (!data.ok) throw new Error(data.reason ?? "delete_failed");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/customer/cars"] });
      toast({ title: "Vehicle removed" });
    },
    onError: (err: any) => {
      // apiRequest throws non-2xx as `Error("STATUS: body")`, so match on
      // substring rather than equality.
      const text = String(err?.message ?? "");
      const msg = text.includes("membership_attached")
        ? "This car has an active subscription. Cancel it first."
        : "Could not remove vehicle.";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const confirmRemove = (c: CarRow) => {
    setConfirmingCar(c);
  };

  // Find the most-washed car for the "favourite ride" badge
  const favoriteId = cars.length
    ? [...cars].sort((a, b) => b.total_washes - a.total_washes)[0].id
    : null;

  // Service-nudge logic: a car "needs a wash" when it's been seen at
  // least once but not in the last 14 days. Brand-new cars (total_washes
  // === 0) get a softer "ready for first wash" tone instead.
  const NUDGE_DAYS = 14;
  const daysSince = (iso: string | null): number => {
    if (!iso) return Number.POSITIVE_INFINITY;
    return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  };
  // A car needs a wash when we've actually seen it before (last_seen_at
  // set) and it's been ≥ NUDGE_DAYS since. We intentionally don't gate on
  // total_washes here because last_seen_at is the truthful "was on a
  // forecourt" signal — total_washes only counts paid orders for *this*
  // customer, so a freshly-linked car would otherwise never trigger.
  const needsWash = (c: CarRow): boolean =>
    c.last_seen_at != null && daysSince(c.last_seen_at) >= NUDGE_DAYS;
  // Most-overdue car (used for the top alert banner).
  const overdue = [...cars]
    .filter(needsWash)
    .sort((a, b) => daysSince(b.last_seen_at) - daysSince(a.last_seen_at))[0];
  const overdueCount = cars.filter(needsWash).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-gray-900">
            My garage
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {cars.length} vehicle{cars.length === 1 ? "" : "s"} linked to your account
          </p>
        </div>
        <Button
          onClick={startAdd}
          className="bg-gradient-to-r from-purple-600 to-orange-500 hover:opacity-90 text-white shadow-lg"
          data-testid="button-add-vehicle"
        >
          <Plus className="w-4 h-4 mr-1" /> Add a car
        </Button>
      </div>

      {/* Service nudge — only shown when at least one car is overdue. */}
      {overdue && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3"
          data-testid="banner-service-nudge"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-200 grid place-items-center shrink-0">
              <AlertCircle className="w-5 h-5 text-amber-800" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest font-bold text-amber-700">
                Time for a wash
              </p>
              <p className="text-sm md:text-base font-extrabold text-gray-900 mt-0.5">
                <span className="font-mono tracking-wider">{overdue.license_plate}</span>{" "}
                hasn't been washed in {daysSince(overdue.last_seen_at)} days
                {overdueCount > 1 && (
                  <span className="text-gray-500 font-semibold">
                    {" "}· +{overdueCount - 1} other{overdueCount - 1 === 1 ? "" : "s"} due
                  </span>
                )}
              </p>
            </div>
          </div>
          {isUnlimitedCar(overdue) ? (
            <button
              type="button"
              onClick={() => checkin.mutate(overdue.id)}
              disabled={checkin.isPending}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-xl font-black border-2 border-black shadow hover:translate-y-[-1px] transition-transform whitespace-nowrap disabled:opacity-60"
              data-testid="button-nudge-free-wash"
            >
              {checkin.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Free wash
            </button>
          ) : (
            <Link
              href={`/checkout?plate=${encodeURIComponent(overdue.license_plate)}`}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-orange-500 text-white rounded-xl font-black border-2 border-black shadow hover:translate-y-[-1px] transition-transform whitespace-nowrap"
              data-testid="button-nudge-book-wash"
            >
              <Droplet className="w-4 h-4" /> Pay & Queue Now
            </Link>
          )}
        </motion.div>
      )}

      {cars.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-100 to-orange-100 grid place-items-center mb-4">
            <CarIcon className="w-8 h-8 text-purple-500" strokeWidth={1.5} />
          </div>
          <p className="text-base font-bold text-gray-700 mb-1">
            Your garage is empty
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Add a vehicle so we can recognise you on arrival.
          </p>
          <Button
            onClick={startAdd}
            className="bg-gradient-to-r from-purple-600 to-orange-500 text-white"
          >
            Add your first car
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {cars.map((c, idx) => {
            const grad = carGradient(c.color, idx);
            const isFav = c.id === favoriteId && c.total_washes > 0;
            const due = needsWash(c);
            const unlimited = isUnlimitedCar(c);
            const ageDays = daysSince(c.last_seen_at);
            return (
              <motion.article
                key={c.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                whileHover={{ y: -4 }}
                className="group relative rounded-3xl overflow-hidden bg-white border border-gray-200 shadow-sm hover:shadow-xl transition"
                data-testid={`card-vehicle-${c.id}`}
              >
                {/* Photo / gradient hero */}
                <div className={`relative h-44 bg-gradient-to-br ${grad}`}>
                  {/* shimmer */}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_60%)]" />
                  {c.photo_url && (
                    <img
                      src={c.photo_url}
                      alt={c.license_plate}
                      className="absolute inset-0 w-full h-full object-cover"
                      data-testid={`img-vehicle-${c.id}`}
                    />
                  )}
                  {/* gradient veil for legibility */}
                  <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

                  {/* badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-start justify-between">
                    <div className="flex flex-col gap-1.5 items-start">
                      {idx === 0 && (
                        <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-white/90 text-purple-700 backdrop-blur">
                          Default
                        </span>
                      )}
                      {isFav && (
                        <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-amber-400 text-amber-900 inline-flex items-center gap-1">
                          <Star className="w-3 h-3 fill-current" /> Favourite
                        </span>
                      )}
                      {due && (
                        <span
                          className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-rose-500 text-white inline-flex items-center gap-1 animate-pulse"
                          data-testid={`badge-needs-wash-${c.id}`}
                        >
                          <AlertCircle className="w-3 h-3" /> {ageDays}d due
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => startEdit(c)}
                        className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 transition"
                        data-testid={`button-edit-vehicle-${c.id}`}
                        aria-label="Edit vehicle"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => confirmRemove(c)}
                        disabled={remove.isPending}
                        className="p-2 rounded-full bg-white/90 hover:bg-rose-50 text-rose-600 shadow-sm opacity-0 group-hover:opacity-100 transition disabled:opacity-50"
                        data-testid={`button-delete-vehicle-${c.id}`}
                        aria-label="Remove vehicle"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* plate + name overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-white/70">
                      License plate
                    </p>
                    <p className="text-2xl font-black tracking-wider drop-shadow">
                      {c.license_plate}
                    </p>
                    <p className="text-xs text-white/90 mt-0.5 truncate">
                      {[c.brand, c.model, c.color].filter(Boolean).join(" · ") || "Untitled vehicle"}
                    </p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 divide-x divide-gray-100">
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-400 inline-flex items-center gap-1 justify-center">
                      <Sparkles className="w-3 h-3" /> Washes
                    </p>
                    <p className="text-2xl font-black bg-gradient-to-r from-purple-600 to-orange-500 bg-clip-text text-transparent leading-none mt-1">
                      {c.total_washes}
                    </p>
                  </div>
                  <div className="px-4 py-3 text-center">
                    <p className="text-[10px] uppercase font-bold text-gray-400 inline-flex items-center gap-1 justify-center">
                      <CalendarClock className="w-3 h-3" /> Last seen
                    </p>
                    <p
                      className={
                        "text-sm font-black leading-none mt-1.5 " +
                        (due ? "text-rose-600" : "text-gray-900")
                      }
                    >
                      {relativeAgo(c.last_seen_at)}
                    </p>
                  </div>
                </div>

                {/* Bottom CTA. Unlimited members get a free-wash button
                    (generates the membership QR — no payment) and it always
                    shows, since their wash is covered any time. Everyone else
                    only sees "Pay & Queue Now" once the car is overdue. */}
                {unlimited ? (
                  <button
                    type="button"
                    onClick={() => checkin.mutate(c.id)}
                    disabled={checkin.isPending}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-black border-t-2 border-black hover:translate-y-[-1px] transition-transform disabled:opacity-60"
                    data-testid={`button-card-free-wash-${c.id}`}
                  >
                    {checkin.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Free wash
                  </button>
                ) : (
                  due && (
                    <Link
                      href={`/checkout?plate=${encodeURIComponent(c.license_plate)}`}
                      className="flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-purple-600 to-orange-500 text-white text-sm font-black border-t-2 border-black hover:translate-y-[-1px] transition-transform"
                      data-testid={`button-card-book-${c.id}`}
                    >
                      <Droplet className="w-4 h-4" /> Pay & Queue Now
                    </Link>
                  )
                )}

                {/* Edit + Delete buttons (always visible on touch devices) */}
                <div className="md:hidden absolute top-3 right-3 flex items-center gap-1.5">
                  <button
                    onClick={() => startEdit(c)}
                    className="p-2 rounded-full bg-white/90 text-gray-700 shadow-sm"
                    aria-label="Edit vehicle"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => confirmRemove(c)}
                    disabled={remove.isPending}
                    className="p-2 rounded-full bg-white/90 text-rose-600 shadow-sm disabled:opacity-50"
                    data-testid={`button-delete-vehicle-mobile-${c.id}`}
                    aria-label="Remove vehicle"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : (setOpen(false), reset()))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit vehicle" : "Add a vehicle"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the brand, model, colour or photo. The plate stays the same."
                : "Save a vehicle to your account so we can recognise it on arrival."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label>Photo</Label>
              <div className="mt-1 flex items-center gap-3">
                <div className="w-24 h-24 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden grid place-items-center shrink-0">
                  {photoBusy ? (
                    <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                  ) : form.photo_url ? (
                    <img
                      src={form.photo_url}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      data-testid="img-vehicle-preview"
                    />
                  ) : (
                    <CarIcon className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickPhoto(e.target.files?.[0])}
                    data-testid="input-vehicle-photo"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={photoBusy}
                    data-testid="button-upload-vehicle-photo"
                  >
                    <Camera className="w-4 h-4 mr-1.5" />
                    {form.photo_url ? "Change photo" : "Upload photo"}
                  </Button>
                  {form.photo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearPhoto}
                      className="text-red-600 hover:text-red-700"
                      data-testid="button-remove-vehicle-photo"
                    >
                      <X className="w-4 h-4 mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="vh-plate">License plate</Label>
              <Input
                id="vh-plate"
                placeholder="KB 2891"
                value={form.license_plate}
                onChange={(e) => setForm({ ...form, license_plate: e.target.value })}
                disabled={!!editingId}
                data-testid="input-vehicle-plate"
              />
              {editingId && (
                <p className="text-[11px] text-gray-500 mt-1">
                  The plate links your vehicle to past washes — it can't be changed.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="vh-brand">Brand</Label>
                <Input
                  id="vh-brand"
                  placeholder="Toyota"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  data-testid="input-vehicle-brand"
                />
              </div>
              <div>
                <Label htmlFor="vh-model">Model</Label>
                <Input
                  id="vh-model"
                  placeholder="Hilux"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  data-testid="input-vehicle-model"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="vh-color">Colour</Label>
              <Input
                id="vh-color"
                placeholder="Pearl White"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                data-testid="input-vehicle-color"
              />
            </div>
            {needClaimPhone && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <Label htmlFor="vh-claim-phone" className="text-amber-900">
                  Verify it's your car
                </Label>
                <p className="text-[11px] text-amber-800 mt-0.5 mb-2">
                  This plate has a pass bought at our counter. Enter the phone
                  number you gave the cashier to link it to your account.
                </p>
                <Input
                  id="vh-claim-phone"
                  type="tel"
                  placeholder="e.g. 8123456"
                  value={claimPhone}
                  onChange={(e) => {
                    setClaimPhone(e.target.value);
                    setClaimPhoneError(false);
                  }}
                  data-testid="input-claim-phone"
                />
                {claimPhoneError && (
                  <p className="text-[11px] text-red-600 mt-1">
                    That phone number doesn't match our records. Check it, or
                    contact us on WhatsApp for help.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={!canSave}
              data-testid="button-save-vehicle"
            >
              {save.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              {editingId ? "Save changes" : "Add vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmingCar}
        onOpenChange={(v) => {
          if (!v) setConfirmingCar(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-delete-vehicle">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {confirmingCar?.license_plate} from your garage?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Your account is currently linked to{" "}
                  <span className="font-mono font-bold tracking-wider">
                    {confirmingCar?.license_plate}
                  </span>
                  {confirmingCar?.brand
                    ? ` (${confirmingCar.brand}${confirmingCar.model ? " " + confirmingCar.model : ""})`
                    : ""}
                  .
                </p>
                <p className="font-semibold text-rose-700">
                  If you remove it, your account will no longer be linked to this
                  vehicle and you won't be able to see its wash history on your
                  dashboard.
                </p>
                <p className="text-gray-500">
                  You can always add it back later by entering the plate again.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-vehicle">
              Keep vehicle
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white"
              data-testid="button-confirm-delete-vehicle"
              onClick={() => {
                if (confirmingCar) {
                  remove.mutate(confirmingCar.id);
                  setConfirmingCar(null);
                }
              }}
            >
              Yes, remove it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!disputePlate}
        onOpenChange={(v) => {
          if (!v) setDisputePlate(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-plate-claimed">
          <AlertDialogHeader>
            <AlertDialogTitle>This vehicle is already claimed</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Plate{" "}
                  <span className="font-mono font-bold tracking-wider">
                    {disputePlate}
                  </span>{" "}
                  is already linked to another Cuci Xpress account, so we can't
                  add it to your garage.
                </p>
                <p className="text-gray-600">
                  If this vehicle is actually yours, tap the button below to
                  message us on WhatsApp and our team will sort it out.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-dispute-cancel">
              Close
            </AlertDialogCancel>
            <a
              href={`https://wa.me/6738387000?text=${encodeURIComponent(
                `Hi Cuci Xpress, this vehicle plate ${disputePlate ?? ""} is mine, please assist to rectify.`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setDisputePlate(null)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm"
              data-testid="button-dispute-whatsapp"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 fill-current"
                aria-hidden
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.15-.174.2-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
              </svg>
              Dispute on WhatsApp
            </a>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {qrVoucher && (
        <MembershipWashQrDialog
          open={!!qrVoucher}
          onClose={() => setQrVoucher(null)}
          voucher={qrVoucher}
        />
      )}
    </div>
  );
}
