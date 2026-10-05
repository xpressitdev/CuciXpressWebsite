import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isVoucherAccountingQuery, VOUCHER_SALES_URL, voucherSalesUrl, type VoucherSalesResponse, type VoucherDraft, voucherSalePayload } from "@/lib/voucherSales";

export function useVoucherSales(start: string, end: string) {
  const queryClient = useQueryClient();
  const list = useQuery<VoucherSalesResponse>({ queryKey: [voucherSalesUrl(start, end)] });
  const save = useMutation({
    mutationFn: async ({ id, draft, idempotencyKey }: { id?: string; draft: VoucherDraft; idempotencyKey: string }) => {
      const payload = voucherSalePayload(draft);
      const response = await apiRequest(id ? "PATCH" : "POST",
        id ? `${VOUCHER_SALES_URL}/${encodeURIComponent(id)}` : VOUCHER_SALES_URL,
        id ? payload : { ...payload, idempotency_key: idempotencyKey });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ predicate: (query) => isVoucherAccountingQuery(query.queryKey) }),
  });
  const voidSale = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!reason.trim()) throw new Error("Enter a reason for voiding this sale.");
      const response = await apiRequest("POST", `${VOUCHER_SALES_URL}/${encodeURIComponent(id)}/void`, { reason: reason.trim() });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ predicate: (query) => isVoucherAccountingQuery(query.queryKey) }),
  });
  return { list, save, voidSale };
}
