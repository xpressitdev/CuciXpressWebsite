import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// LoyaltyStampTab — owner-only "verify physical receipt & add stamps".
//
// Digital-receipt migration backstop. The owner types a plate, taps
// Check to see the plate's current stamp count (auto-counted system
// orders + any manual credits), then credits the number of physical
// B$12 receipts the customer is holding. Receipt number is optional, a
// note is encouraged. The owner picks which branch the credit belongs
// to (owners aren't pinned to a branch). The customer's loyalty card
// picks up the stamps automatically by plate.
// ============================================================
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
};

type BranchRow = { id: number; name: string; location: string };

export default function LoyaltyStampTab() {
  const { toast } = useToast();
  const [plate, setPlate] = useState("");
  const [info, setInfo] = useState<LoyaltyLookup | null>(null);
  const [count, setCount] = useState("1");
  const [note, setNote] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [branchId, setBranchId] = useState("");

  const { data: branchData } = useQuery<{ rows: BranchRow[] }>({
    queryKey: ["/api/admin/branches"],
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
        count: Number(count),
        note: note.trim() || null,
        receipt_no: receiptNo.trim() || null,
        branch_id: Number(branchId),
      });
      return (await r.json()) as LoyaltyLookup & { ok: boolean; added: number };
    },
    onSuccess: (data) => {
      setInfo({
        plate: info?.plate ?? plate.trim().toUpperCase(),
        vehicle_id: info?.vehicle_id ?? null,
        brand: info?.brand ?? null,
        model: info?.model ?? null,
        auto_stamps: data.auto_stamps,
        manual_stamps: data.manual_stamps,
        total_stamps: data.total_stamps,
        required: data.required,
        can_redeem: data.can_redeem,
      });
      setCount("1");
      setNote("");
      setReceiptNo("");
      toast({
        title: `Added ${data.added} stamp${data.added === 1 ? "" : "s"}`,
        description: `${data.total_stamps} of ${data.required} on ${plate
          .trim()
          .toUpperCase()}.`,
      });
    },
    onError: (err: any) =>
      toast({
        title: "Couldn't add stamps",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      }),
  });

  const canCheck = plate.trim().length >= 1 && !lookup.isPending;
  const canAdd = !!info && branchId !== "" && !add.isPending;

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
            Verify a customer's physical B$12 receipts and add the matching
            stamps to their plate. Past washes already in the system count
            automatically — check first so you only top up the difference. Every
            credit is recorded with the branch, your account, and any note for
            the audit trail.
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
            </div>
          )}

          {info && (
            <>
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Stamps to add</Label>
                  <Select value={count} onValueChange={setCount}>
                    <SelectTrigger data-testid="select-loyalty-count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Receipt no. (optional)</Label>
                  <Input
                    value={receiptNo}
                    maxLength={40}
                    placeholder="e.g. 00231"
                    onChange={(e) => setReceiptNo(e.target.value)}
                    data-testid="input-loyalty-receipt"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Note (encouraged)</Label>
                <Input
                  value={note}
                  maxLength={160}
                  placeholder="e.g. 3 paper receipts verified & collected"
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
                {add.isPending
                  ? "Adding…"
                  : `Add ${count} stamp${count === "1" ? "" : "s"}`}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
