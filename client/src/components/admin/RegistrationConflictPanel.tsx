// ============================================================
// RegistrationConflictPanel — owner/manager diagnostic tool.
//
// Problem it solves: /api/auth/customer/register/start deliberately
// pretends to send an OTP when the email / phone / plate is already
// taken (anti-enumeration), so a blocked customer just sees "code
// sent" and nothing arrives. Staff paste what the customer tried and
// see exactly WHICH field conflicts and WHO holds it — without ever
// weakening the customer-facing enumeration protection.
// ============================================================

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Loader2, Mail, Phone, Car as CarIcon, User, CheckCircle2,
  XCircle, AlertTriangle, ArrowRightLeft,
} from "lucide-react";

interface Holder {
  name: string | null;
  email?: string | null;
  phone?: string | null;
  has_account: boolean;
  user_id: number | null;
  customer_id: number | null;
}

interface Conflict {
  field: "phone" | "email" | "plate";
  kind: "taken" | "invalid";
  detail?: string;
  holder?: Holder;
  car?: { id: number; license_plate: string; brand: string | null; model: string | null };
}

interface CheckResp {
  checked: { phone?: string; email?: string; plate?: string };
  conflicts: Conflict[];
  plate_unclaimed?: boolean;
}

const FIELD_LABEL: Record<Conflict["field"], string> = {
  phone: "Phone number",
  email: "Email",
  plate: "Plate",
};

const FIELD_ICON: Record<Conflict["field"], typeof Mail> = {
  phone: Phone,
  email: Mail,
  plate: CarIcon,
};

export default function RegistrationConflictPanel({
  canOpenPlateTransfer,
  onOpenPlateTransfer,
}: {
  canOpenPlateTransfer: boolean;
  onOpenPlateTransfer: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [plate, setPlate] = useState("");
  const [params, setParams] = useState<{ email: string; phone: string; plate: string } | null>(null);

  const check = useQuery<CheckResp>({
    queryKey: ["/api/admin/registration-conflict", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params!.email) qs.set("email", params!.email);
      if (params!.phone) qs.set("phone", params!.phone);
      if (params!.plate) qs.set("plate", params!.plate);
      const res = await fetch(`/api/admin/registration-conflict?${qs.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Check failed");
      return res.json();
    },
    enabled: !!params,
  });

  const hasInput = !!(email.trim() || phone.trim() || plate.trim());
  const doCheck = () => {
    if (!hasInput) return;
    setParams({ email: email.trim(), phone: phone.trim(), plate: plate.trim() });
  };

  const data = check.data;
  const conflictFor = (field: Conflict["field"]) =>
    data?.conflicts.find((c) => c.field === field);
  const plateConflict = conflictFor("plate");

  const checkedFields = data
    ? (Object.keys(data.checked) as Conflict["field"][])
    : [];

  return (
    <Card className="border-2 border-sky-300 bg-sky-50/40 dark:bg-sky-950/20 dark:border-sky-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="w-4 h-4 text-sky-600" />
          Registration Check
          <Badge variant="outline" className="ml-1 text-[10px] uppercase tracking-wide border-sky-400 text-sky-700 dark:text-sky-300">
            Staff only
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Customer says "the code never arrives" when signing up? Paste what they tried below.
          Registration silently blocks (on purpose — it never tells outsiders what's taken)
          when the email, phone, or plate already belongs to an account. This shows which
          field is the problem and who holds it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doCheck()}
            placeholder="Email e.g. rhm3562@gmail.com"
            data-testid="input-regcheck-email"
          />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doCheck()}
            placeholder="Phone e.g. 8123456"
            data-testid="input-regcheck-phone"
          />
          <Input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && doCheck()}
            placeholder="Plate e.g. BAJ6424"
            className="font-mono uppercase"
            data-testid="input-regcheck-plate"
          />
        </div>
        <Button onClick={doCheck} disabled={!hasInput || check.isFetching} data-testid="button-regcheck">
          {check.isFetching ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Search className="w-4 h-4 mr-1.5" />}
          Check why registration is blocked
        </Button>

        {check.isError && (
          <p className="text-sm text-destructive">Check failed. Try again.</p>
        )}

        {data && (
          <div className="space-y-2" data-testid="regcheck-results">
            {data.conflicts.length === 0 ? (
              <div className="rounded-lg border bg-background p-3 flex items-start gap-2" data-testid="regcheck-all-clear">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">No conflicts — registration should work.</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    None of the checked fields are taken. If the customer still gets no code,
                    it's likely an email delivery issue or a typo in the email they entered —
                    ask them to re-check the address and their spam folder.
                    {data.plate_unclaimed && (
                      <> The plate exists in our records but is unclaimed, so registration will
                      link it (with its wash history) to the new account automatically.</>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              checkedFields.map((field) => {
                const c = conflictFor(field);
                const Icon = FIELD_ICON[field];
                if (!c) {
                  return (
                    <div key={field} className="rounded-lg border bg-background p-3 flex items-center gap-2 text-sm" data-testid={`regcheck-ok-${field}`}>
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{FIELD_LABEL[field]}</span>
                      <span className="font-mono text-xs text-muted-foreground">{data.checked[field]}</span>
                      <span className="text-muted-foreground text-xs ml-auto">available</span>
                    </div>
                  );
                }
                return (
                  <div key={field} className="rounded-lg border border-red-300 dark:border-red-800 bg-background p-3 space-y-2" data-testid={`regcheck-conflict-${field}`}>
                    <div className="flex items-center gap-2 text-sm">
                      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{FIELD_LABEL[field]}</span>
                      <span className="font-mono text-xs text-muted-foreground">{data.checked[field]}</span>
                      <Badge variant="destructive" className="ml-auto text-[10px] uppercase">
                        {c.kind === "invalid" ? "invalid" : "already taken"}
                      </Badge>
                    </div>
                    {c.kind === "invalid" ? (
                      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                        {c.detail}
                      </p>
                    ) : (
                      <div className="pl-6 text-sm space-y-0.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Held by
                        </p>
                        <p className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium">{c.holder?.name || "Unnamed account"}</span>
                          {c.holder?.has_account ? (
                            <Badge variant="outline" className="text-[9px] uppercase">account</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] uppercase">walk-in record, no login</Badge>
                          )}
                        </p>
                        {c.holder?.email && (
                          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Mail className="w-3 h-3" /> {c.holder.email}
                          </p>
                        )}
                        {c.holder?.phone && (
                          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Phone className="w-3 h-3" /> {c.holder.phone}
                          </p>
                        )}
                        {field === "plate" && c.car && (
                          <p className="text-xs text-muted-foreground">
                            {[c.car.brand, c.car.model].filter(Boolean).join(" ") || "Vehicle"} ·{" "}
                            <span className="font-mono">{c.car.license_plate}</span>
                          </p>
                        )}
                        {field === "plate" && (
                          canOpenPlateTransfer ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1.5"
                              onClick={onOpenPlateTransfer}
                              data-testid="button-open-plate-transfer"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
                              Fix in Plate Transfer
                            </Button>
                          ) : (
                            <p className="text-xs text-muted-foreground mt-1.5">
                              If the plate really belongs to this customer, ask the owner to move it
                              with the Plate Transfer tool (owner-only).
                            </p>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
