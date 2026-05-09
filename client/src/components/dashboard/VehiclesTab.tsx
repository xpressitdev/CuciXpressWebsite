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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CarRow } from "./types";

interface Props {
  cars: CarRow[];
}

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

export function VehiclesTab({ cars }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setForm(blank);
    setEditingId(null);
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
      toast({ title: editingId ? "Vehicle updated" : "Vehicle added" });
      setOpen(false);
      reset();
    },
    onError: (err: any) => {
      const msg =
        err.message === "duplicate_plate"
          ? "You already have a car with that plate."
          : err.message === "invalid_request"
            ? "Please fill in a valid license plate."
            : "Could not save vehicle.";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const canSave = form.license_plate.trim().length > 0 && !save.isPending && !photoBusy;

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
          <Link
            href="/checkout"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-orange-500 text-white rounded-xl font-black border-2 border-black shadow hover:translate-y-[-1px] transition-transform whitespace-nowrap"
            data-testid="button-nudge-book-wash"
          >
            <Droplet className="w-4 h-4" /> Book a wash
          </Link>
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
                    <button
                      onClick={() => startEdit(c)}
                      className="p-2 rounded-full bg-white/90 hover:bg-white text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 transition"
                      data-testid={`button-edit-vehicle-${c.id}`}
                      aria-label="Edit vehicle"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
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

                {/* Per-card "Book a wash" CTA appears only when the car is
                    overdue. Sits at the bottom so the gradient hero stays
                    clean, full-width on mobile, easy thumb target. */}
                {due && (
                  <Link
                    href="/checkout"
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-purple-600 to-orange-500 text-white text-sm font-black border-t-2 border-black hover:translate-y-[-1px] transition-transform"
                    data-testid={`button-card-book-${c.id}`}
                  >
                    <Droplet className="w-4 h-4" /> Book a wash
                  </Link>
                )}

                {/* Edit button (always visible on touch devices) */}
                <button
                  onClick={() => startEdit(c)}
                  className="md:hidden absolute top-3 right-3 p-2 rounded-full bg-white/90 text-gray-700 shadow-sm"
                  aria-label="Edit vehicle"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
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
    </div>
  );
}
