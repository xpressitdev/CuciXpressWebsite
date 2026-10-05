import { useState } from "react";
import { Pencil, Plus, Ticket, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useVoucherSales } from "@/hooks/use-voucher-sales";
import { newVoucherDraft, voucherDraftFromSale, voucherDraftError, voucherRangeError, VOUCHER_PAYMENT_LABELS, type VoucherSale, type VoucherDraft, type VoucherPayment } from "@/lib/voucherSales";

const money = (cents: number) => `B$${(cents / 100).toFixed(2)}`;

export default function VoucherSalesTab() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [range, setRange] = useState({ start: "", end: "" });
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ id?: string; key: string } | null>(null);
  const [draft, setDraft] = useState<VoucherDraft>(newVoucherDraft);
  const [validation, setValidation] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<VoucherSale | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [page, setPage] = useState(1);
  const { list, save, voidSale } = useVoucherSales(range.start, range.end);
  const data = list.data;
  const pageCount = Math.max(1, Math.ceil((data?.sales.length ?? 0) / 25));
  const currentPage = Math.min(page, pageCount);
  const update = <K extends keyof VoucherDraft>(key: K, value: VoucherDraft[K]) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const openEditor = (sale?: VoucherSale) => {
    setDraft(sale ? voucherDraftFromSale(sale) : newVoucherDraft());
    setValidation(null);
    save.reset();
    setEditor({ id: sale ? String(sale.id) : undefined, key: crypto.randomUUID() });
  };
  const estimatedCents = Math.round(Number(draft.unit_price) * 100) * Number(draft.quantity);

  return <div className="space-y-5" data-testid="voucher-sales-panel">
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Ticket className="h-5 w-5 text-cuci-primary" />Voucher Sales</span>
          <Button onClick={() => openEditor()} disabled={!data} data-testid="button-add-voucher-sale"><Plus className="mr-2 h-4 w-4" />Record sale</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Physical prepaid Basic Wash + Tire Shine vouchers sold outside POS. Recognize full revenue on the original sale date, never again at redemption.</p>
        <div className="rounded-md border border-cuci-primary/20 bg-cuci-primary/5 p-3 text-sm">
          <b>Separate from POS wash revenue.</b> An unspecified branch appears only in Overall P&amp;L. These sales never enter today's cash drawer.
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <b>At redemption:</b> use the existing <b>$9 Voucher Redeem</b> package (B$0) in POS.
          Charge paid extras separately. Historical legacy voucher transactions are unchanged.
          Reference and notes can record serial ranges; this register does not track redemptions or serial inventory.
        </div>
        <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" onSubmit={(event) => {
          event.preventDefault();
          const error = voucherRangeError(start, end);
          setRangeError(error);
          if (!error) { setRange({ start, end }); setPage(1); }
        }}>
          <div className="space-y-1"><Label htmlFor="voucher-start">Start date</Label><Input id="voucher-start" type="date" value={start} onChange={(event) => setStart(event.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="voucher-end">End date</Label><Input id="voucher-end" type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></div>
          <Button type="submit" variant="outline">Apply dates</Button>
          <Button type="button" variant="ghost" onClick={() => { setStart(""); setEnd(""); setRange({ start: "", end: "" }); setRangeError(null); setPage(1); }}>All dates</Button>
        </form>
        {rangeError && <p role="alert" className="text-sm text-red-700">{rangeError}</p>}
        <p className="text-xs text-muted-foreground">{range.start ? `Original sale dates: ${range.start} to ${range.end}` : "All original sale dates"} · Summary excludes voided sales.</p>
        {data && <dl className="flex flex-wrap gap-x-10 gap-y-3 border-t pt-4">
          <div><dt className="text-sm text-muted-foreground">Active vouchers sold</dt><dd className="text-2xl font-bold tabular-nums">{data.summary.quantity.toLocaleString()}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Original sale date revenue</dt><dd className="text-2xl font-bold tabular-nums text-cuci-primary">{money(data.summary.total_cents)}</dd></div>
        </dl>}
      </CardContent>
    </Card>
    {list.isPending && <Card><CardContent className="space-y-3 py-8" role="status" aria-label="Loading voucher sales">
      {[1, 2, 3, 4].map((item) => <div key={item} className="h-10 animate-pulse rounded bg-muted" />)}
    </CardContent></Card>}
    {list.isError && <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 py-6">
      <p role="alert" className="text-sm text-red-700">Voucher sales could not be loaded. {data ? "Showing the last loaded register." : "Please try again."}</p>
      <Button variant="outline" disabled={list.isFetching} onClick={() => list.refetch()}>Retry</Button>
    </CardContent></Card>}
    {data && <Card>
      <CardContent className="p-0">
        {data.sales.length === 0 ? <div className="px-6 py-12 text-center">
          <Ticket className="mx-auto mb-3 h-10 w-10 text-cuci-primary" />
          <h3 className="text-lg font-semibold">No voucher sales in this period</h3>
          <p className="mt-1 text-sm text-muted-foreground">Record the buyer, quantity and original sale date to start your register.</p>
          <Button className="mt-5" variant="outline" onClick={() => openEditor()}>Record first sale</Button>
        </div> : <Table className="min-w-[1080px]" data-testid="table-voucher-sales">
          <TableHeader><TableRow>
            <TableHead>Sale date</TableHead><TableHead>Buyer / reference</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Unit price</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Branch</TableHead><TableHead>Payment</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>{data.sales.slice((currentPage - 1) * 25, currentPage * 25).map((sale) => {
            const isVoid = sale.status !== "active";
            return <TableRow key={sale.id} className={isVoid ? "bg-muted/30 text-muted-foreground" : ""}>
              <TableCell className="whitespace-nowrap">{sale.sale_date}</TableCell>
              <TableCell><p className="font-medium">{sale.buyer}</p>{sale.reference && <p className="text-xs text-muted-foreground">Ref: {sale.reference}</p>}{sale.notes && <p className="max-w-xs whitespace-pre-wrap break-words text-xs text-muted-foreground">{sale.notes}</p>}</TableCell>
              <TableCell className="text-right tabular-nums">{sale.quantity}</TableCell><TableCell className="text-right tabular-nums">{money(sale.unit_price_cents)}</TableCell><TableCell className={`text-right tabular-nums font-semibold ${isVoid ? "line-through" : ""}`}>{money(sale.total_cents)}</TableCell>
              <TableCell>{sale.branch_name ?? "Unspecified / unknown"}</TableCell><TableCell>{VOUCHER_PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</TableCell>
              <TableCell><Badge variant={isVoid ? "secondary" : "outline"}>{isVoid ? "Voided" : "Active"}</Badge>{sale.void_reason && <p className="mt-1 max-w-xs break-words text-xs">{sale.void_reason}</p>}</TableCell>
              <TableCell><div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" disabled={isVoid} aria-label={`Edit sale for ${sale.buyer}`} onClick={() => openEditor(sale)}><Pencil className="mr-1 h-3 w-3" />Edit</Button>
                <Button size="sm" variant="outline" disabled={isVoid} aria-label={`Void sale for ${sale.buyer}`} onClick={() => { voidSale.reset(); setVoidReason(""); setVoidTarget(sale); }}><Ban className="mr-1 h-3 w-3" />Void</Button>
              </div></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>}
        {data.sales.length > 25 && <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-sm">
          <span>Page {currentPage} of {pageCount} · {data.sales.length} sales</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div>
        </div>}
      </CardContent>
    </Card>}
    <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open && !save.isPending) setEditor(null); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{editor?.id ? "Edit voucher sale" : "Record voucher sale"}</DialogTitle><DialogDescription>Basic Wash + Tire Shine · revenue belongs to the original sale date.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          const error = voucherDraftError(draft);
          setValidation(error);
          if (!error && editor) save.mutate({ id: editor.id, draft, idempotencyKey: editor.key }, { onSuccess: () => setEditor(null) });
        }}>
          <fieldset disabled={save.isPending} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="voucher-sale-date">Original sale date</Label><Input id="voucher-sale-date" type="date" value={draft.sale_date} required onChange={(event) => update("sale_date", event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="voucher-buyer">Buyer</Label><Input id="voucher-buyer" value={draft.buyer} required onChange={(event) => update("buyer", event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="voucher-quantity">Quantity</Label><Input id="voucher-quantity" type="number" min="1" step="1" value={draft.quantity} required onChange={(event) => update("quantity", event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="voucher-unit-price">Unit price (B$)</Label><Input id="voucher-unit-price" type="number" min="0.01" step="0.01" value={draft.unit_price} required onChange={(event) => update("unit_price", event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="voucher-branch">Sale branch</Label><Select value={draft.branch_id} onValueChange={(value) => update("branch_id", value)} disabled={save.isPending}><SelectTrigger id="voucher-branch"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unknown">Unspecified / unknown</SelectItem>{data?.branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1"><Label htmlFor="voucher-payment">Payment method</Label><Select value={draft.payment_method} onValueChange={(value) => update("payment_method", value as VoucherPayment)} disabled={save.isPending}><SelectTrigger id="voucher-payment"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(VOUCHER_PAYMENT_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="voucher-reference">Reference (optional)</Label><Input id="voucher-reference" placeholder="Payment reference or printed serial range" value={draft.reference} onChange={(event) => update("reference", event.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="voucher-notes">Notes (optional)</Label><Textarea id="voucher-notes" placeholder="Sale details or serial ranges" value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></div>
          </fieldset>
          <div className="flex justify-between rounded-md bg-muted p-3 text-sm"><span>Sale total</span><b className="tabular-nums">{Number.isFinite(estimatedCents) ? money(estimatedCents) : "—"}</b></div>
          {(validation || save.isError) && <p role="alert" className="text-sm text-red-700">{validation ?? save.error?.message ?? "Sale could not be saved. Try again."}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setEditor(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save sale"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => { if (!open && !voidSale.isPending) setVoidTarget(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Void voucher sale?</DialogTitle><DialogDescription>This keeps the audit record but removes its revenue from the original sale date. It does not issue a refund or change a POS redemption.</DialogDescription></DialogHeader>
        <p className="text-sm font-medium">{voidTarget?.buyer} · {voidTarget?.sale_date} · {money(voidTarget?.total_cents ?? 0)}</p>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (voidTarget && voidReason.trim()) voidSale.mutate({ id: String(voidTarget.id), reason: voidReason }, { onSuccess: () => setVoidTarget(null) });
        }}>
          <div className="space-y-1"><Label htmlFor="voucher-void-reason">Reason for voiding</Label><Textarea id="voucher-void-reason" required value={voidReason} disabled={voidSale.isPending} onChange={(event) => setVoidReason(event.target.value)} /></div>
          {voidSale.isError && <p role="alert" className="text-sm text-red-700">{voidSale.error?.message ?? "Could not void this sale. Try again."}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={voidSale.isPending} onClick={() => setVoidTarget(null)}>Keep sale</Button><Button type="submit" variant="destructive" disabled={!voidReason.trim() || voidSale.isPending}>{voidSale.isPending ? "Voiding…" : "Confirm void"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
