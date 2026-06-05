import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Users, Plus, Pencil, Save, Mail, Building2, ShoppingBag, UserX, Trash2, ShieldCheck,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Role = "owner" | "manager" | "lane" | "cashier";

interface StaffRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  branch_id: number | null;
  is_active: boolean;
  created_at: string;
  branch_name: string | null;
  order_count: number;
}

interface StaffListResp {
  rows: StaffRow[];
}

interface BranchRow {
  id: number;
  name: string;
  location: string;
}

interface BranchListResp {
  rows: BranchRow[];
}

const ROLES: Role[] = ["owner", "manager", "lane", "cashier"];

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  lane: "Lane",
  cashier: "Cashier",
};

const ROLE_BADGE: Record<Role, string> = {
  owner: "bg-purple-600 text-white",
  manager: "bg-blue-600 text-white",
  lane: "bg-amber-600 text-white",
  cashier: "bg-teal-600 text-white",
};

const formatBND = (cents: number) => `B$${(cents / 100).toFixed(2)}`;

const ERROR_MESSAGES: Record<string, string> = {
  email_taken: "That email is already in use by another staff account.",
  branch_required_for_role: "Non-owner roles must be assigned to a branch.",
  weak_password: "Password must be at least 12 characters.",
  last_owner: "You can't demote, deactivate, or delete the only owner.",
  cannot_deactivate_self: "You can't deactivate your own account.",
  cannot_delete_self: "You can't delete your own account.",
  in_use: "This staff member has rung up orders and can't be hard-deleted. Deactivate them instead.",
};

function friendlyError(err: any): string {
  const raw: string = err?.message ?? "";
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (raw.includes(code)) return ERROR_MESSAGES[code];
  }
  return raw || "Something went wrong. Please try again.";
}

export default function StaffTab() {
  const { data, isLoading, error } = useQuery<StaffListResp>({
    queryKey: ["/api/admin/staff"],
  });

  const rows = data?.rows ?? [];
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="cuci-card border-2 border-black">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="cuci-eyebrow">Access</div>
              <CardTitle className="text-2xl font-extrabold tracking-tight">
                <span className="text-cuci-primary">Staff</span>
              </CardTitle>
              <p className="text-sm text-gray-600">
                Manage staff accounts — owners, managers, lane crew, and cashiers.
              </p>
            </div>
            <Button
              className="cuci-cta border-2 border-black"
              onClick={() => setCreating(true)}
              data-testid="button-new-staff"
            >
              <Plus className="w-4 h-4 mr-1" /> New staff
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-red-600">Failed to load staff.</p>}
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500 italic py-6 text-center">
              No staff yet. Click "New staff" to add one.
            </p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {rows.map((s) => (
                <StaffCard
                  key={s.id}
                  staff={s}
                  onEdit={() => setEditing(s)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <StaffEditDialog staff={editing} onClose={() => setEditing(null)} />
      )}

      {creating && (
        <StaffEditDialog staff={null} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function StaffCard({ staff, onEdit }: { staff: StaffRow; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deactivate = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/admin/staff/${staff.id}`, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff"] });
      toast({ title: "Staff deactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't deactivate", description: friendlyError(err), variant: "destructive" });
    },
  });

  const reactivate = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/admin/staff/${staff.id}`, { is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff"] });
      toast({ title: "Staff reactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't reactivate", description: friendlyError(err), variant: "destructive" });
    },
  });

  const hardDelete = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", `/api/admin/staff/${staff.id}?force=1`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff"] });
      toast({ title: "Staff deleted" });
      setConfirmDelete(false);
    },
    onError: (err: any) => {
      toast({ title: "Couldn't delete", description: friendlyError(err), variant: "destructive" });
      setConfirmDelete(false);
    },
  });

  const canHardDelete = staff.order_count === 0;

  return (
    <div
      className={`border-2 border-black rounded-lg p-4 bg-white space-y-3 ${staff.is_active ? "" : "opacity-70"}`}
      data-testid={`staff-card-${staff.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-extrabold text-lg tracking-tight flex items-center gap-2">
            {staff.role === "owner" ? (
              <ShieldCheck className="w-4 h-4 text-cuci-primary" />
            ) : (
              <Users className="w-4 h-4 text-cuci-primary" />
            )}
            <span className="truncate">{staff.name}</span>
          </div>
          <div className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
            <Mail className="w-3 h-3" />
            <span className="truncate">{staff.email}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge className={ROLE_BADGE[staff.role]}>{ROLE_LABEL[staff.role]}</Badge>
          <Badge className={staff.is_active ? "bg-green-600 text-white" : "bg-gray-400 text-white"}>
            {staff.is_active ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
          <Building2 className="w-3 h-3 text-gray-500" />
          <span className="truncate">{staff.branch_name ?? "All branches"}</span>
        </div>
        <div className="border border-gray-200 rounded p-2 flex items-center gap-2">
          <ShoppingBag className="w-3 h-3 text-gray-500" />
          <span><strong>{staff.order_count.toLocaleString()}</strong> orders</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-2 border-black"
          onClick={onEdit}
          data-testid={`button-edit-staff-${staff.id}`}
        >
          <Pencil className="w-3 h-3 mr-1" /> Edit
        </Button>
        {staff.is_active ? (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-2 border-black"
            disabled={deactivate.isPending}
            onClick={() => deactivate.mutate()}
            data-testid={`button-deactivate-staff-${staff.id}`}
          >
            <UserX className="w-3 h-3 mr-1" /> Deactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-2 border-black"
            disabled={reactivate.isPending}
            onClick={() => reactivate.mutate()}
            data-testid={`button-reactivate-staff-${staff.id}`}
          >
            <ShieldCheck className="w-3 h-3 mr-1" /> Reactivate
          </Button>
        )}
      </div>

      <Button
        size="sm"
        variant="outline"
        className="w-full border-2 border-black text-red-600 hover:text-red-700"
        disabled={!canHardDelete}
        onClick={() => setConfirmDelete(true)}
        data-testid={`button-delete-staff-${staff.id}`}
      >
        <Trash2 className="w-3 h-3 mr-1" />
        {canHardDelete ? "Delete permanently" : "Has orders — can't delete"}
      </Button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {staff.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the staff account. This can only be done for staff who have
              never rung up an order. To keep records, deactivate them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid={`button-cancel-delete-staff-${staff.id}`}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={hardDelete.isPending}
              onClick={(e) => { e.preventDefault(); hardDelete.mutate(); }}
              data-testid={`button-confirm-delete-staff-${staff.id}`}
            >
              {hardDelete.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StaffEditDialog({
  staff,
  onClose,
}: {
  staff: StaffRow | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isCreate = staff === null;

  const { data: branchData } = useQuery<BranchListResp>({
    queryKey: ["/api/admin/branches"],
  });
  const branches = branchData?.rows ?? [];

  const [email, setEmail] = useState(staff?.email ?? "");
  const [name, setName] = useState(staff?.name ?? "");
  const [role, setRole] = useState<Role>(staff?.role ?? "cashier");
  const [branchId, setBranchId] = useState<number | null>(staff?.branch_id ?? null);
  const [password, setPassword] = useState("");

  const isOwner = role === "owner";

  const save = useMutation({
    mutationFn: async () => {
      if (isCreate) {
        return apiRequest("POST", "/api/admin/staff", {
          email: email.trim(),
          name: name.trim(),
          role,
          branch_id: isOwner ? null : branchId,
          password,
        });
      }
      const body: Record<string, unknown> = {
        name: name.trim(),
        role,
        branch_id: isOwner ? null : branchId,
      };
      if (password.trim().length > 0) body.password = password;
      return apiRequest("PATCH", `/api/admin/staff/${staff!.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff"] });
      toast({ title: isCreate ? "Staff created" : "Staff updated" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: friendlyError(err), variant: "destructive" });
    },
  });

  const emailValid = isCreate ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) : true;
  const passwordValid = isCreate
    ? password.length >= 12
    : password.length === 0 || password.length >= 12;
  const branchValid = isOwner || branchId !== null;
  const valid =
    name.trim().length > 0 &&
    emailValid &&
    passwordValid &&
    branchValid;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">
            {isCreate ? "New staff" : `Edit ${staff!.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              disabled={!isCreate}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@cucixpress.com"
              data-testid="input-staff-email"
            />
            {!isCreate && (
              <p className="text-[10px] text-gray-500 mt-1">Email can't be changed.</p>
            )}
          </div>
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              data-testid="input-staff-name"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => {
                const next = v as Role;
                setRole(next);
                if (next === "owner") setBranchId(null);
              }}
            >
              <SelectTrigger data-testid="select-staff-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} data-testid={`select-staff-role-${r}`}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-500 mt-1">
              Owners are global. All other roles must be tied to a branch.
            </p>
          </div>
          {!isOwner && (
            <div>
              <Label>Branch</Label>
              <Select
                value={branchId !== null ? String(branchId) : ""}
                onValueChange={(v) => setBranchId(Number(v))}
              >
                <SelectTrigger data-testid="select-staff-branch">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)} data-testid={`select-staff-branch-${b.id}`}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{isCreate ? "Password" : "New password"}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isCreate ? "At least 12 characters" : "Leave blank to keep current"}
              data-testid="input-staff-password"
            />
            <p className="text-[10px] text-gray-500 mt-1">
              {isCreate
                ? "Minimum 12 characters."
                : "Leave blank to keep the current password. Minimum 12 characters if set."}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-2 border-black" onClick={onClose}>Cancel</Button>
          <Button
            className="cuci-cta border-2 border-black"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
            data-testid="button-save-staff"
          >
            <Save className="w-4 h-4 mr-1" />
            {save.isPending ? "Saving…" : isCreate ? "Create staff" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
