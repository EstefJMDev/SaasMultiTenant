import {
  addContractOffer as addContractOfferApi,
  approveAllContractPhases as approveAllContractPhasesApi,
  approveComparative as approveComparativeApi,
  approveContract as approveContractApi,
  createContract as createContractApi,
  importComparativeExcel as importComparativeExcelApi,
  deleteContract as deleteContractApi,
  generateContractDocs as generateContractDocsApi,
  fetchContractDocumentBlob as fetchContractDocumentBlobApi,
  fetchComparativeSourceBlob as fetchComparativeSourceBlobApi,
  replaceComparativeSource as replaceComparativeSourceApi,
  getContractDocumentDownloadUrl as getContractDocumentDownloadUrlApi,
  lookupSupplierByTaxId as lookupSupplierByTaxIdApi,
  rebuildComparative as rebuildComparativeApi,
  regenerateContractPdf as regenerateContractPdfApi,
  rejectComparative as rejectComparativeApi,
  rejectContract as rejectContractApi,
  regenerateSupplierOnboardingLink as regenerateSupplierOnboardingLinkApi,
  saveComparativeDraft as saveComparativeDraftApi,
  syncComparativeOffers as syncComparativeOffersApi,
  selectContractOffer as selectContractOfferApi,
  submitComparative as submitComparativeApi,
  validateRea as validateReaApi,
  sendSupplierForm as sendSupplierFormApi,
  submitContractGerencia as submitContractGerenciaApi,
  updateContract as updateContractApi,
  updateContractWorkflow as updateContractWorkflowApi,
  // FASE 2-8 new
  returnComparative as returnComparativeApi,
  fetchContractTemplates as fetchContractTemplatesApi,
  activateContract as activateContractApi,
  selectContractTemplate as selectContractTemplateApi,
  validateContractFields as validateContractFieldsApi,
  generateContractDocument as generateContractDocumentApi,
  submitReviewDecision as submitReviewDecisionApi,
  fetchReviewApprovals as fetchReviewApprovalsApi,
  sendContractForSignature as sendContractForSignatureApi,
  adminApproveDraft as adminApproveDraftApi,
} from "@api/contracts";

import {
  createContractAutofirmaSignatureRequest as createContractAutofirmaSignatureRequestApi,
  createSignaturitRequest as createSignaturitRequestApi,
  getTenantSignatureConfig as getTenantSignatureConfigApi,
} from "@api/signatures";

export const createContract = (...args: Parameters<typeof createContractApi>) =>
  createContractApi(...args);

export const importComparativeExcel = (
  ...args: Parameters<typeof importComparativeExcelApi>
) => importComparativeExcelApi(...args);

export const updateContract = (...args: Parameters<typeof updateContractApi>) =>
  updateContractApi(...args);

export const deleteContract = (...args: Parameters<typeof deleteContractApi>) =>
  deleteContractApi(...args);

export const approveContract = (...args: Parameters<typeof approveContractApi>) =>
  approveContractApi(...args);

export const approveComparative = (
  ...args: Parameters<typeof approveComparativeApi>
) => approveComparativeApi(...args);

export const approveAllContractPhases = (
  ...args: Parameters<typeof approveAllContractPhasesApi>
) => approveAllContractPhasesApi(...args);

export const rejectComparative = (
  ...args: Parameters<typeof rejectComparativeApi>
) => rejectComparativeApi(...args);

export const rejectContract = (
  ...args: Parameters<typeof rejectContractApi>
) => rejectContractApi(...args);

export const submitContractGerencia = (
  ...args: Parameters<typeof submitContractGerenciaApi>
) => submitContractGerenciaApi(...args);

export const submitComparative = (
  ...args: Parameters<typeof submitComparativeApi>
) => submitComparativeApi(...args);

export const validateRea = (
  ...args: Parameters<typeof validateReaApi>
) => validateReaApi(...args);

export const sendSupplierForm = (
  ...args: Parameters<typeof sendSupplierFormApi>
) => sendSupplierFormApi(...args);

export const addContractOffer = (
  ...args: Parameters<typeof addContractOfferApi>
) => addContractOfferApi(...args);

export const selectContractOffer = (
  ...args: Parameters<typeof selectContractOfferApi>
) => selectContractOfferApi(...args);

export const saveComparativeDraft = (
  ...args: Parameters<typeof saveComparativeDraftApi>
) => saveComparativeDraftApi(...args);

export const rebuildComparative = (
  ...args: Parameters<typeof rebuildComparativeApi>
) => rebuildComparativeApi(...args);

export const syncComparativeOffers = (
  ...args: Parameters<typeof syncComparativeOffersApi>
) => syncComparativeOffersApi(...args);

export const generateContractDocs = (
  ...args: Parameters<typeof generateContractDocsApi>
) => generateContractDocsApi(...args);

export const regenerateContractPdf = (
  ...args: Parameters<typeof regenerateContractPdfApi>
) => regenerateContractPdfApi(...args);

export const regenerateSupplierOnboardingLink = (
  ...args: Parameters<typeof regenerateSupplierOnboardingLinkApi>
) => regenerateSupplierOnboardingLinkApi(...args);

export const fetchContractDocumentBlob = (
  ...args: Parameters<typeof fetchContractDocumentBlobApi>
) => fetchContractDocumentBlobApi(...args);

export const fetchComparativeSourceBlob = (
  ...args: Parameters<typeof fetchComparativeSourceBlobApi>
) => fetchComparativeSourceBlobApi(...args);

export const replaceComparativeSource = (
  ...args: Parameters<typeof replaceComparativeSourceApi>
) => replaceComparativeSourceApi(...args);

export const getContractDocumentDownloadUrl = (
  ...args: Parameters<typeof getContractDocumentDownloadUrlApi>
) => getContractDocumentDownloadUrlApi(...args);

export const lookupSupplierByTaxId = (
  ...args: Parameters<typeof lookupSupplierByTaxIdApi>
) => lookupSupplierByTaxIdApi(...args);

export const updateContractWorkflow = (
  ...args: Parameters<typeof updateContractWorkflowApi>
) => updateContractWorkflowApi(...args);

export const createContractAutofirmaSignatureRequest = (
  ...args: Parameters<typeof createContractAutofirmaSignatureRequestApi>
) => createContractAutofirmaSignatureRequestApi(...args);

export const createSignaturitRequest = (
  ...args: Parameters<typeof createSignaturitRequestApi>
) => createSignaturitRequestApi(...args);

export const getTenantSignatureConfig = (
  ...args: Parameters<typeof getTenantSignatureConfigApi>
) => getTenantSignatureConfigApi(...args);

// ── FASE 2-8 (nuevo flujo) ────────────────────────────────────────────────────

export const returnComparative = (
  ...args: Parameters<typeof returnComparativeApi>
) => returnComparativeApi(...args);

export const fetchContractTemplates = (
  ...args: Parameters<typeof fetchContractTemplatesApi>
) => fetchContractTemplatesApi(...args);

export const activateContract = (
  ...args: Parameters<typeof activateContractApi>
) => activateContractApi(...args);

export const selectContractTemplate = (
  ...args: Parameters<typeof selectContractTemplateApi>
) => selectContractTemplateApi(...args);

export const validateContractFields = (
  ...args: Parameters<typeof validateContractFieldsApi>
) => validateContractFieldsApi(...args);

export const generateContractDocument = (
  ...args: Parameters<typeof generateContractDocumentApi>
) => generateContractDocumentApi(...args);

export const submitReviewDecision = (
  ...args: Parameters<typeof submitReviewDecisionApi>
) => submitReviewDecisionApi(...args);

export const fetchReviewApprovals = (
  ...args: Parameters<typeof fetchReviewApprovalsApi>
) => fetchReviewApprovalsApi(...args);

export const sendContractForSignature = (
  ...args: Parameters<typeof sendContractForSignatureApi>
) => sendContractForSignatureApi(...args);

export const adminApproveDraft = (
  ...args: Parameters<typeof adminApproveDraftApi>
) => adminApproveDraftApi(...args);
