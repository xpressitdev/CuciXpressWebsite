import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tags, Plus, Pencil, Save, Trash2, Package, EyeOff,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES_KEY = ["/api/admin/catalog/categories"];

const formatBND = (cents: number) => `B$${(cents / 100).toFixed(2)}`;

interface CategoryRow {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  package_count: number;
}

interface CategoryListResp {
  rows: CategoryRow[];
}

interface CategoryForm {
  name: string;
  sort_order: number;
  is_active: boolean;
}

const EMPTY_FORM: CategoryForm = {
  name: "",
  sort_order: 0,
  is_active: true,
};

export default function CategoriesSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<CategoryListResp>({
    queryKey: CATEGORIES_KEY,
  });

  const rows = data?.rows ?? [];
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = useMutation({
    mutationFn: async ({ id, force }: { id: string; force: boolean }) => {
      const url = force
        ? `/api/admin/catalog/categories/${id}?force=1`
        : `/api/admin/catalog/categories/${id}`;
      return apiRequest("DELETE", url);
    },
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      toast({
        title: vars.force ? "Category deleted" : "Category deactivated",
      });
    },
    onError: (err: any) => {
      const msg = err?.message ?? "";
      if (msg.startsWith("409")) {
        toast({
          title: "Can't delete this category",
          description: "It's still in use. Deactivate it instead.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Failed to delete",
        description: msg || "Please try again",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="cuci-card border-2 border-black">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="cuci-eyebrow">Catalog</div>
            <CardTitle className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <Tags className="w-5 h-5 text-cuci-primary" />
              <span className="text-cuci-primary">Categories</span>
            </CardTitle>
            <p className="text-sm text-gray-600">
              Group POS products. A category with packages can only be deactivated — delete it after moving its packages elsewhere.
            </p>
          </div>
          <Button
            size="sm"
            className="cuci-cta border-2 border-black"
            onClick={() => setCreating(true)}
            data-testid="button-new-category"
          >
            <Plus className="w-4 h-4 mr-1" /> New category
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-red-600">Failed to load categories.</p>}
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-6 text-center">
            No categories yet. Click "New category" to add one.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((c) => (
              <div
                key={c.id}
                className={`border-2 border-black rounded-lg p-3 bg-white flex items-center justify-between gap-3 flex-wrap ${c.is_active ? "" : "opacity-70"}`}
                data-testid={`category-row-${c.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-extrabold tracking-tight truncate">{c.name}</span>
                  <Badge
                    variant="outline"
                    className="border-2 border-black text-xs flex items-center gap-1"
                  >
                    <Package className="w-3 h-3" /> {c.package_count}
                  </Badge>
                  <Badge className={c.is_active ? "bg-green-600 text-white" : "bg-gray-400 text-white"}>
                    {c.is_active ? "Active" : "Hidden"}
                  </Badge>
                  <span className="text-xs text-gray-500">#{c.sort_order}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-2 border-black"
                    onClick={() => setEditing(c)}
                    data-testid={`button-edit-category-${c.id}`}
                  >
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  {c.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-2 border-black"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ id: c.id, force: false })}
                      data-testid={`button-deactivate-category-${c.id}`}
                    >
                      <EyeOff className="w-3 h-3 mr-1" /> Deactivate
                    </Button>
                  )}
                  {/* Hard delete is only offered when no packages reference this
                      category — matches the server's in-use protection. While
                      packages are assigned, the owner must deactivate instead. */}
                  {c.package_count === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-2 border-black text-red-600 hover:text-red-700"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`Permanently delete "${c.name}"?`)) {
                          remove.mutate({ id: c.id, force: true });
                        }
                      }}
                      data-testid={`button-delete-category-${c.id}`}
                    >
                      <Trash2 className="w-3 h-3 mr-1" /> Delete
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {editing && (
        <CategoryEditDialog category={editing} onClose={() => setEditing(null)} />
      )}
      {creating && (
        <CategoryEditDialog category={null} onClose={() => setCreating(false)} />
      )}
    </Card>
  );
}

function CategoryEditDialog({
  category,
  onClose,
}: {
  category: CategoryRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCreate = category === null;
  const [form, setForm] = useState<CategoryForm>(
    category
      ? {
          name: category.name,
          sort_order: category.sort_order,
          is_active: category.is_active,
        }
      : EMPTY_FORM,
  );

  const save = useMutation({
    mutationFn: async () => {
      if (isCreate) {
        return apiRequest("POST", "/api/admin/catalog/categories", form);
      }
      return apiRequest("PATCH", `/api/admin/catalog/categories/${category!.id}`, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });
      toast({ title: isCreate ? "Category created" : "Category updated" });
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

  const set = <K extends keyof CategoryForm>(k: K, v: CategoryForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.name.trim().length > 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {isCreate ? "New category" : `Edit ${category!.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Premium Wash"
              data-testid="input-category-name"
            />
          </div>
          <div>
            <Label>Sort order</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => set("sort_order", Number(e.target.value) || 0)}
              placeholder="0"
              data-testid="input-category-sort-order"
            />
            <p className="text-[10px] text-gray-500 mt-1">Lower numbers appear first in the POS grid.</p>
          </div>
          <div className="flex items-center justify-between border-2 border-black rounded p-3">
            <div>
              <Label className="text-base">Active</Label>
              <p className="text-xs text-gray-500">Hidden categories stay saved; they just won't show in the POS grid.</p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={(v) => set("is_active", v)}
              data-testid="switch-category-active"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="border-2 border-black"
            onClick={onClose}
            data-testid="button-cancel-category"
          >
            Cancel
          </Button>
          <Button
            className="cuci-cta border-2 border-black"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-save-category"
          >
            <Save className="w-4 h-4 mr-1" />
            {save.isPending ? "Saving…" : isCreate ? "Create category" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
