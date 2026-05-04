import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Car as CarIcon, Loader2 } from "lucide-react";
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
}

const blank: FormState = { license_plate: "", brand: "", model: "", color: "" };

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

export function VehiclesTab({ cars }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(blank);

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
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        license_plate: form.license_plate.trim(),
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        color: form.color.trim() || null,
      };
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

  const canSave = form.license_plate.trim().length > 0 && !save.isPending;

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
                  "absolute top-3 left-3 text-[10px] uppercase font-bold px-2 py-0.5 rounded " +
                  (idx === 0
                    ? "bg-cuci-primary/10 text-cuci-primary"
                    : "bg-gray-100 text-gray-600")
                }
              >
                {idx === 0 ? "Default" : "Family"}
              </span>
              <button
                onClick={() => startEdit(c)}
                className="absolute top-3 right-3 p-1.5 rounded hover:bg-gray-100"
                data-testid={`button-edit-vehicle-${c.id}`}
                aria-label="Edit vehicle"
              >
                <Pencil className="w-4 h-4 text-gray-500" />
              </button>

              <div className="bg-gray-50 rounded-lg h-24 grid place-items-center mb-3 mt-6">
                <CarIcon className="w-12 h-12 text-gray-300" strokeWidth={1.5} />
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
                ? "Update the brand, model, or colour. The plate stays the same."
                : "Save a vehicle to your account so we can recognise it on arrival."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
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
