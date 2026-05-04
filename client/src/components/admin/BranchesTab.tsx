import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  MapPin, Plus, Pencil, Building2, Users, ShoppingBag, Save, ExternalLink,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface BranchRow {
  id: number;
  name: string;
  location: string;
  google_maps_url: string;
  google_maps_embed_url: string;
  review_url: string;
  is_open: boolean;
  queue_count: number;
  last_queue_update: string | null;
  staff_count: number;
  order_count: number;
}

interface BranchListResp {
  rows: BranchRow[];
}

interface BranchForm {
  name: string;
  location: string;
  google_maps_url: string;
  google_maps_embed_url: string;
  review_url: string;
  is_open: boolean;
}

const EMPTY_FORM: BranchForm = {
  name: "",
  location: "",
  google_maps_url: "",
  google_maps_embed_url: "",
  review_url: "",
  is_open: true,
};

export default function BranchesTab() {
  const { data, isLoading, error } = useQuery<BranchListResp>({
    queryKey: ["/api/admin/branches/full"],
  });

  const rows = data?.rows ?? [];
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="cuci-card border-2 border-black">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="cuci-eyebrow">Network</div>
              <CardTitle className="text-2xl font-extrabold tracking-tight">
                <span className="text-cuci-primary">Branches</span>
              </CardTitle>
              <p className="text-sm text-gray-600">
                Manage the five Cuci Xpress branches — name, address, map links, and open/closed state.
              </p>
            </div>
            <Button
              className="cuci-cta border-2 border-black"
              onClick={() => setCreating(true)}
              data-testid="button-new-branch"
            >
              <Plus className="w-4 h-4 mr-1" /> New branch
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600">Failed to load branches.</p>}
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-6 text-center">
              No branches yet. Click "New branch" to add one.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {rows.map((b) => (
                <div
                  key={b.id}
                  className={`border-2 border-black rounded-lg p-4 bg-white space-y-3 ${b.is_open ? "" : "opacity-70"}`}
                  data-testid={`branch-card-${b.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-extrabold text-lg tracking-tight flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-cuci-primary" />
                        {b.name}
                      </div>
                      <div className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{b.location}</span>
                      </div>
                    </div>
                    <Badge className={b.is_open ? "bg-green-600 text-white" : "bg-gray-400 text-white"}>
                      {b.is_open ? "Open" : "Closed"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
                      <Users className="w-3 h-3 text-gray-500" />
                      <span><strong>{b.staff_count}</strong> staff</span>
                    </div>
                    <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
                      <ShoppingBag className="w-3 h-3 text-gray-500" />
                      <span><strong>{b.order_count.toLocaleString()}</strong> orders</span>
                    </div>
                  </div>

                  <div className="flex gap-2 text-xs flex-wrap">
                    <a
                      href={b.google_maps_url}
                      target="_blank" rel="noopener noreferrer"
                      className="text-cuci-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Map
                    </a>
                    <a
                      href={b.review_url}
                      target="_blank" rel="noopener noreferrer"
                      className="text-cuci-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Reviews
                    </a>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-2 border-black"
                    onClick={() => setEditing(b)}
                    data-testid={`button-edit-branch-${b.id}`}
                  >
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editing && (
        <BranchEditDialog
          branch={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Create dialog */}
      {creating && (
        <BranchEditDialog
          branch={null}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function BranchEditDialog({
  branch,
  onClose,
}: {
  branch: BranchRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCreate = branch === null;
  const [form, setForm] = useState<BranchForm>(
    branch
      ? {
          name: branch.name,
          location: branch.location,
          google_maps_url: branch.google_maps_url,
          google_maps_embed_url: branch.google_maps_embed_url,
          review_url: branch.review_url,
          is_open: branch.is_open,
        }
      : EMPTY_FORM,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (isCreate) {
        return apiRequest("POST", "/api/admin/branches", form);
      }
      return apiRequest("PATCH", `/api/admin/branches/${branch!.id}`, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branches/full"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/branches"] });
      toast({ title: isCreate ? "Branch created" : "Branch updated" });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save",
        description: err?.message ?? "Check the form values",
        variant: "destructive",
      });
    },
  });

  const set = <K extends keyof BranchForm>(k: K, v: BranchForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid =
    form.name.trim().length > 0 &&
    form.location.trim().length > 0 &&
    /^https?:\/\//.test(form.google_maps_url) &&
    /^https?:\/\//.test(form.google_maps_embed_url) &&
    /^https?:\/\//.test(form.review_url);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {isCreate ? "New branch" : `Edit ${branch!.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Cuci Xpress Tungku Link"
              data-testid="input-branch-name"
            />
          </div>
          <div>
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="Spg 73-19, Jln Tungku, Brunei"
              data-testid="input-branch-location"
            />
          </div>
          <div>
            <Label>Google Maps URL</Label>
            <Input
              value={form.google_maps_url}
              onChange={(e) => set("google_maps_url", e.target.value)}
              placeholder="https://maps.app.goo.gl/…"
              data-testid="input-branch-maps"
            />
          </div>
          <div>
            <Label>Google Maps embed URL</Label>
            <Input
              value={form.google_maps_embed_url}
              onChange={(e) => set("google_maps_embed_url", e.target.value)}
              placeholder="https://www.google.com/maps/embed?pb=…"
              data-testid="input-branch-embed"
            />
            <p className="text-[10px] text-gray-500 mt-1">From "Share → Embed a map" in Google Maps.</p>
          </div>
          <div>
            <Label>Review URL</Label>
            <Input
              value={form.review_url}
              onChange={(e) => set("review_url", e.target.value)}
              placeholder="https://g.page/r/…/review"
              data-testid="input-branch-review"
            />
          </div>
          <div className="flex items-center justify-between border-2 border-black rounded p-3">
            <div>
              <Label className="text-base">Open today</Label>
              <p className="text-xs text-gray-500">Closed branches still keep their data; they just won't accept new orders.</p>
            </div>
            <Switch
              checked={form.is_open}
              onCheckedChange={(v) => set("is_open", v)}
              data-testid="switch-branch-open"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-2 border-black" onClick={onClose}>Cancel</Button>
          <Button
            className="cuci-cta border-2 border-black"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-save-branch"
          >
            <Save className="w-4 h-4 mr-1" />
            {save.isPending ? "Saving…" : isCreate ? "Create branch" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
