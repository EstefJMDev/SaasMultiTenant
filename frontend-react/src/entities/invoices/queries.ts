import { useQuery } from "@tanstack/react-query";

import { fetchInvoices } from "@api/invoices";
import type { Invoice, InvoiceFilters } from "./types";
import { invoiceKeys } from "./keys";

export const useInvoices = (
  tenantId: number | undefined,
  filters: InvoiceFilters,
  enabled: boolean,
) => {
  return useQuery<Invoice[]>({
    queryKey: invoiceKeys.list(tenantId, filters),
    queryFn: () => fetchInvoices(tenantId, filters),
    enabled,
    // Polling simple y robusto para reflejar cambios de estado sin F5.
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
};
