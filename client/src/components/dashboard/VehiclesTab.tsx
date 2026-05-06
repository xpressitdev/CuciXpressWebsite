import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Car as CarIcon, Loader2, Camera, X } from "lucide-react";
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
      // Only send photo_url if the user actually changed it — server
      // uses key presence to distinguish "leave alone" from "clear".
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl md:text-4xl font-black text-gray-900">
          My vehicles
        </h1>
        <Button
          onClick={startAdd}
          className="cuci-cta bg-cuci-primary hover:bg-cuci-primary text-white"
          data-testid="button-add-vehicle"
        >
          Add a car <Plus className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {cars.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <CarIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            No vehicles linked yet — add one or it'll appear after your first wash.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cars.map((c, idx) => (
            <article
              key={c.id}
              className="bg-white rounded-2xl border border-gray-200 p-4 relative"
              data-testid={`card-vehicle-${c.id}`}
            >
              <span
                className={
                  "absolute top-3 left-3 z-10 text-[10px] uppercase font-bold px-2 py-0.5 rounded " +
                  (idx === 0
                    ? "bg-cuci-primary/10 text-cuci-primary"
                    : "bg-gray-100 text-gray-600")
                }
              >
                {idx === 0 ? "Default" : "Family"}
              </span>
              <button
                onClick={() => startEdit(c)}
                className="absolute top-3 right-3 z-10 p-1.5 rounded bg-white/80 hover:bg-white shadow-sm"
                data-testid={`button-edit-vehicle-${c.id}`}
                aria-label="Edit vehicle"
              >
                <Pencil className="w-4 h-4 text-gray-500" />
              </button>

              <div className="bg-gray-50 rounded-lg h-32 overflow-hidden mb-3 mt-6">
                {c.photo_url ? (
                  <img
                    src={c.photo_url}
                    alt={c.license_plate}
                    className="w-full h-full object-cover"
                    data-testid={`img-vehicle-${c.id}`}
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center">
                    <CarIcon className="w-12 h-12 text-gray-300" strokeWidth={1.5} />
                  </div>
                )}
              </div>

              <p className="text-lg font-black tracking-wider text-gray-900">
                {c.license_plate}
              </p>
              <p className="text-sm text-gray-500">
                {[c.brand, c.model, c.color].filter(Boolean).join(" · ") || "—"}
              </p>

              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500">
                    Total washes
                  </p>
                  <p className="text-xl font-black text-cuci-primary">
                    {c.total_washes}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500">
                    Last washed
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {relativeAgo(c.last_seen_at)}
                  </p>
                </div>
              </div>
            </article>
          ))}
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
            {/* Photo uploader */}
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
