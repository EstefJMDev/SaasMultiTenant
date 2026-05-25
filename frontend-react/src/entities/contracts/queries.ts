import {
  fetchContractById as fetchContractByIdApi,
  fetchContracts as fetchContractsApi,
  fetchContractDocuments as fetchContractDocumentsApi,
  fetchContractWorkflow as fetchContractWorkflowApi,
  fetchContractWorkflowApprovals as fetchContractWorkflowApprovalsApi,
  fetchContractComparativeApprovals as fetchContractComparativeApprovalsApi,
  fetchComparativeOffers as fetchComparativeOffersApi,
} from "@api/contracts";
import { contractKeys } from "./keys";

export const getContractsQueryKey = (
  tenantId?: number,
  filters?: unknown,
) => contractKeys.list(tenantId, filters);

export const fetchContracts = (...args: Parameters<typeof fetchContractsApi>) =>
  fetchContractsApi(...args);

export const fetchContractById = (
  ...args: Parameters<typeof fetchContractByIdApi>
) => fetchContractByIdApi(...args);

export const fetchContractDocuments = (
  ...args: Parameters<typeof fetchContractDocumentsApi>
) => fetchContractDocumentsApi(...args);

export const fetchContractWorkflow = (
  ...args: Parameters<typeof fetchContractWorkflowApi>
) => fetchContractWorkflowApi(...args);

export const fetchContractWorkflowApprovals = (
  ...args: Parameters<typeof fetchContractWorkflowApprovalsApi>
) => fetchContractWorkflowApprovalsApi(...args);

export const fetchContractComparativeApprovals = (
  ...args: Parameters<typeof fetchContractComparativeApprovalsApi>
) => fetchContractComparativeApprovalsApi(...args);

export const fetchComparativeOffers = (
  ...args: Parameters<typeof fetchComparativeOffersApi>
) => fetchComparativeOffersApi(...args);
