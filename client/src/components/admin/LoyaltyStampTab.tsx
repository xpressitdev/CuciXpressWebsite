import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuth } from "@/hooks/useStaffAuth";

// ============================================================
// LoyaltyStampTab — staff "verify physical receipt & add stamps".
//
// Digital-receipt migration backstop. Staff (owner/manager/cashier) type a
// plate, tap Check to see the plate's current stamp count (auto-counted
// system orders + any manual credits), then credit the number of physical
// B$12 receipts the customer is holding. Receipt number is optional, a
// note is encouraged. Owners/managers pick which branch the credit belongs
// to (they aren't pinned to a branch); cashiers are pinned server-side, so
// the picker is hidden and the credit goes to their own branch. The
// customer's loyalty card picks up the stamps automatically by plate.
// ============================================================
type ManualEntry = {
  id: string;
  created_at: string;
  stamps_total: number;
  stamps_remaining: number;
  note: string | null;
  receipt_no: string | null;
  branch_id: number | null;
  branch_name: string | null;
  staff_name: string | null;
  deletable: boolean;
  reason: string | null;
};

type EligibleOrder = {
  id: string;
  created_at: string;
  branch_id: number | null;
  branch_name: string | null;
  receipt_reference: string;
  paid_amount_cents: number;
  status: string;
  loyalty_status: "digital";
  can_transfer: boolean;
  transfer_reason: string | null;
};

type PhysicalTransfer = {
  id: string;
  order_id: string;
  transferred_at: string;
  note: string | null;
  physical_card_reference: string | null;
  used_at: string | null;
  use_note: string | null;
  reversed_at: string | null;
  reversal_note: string | null;
  order_created_at: string;
  branch_id: number | null;
  branch_name: string | null;
  receipt_reference: string;
  paid_amount_cents: number;
  transferred_by_staff_name: string | null;
  used_by_staff_name: string | null;
  reversed_by_staff_name: string | null;
  status: "physical" | "used" | "reversed";
  can_reverse: boolean;
  can_mark_used: boolean;
};

type LoyaltyLookup = {
  plate: string;
  vehicle_id: number | null;
  brand: string | null;
  model: string | null;
  auto_stamps: number;
  manual_stamps: number;
  total_stamps: number;
  required: number;
  can_redeem: boolean;
  eligible_orders: EligibleOrder[];
  physical_transfers: PhysicalTransfer[];
  manual_entries: ManualEntry[];
};

const fmtStampDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Asia/Brunei",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const fmtMoney = (cents: number) => `B$${(cents / 100).toFixed(2)}`;

type BranchRow = { id: number; name: string; location: string };

export default function LoyaltyStampTab() {
  const { toast } = useToast();
  const { staff } = useStaffAuth();
  // Owners/managers aren't pinned to a branch, so they pick which branch the
  // credit belongs to. Cashiers (and lane) are pinned server-side, so they
  // don't pick — and they can't read the owner/manager-only branches list.
  const canPickBranch = staff?.role === "owner" || staff?.role === "manager";
  const [plate, setPlate] = useState("");
  const [info, setInfo] = useState<LoyaltyLookup | null>(null);
  const [note, setNote] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [transferOrder, setTransferOrder] = useState<EligibleOrder | null>(null);
  const [transferNote, setTransferNote] = useState("");
  const [physicalCardReference, setPhysicalCardReference] = useState("");

  const { data: branchData } = useQuery<{ rows: BranchRow[] }>({
    queryKey: ["/api/admin/branches"],
    enabled: canPickBranch,
  });
  const branches = branchData?.rows ?? [];

  const lookup = useMutation({
    mutationFn: async () => {
      const r = await apiRequest(
        "GET",
        `/api/pos/loyalty/lookup?plate=${encodeURIComponent(plate.trim())}`,
      );
      return (await r.json()) as LoyaltyLookup;
    },
    onSuccess: (data) => setInfo(data),
    onError: (err: any) =>
      toast({
        title: "Couldn't check plate",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const add = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/pos/loyalty/stamp", {
        plate: plate.trim(),
        count: 1,
        note: note.trim() || null,
        receipt_no: receiptNo.trim() || null,
        // Cashiers are branch-pinned server-side; only owners/managers choose.
        ...(canPickBranch ? { branch_id: Number(branchId) } : {}),
      });
      return (await r.json()) as LoyaltyLookup & { ok: boolean; added: number };
    },
    onSuccess: (data) => {
      setNote("");
      setReceiptNo("");
      toast({
        title: "Historic receipt stamp added",
        description: `${data.total_stamps} of ${data.required} on ${plate
          .trim()
          .toUpperCase()}.`,
      });
      // Re-run the lookup so the running count AND the credit history (with the
      // new entry) both refresh from the server.
      lookup.mutate();
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't add stamps",
        description:
          err?.message === "matching_digital_order"
            ? "That receipt already matches a system wash. Move the matching wash to a physical card instead."
            : err?.message === "receipt_already_credited"
              ? "That historic receipt has already been credited."
              : err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest(
        "DELETE",
        `/api/pos/loyalty/stamp/${encodeURIComponent(id)}`,
      );
      return (await r.json()) as { ok: boolean };
    },
    onSuccess: () => {
      toast({ title: "Credit removed" });
      // Refresh counts + history from the server.
      lookup.mutate();
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't remove credit",
        description:
          err?.message === "already_used"
            ? "This credit was already used toward a free wash."
            : err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const transfer = useMutation({
    mutationFn: async () => {
      if (!transferOrder) throw new Error("order_required");
      const r = await apiRequest("POST", "/api/pos/loyalty/physical-transfer", {
        order_id: transferOrder.id,
        note: transferNote.trim() || null,
        physical_card_reference: physicalCardReference.trim() || null,
      });
      return (await r.json()) as { ok: boolean; transfer_id: string };
    },
    onSuccess: () => {
      setTransferOrder(null);
      setTransferNote("");
      setPhysicalCardReference("");
      toast({
        title: "Moved to physical card",
        description: "This wash no longer counts on the digital stamp card.",
      });
      lookup.mutate();
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't move this wash",
        description:
          err?.message === "already_transferred"
            ? "Another staff member already moved this wash."
            : err?.message === "order_not_eligible"
              ? "This wash is no longer eligible for transfer."
              : err?.message === "other_branch"
                ? "Cashiers can only move receipts from their own branch."
                : err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const reverseTransfer = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const r = await apiRequest(
        "POST",
        `/api/pos/loyalty/physical-transfer/${encodeURIComponent(id)}/reverse`,
        { note },
      );
      return (await r.json()) as { ok: boolean };
    },
    onSuccess: () => {
      toast({
        title: "Transfer reversed",
        description: "The wash is available on the digital card again.",
      });
      lookup.mutate();
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't reverse transfer",
        description:
          err?.message === "already_used"
            ? "This physical-card entry was already used and cannot be reversed."
            : err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const markTransferUsed = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiRequest(
        "POST",
        `/api/pos/loyalty/physical-transfer/${encodeURIComponent(id)}/use`,
        {},
      );
      return (await r.json()) as { ok: boolean };
    },
    onSuccess: () => {
      toast({ title: "Physical-card entry marked used" });
      lookup.mutate();
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't update entry",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const redeem = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/pos/loyalty/redeem", {
        plate: plate.trim(),
        // Cashiers are branch-pinned server-side; only owners/managers choose.
        ...(canPickBranch ? { branch_id: Number(branchId) } : {}),
      });
      return (await r.json()) as {
        ok: boolean;
        ticket_code: string;
        plate: string;
        package_name: string;
        branch_name: string;
      };
    },
    onSuccess: (data) => {
      toast({
        title: `Free wash queued — ${data.ticket_code}`,
        description: `${data.package_name} for ${data.plate} at ${data.branch_name}. Send the car to the lane.`,
      });
      // Re-run the lookup so the count drops by the redeemed stamps.
      lookup.mutate();
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't claim free wash",
        description:
          err?.message === "not_enough_stamps"
            ? "This plate doesn't have enough stamps yet."
            : err?.message === "no_branch"
              ? "Pick a branch first."
              : err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const canCheck = plate.trim().length >= 1 && !lookup.isPending;
  const canAdd =
    !!info &&
    receiptNo.trim().length > 0 &&
    (!canPickBranch || branchId !== "") &&
    !add.isPending;
  // Owners/managers must pick a branch before queuing (the picker sits below).
  const canRedeem =
    !!info && info.can_redeem && (!canPickBranch || branchId !== "") && !redeem.isPending;

  return (
    <div className="max-w-xl">
      <Card data-testid="card-loyalty-stamp">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Stamp className="w-4 h-4" />
            Loyalty stamps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500">
            Check every digital B$12 wash for this plate. If the customer shows
            the matching receipt and wants it on a physical card, move that
            specific wash below. Manual stamps are only for old paper receipts
            with no matching order in the system.
          </p>
          <div>
            <Label className="text-xs">License plate</Label>
            <div className="flex gap-2">
              <Input
                value={plate}
                placeholder="e.g. BAA 1234"
                onChange={(e) => {
                  setPlate(e.target.value);
                  setInfo(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canCheck) lookup.mutate();
                }}
                data-testid="input-loyalty-plate"
              />
              <Button
                variant="outline"
                className="border-2 border-black shrink-0"
                disabled={!canCheck}
                onClick={() => lookup.mutate()}
                data-testid="button-loyalty-check"
              >
                {lookup.isPending ? "…" : "Check"}
              </Button>
            </div>
          </div>

          {info && (
            <div
              className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              data-testid="text-loyalty-current"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">{info.plate}</span>
                <Badge
                  className={`${
                    info.can_redeem ? "bg-emerald-600" : "bg-gray-500"
                  } text-white`}
                >
                  {info.total_stamps} / {info.required}
                </Badge>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                {info.auto_stamps} from system · {info.manual_stamps} added by
                staff
                {info.can_redeem ? " · ready for a free wash" : ""}
              </p>
              {info.can_redeem && (
                <>
                  <Button
                    className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white border-2 border-black"
                    disabled={!canRedeem}
                    onClick={() => redeem.mutate()}
                    data-testid="button-loyalty-redeem"
                  >
                    {redeem.isPending
                      ? "Queuing…"
                      : "Claim free wash — queue it now"}
                  </Button>
                  {canPickBranch && branchId === "" && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Pick a branch below first.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {info && (
            <div className="space-y-2 pt-1" data-testid="loyalty-eligible-orders">
              <div>
                <Label className="text-xs">Digital-eligible washes</Label>
                <p className="text-[11px] text-gray-500">
                  Each row is one wash currently counted on the online card.
                  Only move it after seeing the matching printed receipt.
                </p>
              </div>
              {info.eligible_orders.length === 0 ? (
                <p className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500">
                  No digital-eligible washes.
                </p>
              ) : (
                info.eligible_orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs"
                    data-testid={`loyalty-order-${order.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-gray-800">
                            {fmtStampDate(order.created_at)}
                          </span>
                          <Badge className="bg-blue-600 text-white">Digital</Badge>
                        </div>
                        <div className="text-gray-500">
                          {order.branch_name ?? "Branch not recorded"} ·{" "}
                          {fmtMoney(order.paid_amount_cents)}
                        </div>
                        <div className="text-gray-500 break-all">
                          Receipt/ticket: {order.receipt_reference}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-auto min-h-8 max-w-32 whitespace-normal border-2 border-black px-2 py-1 text-[11px]"
                          disabled={!order.can_transfer || transfer.isPending}
                          onClick={() => {
                            setTransferOrder(order);
                            setTransferNote("");
                            setPhysicalCardReference("");
                          }}
                          data-testid={`button-loyalty-transfer-${order.id}`}
                        >
                          Move to physical card
                        </Button>
                        {!order.can_transfer && (
                          <p className="mt-1 max-w-32 text-[10px] text-gray-400">
                            Original wash branch only
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {info && info.physical_transfers.length > 0 && (
            <div className="space-y-2 pt-1" data-testid="loyalty-transfer-history">
              <div>
                <Label className="text-xs">Physical-card transfer history</Label>
                <p className="text-[11px] text-gray-500">
                  Transfers stay here for audit. Owners and managers can reverse
                  a mistake only before the physical entry is marked used.
                </p>
              </div>
              {info.physical_transfers.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-gray-200 px-3 py-2 text-xs"
                  data-testid={`loyalty-transfer-${entry.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-gray-800">
                          {fmtStampDate(entry.order_created_at)}
                        </span>
                        <Badge
                          className={
                            entry.status === "physical"
                              ? "bg-amber-600 text-white"
                              : entry.status === "used"
                                ? "bg-gray-700 text-white"
                                : "bg-gray-400 text-white"
                          }
                        >
                          {entry.status === "physical"
                            ? "Physical card"
                            : entry.status === "used"
                              ? "Physical entry used"
                              : "Reversed"}
                        </Badge>
                      </div>
                      <div className="text-gray-500">
                        {entry.branch_name ?? "Branch not recorded"} ·{" "}
                        {fmtMoney(entry.paid_amount_cents)}
                      </div>
                      <div className="text-gray-500 break-all">
                        Receipt/ticket: {entry.receipt_reference}
                      </div>
                      <div className="text-gray-500">
                        Moved {fmtStampDate(entry.transferred_at)}
                        {entry.transferred_by_staff_name
                          ? ` by ${entry.transferred_by_staff_name}`
                          : ""}
                      </div>
                      {entry.physical_card_reference && (
                        <div className="text-gray-500">
                          Card/reference: {entry.physical_card_reference}
                        </div>
                      )}
                      {entry.note && (
                        <div className="text-gray-500 break-words">“{entry.note}”</div>
                      )}
                      {entry.used_at && (
                        <div className="text-gray-500">
                          Used {fmtStampDate(entry.used_at)}
                          {entry.used_by_staff_name
                            ? ` by ${entry.used_by_staff_name}`
                            : ""}
                        </div>
                      )}
                      {entry.reversed_at && (
                        <div className="text-gray-500">
                          Reversed {fmtStampDate(entry.reversed_at)}
                          {entry.reversed_by_staff_name
                            ? ` by ${entry.reversed_by_staff_name}`
                            : ""}
                          {entry.reversal_note ? ` · ${entry.reversal_note}` : ""}
                        </div>
                      )}
                    </div>
                    {(entry.can_mark_used || entry.can_reverse) && (
                      <div className="flex shrink-0 flex-col gap-1">
                        {entry.can_mark_used && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 border-2 border-black px-2 text-[10px]"
                            disabled={markTransferUsed.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Mark this physical-card entry as used? It can no longer be reversed.",
                                )
                              ) {
                                markTransferUsed.mutate(entry.id);
                              }
                            }}
                          >
                            Mark used
                          </Button>
                        )}
                        {entry.can_reverse && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 border-2 border-black px-2 text-[10px] text-red-600"
                            disabled={reverseTransfer.isPending}
                            onClick={() => {
                              const reason = window.prompt(
                                "Why is this transfer being reversed?",
                              );
                              if (reason?.trim()) {
                                reverseTransfer.mutate({
                                  id: entry.id,
                                  note: reason.trim(),
                                });
                              }
                            }}
                          >
                            Reverse
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {info && (
            <>
              {canPickBranch && (
                <div>
                  <Label className="text-xs">Branch (credit belongs to)</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger data-testid="select-loyalty-branch">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs">
                  Historic receipt no. (required)
                </Label>
                <Input
                  value={receiptNo}
                  maxLength={40}
                  placeholder="e.g. 00231"
                  onChange={(e) => setReceiptNo(e.target.value)}
                  data-testid="input-loyalty-receipt"
                />
                <p className="mt-1 text-[10px] text-gray-500">
                  One stamp per receipt. A receipt matching a system order will
                  be rejected—move that wash above instead.
                </p>
              </div>
              <div>
                <Label className="text-xs">Historic receipt note (optional)</Label>
                <Input
                  value={note}
                  maxLength={160}
                  placeholder="e.g. old paper receipt verified"
                  onChange={(e) => setNote(e.target.value)}
                  data-testid="input-loyalty-note"
                />
              </div>
              <Button
                className="w-full cuci-cta border-2 border-black"
                disabled={!canAdd}
                onClick={() => add.mutate()}
                data-testid="button-loyalty-add"
              >
                {add.isPending ? "Adding…" : "Add historic receipt stamp"}
              </Button>
            </>
          )}

          {info && info.manual_entries.length > 0 && (
            <div className="space-y-2 pt-1" data-testid="loyalty-credit-history">
              <Label className="text-xs">Staff credit history</Label>
              <p className="text-[11px] text-gray-500">
                Each credit shows when it was added, the branch, receipt no. and
                note. You can remove a credit only if none of it has been used
                toward a free wash yet. Past washes counted by the system aren't
                shown here — they're real services and can't be removed.
              </p>
              {info.manual_entries.map((e) => {
                const used = e.stamps_total - e.stamps_remaining;
                return (
                  <div
                    key={e.id}
                    className="rounded-md border border-gray-200 px-3 py-2 text-xs flex items-start justify-between gap-3"
                    data-testid={`loyalty-credit-${e.id}`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold text-gray-800">
                        +{e.stamps_total} stamp{e.stamps_total === 1 ? "" : "s"}
                        {used > 0 && (
                          <span className="ml-1 font-normal text-amber-600">
                            · {used} used
                          </span>
                        )}
                      </div>
                      <div className="text-gray-500">
                        {fmtStampDate(e.created_at)}
                        {e.branch_name ? ` · ${e.branch_name}` : ""}
                      </div>
                      {e.receipt_no && (
                        <div className="text-gray-500">
                          Receipt: {e.receipt_no}
                        </div>
                      )}
                      {e.note && (
                        <div className="text-gray-500 break-words">
                          “{e.note}”
                        </div>
                      )}
                      {e.staff_name && (
                        <div className="text-gray-400">by {e.staff_name}</div>
                      )}
                    </div>
                    <div className="shrink-0 self-center">
                      {e.deletable ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-2 border-black text-red-600 hover:text-red-700 h-7 px-2"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(e.id)}
                          data-testid={`button-loyalty-remove-${e.id}`}
                        >
                          Remove
                        </Button>
                      ) : (
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                          {e.reason === "used"
                            ? "used"
                            : e.reason === "other_branch"
                              ? "other branch"
                              : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={transferOrder !== null}
        onOpenChange={(open) => {
          if (!open && !transfer.isPending) setTransferOrder(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move wash to physical card?</DialogTitle>
            <DialogDescription>
              Confirm that you can see the matching printed receipt. This wash
              will immediately disappear from the customer&apos;s digital stamp
              count.
            </DialogDescription>
          </DialogHeader>
          {transferOrder && (
            <div className="space-y-3">
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
                <div className="font-semibold">
                  {fmtStampDate(transferOrder.created_at)}
                </div>
                <div className="text-gray-500">
                  {transferOrder.branch_name ?? "Branch not recorded"} ·{" "}
                  {fmtMoney(transferOrder.paid_amount_cents)}
                </div>
                <div className="break-all text-gray-500">
                  Receipt/ticket: {transferOrder.receipt_reference}
                </div>
              </div>
              <div>
                <Label className="text-xs">Physical card/reference</Label>
                <Input
                  value={physicalCardReference}
                  maxLength={80}
                  placeholder="e.g. Card 104"
                  onChange={(e) => setPhysicalCardReference(e.target.value)}
                  data-testid="input-physical-card-reference"
                />
              </div>
              <div>
                <Label className="text-xs">Note</Label>
                <Input
                  value={transferNote}
                  maxLength={160}
                  placeholder="e.g. receipt seen and stamped"
                  onChange={(e) => setTransferNote(e.target.value)}
                  data-testid="input-physical-card-note"
                />
                <p className="mt-1 text-[10px] text-gray-500">
                  Add a card/reference or a short note.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="border-2 border-black"
              disabled={transfer.isPending}
              onClick={() => setTransferOrder(null)}
            >
              Cancel
            </Button>
            <Button
              className="border-2 border-black bg-amber-600 text-white hover:bg-amber-700"
              disabled={
                transfer.isPending ||
                (!physicalCardReference.trim() && !transferNote.trim())
              }
              onClick={() => transfer.mutate()}
              data-testid="button-confirm-physical-transfer"
            >
              {transfer.isPending ? "Moving…" : "Confirm move"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
