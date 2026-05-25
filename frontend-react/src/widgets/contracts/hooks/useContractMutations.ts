import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@chakra-ui/react";

import {
  addContractOffer,
  approveAllContractPhases,
  approveComparative,
  approveContract,
  createContract,
  rejectComparative,
  rejectContract,
  deleteContract,
  generateContractDocs,
  regenerateContractPdf,
  saveComparativeDraft,
  selectContractOffer,
  submitContractGerencia,
  updateContract,
  contractKeys,
  type Contract,
  type ContractType,
  type ContractUpdatePayload,
} from "@entities/contracts";
import { getApiErrorDetail } from "@shared/utils/api";

interface UseContractMutationsOptions {
  effectiveTenantId?: number;
  contractsBaseKey: readonly unknown[];
  setCurrentContract: (contract: Contract | null) => void;
}

export function useContractMutations({
  effectiveTenantId,
  contractsBaseKey,
  setCurrentContract,
}: UseContractMutationsOptions) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const invalidateContractViews = (contractId: number, tenantId?: number) => {
    void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
    void queryClient.invalidateQueries({
      queryKey: contractKeys.detail(tenantId, contractId),
    });
    void queryClient.invalidateQueries({
      queryKey: contractKeys.workflowApprovals(tenantId, contractId),
    });
    void queryClient.invalidateQueries({
      queryKey: contractKeys.comparativeApprovals(tenantId, contractId),
    });
    void queryClient.invalidateQueries({
      queryKey: contractKeys.documents(tenantId, contractId),
    });
  };

  const createContractMutation = useMutation({
    mutationFn: (payload: {
      type: ContractType;
      comparative_data?: Record<string, unknown>;
    }) =>
      createContract(
        {
          type: payload.type,
          comparative_data: payload.comparative_data ?? null,
        },
        effectiveTenantId,
      ),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
    },
    onError: () => {
      toast({ status: "error", title: "No se pudo crear el comparativo" });
    },
  });

  const submitGerenciaMutation = useMutation({
    mutationFn: (contractId: number) =>
      submitContractGerencia(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: "Contrato enviado" });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo enviar",
        description: getApiErrorDetail(error, "Revisa el estado del contrato."),
      });
    },
  });

  const generateDocsMutation = useMutation({
    mutationFn: (contractId: number) =>
      generateContractDocs(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: "Documentos generados" });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudieron generar los documentos",
        description: getApiErrorDetail(
          error,
          "Revisa el estado del comparativo y la oferta seleccionada.",
        ),
      });
    },
  });

  const updateContractMutation = useMutation({
    mutationFn: ({
      contractId,
      payload,
    }: {
      contractId: number;
      payload: ContractUpdatePayload;
    }) => updateContract(contractId, payload, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: "Contrato actualizado" });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo guardar el contrato",
        description: getApiErrorDetail(error, "Revisa los datos del formulario."),
      });
    },
  });

  const saveComparativeDraftMutation = useMutation({
    mutationFn: ({
      contractId,
      payload,
    }: {
      contractId: number;
      payload: {
        type?: ContractType;
        comparative_data?: Record<string, unknown> | null;
      };
    }) => saveComparativeDraft(contractId, payload, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
    },
  });

  const deleteContractMutation = useMutation({
    mutationFn: (contractId: number) =>
      deleteContract(contractId, effectiveTenantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({
        status: "success",
        title: "Comparativo eliminado",
        description:
          "El comparativo y sus datos asociados se han eliminado de la base de datos.",
      });
      setCurrentContract(null);
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo eliminar el comparativo",
        description: getApiErrorDetail(
          error,
          "Solo se pueden eliminar borradores o rechazados.",
        ),
      });
    },
  });

  const selectOfferMutation = useMutation({
    mutationFn: ({
      contractId,
      offerId,
      tenantId,
    }: {
      contractId: number;
      offerId: number;
      tenantId?: number;
    }) => selectContractOffer(contractId, offerId, tenantId ?? effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo seleccionar la oferta",
        description: getApiErrorDetail(
          error,
          "Revisa tenant, estado del contrato y oferta.",
        ),
      });
    },
  });

  const approveComparativeMutation = useMutation({
    mutationFn: ({
      contractId,
      comment,
    }: {
      contractId: number;
      comment?: string;
    }) =>
      approveComparative(
        contractId,
        { comment: comment || null },
        effectiveTenantId,
      ),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      invalidateContractViews(contract.id, contract.tenant_id ?? effectiveTenantId);
      const fullyApproved = contract.comparative_status === "APPROVED";
      toast({
        status: fullyApproved ? "success" : "info",
        title: fullyApproved ? "Comparativo aprobado" : "Pendiente",
      });
    },
    onError: (error) => {
      toast({
        status: "error",
        title: "No se pudo aprobar el comparativo",
        description: getApiErrorDetail(error, "Revisa estado, rol y tenant."),
      });
    },
  });

  const approveContractMutation = useMutation({
    mutationFn: ({
      contractId,
      comment,
    }: {
      contractId: number;
      comment?: string;
    }) =>
      approveContract(
        contractId,
        { comment: comment || null },
        effectiveTenantId,
      ),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      invalidateContractViews(contract.id, contract.tenant_id ?? effectiveTenantId);
      toast({ status: "success", title: "Contrato aprobado" });
    },
    onError: (error) => {
      toast({
        status: "error",
        title: "No se pudo aprobar el contrato",
        description: getApiErrorDetail(error, "Revisa estado, rol y tenant."),
      });
    },
  });

  const regenerateContractPdfMutation = useMutation({
    mutationFn: (contractId: number) =>
      regenerateContractPdf(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: "Contrato regenerado" });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo regenerar el contrato",
        description: getApiErrorDetail(
          error,
          "Revisa datos de proveedor y del formulario.",
        ),
      });
    },
  });

  const approveAllPhasesMutation = useMutation({
    mutationFn: ({
      contractId,
      comment,
    }: {
      contractId: number;
      comment?: string;
    }) =>
      approveAllContractPhases(
        contractId,
        { comment: comment || null },
        effectiveTenantId,
      ),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      invalidateContractViews(contract.id, contract.tenant_id ?? effectiveTenantId);
      toast({ status: "success", title: "Flujo aprobado en todas las fases" });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo aprobar todo el flujo",
        description: getApiErrorDetail(
          error,
          "Revisa estado del contrato y datos del proveedor.",
        ),
      });
    },
  });

  const rejectComparativeMutation = useMutation({
    mutationFn: ({
      contractId,
      reason,
    }: {
      contractId: number;
      reason: string;
    }) => rejectComparative(contractId, { reason }, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      invalidateContractViews(contract.id, contract.tenant_id ?? effectiveTenantId);
      toast({ status: "success", title: "Comparativo rechazado" });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo rechazar el comparativo",
        description: getApiErrorDetail(error, "Revisa estado, rol y tenant."),
      });
    },
  });

  const rejectContractMutation = useMutation({
    mutationFn: ({
      contractId,
      reason,
      backToStatus,
    }: {
      contractId: number;
      reason: string;
      backToStatus?: Contract["status"] | null;
    }) =>
      rejectContract(
        contractId,
        { reason, back_to_status: backToStatus ?? null },
        effectiveTenantId,
      ),
    onSuccess: (contract, variables) => {
      setCurrentContract(contract);
      invalidateContractViews(contract.id, contract.tenant_id ?? effectiveTenantId);
      toast({
        status: "success",
        title: variables.backToStatus ? "Cambios solicitados" : "Contrato rechazado",
      });
    },
    onError: (error, variables) => {
      toast({
        status: "warning",
        title: variables.backToStatus
          ? "No se pudieron solicitar cambios"
          : "No se pudo rechazar el contrato",
        description: getApiErrorDetail(error, "Revisa estado, rol y tenant."),
      });
    },
  });

  const addOfferMutation = useMutation({
    mutationFn: ({ contractId, file }: { contractId: number; file: File }) =>
      addContractOffer(contractId, file, {}, effectiveTenantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
    },
  });

  return {
    createContractMutation,
    submitGerenciaMutation,
    generateDocsMutation,
    updateContractMutation,
    saveComparativeDraftMutation,
    deleteContractMutation,
    selectOfferMutation,
    approveComparativeMutation,
    approveContractMutation,
    regenerateContractPdfMutation,
    approveAllPhasesMutation,
    rejectComparativeMutation,
    rejectContractMutation,
    addOfferMutation,
    invalidateContractViews,
  };
}
