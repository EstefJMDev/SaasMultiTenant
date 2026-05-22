import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Portal,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Select,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useDisclosure,
  useToast,
  Spinner,
  Radio,
  RadioGroup,
} from "@chakra-ui/react";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  Plus,
  Search as SearchIcon,
  Send,
  Trash2,
  Upload,
  User,
  Users,
  Truck,
  Wrench,
  X,
} from "lucide-react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { ContractsHero } from "./ContractsHero";
import { ContractPdfViewer } from "./sections/contract-form/ContractPdfViewer";
import { SuministroForm } from "./sections/contract-form/SuministroForm";
import { SubcontratacionForm } from "./sections/contract-form/SubcontratacionForm";
import { ServicioForm } from "./sections/contract-form/ServicioForm";
import { ObraNumeroAutocomplete } from "./components/ObraNumeroAutocomplete";
import {
  consumeContractDeepLink,
  peekContractDeepLink,
  subscribeContractDeepLink,
} from "./contractDeepLink";
import { fetchErpProject } from "@api/erpReports";
import { ProjectHero } from "@widgets/projects";
import { PageInfoContext } from "@widgets/app-shell/PageInfoContext";

import { useCurrentUser } from "@hooks/useCurrentUser";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { useRouter } from "@tanstack/react-router";
import { getParentPath } from "@shared/routing/parentPath";
import {
  addContractOffer,
  approveAllContractPhases,
  approveComparative,
  approveContract,
  createContract,
  importComparativeExcel,
  deleteContract,
  fetchContractById,
  fetchContracts,
  fetchContractDocuments,
  fetchContractWorkflow,
  fetchContractWorkflowApprovals,
  fetchContractComparativeApprovals,
  fetchComparativeOffers,
  fetchComparativeSourceBlob,
  fetchContractDocumentBlob,
  replaceComparativeSource,
  generateContractDocs,
  lookupSupplierByTaxId,
  rebuildComparative,
  regenerateContractPdf,
  regenerateSupplierOnboardingLink,
  saveComparativeDraft,
  selectContractOffer,
  syncComparativeOffers,
  submitComparative,
  validateRea,
  sendSupplierForm,
  submitContractGerencia,
  updateContract,
  updateContractWorkflow,
  createContractAutofirmaSignatureRequest,
  createSignaturitRequest,
  // FASE 2-8
  returnComparative,
  rejectComparative,
  fetchContractTemplates,
  activateContract,
  selectContractTemplate,
  generateContractDocument,
  submitReviewDecision,
  fetchReviewApprovals,
  sendContractForSignature,
  adminApproveDraft,
  contractKeys,
  type Contract,
  type ContractTemplate,
  type ContractType,
  type ContractUpdatePayload,
  type ContractWorkflowApproval,
  type ContractComparativeApproval,
  type ReviewApproval,
} from "@entities/contracts";
import type { ReaValidationResult } from "@api/contracts";
import { useHrDepartments, type Department } from "@entities/hr";

// ============================================================================
// COMPONENTE PRINCIPAL - MODULO DE CONTRATOS
// ============================================================================

type ViewState =
  | "dashboard"
  | "documents"
  | "comparativo-upload"
  | "comparativo-manual"
  | "comparativo-review"
  | "contrato-form"
  | "approval-panel"
  | "workflow-config";

interface ComparativoData {
  type: "ocr" | "manual" | "excel";
  files?: FileUploadState[];
  ofertas?: OfertaItem[];
  lineas?: ManualComparativeLineItem[];
}

interface FileUploadState {
  id: number;
  name: string;
  size?: number;
  file?: File;
  status: "pending" | "processing" | "completed" | "warning";
  progress: number;
}

interface OfertaItem {
  id: number;
  proveedor: string;
  importe: string;
  plazo: string;
  observaciones: string;
}

interface ManualComparativeLineItem {
  id: number;
  codigo: string;
  medicion: string;
  unidad: string;
  descripcion: string;
  esCategoria: boolean;
  costeUnitario: string;
  precioNetoUnitario: string;
  pricesByOffer: Record<
    number,
    { ofertaN: string; precio: string; importe: string }
  >;
}

type ContractsViewMeta = Record<
  ViewState,
  {
    label: string;
    navLabel: string;
    description: string;
    icon: React.ReactElement;
  }
>;

type ContractsModuleScope = "all" | "comparatives" | "contracts";
type ContractsModuleVariant = "default" | "legal" | "administration";

interface ContractsModuleProps {
  scope?: ContractsModuleScope;
  // Variante de presentación. No altera datos, filtros ni permisos del módulo:
  // solo cambia el título mostrado para diferenciar la entrada en el menú
  // (Contratos / Contratos Jurídico / Contratos Administración).
  variant?: ContractsModuleVariant;
  initialView?: ViewState;
  forcedView?: ViewState;
  forcedViewMode?: "ver" | "editar";
  forcedContractId?: number;
  forcedIsNewFlow?: boolean;
  forcedSubTab?: "comparativo" | "informacion";
  onViewChange?: (next: {
    view: ViewState;
    viewMode: "ver" | "editar";
    contractId?: number | null;
    isNewFlow: boolean;
  }) => void;
  onSubTabChange?: (subTab: "comparativo" | "informacion") => void;
  // Invocado cuando forcedContractId no se encuentra en la lista ni vía fetch
  // puntual (id inexistente o sin permiso). El host decide qué pintar.
  onContractNotFound?: () => void;
}

const CONTRACTS_VARIANT_TITLES: Record<ContractsModuleVariant, string> = {
  default: "Contratos",
  legal: "Contratos Jurídico",
  administration: "Contratos Administración",
};

// Breadcrumb (texto gris sobre el título). En la variante por defecto se deja
// nulo para que AppShell calcule el de la sección del nav. En las variantes
// de departamento queremos ver el nombre del departamento concreto.
const CONTRACTS_VARIANT_BREADCRUMBS: Record<
  ContractsModuleVariant,
  string | null
> = {
  default: null,
  legal: "Jurídico",
  administration: "Administración",
};

export const ContractsModule: React.FC<ContractsModuleProps> = ({
  scope = "all",
  variant = "default",
  initialView = "dashboard",
  forcedView,
  forcedViewMode,
  forcedContractId,
  forcedIsNewFlow,
  forcedSubTab,
  onViewChange,
  onSubTabChange,
  onContractNotFound,
}) => {
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const { tenantId, isSuperAdmin } = useEffectiveTenantId();
  const effectiveTenantId = tenantId ?? undefined;
  const contractsBaseKey = effectiveTenantId
    ? contractKeys.base(effectiveTenantId)
    : (["contracts"] as const);

  const isControlled = Boolean(onViewChange);
  const [internalView, setInternalView] = useState<ViewState>(
    isControlled ? (forcedView ?? initialView) : initialView,
  );
  const [internalViewMode, setInternalViewMode] = useState<"ver" | "editar">(
    isControlled ? (forcedViewMode ?? "ver") : "ver",
  );
  // En modo controlado la URL (forcedView/forcedViewMode) es la fuente de verdad,
  // pero mantenemos staging refs para acumular cambios entre llamadas a setters.
  const pendingViewModeRef = useRef<"ver" | "editar" | null>(null);
  const pendingContractIdRef = useRef<number | null | undefined>(undefined);
  const pendingIsNewFlowRef = useRef<boolean | null>(null);
  const currentView: ViewState = isControlled
    ? (forcedView ?? initialView)
    : internalView;
  const viewMode: "ver" | "editar" = isControlled
    ? (forcedViewMode ?? "ver")
    : internalViewMode;
  // Refs para usar dentro de los setters sin estar en deps.
  const currentViewRef = useRef(currentView);
  const viewModeRef = useRef(viewMode);
  const currentContractRef = useRef<Contract | null>(null);
  const newFlowContractIdRef = useRef<number | null>(null);
  const suppressNextSaveToastRef = useRef(false);
  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  const setCurrentView: React.Dispatch<React.SetStateAction<ViewState>> = (value) => {
    const next = typeof value === "function"
      ? (value as (prev: ViewState) => ViewState)(currentViewRef.current)
      : value;
    if (isControlled && onViewChange) {
      const stagedMode = pendingViewModeRef.current ?? viewModeRef.current;
      const stagedContractId =
        pendingContractIdRef.current === undefined
          ? currentContractRef.current?.id ?? null
          : pendingContractIdRef.current;
      const stagedIsNew =
        pendingIsNewFlowRef.current !== null
          ? pendingIsNewFlowRef.current
          : newFlowContractIdRef.current !== null &&
            currentContractRef.current?.id === newFlowContractIdRef.current;
      // Reset pending tras consumir
      pendingViewModeRef.current = null;
      pendingContractIdRef.current = undefined;
      pendingIsNewFlowRef.current = null;
      onViewChange({
        view: next,
        viewMode: stagedMode,
        contractId: stagedContractId,
        isNewFlow: stagedIsNew,
      });
      return;
    }
    setInternalView(next);
  };
  // En modo controlado, agrupamos cambios de view/mode/contract llamados en el
  // mismo tick en un único push de URL: si después se llama a setCurrentView,
  // éste consume el pending y emite el evento síncrono; si sólo cambia el modo
  // (caso "Editar" dentro de ContratoForm), un microtask flushea el pending.
  const scheduledModeFlushRef = useRef(false);
  const flushPendingModeChange = () => {
    scheduledModeFlushRef.current = false;
    if (!isControlled || !onViewChange) return;
    if (pendingViewModeRef.current === null) return; // ya consumido por setCurrentView
    const next = pendingViewModeRef.current;
    if (next === viewModeRef.current) {
      pendingViewModeRef.current = null;
      return;
    }
    const stagedContractId =
      pendingContractIdRef.current === undefined
        ? currentContractRef.current?.id ?? null
        : pendingContractIdRef.current;
    const stagedIsNew =
      pendingIsNewFlowRef.current !== null
        ? pendingIsNewFlowRef.current
        : newFlowContractIdRef.current !== null &&
          currentContractRef.current?.id === newFlowContractIdRef.current;
    pendingViewModeRef.current = null;
    pendingContractIdRef.current = undefined;
    pendingIsNewFlowRef.current = null;
    onViewChange({
      view: currentViewRef.current,
      viewMode: next,
      contractId: stagedContractId,
      isNewFlow: stagedIsNew,
    });
  };
  const setViewMode: React.Dispatch<React.SetStateAction<"ver" | "editar">> = (value) => {
    const next = typeof value === "function"
      ? (value as (prev: "ver" | "editar") => "ver" | "editar")(
          pendingViewModeRef.current ?? viewModeRef.current,
        )
      : value;
    if (isControlled) {
      pendingViewModeRef.current = next;
      if (!scheduledModeFlushRef.current) {
        scheduledModeFlushRef.current = true;
        queueMicrotask(flushPendingModeChange);
      }
      return;
    }
    setInternalViewMode(next);
  };
  const [comparativoData, setComparativoData] =
    useState<ComparativoData | null>(null);
  const [currentContract, setCurrentContractState] = useState<Contract | null>(null);
  const setCurrentContract: React.Dispatch<React.SetStateAction<Contract | null>> = (value) => {
    const next = typeof value === "function"
      ? (value as (prev: Contract | null) => Contract | null)(currentContractRef.current)
      : value;
    if (isControlled) {
      pendingContractIdRef.current = next?.id ?? null;
    }
    setCurrentContractState(next);
  };
  const [approvalErrorDetail, setApprovalErrorDetail] = useState<string | null>(
    null,
  );
  const [contractToDelete, setContractToDelete] = useState<Contract | null>(
    null,
  );
  const deleteCancelRef = React.useRef<HTMLButtonElement | null>(null);

  // Marca un comparativo recién creado en el flujo "Nuevo comparativo".
  // Mientras está activo, ocultamos la pestaña "Aprobaciones" en la revisión.
  const [newFlowContractId, setNewFlowContractIdState] = useState<number | null>(
    null,
  );
  const setNewFlowContractId: React.Dispatch<React.SetStateAction<number | null>> = (value) => {
    const next = typeof value === "function"
      ? (value as (prev: number | null) => number | null)(newFlowContractIdRef.current)
      : value;
    if (isControlled) {
      // newFlow flag: comparamos con el contractId pendiente o actual
      const ctxId = pendingContractIdRef.current === undefined
        ? currentContractRef.current?.id ?? null
        : pendingContractIdRef.current;
      pendingIsNewFlowRef.current = next !== null && ctxId === next;
    }
    setNewFlowContractIdState(next);
  };
  useEffect(() => { currentContractRef.current = currentContract; }, [currentContract]);
  useEffect(() => { newFlowContractIdRef.current = newFlowContractId; }, [newFlowContractId]);

  // Información general compartida entre "Subida OCR" y "Comparativo manual".
  const [sharedObraNumero, setSharedObraNumero] = useState("");
  const [sharedObraNombre, setSharedObraNombre] = useState("");
  const [sharedJefeObra, setSharedJefeObra] = useState("");
  const [sharedContractType, setSharedContractType] =
    useState<ContractType>("SUBCONTRATACION");
  const [sharedTituloComparativo, setSharedTituloComparativo] = useState("");
  // Limpia campos del wizard y datos del comparativo para empezar uno nuevo desde cero.
  // Jefe de obra se pre-rellena con el usuario actual (editable luego por el usuario).
  const resetWizardState = () => {
    setSharedObraNumero("");
    setSharedObraNombre("");
    setSharedJefeObra(currentUser?.full_name?.trim() ?? "");
    setSharedContractType("SUBCONTRATACION");
    setSharedTituloComparativo("");
    setComparativoData(null);
    setCurrentContract(null);
    setNewFlowContractId(null);
  };

  // Al entrar al wizard sin contrato, autocompleta el Jefe de obra con el usuario actual
  // mientras el campo siga vacío (no pisa edición manual ni datos existentes).
  useEffect(() => {
    if (currentContract) return;
    if (currentView !== "comparativo-upload" && currentView !== "comparativo-manual") return;
    const defaultJefe = currentUser?.full_name?.trim();
    if (!defaultJefe) return;
    if (sharedJefeObra.trim().length > 0) return;
    setSharedJefeObra(defaultJefe);
  }, [currentView, currentUser?.full_name, currentContract, sharedJefeObra]);

  const { setOverride } = useContext(PageInfoContext);
  useEffect(() => {
    if (scope === "comparatives") {
      const overrides: Partial<Record<string, { title: string }>> = {
        "comparativo-review":  { title: "Revisión del comparativo" },
        "approval-panel":      { title: "Aprobaciones" },
        "comparativo-upload":  { title: "Nuevo comparativo" },
        "comparativo-manual":  { title: "Comparativo manual" },
      };
      const match = overrides[currentView];
      // Siempre forzar título "Comparativos" como base para evitar fallback al nav.
      setOverride(match
        ? { title: match.title }
        : { title: "Comparativos" });
      return () => setOverride(null);
    }
    if (scope === "contracts") {
      const breadcrumb = CONTRACTS_VARIANT_BREADCRUMBS[variant];
      setOverride({
        title: CONTRACTS_VARIANT_TITLES[variant],
        ...(breadcrumb ? { breadcrumb } : {}),
      });
      return () => setOverride(null);
    }
    setOverride(null);
    return () => setOverride(null);
  }, [scope, variant, currentView, setOverride]);

  const getApiErrorDetail = (error: unknown, fallback: string) => {
    const axiosErr = error as AxiosError<{ detail?: string }>;
    const detail = axiosErr?.response?.data?.detail;
    return detail || fallback;
  };

  const openContractDocumentPreview = async (
    contractId: number,
    docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
    tenantId?: number,
  ) => {
    try {
      const { blob } = await fetchContractDocumentBlob(
        contractId,
        docType,
        tenantId,
        true,
      );
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      toast({
        status: "warning",
        title: "No se pudo abrir el documento",
        description: getApiErrorDetail(error, "Revisa el tenant activo."),
      });
    }
  };

  const downloadContractDocumentFile = async (
    contractId: number,
    docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
    tenantId?: number,
  ) => {
    try {
      const { blob, filename } = await fetchContractDocumentBlob(
        contractId,
        docType,
        tenantId,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename || `CT-${contractId}-${docType}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      toast({
        status: "warning",
        title: "No se pudo descargar el documento",
        description: getApiErrorDetail(error, "Revisa el tenant activo."),
      });
    }
  };

  useEffect(() => {
    if (isControlled) return;
    setInternalView((prev) => (prev === initialView ? prev : initialView));
  }, [initialView, isControlled]);

  // Resetear scroll al inicio cada vez que cambia la vista.
  useEffect(() => {
    const root = document.querySelector('[data-scroll-root="true"]') as HTMLElement | null;
    if (root) root.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [currentView]);

  useEffect(() => {
    if (forcedIsNewFlow === true && newFlowContractId === null && currentContract?.id) {
      setNewFlowContractId(currentContract.id);
    }
    if (forcedIsNewFlow === false && newFlowContractId !== null) {
      setNewFlowContractId(null);
    }
  }, [forcedIsNewFlow, newFlowContractId, currentContract?.id]);

  // En modo controlado: detectar entrada a "nuevo comparativo" para limpiar el wizard.
  const prevForcedViewRef = useRef<ViewState | undefined>(forcedView);
  useEffect(() => {
    const entering =
      forcedView === "comparativo-upload" &&
      forcedIsNewFlow === true &&
      prevForcedViewRef.current !== "comparativo-upload";
    prevForcedViewRef.current = forcedView;
    if (entering) {
      resetWizardState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedView, forcedIsNewFlow]);

  // En modo controlado, todos los cambios pasan por setCurrentView (el último
  // setter llamado en cada handler), que ya hace push con el contractId/isNewFlow
  // pendientes acumulados. No necesitamos useEffect notifier.

  // IDs de contratos eliminados localmente en la sesión actual.
  // Filtro defensivo porque el backend remoto hace soft-delete sin filtrar
  // en el listado y `ContractRead` no expone `deleted_at`.
  const [deletedContractIds, setDeletedContractIds] = useState<Set<number>>(
    () => new Set(),
  );

  const contractsQuery = useQuery<Contract[]>({
    queryKey: contractKeys.list(effectiveTenantId),
    queryFn: () => fetchContracts(effectiveTenantId),
    enabled: !isSuperAdmin || Boolean(effectiveTenantId),
    retry: false,
    // Descarta contratos soft-eliminados localmente.
    select: (data) => {
      const filtered = data.filter(
        (contract) => !deletedContractIds.has(contract.id),
      );
      if (deletedContractIds.size > 0) {
        console.log(
          "[contractsQuery.select] IDs eliminados localmente:",
          [...deletedContractIds],
          "→ filtrando",
          data.length - filtered.length,
          "de",
          data.length,
        );
      }
      return filtered;
    },
  });

  // Sincroniza contrato seleccionado con forcedContractId del router.
  // Si el id no aparece en la lista (p. ej. acceso directo por URL a un
  // contrato no visible en la lista paginada/filtrada del usuario), se
  // intenta un fetch puntual. Si éste falla, se notifica al host.
  useEffect(() => {
    if (!forcedContractId) return;
    if (currentContract?.id === forcedContractId) return;
    const found = contractsQuery.data?.find((c) => c.id === forcedContractId);
    if (found) {
      setCurrentContract(found);
      return;
    }
    // Esperar a que la lista termine de cargar antes de fallback a fetch puntual.
    if (contractsQuery.isLoading) return;
    let cancelled = false;
    fetchContractById(forcedContractId, effectiveTenantId)
      .then((contract) => {
        if (cancelled) return;
        if (contract) setCurrentContract(contract);
        else onContractNotFound?.();
      })
      .catch(() => {
        if (cancelled) return;
        onContractNotFound?.();
      });
    return () => {
      cancelled = true;
    };
  }, [
    forcedContractId,
    contractsQuery.data,
    contractsQuery.isLoading,
    currentContract?.id,
    effectiveTenantId,
    onContractNotFound,
  ]);

  // Evitamos consultar /signatures/config desde este modulo para no forzar 403.
  const signatureConfigQuery = { data: null as { allow_autofirma?: boolean } | null };

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
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
    },
    onError: () => {
      toast({
        status: "error",
        title: "No se pudo crear el comparativo",
      });
    },
  });
  const importComparativeExcelMutation = useMutation({
    mutationFn: (payload: {
      file: File;
      type: ContractType;
      obra_numero?: string | null;
      obra_nombre?: string | null;
      jefe_obra?: string | null;
    }) =>
      importComparativeExcel(
        payload.file,
        {
          type: payload.type,
          obra_numero: payload.obra_numero ?? null,
          obra_nombre: payload.obra_nombre ?? null,
          jefe_obra: payload.jefe_obra ?? null,
        },
        effectiveTenantId,
      ),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
    },
    onError: () => {
      toast({
        status: "error",
        title: "No se pudo importar el Excel",
      });
    },
  });

  const submitGerenciaMutation = useMutation({
    mutationFn: (contractId: number) =>
      submitContractGerencia(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
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
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
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
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
      if (suppressNextSaveToastRef.current) {
        suppressNextSaveToastRef.current = false;
        return;
      }
      const isComparativeEditingContext =
        scope === "comparatives" || currentView === "comparativo-review";
      toast({
        status: "success",
        title: isComparativeEditingContext
          ? "Borrador guardado"
          : `Contrato guardado (CT-${contract.id})`,
        description:
          isComparativeEditingContext
            ? undefined
            : contract.status === "PENDING_DATA_VALIDATION"
            ? "Los cambios del borrador administrativo se han guardado correctamente."
            : "Los cambios del contrato se han guardado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo guardar el contrato",
        description: getApiErrorDetail(
          error,
          "Revisa los datos del formulario.",
        ),
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
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
      toast({ status: "success", title: "Borrador guardado" });
    },
    onError: () => {
      toast({ status: "error", title: "No se pudo guardar el borrador" });
    },
  });

  const deleteContractMutation = useMutation({
    mutationFn: (contractId: number) => {
      console.log("[DELETE] Enviando DELETE para contractId=", contractId, "tenantId=", effectiveTenantId);
      return deleteContract(contractId, effectiveTenantId);
    },
    onSuccess: async (data, contractId) => {
      console.log("[DELETE] Backend respondió OK para contractId=", contractId, "data=", data);
      setDeletedContractIds((prev) => {
        const next = new Set(prev);
        next.add(contractId);
        console.log("[DELETE] Set de IDs eliminados local ahora:", [...next]);
        return next;
      });
      // Optimistic: removemos del cache inmediatamente.
      queryClient.setQueryData<Contract[]>(
        contractKeys.list(effectiveTenantId),
        (prev) => {
          const filtered = (prev ?? []).filter((c) => c.id !== contractId);
          console.log("[DELETE] Cache tras optimistic update:", filtered.length, "items");
          return filtered;
        },
      );
      await queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({
        status: "success",
        title: "Comparativo eliminado",
        description:
          "El comparativo y sus datos asociados se han eliminado de la base de datos.",
      });
      if (currentContract?.id === contractId) {
        setCurrentContract(null);
      }
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
    }) =>
      selectContractOffer(contractId, offerId, tenantId ?? effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
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
      setApprovalErrorDetail(null);
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
      const fullyApproved = contract.comparative_status === "APPROVED";
      toast({
        status: "success",
        title: "Comparativo aprobado",
        description: fullyApproved
          ? "El comparativo ha quedado completamente aprobado."
          : "Tu aprobación se ha registrado correctamente. Queda pendiente la siguiente validación.",
      });
    },
    onError: (error) => {
      const detail = getApiErrorDetail(error, "Revisa estado, rol y tenant.");
      setApprovalErrorDetail(detail);
      toast({
        status: "error",
        title: "No se pudo aprobar el comparativo",
        description: detail,
      });
    },
  });

  const returnComparativeMutation = useMutation({
    mutationFn: ({ contractId, comment }: { contractId: number; comment: string }) =>
      returnComparative(contractId, comment, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      setApprovalErrorDetail(null);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "info", title: "Comparativo devuelto para correcciones" });
    },
    onError: (error) => {
      toast({
        status: "error",
        title: "No se pudo devolver el comparativo",
        description: getApiErrorDetail(error, "Revisa estado y rol."),
      });
    },
  });

  const rejectComparativeMutation = useMutation({
    mutationFn: ({ contractId, reason }: { contractId: number; reason: string }) =>
      rejectComparative(contractId, { reason }, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      setApprovalErrorDetail(null);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: "Comparativo rechazado" });
    },
    onError: (error) => {
      toast({
        status: "error",
        title: "No se pudo rechazar el comparativo",
        description: getApiErrorDetail(error, "Revisa estado y rol."),
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
      setApprovalErrorDetail(null);
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
      toast({ status: "success", title: "Contrato aprobado" });
    },
    onError: (error) => {
      const detail = getApiErrorDetail(error, "Revisa estado, rol y tenant.");
      setApprovalErrorDetail(detail);
      toast({
        status: "error",
        title: "No se pudo aprobar el contrato",
        description: detail,
      });
    },
  });

  const validateReaMutation = useMutation({
    mutationFn: (contractId: number) =>
      validateRea(contractId, effectiveTenantId),
  });

  const sendSupplierFormMutation = useMutation({
    mutationFn: (contractId: number) =>
      sendSupplierForm(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({
        status: "success",
        title: "Formulario enviado al proveedor",
        description: "El proveedor recibirá un email con el enlace para completar sus datos.",
        duration: 7000,
        isClosable: true,
      });
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo enviar el formulario al proveedor",
        description: getApiErrorDetail(error, "Revisa NIF/CIF y email del proveedor."),
      });
    },
  });

  const submitComparativeMutation = useMutation({
    mutationFn: (contractId: number) =>
      submitComparative(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      setApprovalErrorDetail(null);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      if (contract.status === "PENDING_SUPPLIER") {
        toast({
          status: "info",
          title: "Enlace enviado al proveedor",
          description:
            "El proveedor no está en BD. Se ha enviado un enlace al email del comparativo para completar sus datos. El comparativo avanzará a Gerencia automáticamente cuando termine.",
          duration: 9000,
          isClosable: true,
        });
      } else {
        toast({
          status: "success",
          title: "Comparativo enviado",
        });
      }
    },
    onError: (error) => {
      toast({
        status: "warning",
        title: "No se pudo enviar el comparativo",
        description: getApiErrorDetail(
          error,
          "Revisa que exista oferta seleccionada y el comparativo esté en borrador.",
        ),
      });
    },
  });

  const regenerateContractPdfMutation = useMutation({
    mutationFn: (contractId: number) =>
      regenerateContractPdf(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
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
      setApprovalErrorDetail(null);
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
      toast({ status: "success", title: "Flujo aprobado en todas las fases" });
    },
    onError: (error) => {
      const detail = getApiErrorDetail(
        error,
        "Revisa estado del contrato y datos del proveedor.",
      );
      setApprovalErrorDetail(detail);
      toast({
        status: "warning",
        title: "No se pudo aprobar todo el flujo",
        description: detail,
      });
    },
  });

  const addOfferMutation = useMutation({
    mutationFn: ({ contractId, file }: { contractId: number; file: File }) =>
      addContractOffer(contractId, file, {}, effectiveTenantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: contractsBaseKey,
      });
    },
  });

  // ── FASE 3: activar contrato ─────────────────────────────────────────────────
  const activateContractMutation = useMutation({
    mutationFn: ({ contractId, subtype }: { contractId: number; subtype?: string }) =>
      activateContract(contractId, { subtype }, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: "Contrato activado" });
    },
    onError: (error) => {
      toast({ status: "error", title: "Error", description: getApiErrorDetail(error, "No se pudo activar.") });
    },
  });

  // ── FASE 4: seleccionar plantilla ────────────────────────────────────────────
  const selectTemplateMutation = useMutation({
    mutationFn: ({ contractId, templateId }: { contractId: number; templateId: number }) =>
      selectContractTemplate(contractId, templateId, effectiveTenantId),
    onSuccess: ({ contract }) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: "Plantilla seleccionada" });
    },
    onError: (error) => {
      toast({ status: "error", title: "Error", description: getApiErrorDetail(error, "No se pudo seleccionar la plantilla.") });
    },
  });

  // ── FASE 6: generar documento ────────────────────────────────────────────────
  const generateDocumentMutation = useMutation({
    mutationFn: (contractId: number) =>
      generateContractDocument(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      if ((contract as any).supplier_request_token) {
        toast({ status: "info", title: "Datos incompletos — Email enviado al proveedor", description: "El proveedor recibirá un enlace para completar sus datos." });
      } else {
        toast({ status: "success", title: "Documento generado — En revisión" });
      }
    },
    onError: (error) => {
      toast({ status: "error", title: "Error generando documento", description: getApiErrorDetail(error, "Revisa los datos del contrato.") });
    },
  });

  // ── FASE 6.5: Admin aprueba borrador → pasa a revisión multi-rol ────────────
  const adminApproveDraftMutation = useMutation({
    mutationFn: (contractId: number) =>
      adminApproveDraft(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      void queryClient.invalidateQueries({ queryKey: ["review-approvals", contract.id] });
      toast({
        status: "success",
        title: "Contrato enviado a revisión",
        description: "Jurídico, Jefe de Obra y Director Técnico han sido notificados.",
      });
    },
    onError: (error) => {
      toast({
        status: "error",
        title: "Error al aprobar el borrador",
        description: getApiErrorDetail(error, "Revisa los datos del contrato."),
      });
    },
  });

  // ── FASE 7: decisión de revisión ─────────────────────────────────────────────
  const reviewDecisionMutation = useMutation({
    mutationFn: ({ contractId, approved, comment }: { contractId: number; approved: boolean; comment?: string }) =>
      submitReviewDecision(contractId, { approved, comment }, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: contract.status === "FULLY_APPROVED" ? "¡Contrato totalmente aprobado!" : "Decisión registrada" });
    },
    onError: (error) => {
      toast({ status: "error", title: "Error", description: getApiErrorDetail(error, "No se pudo registrar la decisión.") });
    },
  });

  // ── FASE 8: enviar a firma ───────────────────────────────────────────────────
  const sendForSignatureMutation = useMutation({
    mutationFn: (contractId: number) =>
      sendContractForSignature(contractId, effectiveTenantId),
    onSuccess: (contract) => {
      setCurrentContract(contract);
      void queryClient.invalidateQueries({ queryKey: contractsBaseKey });
      toast({ status: "success", title: "Contrato enviado a Viafirma para firma" });
    },
    onError: (error) => {
      toast({ status: "error", title: "Error", description: getApiErrorDetail(error, "No se pudo enviar a firma.") });
    },
  });

  const contracts = contractsQuery.data ?? [];
  const allowAutofirma = isSuperAdmin;
  const roleName = (currentUser?.role_name ?? "").toLowerCase();
  const isJefeObraPosition = useMemo(() => {
    const positionName = (currentUser?.position_name ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    return positionName.includes("jefe de obra");
  }, [currentUser?.position_name]);
  const permissions = useMemo(
    () => new Set(currentUser?.permissions ?? []),
    [currentUser?.permissions],
  );
  const canManageWorkflow =
    isSuperAdmin || roleName === "tenant_admin" || permissions.has("hr:manage");
  const CONTRACT_ADMIN_ROLES = new Set([
    "administracion",
    "admin",
    "administration",
    "tenant_admin",
  ]);
  const isContractAdmin = isSuperAdmin || CONTRACT_ADMIN_ROLES.has(roleName);
  const canManageDraftContracts = Boolean(
    isSuperAdmin || roleName === "tenant_admin",
  );
  const canEditContractsByCap = Boolean(
    isSuperAdmin || currentUser?.can_edit_contract,
  );
  const contractsForScope = useMemo(() => {
    if (scope !== "contracts") return contracts;
    const approvedContracts = contracts.filter(
      (contract) => contract.comparative_status === "APPROVED",
    );
    if (canManageDraftContracts) return approvedContracts;
    return approvedContracts.filter((contract) => {
      const isAdminDraft = contract.status === "DRAFT";
      const isPreAdminStatus = [
        "PENDING_SUPPLIER",
        "PENDING_TEMPLATE",
        "PENDING_DATA_VALIDATION",
      ].includes(contract.status);
      if (!isAdminDraft && !isPreAdminStatus) return true;
      return canEditContractsByCap;
    });
  }, [canEditContractsByCap, canManageDraftContracts, contracts, scope]);
  const latestContracts = useMemo(
    () => contractsForScope.slice(0, 3),
    [contractsForScope],
  );

  useEffect(() => {
    if (currentView === "workflow-config" && !canManageWorkflow) {
      setCurrentView("dashboard");
    }
  }, [currentView, canManageWorkflow]);
  const pendingContract = useMemo(() => {
    const isGerenciaRole =
      roleName === "gerencia" ||
      roleName === "gerente" ||
      roleName === "manager" ||
      roleName === "management" ||
      roleName === "tenant_admin";

    if (isGerenciaRole) {
      return (
        contracts.find(
          (contract: Contract) =>
            contract.comparative_status === "PENDING_MGMT_APPROVAL",
        ) ??
        contracts.find(
          (contract: Contract) => contract.status === "PENDING_GERENCIA",
        ) ??
        null
      );
    }

    return (
      contracts.find(
        (contract: Contract) =>
          contract.status.startsWith("PENDING") ||
          contract.comparative_status === "PENDING_MGMT_APPROVAL",
      ) ?? null
    );
  }, [contracts, roleName]);

  useEffect(() => {
    if (currentView !== "approval-panel") return;
    if (currentContract) return;
    const fallback = pendingContract ?? contracts[0] ?? null;
    if (fallback) {
      setCurrentContract(fallback);
    }
  }, [currentView, currentContract, pendingContract, contracts]);

  useEffect(() => {
    if (currentView !== "comparativo-review") return;
    if (currentContract) return;
    const fallback = contracts[0] ?? null;
    if (fallback) {
      setCurrentContract(fallback);
    }
  }, [currentView, currentContract, contracts]);

  useEffect(() => {
    if (!currentContract) return;
    const refreshed = contracts.find(
      (contract: Contract) => contract.id === currentContract.id,
    );
    if (refreshed && refreshed !== currentContract) {
      setCurrentContract(refreshed);
    }
  }, [contracts, currentContract]);

  // Deep link via store global (CustomEvent). El bell de notificaciones setea
  // un payload {contractId, view, mode, doc} y navega a /contracts; aqui lo
  // consumimos en cuanto haya contracts cargados.
  const [deepLinkTick, setDeepLinkTick] = useState(0);
  useEffect(() => {
    const unsub = subscribeContractDeepLink(() => setDeepLinkTick((t) => t + 1));
    return unsub;
  }, []);
  useEffect(() => {
    if (contracts.length === 0) return;
    const link = peekContractDeepLink();
    if (!link) return;
    const target = contracts.find((c: Contract) => c.id === link.contractId);
    if (!target) return;
    consumeContractDeepLink();
    setCurrentContract(target);
    setViewMode(link.mode || "ver");
    setCurrentView((link.view as ViewState) || "contrato-form");
    if (
      link.doc === "CONTRACT" ||
      link.doc === "COMPARATIVE" ||
      link.doc === "SIGNED"
    ) {
      void openContractDocumentPreview(
        target.id,
        link.doc,
        target.tenant_id ?? effectiveTenantId,
      );
    }
  }, [contracts, deepLinkTick, effectiveTenantId]);

  useEffect(() => {
    if (currentView !== "comparativo-review" || !currentContract) return;
    void contractsQuery.refetch();
  }, [currentView, currentContract?.id, effectiveTenantId]);

  const handleSelectContract = (contract: Contract, view: ViewState) => {
    setCurrentContract(contract);
    setApprovalErrorDetail(null);
    setViewMode("ver");
    setNewFlowContractId(null);
    setCurrentView(view);
  };

  const viewMeta: ContractsViewMeta = {
    dashboard: {
      label: "Panel",
      navLabel: "Panel",
      description: "Resumen general y accesos rápidos de contratos.",
      icon: <FileText size={16} />,
    },
    documents: {
      label: "Comparativos",
      navLabel: "Comparativos",
      description: "Consulta, descarga y abre archivos del contrato seleccionado.",
      icon: <Download size={16} />,
    },
    "comparativo-upload": {
      label: "OCR",
      navLabel: "OCR",
      description: "Carga ofertas y construye el comparativo automáticamente.",
      icon: <Upload size={16} />,
    },
    "comparativo-manual": {
      label: "Manual",
      navLabel: "Manual",
      description: "Edita líneas, precios y estructura del comparativo.",
      icon: <Plus size={16} />,
    },
    "comparativo-review": {
      label: "Revisión",
      navLabel: "Revisar",
      description: "Valida ofertas, analiza totales y selecciona la ganadora.",
      icon: <Eye size={16} />,
    },
    "contrato-form": {
      label: "Contrato",
      navLabel: "Contrato",
      description: "Completa datos contractuales y genera documentación final.",
      icon: <FileText size={16} />,
    },
    "approval-panel": {
      label: "Aprobaciones",
      navLabel: "Aprobaciones",
      description: "Gestiona fases, historial y estado de aprobación.",
      icon: <Check size={16} />,
    },
    "workflow-config": {
      label: "Workflow",
      navLabel: "Workflow",
      description: "Define el orden de departamentos para aprobación.",
      icon: <Wrench size={16} />,
    },
  };

  const comparativeTabs: ViewState[] = [
    "documents",
    "comparativo-upload",   // no aparece en nav, botón "Nuevo comparativo"
    "comparativo-review",   // no aparece en nav, se abre al pulsar "Abrir" en la tabla
    "comparativo-manual",   // no aparece en nav, modo manual dentro de "Nuevo comparativo"
    "approval-panel",       // no aparece en nav, botón "Aprobaciones" dentro del comparativo
  ];
  const contractsTabs: ViewState[] = [
    "dashboard",
    "documents",
    "contrato-form",
    "approval-panel",
    ...(canManageWorkflow ? (["workflow-config"] as ViewState[]) : []),
  ];
  const viewTabs: ViewState[] =
    scope === "comparatives"
      ? comparativeTabs
      : scope === "contracts"
        ? contractsTabs
        : [
            "dashboard",
            "documents",
            "comparativo-upload",
            "comparativo-manual",
            "comparativo-review",
            "contrato-form",
            "approval-panel",
            ...(canManageWorkflow ? (["workflow-config"] as ViewState[]) : []),
          ];

  useEffect(() => {
    if (!viewTabs.includes(currentView)) {
      setCurrentView(viewTabs[0] ?? "dashboard");
    }
  }, [currentView, viewTabs]);

  const defaultDashboardOpenView: ViewState =
    scope === "contracts" ? "contrato-form" : "comparativo-review";
  const navCardBg = useColorModeValue("white", "gray.800");
  const navBorderColor = useColorModeValue("gray.200", "gray.700");
  const navGradient = useColorModeValue(
    "linear(to-r, brand.50, teal.50)",
    "linear(to-r, gray.700, gray.800)",
  );
  const navIconBg = useColorModeValue("whiteAlpha.800", "whiteAlpha.200");
  const navDescriptionColor = useColorModeValue("gray.600", "gray.300");
  // En scope "comparatives" la navegación de pestañas se ha eliminado;
  // el botón "Nuevo comparativo" pasa a la cabecera del listado.
  const tabsNavigation =
    scope === "comparatives" || scope === "contracts" ? null : (
      <ContractsTabsNav
        currentView={currentView}
        onChangeView={setCurrentView}
        canManageWorkflow={canManageWorkflow}
        viewTabs={viewTabs}
        viewMeta={viewMeta}
        navCardBg={navCardBg}
        navBorderColor={navBorderColor}
        navGradient={navGradient}
        navIconBg={navIconBg}
        navDescriptionColor={navDescriptionColor}
        showHeader={false}
      />
    );

  if (contractsQuery.isLoading) {
    return (
      <Flex justify="center" py={10}>
        <Spinner />
      </Flex>
    );
  }

  const parentViewMap: Partial<Record<ViewState, ViewState | null>> =
    scope === "comparatives"
      ? {
          "comparativo-review": "documents",
          "comparativo-upload": "documents",
          "comparativo-manual": "comparativo-upload",
          "approval-panel": "comparativo-review",
        }
      : {
          documents: "dashboard",
          "contrato-form": "dashboard",
          "approval-panel": "dashboard",
          "workflow-config": "dashboard",
          "comparativo-review": "dashboard",
          "comparativo-upload": "dashboard",
          "comparativo-manual": "dashboard",
        };

  const handleVolver = () => {
    // En modo controlado por URL, usar getParentPath para navegar al padre real.
    if (isControlled) {
      const parent = getParentPath(router.state.location.pathname);
      router.history.push(parent ?? "/dashboard");
      return;
    }
    const parent = parentViewMap[currentView];
    if (parent !== undefined) {
      setCurrentView(parent as ViewState);
    } else {
      // Fallback: ir al dashboard en lugar de history.back() para mantener consistencia.
      router.history.push("/dashboard");
    }
  };

  return (
    <Box>
      {isSuperAdmin && !effectiveTenantId ? (
        <Alert status="warning" borderRadius="md" mt={6}>
          <AlertIcon />
          Selecciona un tenant para visualizar y gestionar contratos.
        </Alert>
      ) : (
        <Box>
          {currentView === "dashboard" && (
            <Dashboard
              navigation={tabsNavigation}
              contracts={contractsForScope}
              latestContracts={latestContracts}
              currentUserId={currentUser?.id ?? null}
              onSelectContract={handleSelectContract}
              defaultOpenView={defaultDashboardOpenView}
              isEditable={
                scope === "comparatives"
                  ? (contract) => contract.comparative_status !== "APPROVED"
                  : (contract) =>
                      contract.status === "DRAFT" ||
                      (contract.status === "PENDING_DATA_VALIDATION" &&
                        !!currentUser?.id &&
                        contract.assigned_admin_user_id === currentUser.id)
              }
              onEditContract={(contract) => {
                setCurrentContract(contract);
                setViewMode("editar");
                if (scope === "comparatives") {
                  setCurrentView("comparativo-review");
                } else {
                  setCurrentView("contrato-form");
                }
              }}
              onDeleteContract={(contract) => {
                setContractToDelete(contract);
              }}
            />
          )}
          {currentView === "comparativo-upload" && (
            <ComparativoUpload
              tabsNavigation={tabsNavigation}
              onNavigate={setCurrentView}
              onComplete={setComparativoData}
              obraNumero={sharedObraNumero}
              setObraNumero={setSharedObraNumero}
              obraNombre={sharedObraNombre}
              setObraNombre={setSharedObraNombre}
              jefeObra={sharedJefeObra}
              setJefeObra={setSharedJefeObra}
              contractType={sharedContractType}
              setContractType={setSharedContractType}
              tituloComparativo={sharedTituloComparativo}
              setTituloComparativo={setSharedTituloComparativo}
              tenantId={effectiveTenantId}
              onImportExcel={async (file, payload) => {
                const contract =
                  await importComparativeExcelMutation.mutateAsync({
                    file,
                    type: payload.type,
                    title: sharedTituloComparativo.trim() || null,
                    obra_numero: sharedObraNumero.trim() || null,
                    obra_nombre: sharedObraNombre.trim() || null,
                    jefe_obra: sharedJefeObra.trim() || null,
                  });
                const refreshed = await fetchContracts(effectiveTenantId);
                const updated =
                  refreshed.find((item: Contract) => item.id === contract.id) ??
                  contract;
                setCurrentContract(updated);
                setNewFlowContractId(updated.id);
                setCurrentView("comparativo-review");
              }}
              onCreateContract={async (payload, files) => {
                const manualObraNumero = sharedObraNumero.trim();
                const manualObraNombre = sharedObraNombre.trim();
                const manualJefeObra = sharedJefeObra.trim();
                const manualComparativeData =
                  manualObraNumero || manualObraNombre || manualJefeObra
                    ? {
                        ...(manualObraNumero ? { obra_numero: manualObraNumero } : {}),
                        ...(manualObraNombre ? { obra_nombre: manualObraNombre } : {}),
                        ...(manualJefeObra ? { jefe_obra: manualJefeObra } : {}),
                        header: {
                          ...(manualObraNumero ? { obra_num: manualObraNumero } : {}),
                          ...(manualObraNombre ? { obra_nombre: manualObraNombre } : {}),
                          ...(manualJefeObra ? { jefe_obra: manualJefeObra } : {}),
                        },
                      }
                    : undefined;
                const manualTitle = sharedTituloComparativo.trim();
                const contract =
                  await createContractMutation.mutateAsync({
                    ...payload,
                    ...(manualTitle ? { title: manualTitle } : {}),
                    comparative_data: {
                      ...((payload as any)?.comparative_data ?? {}),
                      ...(manualComparativeData ?? {}),
                    },
                  });
                if (files.length > 0) {
                  await Promise.all(
                    files.map((file) =>
                      addOfferMutation.mutateAsync({
                        contractId: contract.id,
                        file,
                      }),
                    ),
                  );
                }
                const refreshed = await fetchContracts(effectiveTenantId);
                const updated =
                  refreshed.find((item: Contract) => item.id === contract.id) ??
                  contract;
                setCurrentContract(updated);
                setNewFlowContractId(updated.id);
                setCurrentView("comparativo-review");
              }}
              onSaveDraft={async (payload) => {
                const canUpdateCurrent =
                  Boolean(currentContract?.id) &&
                  currentContract?.status === "DRAFT" &&
                  (currentContract?.comparative_status === "DRAFT" ||
                    currentContract?.comparative_status === "REJECTED" ||
                    currentContract?.comparative_status === "NEEDS_CHANGES");
                const manualObraNumero = sharedObraNumero.trim();
                const manualObraNombre = sharedObraNombre.trim();
                const manualJefeObra = sharedJefeObra.trim();
                const manualTitle = sharedTituloComparativo.trim();
                const manualComparativeData =
                  manualObraNumero || manualObraNombre || manualJefeObra
                    ? {
                        ...(manualObraNumero ? { obra_numero: manualObraNumero } : {}),
                        ...(manualObraNombre ? { obra_nombre: manualObraNombre } : {}),
                        ...(manualJefeObra ? { jefe_obra: manualJefeObra } : {}),
                        header: {
                          ...(manualObraNumero ? { obra_num: manualObraNumero } : {}),
                          ...(manualObraNombre ? { obra_nombre: manualObraNombre } : {}),
                          ...(manualJefeObra ? { jefe_obra: manualJefeObra } : {}),
                        },
                      }
                    : undefined;
                if (canUpdateCurrent && currentContract?.id) {
                  const updated = await saveComparativeDraftMutation.mutateAsync({
                    contractId: currentContract.id,
                    payload: {
                      type: payload.type,
                      ...(manualTitle ? { title: manualTitle } : {}),
                    },
                  });
                  setCurrentContract(updated);
                  setNewFlowContractId(updated.id);
                  return;
                }
                const created = await createContractMutation.mutateAsync({
                  type: payload.type,
                  ...(manualTitle ? { title: manualTitle } : {}),
                  ...(manualComparativeData
                    ? { comparative_data: manualComparativeData }
                    : {}),
                });
                setCurrentContract(created);
                setNewFlowContractId(created.id);
              }}
            />
          )}
          {currentView === "comparativo-manual" && (
            <ComparativoManual
              tabsNavigation={tabsNavigation}
              contract={currentContract}
              onNavigate={setCurrentView}
              onComplete={setComparativoData}
              obraNumero={sharedObraNumero}
              setObraNumero={setSharedObraNumero}
              obraNombre={sharedObraNombre}
              setObraNombre={setSharedObraNombre}
              jefeObra={sharedJefeObra}
              setJefeObra={setSharedJefeObra}
              contractType={sharedContractType}
              setContractType={setSharedContractType}
              tituloComparativo={sharedTituloComparativo}
              setTituloComparativo={setSharedTituloComparativo}
              tenantId={effectiveTenantId}
              onSaveDraft={async (payload) => {
                const canUpdateCurrent =
                  Boolean(currentContract?.id) &&
                  currentContract?.status === "DRAFT" &&
                  (currentContract?.comparative_status === "DRAFT" ||
                    currentContract?.comparative_status === "REJECTED" ||
                    currentContract?.comparative_status === "NEEDS_CHANGES");
                const manualTitle = sharedTituloComparativo.trim();

                if (canUpdateCurrent && currentContract?.id) {
                  const updated =
                    await saveComparativeDraftMutation.mutateAsync({
                      contractId: currentContract.id,
                      payload: {
                        type: payload.type,
                        comparative_data: payload.comparative_data ?? null,
                        ...(manualTitle ? { title: manualTitle } : {}),
                      },
                    });
                  setCurrentContract(updated);
                  setNewFlowContractId(updated.id);
                  return updated;
                }
                const created = await createContractMutation.mutateAsync({
                  ...payload,
                  ...(manualTitle ? { title: manualTitle } : {}),
                });
                setCurrentContract(created);
                setNewFlowContractId(created.id);
                return created;
              }}
            />
          )}
          {currentView === "documents" && (
            <DocumentsCenter
              tabsNavigation={tabsNavigation}
              contracts={contractsForScope}
              tenantId={effectiveTenantId}
              initialContractId={currentContract?.id ?? null}
              scope={scope}
              onOpenDocumentPreview={openContractDocumentPreview}
              onDownloadDocument={downloadContractDocumentFile}
              onNavigate={setCurrentView}
              onOpenContract={(contract) => {
                setCurrentContract(contract);
                setViewMode("ver");
                setNewFlowContractId(null);
                setCurrentView(
                  scope === "comparatives" ? "comparativo-review" : "contrato-form",
                );
              }}
              onEditContract={scope === "comparatives" ? (contract) => {
                setCurrentContract(contract);
                setViewMode("editar");
                setNewFlowContractId(null);
                setCurrentView("comparativo-review");
              } : undefined}
              onDeleteContract={scope === "comparatives" ? (contract) => {
                setContractToDelete(contract);
              } : undefined}
              onNewComparative={scope === "comparatives" ? () => { resetWizardState(); setCurrentView("comparativo-upload"); } : undefined}
              canCreateComparative={isSuperAdmin || Boolean(currentUser?.can_create_comparative)}
              canEditComparative={isSuperAdmin || Boolean(currentUser?.can_edit_comparative)}
              canDeleteComparative={isSuperAdmin || Boolean(currentUser?.can_delete_comparative)}
            />
          )}
          {currentView === "comparativo-review" && (
            <ComparativoReview
              tabsNavigation={tabsNavigation}
              data={comparativoData}
              contract={currentContract}
              contracts={contracts}
              tenantId={effectiveTenantId}
              obraNumero={sharedObraNumero}
              setObraNumero={setSharedObraNumero}
              obraNombre={sharedObraNombre}
              setObraNombre={setSharedObraNombre}
              jefeObra={sharedJefeObra}
              setJefeObra={setSharedJefeObra}
              contractType={sharedContractType}
              setContractType={setSharedContractType}
              tituloComparativo={sharedTituloComparativo}
              setTituloComparativo={setSharedTituloComparativo}
              viewMode={viewMode}
              onEditComparativoData={(source) => {
                if (source === "manual") {
                  setCurrentView("comparativo-manual");
                } else {
                  setCurrentView("comparativo-upload");
                }
              }}
              isNewFlow={
                newFlowContractId !== null &&
                currentContract?.id === newFlowContractId
              }
              isSavingIntake={updateContractMutation.isPending}
              isSavingDraft={saveComparativeDraftMutation.isPending}
              isSubmittingComparative={submitComparativeMutation.isPending}
              isValidatingRea={validateReaMutation.isPending}
              onValidateRea={async () => {
                if (!currentContract) return null;
                return await validateReaMutation.mutateAsync(currentContract.id);
              }}
              isSendingSupplierForm={sendSupplierFormMutation.isPending}
              onSendSupplierForm={async () => {
                if (!currentContract) return;
                await sendSupplierFormMutation.mutateAsync(currentContract.id);
              }}
              initialSubTab={forcedSubTab}
              onSubTabChange={onSubTabChange}
              onNavigate={setCurrentView}
              onSaveDraft={async () => {
                if (!currentContract) return;
                await saveComparativeDraftMutation.mutateAsync({
                  contractId: currentContract.id,
                  payload: {},
                });
                setNewFlowContractId(null);
              }}
              onChangeContract={(contractId) => {
                const next = contracts.find(
                  (item: Contract) => item.id === contractId,
                );
                if (next) {
                  setCurrentContract(next);
                  setNewFlowContractId(null);
                }
              }}
              onSaveIntake={async (payload) => {
                if (!currentContract) return;
                const updated = await updateContractMutation.mutateAsync({
                  contractId: currentContract.id,
                  payload,
                });
                setCurrentContract(updated);
              }}
              onSaveIntakeSilently={async (payload) => {
                if (!currentContract) return;
                suppressNextSaveToastRef.current = true;
                try {
                  const updated = await updateContractMutation.mutateAsync({
                    contractId: currentContract.id,
                    payload,
                  });
                  setCurrentContract(updated);
                } catch (error) {
                  suppressNextSaveToastRef.current = false;
                  throw error;
                }
              }}
              onSubmitComparative={async () => {
                if (!currentContract) return;
                const updated = await submitComparativeMutation.mutateAsync(
                  currentContract.id,
                );
                setCurrentContract(updated);
                setNewFlowContractId(null);
                return updated;
              }}
              onSelectOffer={(offerId) => {
                if (!currentContract) return;
                const canSelectOffer =
                  currentContract.status === "DRAFT" &&
                  (currentContract.comparative_status === "DRAFT" ||
                    currentContract.comparative_status === "REJECTED" ||
                    currentContract.comparative_status === "NEEDS_CHANGES" ||
                    currentContract.comparative_status === "APPROVED");
                if (!canSelectOffer) {
                  toast({
                    status: "warning",
                    title: "No se puede seleccionar oferta",
                    description:
                      "Solo puedes cambiar la oferta cuando el contrato está en borrador.",
                  });
                  return;
                }
                selectOfferMutation.mutate({
                  contractId: currentContract.id,
                  offerId,
                  tenantId: currentContract.tenant_id ?? effectiveTenantId,
                });
              }}
              onSaveDraftWithData={async (payload) => {
                if (!currentContract) return;
                await saveComparativeDraftMutation.mutateAsync({
                  contractId: currentContract.id,
                  payload,
                });
              }}
              onAddOffer={async (contractId, file) => {
                await addOfferMutation.mutateAsync({ contractId, file });
              }}
            />
          )}
          {currentView === "contrato-form" && (
            <>
              <ContratoForm
                tabsNavigation={tabsNavigation}
                comparativoData={comparativoData}
                contract={currentContract}
                tenantId={effectiveTenantId}
                isSuperAdmin={isSuperAdmin}
                allowAutofirma={allowAutofirma}
                canManageWorkflow={isContractAdmin}
                viewMode={viewMode}
                onSwitchToEdit={() => setViewMode("editar")}
                isSubmittingGerencia={submitGerenciaMutation.isPending}
                isPreparingDocs={generateDocsMutation.isPending}
                isRegeneratingContract={regenerateContractPdfMutation.isPending}
                onNavigate={setCurrentView}
                onSave={async (payload) => {
                  if (!currentContract) return;
                  await updateContractMutation.mutateAsync({
                    contractId: currentContract.id,
                    payload,
                  });
                }}
                onRegenerateContract={async () => {
                  if (!currentContract) return;
                  await regenerateContractPdfMutation.mutateAsync(
                    currentContract.id,
                  );
                }}
                onSubmit={async () => {
                  if (!currentContract) return;
                  try {
                    let latestContract = await fetchContractById(
                      currentContract.id,
                      currentContract.tenant_id ?? effectiveTenantId,
                    ).catch(() => currentContract);
                    const selectedOfferId =
                      (
                        latestContract.comparative_data as Record<
                          string,
                          unknown
                        > | null
                      )?.selected_offer_id ?? latestContract.selected_offer_id;

                    if (latestContract.status === "DRAFT") {
                      if (!selectedOfferId) {
                        toast({
                          status: "warning",
                          title: "Falta seleccionar oferta ganadora",
                          description:
                            "Selecciona una oferta en el comparativo antes de generar documentos.",
                        });
                        return;
                      }
                      if (latestContract.comparative_status === "REJECTED") {
                        toast({
                          status: "warning",
                          title: "Comparativo rechazado",
                          description:
                            "Debes corregir el comparativo rechazado antes de generar documentos.",
                        });
                        return;
                      }
                      if (latestContract.comparative_status !== "APPROVED") {
                        toast({
                          status: "warning",
                          title: "Comparativo no aprobado",
                          description:
                            "El comparativo debe ser aprobado por gerencia antes de generar documentos.",
                        });
                        return;
                      }
                      latestContract = await generateDocsMutation.mutateAsync(
                        latestContract.id,
                      );
                    }

                    if (latestContract.status === "PENDING_SUPPLIER") {
                      toast({
                        status: "warning",
                        title: "Faltan datos del proveedor",
                        description:
                          "Completa proveedor (nombre, CIF, email y dirección) para pasar a Jefe de Obra.",
                      });
                      return;
                    }

                    await submitGerenciaMutation.mutateAsync(latestContract.id);
                  } catch {
                    // Los detalles concretos ya se notifican en onError de cada mutación.
                  }
                }}
              />
              {currentContract && (
                <WorkflowActionsPanel
                  contract={currentContract}
                  tenantId={effectiveTenantId}
                  isAdmin={isContractAdmin}
                  roleName={roleName}
                  onActivate={(subtype) =>
                    activateContractMutation.mutate({
                      contractId: currentContract.id,
                      subtype,
                    })
                  }
                  onSelectTemplate={(templateId) =>
                    selectTemplateMutation.mutate({
                      contractId: currentContract.id,
                      templateId,
                    })
                  }
                  onGenerateDocument={() =>
                    generateDocumentMutation.mutate(currentContract.id)
                  }
                  onAdminApproveDraft={() =>
                    adminApproveDraftMutation.mutate(currentContract.id)
                  }
                  onReviewDecision={(approved, comment) =>
                    reviewDecisionMutation.mutate({
                      contractId: currentContract.id,
                      approved,
                      comment,
                    })
                  }
                  onSendForSignature={() =>
                    sendForSignatureMutation.mutate(currentContract.id)
                  }
                  onOpenDocumentPreview={openContractDocumentPreview}
                  onDownloadDocument={downloadContractDocumentFile}
                  isLoading={
                    activateContractMutation.isPending ||
                    selectTemplateMutation.isPending ||
                    generateDocumentMutation.isPending ||
                    adminApproveDraftMutation.isPending ||
                    reviewDecisionMutation.isPending ||
                    sendForSignatureMutation.isPending
                  }
                />
              )}
            </>
          )}
          {currentView === "approval-panel" && (
            <ApprovalPanel
              tabsNavigation={tabsNavigation}
              onNavigate={setCurrentView}
              contract={currentContract ?? pendingContract}
              viewMode={viewMode}
              scope={scope}
              tenantId={effectiveTenantId}
              isSuperAdmin={isSuperAdmin}
              currentRoleName={roleName}
              currentUserId={currentUser?.id ?? null}
              canApproveComparativeByPosition={
                !isJefeObraPosition && Boolean(currentUser?.can_approve_comparative)
              }
              canRejectComparativeByPosition={Boolean(currentUser?.can_reject_comparative)}
              canCreateComparativeByPosition={Boolean(currentUser?.can_create_comparative)}
              canEditComparativeByPosition={Boolean(currentUser?.can_edit_comparative)}
              canDeleteComparativeByPosition={Boolean(currentUser?.can_delete_comparative)}
              approvalErrorDetail={approvalErrorDetail}
              isApproving={
                approveComparativeMutation.isPending ||
                approveContractMutation.isPending ||
                approveAllPhasesMutation.isPending
              }
              isReturning={returnComparativeMutation.isPending}
              isRejecting={rejectComparativeMutation.isPending}
              onOpenDocumentPreview={openContractDocumentPreview}
              onDownloadDocument={downloadContractDocumentFile}
              onApproveComparative={(comment) => {
                const target = currentContract ?? pendingContract;
                if (!target) return;
                approveComparativeMutation.mutate({
                  contractId: target.id,
                  comment,
                });
              }}
              onApproveContract={(comment) => {
                const target = currentContract ?? pendingContract;
                if (!target) return;
                if (
                  target.status === "PENDING_JEFE_OBRA" ||
                  target.status === "DRAFT"
                ) {
                  submitGerenciaMutation.mutate(target.id);
                  return;
                }
                approveContractMutation.mutate({
                  contractId: target.id,
                  comment,
                });
              }}
              onApproveAllPhases={(comment) => {
                const target = currentContract ?? pendingContract;
                if (!target) return;
                approveAllPhasesMutation.mutate({
                  contractId: target.id,
                  comment,
                });
              }}
              onReturnComparative={(comment) => {
                const target = currentContract ?? pendingContract;
                if (!target) return;
                returnComparativeMutation.mutate({
                  contractId: target.id,
                  comment,
                });
              }}
              onRejectComparative={(reason) => {
                const target = currentContract ?? pendingContract;
                if (!target) return;
                rejectComparativeMutation.mutate({
                  contractId: target.id,
                  reason,
                });
              }}
              isSendingSupplierForm={sendSupplierFormMutation.isPending}
              onSendSupplierForm={async () => {
                const target = currentContract ?? pendingContract;
                if (!target) return;
                await sendSupplierFormMutation.mutateAsync(target.id);
              }}
            />
          )}
          {currentView === "workflow-config" && canManageWorkflow && (
            <WorkflowConfigPanel
              tabsNavigation={tabsNavigation}
              onNavigate={setCurrentView}
              tenantId={effectiveTenantId}
            />
          )}
        </Box>
      )}
      <AlertDialog
        isOpen={Boolean(contractToDelete)}
        leastDestructiveRef={deleteCancelRef}
        onClose={() => {
          if (deleteContractMutation.isPending) return;
          setContractToDelete(null);
        }}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold" textAlign="center">
              Eliminar contrato
            </AlertDialogHeader>
            <AlertDialogBody textAlign="center">
              {contractToDelete
                ? `Vas a eliminar el contrato CT-${contractToDelete.id}. Esta acción no se puede deshacer.`
                : "Esta acción no se puede deshacer."}
            </AlertDialogBody>
            <AlertDialogFooter justifyContent="center" gap={3}>
              <Button
                ref={deleteCancelRef}
                onClick={() => setContractToDelete(null)}
                isDisabled={deleteContractMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                colorScheme="red"
                isLoading={deleteContractMutation.isPending}
                loadingText="Eliminando"
                onClick={() => {
                  if (!contractToDelete) return;
                  deleteContractMutation.mutate(contractToDelete.id, {
                    onSettled: () => setContractToDelete(null),
                  });
                }}
              >
                Eliminar
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
};

// ============================================================================
// DASHBOARD
// ============================================================================

interface DashboardProps {
  navigation?: React.ReactNode;
  contracts: Contract[];
  latestContracts: Contract[];
  currentUserId?: number | null;
  defaultOpenView: ViewState;
  onSelectContract: (contract: Contract, view: ViewState) => void;
  onEditContract: (contract: Contract) => void;
  onDeleteContract: (contract: Contract) => void;
  isEditable?: (contract: Contract) => boolean;
}

const PAGE_SIZE = 10;

const Dashboard: React.FC<DashboardProps> = ({
  navigation,
  contracts,
  latestContracts,
  currentUserId,
  defaultOpenView,
  onSelectContract,
  onEditContract,
  onDeleteContract,
  isEditable,
}) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const { data: currentUser } = useCurrentUser();
  const normalizedRole = String(currentUser?.role_name ?? "").trim().toLowerCase();
  const canManageDraftContracts = Boolean(
    currentUser?.is_super_admin || normalizedRole === "tenant_admin",
  );
  const canEditContractsByCap = Boolean(
    currentUser?.is_super_admin || currentUser?.can_edit_contract,
  );
  const visibleContracts = useMemo(() => {
    if (canManageDraftContracts) return contracts;
    return contracts.filter((contract) => {
      const isAdminDraft =
        contract.status === "DRAFT" &&
        contract.comparative_status === "APPROVED";
      const isPreAdminStatus = [
        "PENDING_SUPPLIER",
        "PENDING_TEMPLATE",
        "PENDING_DATA_VALIDATION",
      ].includes(contract.status);
      if (!isAdminDraft && !isPreAdminStatus) return true;
      return canEditContractsByCap;
    });
  }, [canEditContractsByCap, canManageDraftContracts, contracts]);
  const [contractsPage, setContractsPage] = useState(0);
  const [filterObraNumero, setFilterObraNumero] = useState("");
  const [filterTitulo, setFilterTitulo] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterProveedor, setFilterProveedor] = useState("");
  const [filterFecha, setFilterFecha] = useState("");
  const [filterAssignedToMe, setFilterAssignedToMe] = useState(false);
  const handleClearFilters = () => {
    setFilterObraNumero("");
    setFilterTitulo("");
    setFilterEstado("");
    setFilterProveedor("");
    setFilterFecha("");
    setFilterAssignedToMe(false);
    setContractsPage(0);
  };
  const filteredContracts = useMemo(() => {
    const obraQ = filterObraNumero.trim().toLowerCase();
    const tituloQ = filterTitulo.trim().toLowerCase();
    const proveedorQ = filterProveedor.trim().toLowerCase();
    const estadoGroupOf = (status?: string | null): string => {
      if (status === "SIGNED") return "FIRMADO";
      if (status === "REJECTED") return "RECHAZADO";
      if (status === "DRAFT") return "BORRADOR";
      return "PENDIENTE";
    };
    return visibleContracts.filter((c) => {
      if (obraQ) {
        const obra = getComparativeObraNumero(c).toLowerCase();
        if (!obra.includes(obraQ)) return false;
      }
      if (tituloQ) {
        const titulo = (c.title || c.supplier_name || "").toLowerCase();
        if (!titulo.includes(tituloQ)) return false;
      }
      if (filterEstado && estadoGroupOf(c.status) !== filterEstado) {
        return false;
      }
      if (proveedorQ) {
        const proveedor = (c.supplier_name ?? "").toLowerCase();
        if (!proveedor.includes(proveedorQ)) return false;
      }
      if (filterFecha) {
        const updated = c.updated_at ? c.updated_at.slice(0, 10) : "";
        if (updated !== filterFecha) return false;
      }
      if (filterAssignedToMe) {
        if (!currentUserId || c.assigned_admin_user_id !== currentUserId) {
          return false;
        }
      }
      return true;
    });
  }, [
    visibleContracts,
    filterObraNumero,
    filterTitulo,
    filterEstado,
    filterProveedor,
    filterFecha,
    filterAssignedToMe,
    currentUserId,
  ]);
  useEffect(() => {
    setContractsPage(0);
  }, [filterObraNumero, filterTitulo, filterEstado, filterProveedor, filterFecha, filterAssignedToMe]);
  const hasActiveFilters =
    Boolean(filterObraNumero) ||
    Boolean(filterTitulo) ||
    Boolean(filterEstado) ||
    Boolean(filterProveedor) ||
    Boolean(filterFecha) ||
    filterAssignedToMe;
  const totalContractPages = Math.max(1, Math.ceil(filteredContracts.length / PAGE_SIZE));
  const pagedContracts = filteredContracts.slice(contractsPage * PAGE_SIZE, (contractsPage + 1) * PAGE_SIZE);
  const pendingCount = visibleContracts.filter((contract) =>
    [
      "DRAFT",
      "PENDING_SUPPLIER",
      "PENDING_JEFE_OBRA",
      "PENDING_GERENCIA",
      "PENDING_DEPARTAMENTOS",
      "PENDING_ADMIN",
      "PENDING_COMPRAS",
      "PENDING_JURIDICO",
      "PENDING_TEMPLATE",
      "PENDING_DATA_VALIDATION",
      "PENDING_REVIEW",
    ].includes(contract.status),
  ).length;
  const signedCount = visibleContracts.filter(
    (contract) => contract.status === "SIGNED",
  ).length;

  return (
    <Stack spacing={6}>
      <ContractsHero
        totalCount={visibleContracts.length}
        pendingCount={pendingCount}
        signedCount={signedCount}
      />
      {navigation}

      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        overflow="hidden"
      >
        <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
          <Heading size="md">Listado de Contratos</Heading>
        </Box>
        <Box
          px={6}
          py={3}
          borderBottom="1px solid"
          borderColor={borderColor}
        >
          <SimpleGrid columns={{ base: 1, md: 7 }} spacing={3} alignItems="end">
            <FormControl>
              <FormLabel fontSize="xs" mb={1} color="gray.600">Nº de obra</FormLabel>
              <Input
                size="sm"
                type="number"
                value={filterObraNumero}
                onChange={(event) => setFilterObraNumero(event.target.value)}
                placeholder="Ej. 1234"
                rounded="lg"
                bg="white"
                borderColor="gray.200"
                focusBorderColor="brand.500"
                _hover={{ borderColor: "gray.300" }}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" mb={1} color="gray.600">Título</FormLabel>
              <Input
                size="sm"
                value={filterTitulo}
                onChange={(event) => setFilterTitulo(event.target.value)}
                placeholder="Buscar título"
                rounded="lg"
                bg="white"
                borderColor="gray.200"
                focusBorderColor="brand.500"
                _hover={{ borderColor: "gray.300" }}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" mb={1} color="gray.600">Estado</FormLabel>
              <Menu matchWidth gutter={4}>
                <MenuButton
                  as={Button}
                  size="sm"
                  w="100%"
                  textAlign="left"
                  fontWeight="normal"
                  rounded="lg"
                  bg="white"
                  borderWidth="1px"
                  borderColor="gray.200"
                  _hover={{ borderColor: "gray.300", bg: "white" }}
                  _active={{ borderColor: "brand.500", bg: "white" }}
                  _expanded={{ borderColor: "brand.500", bg: "white", boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)" }}
                  rightIcon={<ChevronDown size={16} color="#718096" />}
                >
                  {(() => {
                    const dotColor =
                      filterEstado === "FIRMADO"
                        ? "green.400"
                        : filterEstado === "RECHAZADO"
                        ? "red.400"
                        : filterEstado === "PENDIENTE"
                        ? "orange.400"
                        : filterEstado === "BORRADOR"
                        ? "gray.400"
                        : null;
                    const label =
                      filterEstado === "FIRMADO"
                        ? "Firmado"
                        : filterEstado === "RECHAZADO"
                        ? "Rechazado"
                        : filterEstado === "PENDIENTE"
                        ? "Pendiente"
                        : filterEstado === "BORRADOR"
                        ? "Borrador"
                        : "Todos";
                    return (
                      <HStack spacing={2}>
                        {dotColor && (
                          <Box w="8px" h="8px" rounded="full" bg={dotColor} />
                        )}
                        <Text fontSize="sm" color={filterEstado ? "gray.800" : "gray.500"}>
                          {label}
                        </Text>
                      </HStack>
                    );
                  })()}
                </MenuButton>
                <Portal>
                  <MenuList
                    rounded="lg"
                    py={1}
                    minW="160px"
                    boxShadow="lg"
                    borderColor="gray.100"
                    zIndex="popover"
                  >
                    {[
                      { value: "", label: "Todos", dot: null },
                      { value: "BORRADOR", label: "Borrador", dot: "gray.400" },
                      { value: "PENDIENTE", label: "Pendiente", dot: "orange.400" },
                      { value: "FIRMADO", label: "Firmado", dot: "green.400" },
                      { value: "RECHAZADO", label: "Rechazado", dot: "red.400" },
                    ].map((opt) => {
                      const selected = filterEstado === opt.value;
                      return (
                        <MenuItem
                          key={opt.value || "todos"}
                          onClick={() => setFilterEstado(opt.value)}
                          fontSize="sm"
                          rounded="md"
                          mx={1}
                          bg={selected ? "brand.50" : undefined}
                          color={selected ? "brand.700" : "gray.800"}
                          _hover={{ bg: selected ? "brand.50" : "gray.50" }}
                        >
                          <HStack spacing={2} flex={1}>
                            {opt.dot ? (
                              <Box w="8px" h="8px" rounded="full" bg={opt.dot} />
                            ) : (
                              <Box w="8px" h="8px" />
                            )}
                            <Text flex={1}>{opt.label}</Text>
                            {selected && <Check size={14} />}
                          </HStack>
                        </MenuItem>
                      );
                    })}
                  </MenuList>
                </Portal>
              </Menu>
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" mb={1} color="gray.600">Proveedor</FormLabel>
              <Input
                size="sm"
                value={filterProveedor}
                onChange={(event) => setFilterProveedor(event.target.value)}
                placeholder="Buscar proveedor"
                rounded="lg"
                bg="white"
                borderColor="gray.200"
                focusBorderColor="brand.500"
                _hover={{ borderColor: "gray.300" }}
              />
            </FormControl>
            <FormControl>
              <FormLabel fontSize="xs" mb={1} color="gray.600">Fecha</FormLabel>
              <Input
                size="sm"
                type="date"
                value={filterFecha}
                onChange={(event) => setFilterFecha(event.target.value)}
                rounded="lg"
                bg="white"
                borderColor="gray.200"
                focusBorderColor="brand.500"
                _hover={{ borderColor: "gray.300" }}
              />
            </FormControl>
            <FormControl display="flex" alignItems="center" pt={{ base: 0, md: 6 }}>
              <Checkbox
                isChecked={filterAssignedToMe}
                onChange={(event) => setFilterAssignedToMe(event.target.checked)}
                colorScheme="brand"
              >
                Asignados a mí
              </Checkbox>
            </FormControl>
            <Button
              size="sm"
              variant="outline"
              rounded="lg"
              onClick={handleClearFilters}
              isDisabled={!hasActiveFilters}
            >
              Limpiar filtros
            </Button>
          </SimpleGrid>
        </Box>
        <Box
          overflowX="auto"
          sx={{
            "& th, & td": { paddingInlineStart: "1.5rem", paddingInlineEnd: "1.5rem" },
          }}
        >
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Contrato</Th>
                <Th>Obra</Th>
                <Th>Tipo</Th>
                <Th>Estado</Th>
                <Th>Proveedor</Th>
                <Th>Asignado</Th>
                <Th>Creado</Th>
                <Th>Actualizado</Th>
                <Th textAlign="right">Acciones</Th>
              </Tr>
            </Thead>
            <Tbody>
              {pagedContracts.map((contract) => (
                <Tr
                  key={contract.id}
                  cursor="pointer"
                  _hover={{ bg: "blackAlpha.50" }}
                  onClick={() => onSelectContract(contract, defaultOpenView)}
                >
                  <Td fontWeight="semibold">CT-{contract.id}</Td>
                  <Td>{getComparativeObraNumero(contract)}</Td>
                  <Td>{formatContractType(contract.type)}</Td>
                  <Td><ContractStatusChip status={contract.status} /></Td>
                  <Td>{contract.supplier_name ?? "Pendiente"}</Td>
                  <Td>{contract.assigned_admin_user_name ?? "Sin asignar"}</Td>
                  <Td>{formatDate(contract.created_at)}</Td>
                  <Td>{formatDate(contract.updated_at)}</Td>
                  <Td onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                    <HStack justify="flex-end" spacing={2}>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => onSelectContract(contract, defaultOpenView)}
                      >
                        Ver
                      </Button>
                      <Button
                        size="xs"
                        colorScheme="blue"
                        variant="outline"
                        onClick={() => onEditContract(contract)}
                        isDisabled={isEditable ? !isEditable(contract) : contract.status !== "DRAFT"}
                      >
                        Editar
                      </Button>
                      <Button
                        size="xs"
                        colorScheme="red"
                        variant="outline"
                        onClick={() => onDeleteContract(contract)}
                        isDisabled={
                          !canEditContractsByCap ||
                          !["DRAFT", "REJECTED"].includes(contract.status)
                        }
                      >
                        Eliminar
                      </Button>
                    </HStack>
                  </Td>
                </Tr>
              ))}
              {visibleContracts.length === 0 && (
                <Tr>
                  <Td colSpan={9}>
                    <Text fontSize="sm" color="gray.500">
                      No hay contratos todavía.
                    </Text>
                  </Td>
                </Tr>
              )}
              {visibleContracts.length > 0 && filteredContracts.length === 0 && (
                <Tr>
                  <Td colSpan={9}>
                    <Flex
                      py={8}
                      direction="column"
                      align="center"
                      justify="center"
                      gap={3}
                    >
                      <Flex
                        w="44px"
                        h="44px"
                        align="center"
                        justify="center"
                        rounded="full"
                        bg="gray.100"
                        color="gray.500"
                      >
                        <SearchIcon size={20} />
                      </Flex>
                      <Stack spacing={1} align="center">
                        <Text fontSize="sm" fontWeight="semibold" color="gray.700">
                          Sin resultados
                        </Text>
                        <Text fontSize="xs" color="gray.500" textAlign="center">
                          Ningún contrato coincide con los filtros aplicados.
                        </Text>
                      </Stack>
                      <Button
                        size="sm"
                        variant="outline"
                        rounded="lg"
                        onClick={handleClearFilters}
                      >
                        Limpiar filtros
                      </Button>
                    </Flex>
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </Box>
      </Box>
      {filteredContracts.length > PAGE_SIZE && (
        <Flex py={3} align="center" justify="center" gap={3}>
          <IconButton
            aria-label="Página anterior"
            icon={<ChevronLeft size={16} />}
            size="sm"
            variant="ghost"
            isDisabled={contractsPage === 0}
            onClick={() => setContractsPage((p) => p - 1)}
          />
          <Text fontSize="sm" color="gray.600">
            Página {contractsPage + 1} de {totalContractPages}
          </Text>
          <IconButton
            aria-label="Página siguiente"
            icon={<ChevronRight size={16} />}
            size="sm"
            variant="ghost"
            isDisabled={contractsPage >= totalContractPages - 1}
            onClick={() => setContractsPage((p) => p + 1)}
          />
        </Flex>
      )}
    </Stack>
  );
};

interface DocumentsCenterProps {
  tabsNavigation?: React.ReactNode;
  contracts: Contract[];
  tenantId?: number;
  initialContractId?: number | null;
  scope?: ContractsModuleScope;
  onOpenDocumentPreview: (
    contractId: number,
    docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
    tenantId?: number,
  ) => Promise<void>;
  onDownloadDocument: (
    contractId: number,
    docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
    tenantId?: number,
  ) => Promise<void>;
  onNavigate: (view: ViewState) => void;
  onOpenContract: (contract: Contract) => void;
  onEditContract?: (contract: Contract) => void;
  onDeleteContract?: (contract: Contract) => void;
  onNewComparative?: () => void;
  canCreateComparative?: boolean;
  canEditComparative?: boolean;
  canDeleteComparative?: boolean;
}

interface TabVisualBannerProps {
  icon: React.ReactElement;
  title: string;
  description: string;
  eyebrow?: string;
}

const TabVisualBanner: React.FC<TabVisualBannerProps> = ({
  icon,
  title,
  description,
  eyebrow,
}) => {
  return (
    <ProjectHero
      items={[]}
      title={title}
      subtitle={description}
      eyebrow={eyebrow ?? "Módulo de contratos"}
      leadIcon={icon}
    />
  );
};

const DocumentsCenter: React.FC<DocumentsCenterProps> = ({
  tabsNavigation,
  contracts,
  tenantId,
  initialContractId,
  scope = "all",
  onOpenDocumentPreview,
  onDownloadDocument,
  onNavigate,
  onOpenContract,
  onEditContract,
  onDeleteContract,
  onNewComparative,
  canCreateComparative = true,
  canEditComparative = true,
  canDeleteComparative = true,
}) => {
  const queryClient = useQueryClient();
  const hasAutoSyncedRef = useRef(false);

  // Una sola vez por montaje del DocumentsCenter en scope=comparatives:
  // verificamos cada contrato del listado con fetchContractById. Los que
  // retornen 404 son contratos soft-eliminados en backend (colgados en la
  // UI). Cada 404 dispara addDeletedContractId() en el catch del API, así
  // se filtran en el próximo fetchContracts.
  useEffect(() => {
    if (scope !== "comparatives") return;
    if (hasAutoSyncedRef.current) return;
    if (contracts.length === 0) return;
    hasAutoSyncedRef.current = true;

    let cancelled = false;
    void (async () => {
      let removed = 0;
      await Promise.all(
        contracts.map(async (contract) => {
          try {
            await fetchContractById(contract.id, contract.tenant_id ?? tenantId);
          } catch (error) {
            const status = (error as { response?: { status?: number } })
              ?.response?.status;
            if (status === 404) removed += 1;
          }
        }),
      );
      if (cancelled) return;
      if (removed > 0) {
        await queryClient.invalidateQueries({ queryKey: ["contracts"] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, contracts, tenantId, queryClient]);
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("Documento");
  const [comparativesPage, setComparativesPage] = useState(0);
  const [filterObraNumero, setFilterObraNumero] = useState("");
  const [filterTitulo, setFilterTitulo] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [filterProveedor, setFilterProveedor] = useState("");
  const [filterFecha, setFilterFecha] = useState("");
  const handleClearFilters = () => {
    setFilterObraNumero("");
    setFilterTitulo("");
    setFilterEstado("");
    setFilterProveedor("");
    setFilterFecha("");
    setComparativesPage(0);
  };
  const filteredComparatives = useMemo(() => {
    const obraQ = filterObraNumero.trim().toLowerCase();
    const tituloQ = filterTitulo.trim().toLowerCase();
    const proveedorQ = filterProveedor.trim().toLowerCase();
    const estadoGroupOf = (status?: string | null): string => {
      if (status === "APPROVED") return "APROBADO";
      if (status === "REJECTED") return "RECHAZADO";
      if (
        status === "PENDING_REVIEW" ||
        status === "PENDING_MGMT_APPROVAL" ||
        status === "NEEDS_CHANGES"
      )
        return "PENDIENTE";
      return "BORRADOR";
    };
    return contracts.filter((c) => {
      if (obraQ) {
        const obra = getComparativeObraNumero(c).toLowerCase();
        if (!obra.includes(obraQ)) return false;
      }
      if (tituloQ) {
        const titulo = (c.title || c.supplier_name || "").toLowerCase();
        if (!titulo.includes(tituloQ)) return false;
      }
      if (filterEstado && estadoGroupOf(c.comparative_status) !== filterEstado) {
        return false;
      }
      if (proveedorQ) {
        const proveedor = (c.supplier_name ?? "").toLowerCase();
        if (!proveedor.includes(proveedorQ)) return false;
      }
      if (filterFecha) {
        const created = c.created_at ? c.created_at.slice(0, 10) : "";
        if (created !== filterFecha) return false;
      }
      return true;
    });
  }, [
    contracts,
    filterObraNumero,
    filterTitulo,
    filterEstado,
    filterProveedor,
    filterFecha,
  ]);
  useEffect(() => {
    setComparativesPage(0);
  }, [filterObraNumero, filterTitulo, filterEstado, filterProveedor, filterFecha]);
  const totalComparativesPages = Math.max(1, Math.ceil(filteredComparatives.length / PAGE_SIZE));
  const pagedComparatives = filteredComparatives.slice(
    comparativesPage * PAGE_SIZE,
    (comparativesPage + 1) * PAGE_SIZE,
  );
  const hasActiveFilters =
    Boolean(filterObraNumero) ||
    Boolean(filterTitulo) ||
    Boolean(filterEstado) ||
    Boolean(filterProveedor) ||
    Boolean(filterFecha);

  useEffect(() => {
    if (selectedContractId) return;
    if (
      initialContractId &&
      contracts.some((c) => c.id === initialContractId)
    ) {
      setSelectedContractId(String(initialContractId));
      return;
    }
    if (contracts.length > 0) {
      setSelectedContractId(String(contracts[0].id));
    }
  }, [contracts, initialContractId, selectedContractId]);

  const selectedContract = useMemo(
    () =>
      contracts.find(
        (contract) => String(contract.id) === selectedContractId,
      ) ?? null,
    [contracts, selectedContractId],
  );
  const isComparativesScope = scope === "comparatives";

  const docsQuery = useQuery({
    queryKey: contractKeys.documentsCenter(
      selectedContract?.tenant_id ?? tenantId,
      selectedContract?.id ?? 0,
    ),
    queryFn: () =>
      fetchContractDocuments(
        selectedContract!.id,
        selectedContract?.tenant_id ?? tenantId,
      ),
    enabled: !isComparativesScope && Boolean(selectedContract?.id),
  });

  if (isComparativesScope) {
    return (
      <Box mb={6}>
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          rounded="xl"
          overflow="hidden"
        >
          <Flex
            px={6}
            py={5}
            borderBottom="1px solid"
            borderColor={borderColor}
            align="center"
            justify="space-between"
            gap={3}
          >
            <Heading size="md">Listado de comparativos</Heading>
            {onNewComparative && canCreateComparative && (
              <Button
                size="sm"
                colorScheme="brand"
                leftIcon={<Plus size={16} />}
                onClick={onNewComparative}
              >
                Nuevo comparativo
              </Button>
            )}
          </Flex>
          <Box
            px={6}
            py={3}
            borderBottom="1px solid"
            borderColor={borderColor}
          >
            <SimpleGrid columns={{ base: 1, md: 6 }} spacing={3} alignItems="end">
              <FormControl>
                <FormLabel fontSize="xs" mb={1} color="gray.600">Nº de obra</FormLabel>
                <Input
                  size="sm"
                  type="number"
                  value={filterObraNumero}
                  onChange={(event) => setFilterObraNumero(event.target.value)}
                  placeholder="Ej. 1234"
                  rounded="lg"
                  bg="white"
                  borderColor="gray.200"
                  focusBorderColor="brand.500"
                  _hover={{ borderColor: "gray.300" }}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" mb={1} color="gray.600">Título</FormLabel>
                <Input
                  size="sm"
                  value={filterTitulo}
                  onChange={(event) => setFilterTitulo(event.target.value)}
                  placeholder="Buscar título"
                  rounded="lg"
                  bg="white"
                  borderColor="gray.200"
                  focusBorderColor="brand.500"
                  _hover={{ borderColor: "gray.300" }}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" mb={1} color="gray.600">Estado</FormLabel>
                <Menu matchWidth gutter={4}>
                  <MenuButton
                    as={Button}
                    size="sm"
                    w="100%"
                    textAlign="left"
                    fontWeight="normal"
                    rounded="lg"
                    bg="white"
                    borderWidth="1px"
                    borderColor="gray.200"
                    _hover={{ borderColor: "gray.300", bg: "white" }}
                    _active={{ borderColor: "brand.500", bg: "white" }}
                    _expanded={{ borderColor: "brand.500", bg: "white", boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)" }}
                    rightIcon={<ChevronDown size={16} color="#718096" />}
                  >
                    {(() => {
                      const dotColor =
                        filterEstado === "APROBADO"
                          ? "green.400"
                          : filterEstado === "RECHAZADO"
                          ? "red.400"
                          : filterEstado === "PENDIENTE"
                          ? "orange.400"
                          : filterEstado === "BORRADOR"
                          ? "gray.400"
                          : null;
                      const label =
                        filterEstado === "APROBADO"
                          ? "Aprobado"
                          : filterEstado === "RECHAZADO"
                          ? "Rechazado"
                          : filterEstado === "PENDIENTE"
                          ? "Pendiente"
                          : filterEstado === "BORRADOR"
                          ? "Borrador"
                          : "Todos";
                      return (
                        <HStack spacing={2}>
                          {dotColor && (
                            <Box w="8px" h="8px" rounded="full" bg={dotColor} />
                          )}
                          <Text fontSize="sm" color={filterEstado ? "gray.800" : "gray.500"}>
                            {label}
                          </Text>
                        </HStack>
                      );
                    })()}
                  </MenuButton>
                  <Portal>
                    <MenuList
                      rounded="lg"
                      py={1}
                      minW="160px"
                      boxShadow="lg"
                      borderColor="gray.100"
                      zIndex="popover"
                    >
                      {[
                        { value: "", label: "Todos", dot: null },
                        { value: "BORRADOR", label: "Borrador", dot: "gray.400" },
                        { value: "PENDIENTE", label: "Pendiente", dot: "orange.400" },
                        { value: "APROBADO", label: "Aprobado", dot: "green.400" },
                        { value: "RECHAZADO", label: "Rechazado", dot: "red.400" },
                      ].map((opt) => {
                        const selected = filterEstado === opt.value;
                        return (
                          <MenuItem
                            key={opt.value || "todos"}
                            onClick={() => setFilterEstado(opt.value)}
                            fontSize="sm"
                            rounded="md"
                            mx={1}
                            bg={selected ? "brand.50" : undefined}
                            color={selected ? "brand.700" : "gray.800"}
                            _hover={{ bg: selected ? "brand.50" : "gray.50" }}
                          >
                            <HStack spacing={2} flex={1}>
                              {opt.dot ? (
                                <Box w="8px" h="8px" rounded="full" bg={opt.dot} />
                              ) : (
                                <Box w="8px" h="8px" />
                              )}
                              <Text flex={1}>{opt.label}</Text>
                              {selected && <Check size={14} />}
                            </HStack>
                          </MenuItem>
                        );
                      })}
                    </MenuList>
                  </Portal>
                </Menu>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" mb={1} color="gray.600">Proveedor</FormLabel>
                <Input
                  size="sm"
                  value={filterProveedor}
                  onChange={(event) => setFilterProveedor(event.target.value)}
                  placeholder="Buscar proveedor"
                  rounded="lg"
                  bg="white"
                  borderColor="gray.200"
                  focusBorderColor="brand.500"
                  _hover={{ borderColor: "gray.300" }}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="xs" mb={1} color="gray.600">Fecha</FormLabel>
                <Input
                  size="sm"
                  type="date"
                  value={filterFecha}
                  onChange={(event) => setFilterFecha(event.target.value)}
                  rounded="lg"
                  bg="white"
                  borderColor="gray.200"
                  focusBorderColor="brand.500"
                  _hover={{ borderColor: "gray.300" }}
                />
              </FormControl>
              <Button
                size="sm"
                variant="outline"
                rounded="lg"
                onClick={handleClearFilters}
                isDisabled={!hasActiveFilters}
              >
                Limpiar filtros
              </Button>
            </SimpleGrid>
          </Box>
          <Box
            overflowX="auto"
            sx={{
              "& th, & td": { paddingInlineStart: "1.5rem", paddingInlineEnd: "1.5rem" },
            }}
          >
            {contracts.length === 0 ? (
              <Box px={6} py={10}>
                <Text fontSize="sm" color="gray.500" textAlign="center">
                  No hay comparativos todavía.
                </Text>
              </Box>
            ) : filteredComparatives.length === 0 ? (
              <Flex
                px={6}
                py={12}
                direction="column"
                align="center"
                justify="center"
                gap={3}
                minH="220px"
              >
                <Flex
                  w="44px"
                  h="44px"
                  align="center"
                  justify="center"
                  rounded="full"
                  bg="gray.100"
                  color="gray.500"
                >
                  <SearchIcon size={20} />
                </Flex>
                <Stack spacing={1} align="center">
                  <Text fontSize="sm" fontWeight="semibold" color="gray.700">
                    Sin resultados
                  </Text>
                  <Text fontSize="xs" color="gray.500" textAlign="center">
                    Ningún comparativo coincide con los filtros aplicados.
                  </Text>
                </Stack>
                <Button
                  size="sm"
                  variant="outline"
                  rounded="lg"
                  onClick={handleClearFilters}
                >
                  Limpiar filtros
                </Button>
              </Flex>
            ) : (
              <>
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>ID</Th>
                      <Th>Nº de obra</Th>
                      <Th>Título</Th>
                      <Th>Estado</Th>
                      <Th>Proveedor</Th>
                      <Th>Fecha de creación</Th>
                      <Th>Actualizado</Th>
                      <Th textAlign="right">Acción</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {pagedComparatives.map((contract) => (
                      <Tr
                        key={contract.id}
                        cursor="pointer"
                        _hover={{ bg: "blackAlpha.50" }}
                        onClick={() => onOpenContract(contract)}
                      >
                        <Td fontWeight="semibold">CP-{contract.id}</Td>
                        <Td>{getComparativeObraNumero(contract)}</Td>
                        <Td>{contract.title || contract.supplier_name || "Sin título"}</Td>
                        <Td>
                          <ComparativeStatusChip
                            status={contract.comparative_status}
                          />
                        </Td>
                        <Td>{contract.supplier_name ?? "Pendiente"}</Td>
                        <Td>{formatDate(contract.created_at)}</Td>
                        <Td>{formatDate(contract.updated_at)}</Td>
                        <Td onClick={(event: React.MouseEvent) => event.stopPropagation()}>
                          <HStack justify="flex-end" spacing={2}>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => onOpenContract(contract)}
                            >
                              Ver
                            </Button>
                            {onEditContract && canEditComparative && (
                              <Button
                                size="xs"
                                colorScheme="blue"
                                variant="outline"
                                onClick={() => onEditContract(contract)}
                                isDisabled={!["DRAFT", "NEEDS_CHANGES", "REJECTED"].includes(contract.comparative_status ?? "DRAFT")}
                              >
                                Editar
                              </Button>
                            )}
                            {onDeleteContract && canDeleteComparative && (
                              <Button
                                size="xs"
                                colorScheme="red"
                                variant="outline"
                                onClick={() => onDeleteContract(contract)}
                                isDisabled={!["DRAFT", "REJECTED"].includes(contract.comparative_status ?? "DRAFT")}
                              >
                                Eliminar
                              </Button>
                            )}
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </>
            )}
          </Box>
        </Box>
        {filteredComparatives.length > PAGE_SIZE && (
          <Flex py={3} align="center" justify="center" gap={3}>
            <IconButton
              aria-label="Página anterior"
              icon={<ChevronLeft size={16} />}
              size="sm"
              variant="ghost"
              isDisabled={comparativesPage === 0}
              onClick={() => setComparativesPage((p) => p - 1)}
            />
            <Text fontSize="sm" color="gray.600">
              Página {comparativesPage + 1} de {totalComparativesPages}
            </Text>
            <IconButton
              aria-label="Página siguiente"
              icon={<ChevronRight size={16} />}
              size="sm"
              variant="ghost"
              isDisabled={comparativesPage >= totalComparativesPages - 1}
              onClick={() => setComparativesPage((p) => p + 1)}
            />
          </Flex>
        )}
      </Box>
    );
  }

  return (
    <Stack spacing={6}>
      <TabVisualBanner
        icon={<Download size={18} />}
        title="Centro de documentos"
        description={`Explora, abre y descarga los archivos de cada ${isComparativesScope ? "comparativo" : "contrato"} desde un único punto.`}
      />
      {tabsNavigation}

      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        p={5}
      >
        <FormControl maxW="360px">
          <FormLabel fontSize="sm" fontWeight="semibold">
            {isComparativesScope ? "Comparativo" : "Contrato"}
          </FormLabel>
          <Select
            value={selectedContractId}
            onChange={(event) => setSelectedContractId(event.target.value)}
            placeholder={`Selecciona ${isComparativesScope ? "comparativo" : "contrato"}`}
          >
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {`CT-${contract.id} | ${formatContractType(contract.type)} | ${contract.supplier_name ?? "Sin proveedor"}`}
              </option>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        overflow="hidden"
      >
        <Box px={6} py={4} borderBottom="1px solid" borderColor={borderColor}>
          <Text fontWeight="semibold">
            {selectedContract
              ? `Archivos de CT-${selectedContract.id}`
              : `Archivos del ${isComparativesScope ? "comparativo" : "contrato"}`}
          </Text>
        </Box>
        <Box p={6}>
          {!selectedContract && (
            <Text fontSize="sm" color="gray.500">
              {`No hay ${isComparativesScope ? "comparativos" : "contratos"} para mostrar.`}
            </Text>
          )}
          {selectedContract && docsQuery.isLoading && (
            <Text fontSize="sm" color="gray.500">
              Cargando documentos...
            </Text>
          )}
          {selectedContract &&
            !docsQuery.isLoading &&
            (docsQuery.data?.length ?? 0) === 0 && (
              <Text fontSize="sm" color="gray.500">
                {`Este ${isComparativesScope ? "comparativo" : "contrato"} todavía no tiene documentos generados.`}
              </Text>
            )}
          {selectedContract && (docsQuery.data?.length ?? 0) > 0 && (
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>Tipo</Th>
                  <Th>Fecha</Th>
                  <Th textAlign="right">Acciones</Th>
                </Tr>
              </Thead>
              <Tbody>
                {(docsQuery.data ?? []).map((doc) => {
                  return (
                    <Tr key={doc.id}>
                      <Td>{doc.doc_type}</Td>
                      <Td>{formatDate(doc.created_at)}</Td>
                      <Td>
                        <HStack justify="flex-end" spacing={2}>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              void onOpenDocumentPreview(
                                selectedContract.id,
                                doc.doc_type,
                                selectedContract.tenant_id ?? tenantId,
                              );
                            }}
                          >
                            Ver
                          </Button>
                          <Button
                            size="xs"
                            colorScheme="blue"
                            onClick={() => {
                              void onDownloadDocument(
                                selectedContract.id,
                                doc.doc_type,
                                selectedContract.tenant_id ?? tenantId,
                              );
                            }}
                          >
                            Descargar
                          </Button>
                        </HStack>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
          {selectedContract && (
            <HStack mt={4}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenContract(selectedContract)}
              >
                {`Abrir ficha de ${isComparativesScope ? "comparativo" : "contrato"}`}
              </Button>
            </HStack>
          )}
        </Box>
      </Box>
      <Modal
        isOpen={Boolean(previewUrl)}
        onClose={() => setPreviewUrl(null)}
        size="6xl"
        isCentered
      >
        <ModalOverlay />
        <ModalContent minH="80vh">
          <ModalHeader>{previewTitle}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            {previewUrl ? (
              <Box borderWidth="1px" rounded="md" overflow="hidden" h="70vh">
                <iframe
                  src={previewUrl}
                  title={previewTitle}
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              </Box>
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Stack>
  );
};

interface ActivityItemProps {
  status: "approved" | "created" | "pending";
  title: string;
  description: string;
  time: string;
  onClick?: () => void;
}

const ActivityItem: React.FC<ActivityItemProps> = ({
  status,
  title,
  description,
  time,
  onClick,
}) => {
  const iconMap = {
    approved: <Check size={18} color="#16a34a" />,
    created: <FileText size={18} color="#2563eb" />,
    pending: <AlertCircle size={18} color="#d97706" />,
  };

  return (
    <Flex
      px={6}
      py={4}
      align="center"
      gap={4}
      cursor={onClick ? "pointer" : "default"}
      _hover={{ bg: "gray.50" }}
      onClick={onClick}
    >
      {iconMap[status]}
      <Box flex="1">
        <Text fontWeight="semibold">{title}</Text>
        <Text fontSize="sm" color="gray.500">
          {description}
        </Text>
      </Box>
      <Text fontSize="xs" color="gray.400">
        {time}
      </Text>
    </Flex>
  );
};

// ============================================================================
// CABECERA COMPARTIDA - INFORMACIÓN GENERAL + BOTONES OCR/MANUAL
// ============================================================================

interface NuevoComparativoHeaderProps {
  active: "ocr" | "manual";
  onNavigate: (view: ViewState) => void;
  obraNumero: string;
  setObraNumero: (value: string) => void;
  obraNombre: string;
  setObraNombre: (value: string) => void;
  jefeObra: string;
  setJefeObra: (value: string) => void;
  contractType: ContractType | undefined;
  setContractType: (value: ContractType) => void;
  tituloComparativo: string;
  setTituloComparativo: (value: string) => void;
  borderColor: string;
  tenantId?: number;
}

const NuevoComparativoHeader: React.FC<NuevoComparativoHeaderProps> = ({
  active,
  onNavigate,
  obraNumero,
  setObraNumero,
  obraNombre,
  setObraNombre,
  jefeObra,
  setJefeObra,
  contractType,
  setContractType,
  tituloComparativo,
  setTituloComparativo,
  borderColor,
  tenantId,
}) => {
  return (
    <Stack spacing={4}>
      <Box>
        <Text fontSize="sm" fontWeight="medium" mb={2}>
          Título del comparativo
        </Text>
        <Input
          value={tituloComparativo}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setTituloComparativo(event.target.value)
          }
          placeholder="Ej.: Comparativo de carpintería metálica"
        />
      </Box>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>
            Nº de obra
          </Text>
          <ObraNumeroAutocomplete
            obraNumero={obraNumero}
            setObraNumero={setObraNumero}
            onSelectObra={(project) => {
              setObraNumero(String(project.code));
              setObraNombre(project.name);
            }}
          />
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>
            Nombre de obra
          </Text>
          <Input
            value={obraNombre}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setObraNombre(event.target.value)
            }
          />
        </Box>
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>
            Jefe de obra
          </Text>
          <Input
            value={jefeObra}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setJefeObra(event.target.value)
            }
            placeholder="Jefe de obra"
          />
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>
            Tipo de contrato
          </Text>
          <Box
            as="select"
            value={contractType ?? ""}
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              const v = event.target.value;
              if (v) setContractType(v as ContractType);
            }}
            width="100%"
            border="1px solid"
            borderColor={borderColor}
            rounded="md"
            px={3}
            py={2}
            bg="transparent"
          >
            <Box as="option" value="" disabled>
              Selecciona el tipo
            </Box>
            <Box as="option" value="SUBCONTRATACION">
              Subcontratación
            </Box>
            <Box as="option" value="SUMINISTRO">
              Suministro
            </Box>
            <Box as="option" value="SERVICIO">
              Servicio
            </Box>
          </Box>
        </Box>
      </SimpleGrid>
      <HStack spacing={2} pt={2}>
        <Button
          size="sm"
          px={4}
          borderRadius="10px"
          fontWeight={active === "ocr" ? 600 : 500}
          bg={active === "ocr" ? "brand.600" : "transparent"}
          color={active === "ocr" ? "white" : "inherit"}
          _hover={{
            bg: active === "ocr" ? "brand.600" : "gray.50",
          }}
          onClick={
            active === "ocr"
              ? undefined
              : () => onNavigate("comparativo-upload")
          }
        >
          Subida OCR
        </Button>
        <Button
          size="sm"
          px={4}
          borderRadius="10px"
          fontWeight={active === "manual" ? 600 : 500}
          bg={active === "manual" ? "brand.600" : "transparent"}
          color={active === "manual" ? "white" : "inherit"}
          _hover={{
            bg: active === "manual" ? "brand.600" : "gray.50",
          }}
          onClick={
            active === "manual"
              ? undefined
              : () => onNavigate("comparativo-manual")
          }
        >
          Comparativo manual
        </Button>
      </HStack>
    </Stack>
  );
};

// ============================================================================
// COMPARATIVO UPLOAD (OCR)
// ============================================================================

interface ComparativoUploadProps {
  tabsNavigation?: React.ReactNode;
  onNavigate: (view: ViewState) => void;
  onComplete: (data: ComparativoData) => void;
  obraNumero: string;
  setObraNumero: (value: string) => void;
  obraNombre: string;
  setObraNombre: (value: string) => void;
  jefeObra: string;
  setJefeObra: (value: string) => void;
  contractType: ContractType;
  setContractType: (value: ContractType) => void;
  tituloComparativo: string;
  setTituloComparativo: (value: string) => void;
  tenantId?: number;
  onImportExcel: (
    file: File,
    payload: { type: ContractType },
  ) => Promise<void>;
  onCreateContract: (
    payload: { type: ContractType; comparative_data?: Record<string, unknown> },
    files: File[],
  ) => Promise<void>;
  onSaveDraft: (payload: { type: ContractType }) => Promise<void>;
}

const ComparativoUpload: React.FC<ComparativoUploadProps> = ({
  tabsNavigation,
  onNavigate,
  onComplete,
  obraNumero,
  setObraNumero,
  obraNombre,
  setObraNombre,
  jefeObra,
  setJefeObra,
  contractType,
  setContractType,
  tituloComparativo,
  setTituloComparativo,
  tenantId,
  onImportExcel,
  onCreateContract,
  onSaveDraft,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const cancelUploadDisclosure = useDisclosure();
  const cancelUploadRef = useRef<HTMLButtonElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (inputFiles.length === 0) return;

    const allowed = /\.(pdf|jpg|jpeg|png|xlsx|xls)$/i;
    const maxSize = 5 * 1024 * 1024;

    const invalid = inputFiles.filter((f) => !allowed.test(f.name));
    if (invalid.length > 0) {
      toast({ status: "warning", title: "Formato no permitido", description: "Solo PDF, JPG, PNG, XLSX o XLS." });
      return;
    }
    const oversized = inputFiles.filter((f) => f.size > maxSize);
    if (oversized.length > 0) {
      toast({ status: "warning", title: "Archivo demasiado grande", description: `Máximo 5 MB por archivo. Afectados: ${oversized.map((f) => f.name).join(", ")}` });
      return;
    }

    const existingKeys = new Set(
      selectedFiles.map((f) => `${f.name}-${f.size}-${f.lastModified}`),
    );
    const newFiles = inputFiles.filter(
      (f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`),
    );
    if (newFiles.length === 0) return;

    if (selectedFiles.length + newFiles.length > 10) {
      toast({ status: "warning", title: "Límite de archivos", description: "Máximo 10 archivos en total." });
      return;
    }

    const nextSelected = [...selectedFiles, ...newFiles];
    const nextStates: FileUploadState[] = newFiles.map((file, index) => ({
      id: Date.now() + index,
      name: file.name,
      size: file.size,
      file,
      status: "pending",
      progress: 0,
    }));
    setSelectedFiles(nextSelected);
    setFiles((prev) => [...prev, ...nextStates]);
  };

  const handleRemoveFile = (fileId: number) => {
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
    setSelectedFiles((prev) =>
      prev.filter(
        (file) =>
          !files.some(
            (state) =>
              state.id === fileId &&
              state.name === file.name &&
              state.size === file.size,
          ),
      ),
    );
  };

  const handleProcess = async () => {
    const missing: string[] = [];
    if (!obraNumero.trim()) missing.push("Nº de obra");
    if (!obraNombre.trim()) missing.push("Nombre de obra");
    if (!contractType) missing.push("Tipo de contrato");
    if (missing.length > 0) {
      toast({
        status: "warning",
        title: "No se puede avanzar sin cumplimentar los datos",
        description: `Completa: ${missing.join(", ")}.`,
      });
      return;
    }
    if (selectedFiles.length === 0) {
      toast({ status: "warning", title: "Sube al menos una oferta", description: `Archivos en lista: ${files.length}` });
      return;
    }
    setIsProcessing(true);
    const excelFiles = selectedFiles.filter((file) =>
      /\.(xlsx|xls)$/i.test(file.name),
    );
    const nonExcelFiles = selectedFiles.filter(
      (file) => !/\.(xlsx|xls)$/i.test(file.name),
    );

    if (excelFiles.length > 0 && nonExcelFiles.length > 0) {
      toast({
        status: "warning",
        title: "No mezcles formatos",
        description:
          "Sube Excel (.xlsx/.xls) o documentos OCR (PDF/imagen), pero no ambos a la vez.",
      });
      return;
    }

    if (excelFiles.length > 1) {
      toast({
        status: "warning",
        title: "Solo un Excel por importación",
        description: "Selecciona un único archivo Excel para crear el comparativo.",
      });
      return;
    }

    setFiles((prev) => prev.map((item) => ({ ...item, status: "processing", progress: 0 })));

    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label}: sin respuesta tras ${ms / 1000}s`)), ms),
      );
      return Promise.race([promise, timeout]);
    };

    try {
      if (excelFiles.length === 1) {
        await withTimeout(onImportExcel(excelFiles[0], { type: contractType }), 30000, "Importar Excel");
        onComplete({ type: "excel", files });
      } else {
        const comparativeData = {
          source: "ocr",
          offers: selectedFiles.map((file) => ({ file: file.name })),
          obra_numero: obraNumero,
          obra_nombre: obraNombre,
          jefe_obra: jefeObra,
          contract_type: contractType,
          header: {
            obra_num: obraNumero,
            obra_nombre: obraNombre,
          },
          project: {
            nombre_obra: obraNombre,
          },
        };
        await withTimeout(
          onCreateContract({ type: contractType, comparative_data: comparativeData }, selectedFiles),
          30000,
          "Crear comparativo",
        );
        onComplete({ type: "ocr", files });
      }
      setFiles((prev) => prev.map((item) => ({ ...item, status: "completed", progress: 100 })));
    } catch (error: any) {
      setFiles((prev) => prev.map((item) => ({ ...item, status: "warning", progress: 100 })));
      const detail = error?.response?.data?.detail ?? error?.message ?? "Error desconocido";
      toast({
        status: "error",
        title: "Error al procesar",
        description: String(detail),
        duration: 8000,
        isClosable: true,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Box mb={6}>
      {tabsNavigation}
      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        overflow="hidden"
      >
        <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
          <Heading size="md" mb={4}>Nuevo comparativo</Heading>
          <NuevoComparativoHeader
            active="ocr"
            onNavigate={onNavigate}
            obraNumero={obraNumero}
            setObraNumero={setObraNumero}
            obraNombre={obraNombre}
            setObraNombre={setObraNombre}
            jefeObra={jefeObra}
            setJefeObra={setJefeObra}
            contractType={contractType}
            setContractType={setContractType}
            tituloComparativo={tituloComparativo}
            setTituloComparativo={setTituloComparativo}
            borderColor={borderColor}
            tenantId={tenantId}
          />
        </Box>
        <Stack spacing={6} p={6}>
        <Box
          border="2px dashed"
          borderColor={isDragging ? "brand.500" : borderColor}
          bg={isDragging ? "brand.50" : "transparent"}
          rounded="lg"
          p={10}
          textAlign="center"
          cursor="pointer"
          transition="all 0.15s"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const allowed = /\.(pdf|jpg|jpeg|png|xlsx|xls)$/i;
            const maxSize = 5 * 1024 * 1024;
            const droppedFiles = Array.from(e.dataTransfer.files);
            if (droppedFiles.length === 0) return;

            const invalid = droppedFiles.filter((f) => !allowed.test(f.name));
            if (invalid.length > 0) {
              toast({ status: "warning", title: "Formato no permitido", description: "Solo PDF, JPG, PNG, XLSX o XLS." });
              return;
            }
            const oversized = droppedFiles.filter((f) => f.size > maxSize);
            if (oversized.length > 0) {
              toast({ status: "warning", title: "Archivo demasiado grande", description: `Máximo 5 MB por archivo. Afectados: ${oversized.map((f) => f.name).join(", ")}` });
              return;
            }

            const existingKeys = new Set(
              selectedFiles.map((f) => `${f.name}-${f.size}-${f.lastModified}`),
            );
            const newFiles = droppedFiles.filter(
              (f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`),
            );
            if (newFiles.length === 0) return;

            if (selectedFiles.length + newFiles.length > 10) {
              toast({ status: "warning", title: "Límite de archivos", description: "Máximo 10 archivos en total." });
              return;
            }

            const nextSelected = [...selectedFiles, ...newFiles];
            const nextStates: FileUploadState[] = newFiles.map((f, i) => ({
              id: Date.now() + i,
              name: f.name,
              size: f.size,
              file: f,
              status: "pending",
              progress: 0,
            }));
            setSelectedFiles(nextSelected);
            setFiles((prev) => [...prev, ...nextStates]);
          }}
        >
          <Stack spacing={3} align="center" pointerEvents="none">
            <Upload size={32} color={isDragging ? "#3b82f6" : "#94a3b8"} />
            <Text fontWeight="semibold">
              Arrastra archivos o haz clic para subir
            </Text>
            <Text fontSize="sm" color="gray.500">
              Formatos: PDF, JPG, PNG, XLSX, XLS • Máximo: 10 archivos, 5MB c/u
            </Text>
            <Text fontSize="sm" color="gray.500">
              Puedes subir varios archivos del mismo comparativo.
            </Text>
          </Stack>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={3}>
            Archivos subidos
          </Text>
          <Stack spacing={3}>
            {files.map((file) => (
              <FileUploadItem
                key={file.id}
                file={file}
                onRemove={() => handleRemoveFile(file.id)}
              />
            ))}
          </Stack>
        </Box>
        </Stack>

        <Flex
          px={6}
          py={4}
          borderTop="1px solid"
          borderColor={borderColor}
          justify="space-between"
          bg={useColorModeValue("gray.50", "gray.900")}
        >
          <Button
            colorScheme="brand"
            variant="outline"
            onClick={cancelUploadDisclosure.onOpen}
          >
            Cancelar
          </Button>
          <Button
            colorScheme="brand"
            onClick={handleProcess}
            isLoading={isProcessing}
            loadingText="Procesando..."
            isDisabled={isProcessing}
            opacity={
              !obraNumero.trim() || !obraNombre.trim() || !contractType
                ? 0.5
                : 1
            }
          >
            Siguiente
          </Button>
        </Flex>
      </Box>

      <AlertDialog
        isOpen={cancelUploadDisclosure.isOpen}
        leastDestructiveRef={cancelUploadRef}
        onClose={cancelUploadDisclosure.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold" textAlign="center" borderBottomWidth={0}>
              ¿Estás seguro que quieres cancelar?
            </AlertDialogHeader>
            <AlertDialogBody textAlign="center">
              Se perderán los datos si no se guarda el archivo.
            </AlertDialogBody>
            <AlertDialogFooter gap={3} justifyContent="center" borderTopWidth={0}>
              <Button
                ref={cancelUploadRef}
                variant="outline"
                onClick={() => {
                  cancelUploadDisclosure.onClose();
                  onNavigate("documents");
                }}
              >
                Aceptar
              </Button>
              <Button
                colorScheme="brand"
                isLoading={isSavingDraft}
                isDisabled={isSavingDraft}
                onClick={async () => {
                  setIsSavingDraft(true);
                  try {
                    await onSaveDraft({ type: contractType });
                  } finally {
                    setIsSavingDraft(false);
                  }
                  cancelUploadDisclosure.onClose();
                  onNavigate("dashboard");
                }}
              >
                Guardar en borrador
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
};

interface FileUploadItemProps {
  file: FileUploadState;
  onRemove?: () => void;
}

const FileUploadItem: React.FC<FileUploadItemProps> = ({ file, onRemove }) => {
  const statusConfig = {
    pending: {
      color: "gray",
      label: "Listo para procesar",
      icon: <Clock size={14} />,
    },
    processing: {
      color: "blue",
      label: "Procesando OCR...",
      icon: <Clock size={14} />,
    },
    completed: { color: "brand", label: "Extraído", icon: <Check size={14} /> },
    warning: {
      color: "yellow",
      label: "Revisar",
      icon: <AlertCircle size={14} />,
    },
  };
  const config = statusConfig[file.status];
  const cardBg = useColorModeValue("gray.50", "gray.900");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Flex
      align="center"
      gap={4}
      p={4}
      bg={cardBg}
      border="1px solid"
      borderColor={borderColor}
      rounded="lg"
    >
      <FileText size={20} color="#94a3b8" />
      <Box flex="1">
        <Text fontWeight="medium">{file.name}</Text>
        {file.status === "processing" && (
          <Box mt={2} h="6px" bg="gray.200" rounded="full" overflow="hidden">
            <Box h="6px" bg="blue.500" width={`${file.progress}%`} />
          </Box>
        )}
        {file.size && (
          <Text fontSize="xs" color="gray.500" mt={1}>
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </Text>
        )}
      </Box>
      <Badge
        colorScheme={config.color}
        display="inline-flex"
        alignItems="center"
        gap={2}
        px={3}
        py={1}
        rounded="full"
      >
        {config.icon}
        {config.label}
      </Badge>
      {onRemove && (
        <IconButton
          aria-label="Eliminar archivo"
          icon={<Trash2 size={16} />}
          size="sm"
          variant="ghost"
          onClick={onRemove}
        />
      )}
    </Flex>
  );
};

// ============================================================================
// COMPARATIVO MANUAL
// ============================================================================

interface ComparativoManualProps {
  tabsNavigation?: React.ReactNode;
  contract: Contract | null;
  onNavigate: (view: ViewState) => void;
  onComplete: (data: ComparativoData) => void;
  obraNumero: string;
  setObraNumero: (value: string) => void;
  obraNombre: string;
  setObraNombre: (value: string) => void;
  jefeObra: string;
  setJefeObra: (value: string) => void;
  contractType: ContractType | undefined;
  setContractType: (value: ContractType) => void;
  tituloComparativo: string;
  setTituloComparativo: (value: string) => void;
  tenantId?: number;
  onSaveDraft: (payload: {
    type: ContractType;
    comparative_data?: Record<string, unknown>;
  }) => Promise<Contract>;
  /** Cuando true, oculta header de campos y reemplaza "Siguiente" por "Aplicar" */
  inlineEditMode?: boolean;
  onInlineCancel?: () => void;
  onInlineApply?: (payload: { type: ContractType; comparative_data: Record<string, unknown> }) => Promise<void>;
}

const ComparativoManual: React.FC<ComparativoManualProps> = ({
  tabsNavigation,
  contract,
  onNavigate,
  onComplete,
  obraNumero,
  setObraNumero,
  obraNombre,
  setObraNombre,
  jefeObra,
  setJefeObra,
  contractType,
  setContractType,
  tituloComparativo,
  setTituloComparativo,
  tenantId,
  onSaveDraft,
  inlineEditMode = false,
  onInlineCancel,
  onInlineApply,
}) => {
  const createId = () => Date.now() + Math.floor(Math.random() * 100000);
  const createEmptyOffer = (): OfertaItem => ({
    id: createId(),
    proveedor: "",
    importe: "",
    plazo: "",
    observaciones: "",
  });
  const createEmptyLine = (
    offerIds: number[],
    isCategory = false,
  ): ManualComparativeLineItem => ({
    id: createId(),
    codigo: "",
    medicion: "",
    unidad: "Ud.",
    descripcion: "",
    esCategoria: isCategory,
    costeUnitario: "",
    precioNetoUnitario: "",
    pricesByOffer: offerIds.reduce<
      Record<number, { ofertaN: string; precio: string; importe: string }>
    >((acc, offerId) => {
      acc[offerId] = { ofertaN: "", precio: "", importe: "" };
      return acc;
    }, {}),
  });
  const parseAmount = (raw: string): number | null => {
    if (!raw?.trim()) return null;
    let token = raw.trim().replace(/\s/g, "");
    const comma = token.lastIndexOf(",");
    const dot = token.lastIndexOf(".");
    if (comma !== -1 && dot !== -1) {
      if (comma > dot) {
        token = token.replace(/\./g, "").replace(",", ".");
      } else {
        token = token.replace(/,/g, "");
      }
    } else if (comma !== -1) {
      token = token.replace(/\./g, "").replace(",", ".");
    } else {
      const parts = token.split(".");
      if (parts.length > 2) {
        token = parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
      }
    }
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };
  const formatEuropeanNumber = (value: number): string =>
    value.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const formatDateInput = (value: Date): string => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [fechaSolicitud, setFechaSolicitud] = useState(() =>
    formatDateInput(new Date()),
  );

  const obra = [obraNumero, obraNombre].map((v) => v.trim()).filter(Boolean).join(" - ");

  // Recalcular fecha en cada montaje para asegurar día actual.
  useEffect(() => {
    setFechaSolicitud(formatDateInput(new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [ofertas, setOfertas] = useState<OfertaItem[]>(() => [
    createEmptyOffer(),
  ]);
  const [lineas, setLineas] = useState<ManualComparativeLineItem[]>(() => []);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const toast = useToast();
  const cancelManualDisclosure = useDisclosure();
  const cancelManualRef = useRef<HTMLButtonElement>(null);
  const cardBg = useColorModeValue("white", "gray.800");
  const sectionBg = useColorModeValue("gray.50", "gray.900");
  const footerBg = useColorModeValue("gray.100", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  useEffect(() => {
    if (lineas.length > 0 || ofertas.length === 0) return;
    setLineas([createEmptyLine(ofertas.map((oferta) => oferta.id))]);
  }, [lineas.length, ofertas]);

  useEffect(() => {
    // Sin contrato (nuevo comparativo): resetear tabla a estado vacío.
    if (!contract) {
      const emptyOffer = createEmptyOffer();
      setOfertas([emptyOffer]);
      setLineas([]);
      return;
    }
    const source = (contract?.comparative_data as any)?.source;
    if (source !== "manual") return;

    const data = (contract.comparative_data as any) ?? {};
    const nextType = data.contract_type;
    if (
      nextType === "SUBCONTRATACION" ||
      nextType === "SUMINISTRO" ||
      nextType === "SERVICIO"
    ) {
      setContractType(nextType);
    }
    const obraNumeroRaw =
      typeof data.obra_numero === "string" ? data.obra_numero : "";
    const obraNombreRaw =
      typeof data.obra_nombre === "string" ? data.obra_nombre : "";
    const sanitizeObraNumero = (raw: string) =>
      raw.replace(/\D/g, "").slice(0, 4);
    if (obraNumeroRaw || obraNombreRaw) {
      setObraNumero(sanitizeObraNumero(obraNumeroRaw));
      setObraNombre(obraNombreRaw);
    } else if (typeof data.obra === "string" && data.obra) {
      const [first, ...rest] = data.obra.split(" - ");
      setObraNumero(sanitizeObraNumero(first?.trim() ?? ""));
      setObraNombre(rest.join(" - ").trim());
    } else {
      setObraNumero("");
      setObraNombre("");
    }
    const persistedJefe =
      typeof data.jefe_obra === "string" ? data.jefe_obra : "";
    setJefeObra(persistedJefe);
    setFechaSolicitud(formatDateInput(new Date()));

    const draftOffersRaw = Array.isArray(data.offers) ? data.offers : [];
    const hydratedOffers: OfertaItem[] = draftOffersRaw.map(
      (item: any, index: number) => ({
        id: createId(),
        proveedor:
          (typeof item?.supplier_name === "string" && item.supplier_name) ||
          (typeof item?.provider === "string" && item.provider) ||
          `Proveedor ${index + 1}`,
        importe:
          typeof item?.total_amount === "number" &&
          Number.isFinite(item.total_amount)
            ? formatEuropeanNumber(item.total_amount)
            : "",
        plazo: typeof item?.plazo === "string" ? item.plazo : "",
        observaciones: typeof item?.notes === "string" ? item.notes : "",
      }),
    );
    const nextOffers =
      hydratedOffers.length > 0 ? hydratedOffers : [createEmptyOffer()];
    setOfertas(nextOffers);

    const offerIds = nextOffers.map((offer) => offer.id);
    const linesRaw = Array.isArray(data.lines) ? data.lines : [];
    const hydratedLines: ManualComparativeLineItem[] = linesRaw.map(
      (item: any) => {
        const pricesByOffer: Record<
          number,
          { ofertaN: string; precio: string; importe: string }
        > = {};
        const pricesRaw = Array.isArray(item?.prices) ? item.prices : [];
        const byProvider = new Map<string, any>();
        pricesRaw.forEach((price: any) => {
          const providerKey =
            typeof price?.proveedor === "string"
              ? price.proveedor.trim().toLowerCase()
              : "";
          if (providerKey) byProvider.set(providerKey, price);
        });

        nextOffers.forEach((offer) => {
          const key = (offer.proveedor || "").trim().toLowerCase();
          const priceData = key ? byProvider.get(key) : null;
          const precio =
            typeof priceData?.precio_unitario === "number" &&
            Number.isFinite(priceData.precio_unitario)
              ? formatEuropeanNumber(priceData.precio_unitario)
              : "";
          const importe =
            typeof priceData?.importe === "number" &&
            Number.isFinite(priceData.importe)
              ? formatEuropeanNumber(priceData.importe)
              : "";
          pricesByOffer[offer.id] = {
            ofertaN:
              typeof priceData?.oferta_num === "string"
                ? priceData.oferta_num
                : "",
            precio,
            importe,
          };
        });

        const quantity =
          typeof item?.cantidad === "number" && Number.isFinite(item.cantidad)
            ? formatEuropeanNumber(item.cantidad)
            : "";
        const description =
          typeof item?.descripcion === "string" ? item.descripcion : "";
        const hasPrices = pricesRaw.length > 0;
        const isCategory =
          !hasPrices && !quantity && Boolean(description.trim());
        return {
          id: createId(),
          codigo:
            typeof item?.cod_capitulo === "string" ? item.cod_capitulo : "",
          medicion: quantity,
          unidad:
            typeof item?.unidad === "string" && item.unidad
              ? item.unidad
              : "Ud.",
          descripcion: description || "",
          esCategoria: isCategory,
          costeUnitario:
            typeof item?.coste_unitario === "number" &&
            Number.isFinite(item.coste_unitario)
              ? formatEuropeanNumber(item.coste_unitario)
              : "",
          precioNetoUnitario:
            typeof item?.precio_neto_unitario === "number" &&
            Number.isFinite(item.precio_neto_unitario)
              ? formatEuropeanNumber(item.precio_neto_unitario)
              : "",
          pricesByOffer,
        };
      },
    );
    setLineas(
      hydratedLines.length > 0 ? hydratedLines : [createEmptyLine(offerIds)],
    );
  }, [contract]);

  const addOferta = () => {
    const newOffer = createEmptyOffer();
    setOfertas((prev) => [...prev, newOffer]);
    setLineas((prev) =>
      prev.map((linea) => ({
        ...linea,
        pricesByOffer: {
          ...linea.pricesByOffer,
          [newOffer.id]: { ofertaN: "", precio: "", importe: "" },
        },
      })),
    );
  };

  const removeOferta = (id: number) => {
    if (ofertas.length <= 1) return;
    setOfertas((prev) => prev.filter((o) => o.id !== id));
    setLineas((prev) =>
      prev.map((linea) => {
        const nextPrices = { ...linea.pricesByOffer };
        delete nextPrices[id];
        return { ...linea, pricesByOffer: nextPrices };
      }),
    );
  };
  const updateOferta = (id: number, field: keyof OfertaItem, value: string) => {
    setOfertas((prev) =>
      prev.map((oferta) =>
        oferta.id === id ? { ...oferta, [field]: value } : oferta,
      ),
    );
  };
  const addLinea = () => {
    setLineas((prev) => [
      ...prev,
      createEmptyLine(ofertas.map((oferta) => oferta.id)),
    ]);
  };
  const removeLinea = (lineaId: number) => {
    if (lineas.length <= 1) return;
    setLineas((prev) => prev.filter((linea) => linea.id !== lineaId));
  };
  const updateLinea = (
    lineaId: number,
    field:
      | "codigo"
      | "medicion"
      | "unidad"
      | "descripcion"
      | "costeUnitario"
      | "precioNetoUnitario",
    value: string,
  ) => {
    setLineas((prev) =>
      prev.map((linea) => {
        if (linea.id !== lineaId) return linea;
        const updated = { ...linea, [field]: value };
        if (field === "medicion") {
          const qty = parseAmount(value);
          const nextPrices = { ...updated.pricesByOffer };
          Object.keys(nextPrices).forEach((offerIdRaw) => {
            const offerId = Number(offerIdRaw);
            const precio = parseAmount(nextPrices[offerId]?.precio ?? "");
            if (qty !== null && precio !== null) {
              nextPrices[offerId] = {
                ...nextPrices[offerId],
                importe: formatEuropeanNumber(qty * precio),
              };
            } else {
              nextPrices[offerId] = {
                ...nextPrices[offerId],
                importe: "",
              };
            }
          });
          updated.pricesByOffer = nextPrices;
        }
        return updated;
      }),
    );
  };
  const updateLineaOfferPrice = (
    lineaId: number,
    offerId: number,
    field: "ofertaN" | "precio" | "importe",
    value: string,
  ) => {
    setLineas((prev) =>
      prev.map((linea) => {
        if (linea.id !== lineaId) return linea;
        const qty = parseAmount(linea.medicion ?? "");
        const current = linea.pricesByOffer[offerId] ?? {
          ofertaN: "",
          precio: "",
          importe: "",
        };
        const nextValue = {
          ...current,
          [field]: value,
        };
        if (field === "precio") {
          const price = parseAmount(value);
          nextValue.importe =
            qty !== null && price !== null
              ? formatEuropeanNumber(qty * price)
              : "";
        }
        return {
          ...linea,
          pricesByOffer: {
            ...linea.pricesByOffer,
            [offerId]: nextValue,
          },
        };
      }),
    );
  };
  const addCategoria = () => {
    setLineas((prev) => [
      ...prev,
      createEmptyLine(
        ofertas.map((oferta) => oferta.id),
        true,
      ),
    ]);
  };

  const offerTotals = useMemo(() => {
    const totals = new Map<number, number>();
    ofertas.forEach((oferta) => totals.set(oferta.id, 0));
    lineas.forEach((linea) => {
      if (linea.esCategoria) return;
      ofertas.forEach((oferta) => {
        const rawAmount = linea.pricesByOffer[oferta.id]?.importe ?? "";
        const parsed = parseAmount(rawAmount);
        if (parsed !== null) {
          totals.set(oferta.id, (totals.get(oferta.id) ?? 0) + parsed);
        }
      });
    });
    return totals;
  }, [lineas, ofertas]);
  const bestOffer = useMemo(() => {
    const candidates = ofertas
      .map((oferta) => ({
        offerId: oferta.id,
        name: oferta.proveedor || `Oferta ${oferta.id}`,
        total: offerTotals.get(oferta.id) ?? 0,
      }))
      .filter((item) => item.total > 0)
      .sort((a, b) => a.total - b.total);
    return candidates[0] ?? null;
  }, [ofertas, offerTotals]);

  const buildComparativeData = () => {
    const baseComparativeData =
      (contract?.comparative_data as Record<string, unknown> | null) ?? {};
    const baseTotals =
      (baseComparativeData.totales as Record<string, unknown> | undefined) ?? {};
    const comparativeLines = lineas
      .map((linea) => {
        if (linea.esCategoria) {
          return {
            cod_capitulo: linea.codigo || null,
            cantidad: null,
            unidad: linea.unidad || null,
            descripcion: linea.descripcion || "Categoría",
            prices: [],
            precio_minimo: null,
            proveedor_minimo: null,
            coste_unitario: null,
            coste_importe: null,
            precio_neto_unitario: null,
            precio_neto_importe: null,
          };
        }
        const prices = ofertas
          .map((oferta) => {
            const priceDraft = linea.pricesByOffer[oferta.id] ?? {
              ofertaN: "",
              precio: "",
              importe: "",
            };
            const precio = parseAmount(priceDraft.precio);
            const importe = parseAmount(priceDraft.importe);
            if (precio === null && importe === null) return null;
            return {
              proveedor: oferta.proveedor || `Oferta ${oferta.id}`,
              oferta_num: priceDraft.ofertaN || null,
              precio_unitario: precio,
              importe,
            };
          })
          .filter(Boolean) as Array<{
          proveedor: string;
          precio_unitario: number | null;
          importe: number | null;
        }>;

        const minByPrice = prices
          .filter(
            (item) =>
              typeof item.precio_unitario === "number" &&
              (item.precio_unitario ?? 0) > 0,
          )
          .sort(
            (a, b) =>
              (a.precio_unitario ?? Number.MAX_SAFE_INTEGER) -
              (b.precio_unitario ?? Number.MAX_SAFE_INTEGER),
          )[0];
        const cantidad = parseAmount(linea.medicion);
        const costeUnitario = parseAmount(linea.costeUnitario);
        const precioNetoUnitario = parseAmount(linea.precioNetoUnitario);
        const costeImporte =
          typeof cantidad === "number" && typeof costeUnitario === "number"
            ? cantidad * costeUnitario
            : null;
        const precioNetoImporte =
          typeof cantidad === "number" && typeof precioNetoUnitario === "number"
            ? cantidad * precioNetoUnitario
            : null;

        return {
          cod_capitulo: linea.codigo || null,
          cantidad,
          unidad: linea.unidad || null,
          descripcion: linea.descripcion || "Sin descripción",
          prices,
          precio_minimo: minByPrice?.precio_unitario ?? null,
          proveedor_minimo: minByPrice?.proveedor ?? null,
          coste_unitario: costeUnitario,
          coste_importe: costeImporte,
          precio_neto_unitario: precioNetoUnitario,
          precio_neto_importe: precioNetoImporte,
        };
      })
      .filter((linea) => {
        const hasCoreData =
          Boolean(linea.cod_capitulo) ||
          typeof linea.cantidad === "number" ||
          Boolean(linea.unidad) ||
          Boolean(linea.descripcion?.trim());
        const hasPrices =
          Array.isArray(linea.prices) && linea.prices.length > 0;
        const isCategory =
          !hasPrices &&
          typeof linea.cantidad !== "number" &&
          Boolean(linea.descripcion?.trim());
        return hasCoreData && (hasPrices || isCategory);
      });

    const comparativeData = {
      ...baseComparativeData,
      source: "manual",
      contract_type: contractType,
      obra,
      obra_numero: obraNumero,
      obra_nombre: obraNombre,
      jefe_obra: jefeObra,
      header: {
        ...((baseComparativeData as any)?.header ?? {}),
        obra_num: obraNumero,
        obra_nombre: obraNombre,
      },
      project: {
        ...((baseComparativeData as any)?.project ?? {}),
        nombre_obra: obraNombre,
      },
      fecha_solicitud: fechaSolicitud,
      lines: comparativeLines,
      offers: ofertas.map((oferta) => ({
        supplier_name: oferta.proveedor,
        total_amount:
          (offerTotals.get(oferta.id) ?? 0) > 0
            ? offerTotals.get(oferta.id)
            : parseAmount(oferta.importe),
        plazo: oferta.plazo,
        notes: oferta.observaciones,
      })),
      totales: {
        ...baseTotals,
        total_ofertado_proveedor: null,
      },
    };
    return comparativeData;
  };

  const validateRequiredFields = (): boolean => {
    const missing: string[] = [];
    if (!obraNumero.trim()) missing.push("Nº de obra");
    if (!obraNombre.trim()) missing.push("Nombre de obra");
    if (!contractType) missing.push("Tipo de contrato");
    if (missing.length > 0) {
      toast({
        status: "warning",
        title: "No se puede avanzar sin cumplimentar los datos",
        description: `Completa: ${missing.join(", ")}.`,
      });
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validateRequiredFields()) return;
    // validateRequiredFields garantiza que contractType ya está definido.
    const resolvedType = contractType!;
    const comparativeData = buildComparativeData();
    setIsSavingDraft(true);
    try {
      const saved = await onSaveDraft({
        type: resolvedType,
        comparative_data: comparativeData,
      });
      onComplete({ type: "manual", ofertas, lineas });
      toast({
        status: "success",
        title: "Borrador guardado",
      });
    } catch (error) {
      toast({
        status: "error",
        title: "No se pudo guardar el borrador",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleGenerate = async () => {
    if (!validateRequiredFields()) return;
    const resolvedType = contractType!;
    const comparativeData = buildComparativeData();
    onComplete({ type: "manual", ofertas, lineas });
    setIsSavingDraft(true);
    try {
      if (inlineEditMode && onInlineApply) {
        await onInlineApply({ type: resolvedType, comparative_data: comparativeData });
      } else {
        await onSaveDraft({ type: resolvedType, comparative_data: comparativeData });
        onNavigate("comparativo-review");
      }
    } catch (error) {
      toast({
        status: "error",
        title: "No se pudo generar el comparativo",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  return (
    <Box mb={inlineEditMode ? 0 : 6}>
      {!inlineEditMode && tabsNavigation}
      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        overflow="hidden"
      >
      {inlineEditMode ? (
        <Flex px={6} py={4} borderBottom="1px solid" borderColor={borderColor} align="center" justify="space-between" flexWrap="wrap">
          <Text fontWeight="semibold" fontSize="sm" color="gray.600" flexShrink={0}>
            Edición de la tabla del comparativo
          </Text>
          <HStack spacing={2}>
            <Button
              size="sm"
              colorScheme="brand"
              variant="outline"
              leftIcon={<Plus size={14} />}
              onClick={addOferta}
            >
              Proveedor
            </Button>
            <Button
              size="sm"
              colorScheme="brand"
              variant="outline"
              leftIcon={<Plus size={14} />}
              onClick={addLinea}
            >
              Línea
            </Button>
            <Button
              size="sm"
              colorScheme="brand"
              variant="outline"
              leftIcon={<Plus size={14} />}
              onClick={addCategoria}
            >
              Categoría
            </Button>
          </HStack>
        </Flex>
      ) : (
        <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
          <Heading size="md" mb={4}>Nuevo comparativo</Heading>
          <NuevoComparativoHeader
            active="manual"
            onNavigate={onNavigate}
            obraNumero={obraNumero}
            setObraNumero={setObraNumero}
            obraNombre={obraNombre}
            setObraNombre={setObraNombre}
            jefeObra={jefeObra}
            setJefeObra={setJefeObra}
            contractType={contractType}
            setContractType={setContractType}
            tituloComparativo={tituloComparativo}
            setTituloComparativo={setTituloComparativo}
            borderColor={borderColor}
            tenantId={tenantId}
          />
        </Box>
      )}
      <Stack spacing={6} p={6}>
        <Box>
          {!inlineEditMode && (
            <Flex justify="flex-end" mb={3}>
              <HStack spacing={2}>
                <Button
                  size="sm"
                  colorScheme="brand"
                  variant="outline"
                  leftIcon={<Plus size={14} />}
                  onClick={addOferta}
                >
                  Proveedor
                </Button>
                <Button
                  size="sm"
                  colorScheme="brand"
                  variant="outline"
                  leftIcon={<Plus size={14} />}
                  onClick={addLinea}
                >
                  Línea
                </Button>
                <Button
                  size="sm"
                  colorScheme="brand"
                  variant="outline"
                  leftIcon={<Plus size={14} />}
                  onClick={addCategoria}
                >
                  Categoría
                </Button>
              </HStack>
            </Flex>
          )}
          <Box
            overflowX="auto"
          >
            <Table size="sm" sx={{ "th, td": { px: 2, py: 1.5 } }}>
              <Thead>
                <Tr>
                  <Th rowSpan={2}>Código</Th>
                  <Th rowSpan={2}>Medida</Th>
                  <Th rowSpan={2}>Unidad</Th>
                  <Th rowSpan={2} minW="320px">
                    Descripción
                  </Th>
                  {ofertas.map((oferta, idx) => (
                    <Th
                      key={`head-${oferta.id}`}
                      colSpan={2}
                      textAlign="center"
                    >
                      <HStack spacing={2} justify="center">
                        <Input
                          size="xs"
                          value={oferta.proveedor}
                          placeholder={`Proveedor ${idx + 1}`}
                          onChange={(e) =>
                            updateOferta(oferta.id, "proveedor", e.target.value)
                          }
                        />
                        <IconButton
                          aria-label="Eliminar proveedor"
                          size="xs"
                          variant="ghost"
                          icon={<Trash2 size={12} />}
                          onClick={() => removeOferta(oferta.id)}
                        />
                      </HStack>
                    </Th>
                  ))}
                  <Th colSpan={2} textAlign="center" bg="yellow.50">
                    Precios mínimos
                  </Th>
                  <Th colSpan={4} textAlign="center" bg="blue.50">
                    Datos de planificación
                  </Th>
                  <Th rowSpan={2}></Th>
                </Tr>
                <Tr>
                  {ofertas.map((oferta) => (
                    <React.Fragment key={`sub-${oferta.id}`}>
                      <Th textAlign="center">Precio</Th>
                      <Th textAlign="center">Importe</Th>
                    </React.Fragment>
                  ))}
                  <Th bg="yellow.50">Precio</Th>
                  <Th bg="yellow.50">Proveedor</Th>
                  <Th bg="blue.50">Coste unit.</Th>
                  <Th bg="blue.50">Coste imp.</Th>
                  <Th bg="blue.50">P. neto unit.</Th>
                  <Th bg="blue.50">P. neto imp.</Th>
                </Tr>
              </Thead>
              <Tbody>
                {lineas.map((linea) => {
                  const minCandidates = ofertas
                    .map((oferta) => {
                      const value = parseAmount(
                        linea.pricesByOffer[oferta.id]?.precio ?? "",
                      );
                      return {
                        provider: oferta.proveedor || `Oferta ${oferta.id}`,
                        precio: value,
                      };
                    })
                    .filter(
                      (item) =>
                        typeof item.precio === "number" &&
                        (item.precio ?? 0) > 0,
                    )
                    .sort(
                      (a, b) =>
                        (a.precio ?? Number.MAX_SAFE_INTEGER) -
                        (b.precio ?? Number.MAX_SAFE_INTEGER),
                    );
                  const best = minCandidates[0];
                  const qty = parseAmount(linea.medicion);
                  const costeUnit = parseAmount(linea.costeUnitario);
                  const netoUnit = parseAmount(linea.precioNetoUnitario);
                  const costeImp =
                    qty !== null && costeUnit !== null ? qty * costeUnit : null;
                  const netoImp =
                    qty !== null && netoUnit !== null ? qty * netoUnit : null;

                  return (
                    <Tr
                      key={linea.id}
                      bg={linea.esCategoria ? sectionBg : undefined}
                    >
                      <Td>
                        <Input
                          size="xs"
                          value={linea.codigo}
                          onChange={(e) =>
                            updateLinea(linea.id, "codigo", e.target.value)
                          }
                        />
                      </Td>
                      <Td>
                        <Input
                          size="xs"
                          value={linea.medicion}
                          onChange={(e) =>
                            updateLinea(linea.id, "medicion", e.target.value)
                          }
                          isDisabled={linea.esCategoria}
                        />
                      </Td>
                      <Td>
                        <Input
                          size="xs"
                          value={linea.unidad}
                          onChange={(e) =>
                            updateLinea(linea.id, "unidad", e.target.value)
                          }
                        />
                      </Td>
                      <Td>
                        <Input
                          size="xs"
                          value={linea.descripcion}
                          fontWeight={linea.esCategoria ? "bold" : "normal"}
                          onChange={(e) =>
                            updateLinea(linea.id, "descripcion", e.target.value)
                          }
                        />
                      </Td>
                      {ofertas.map((oferta) => (
                        <React.Fragment key={`${linea.id}-${oferta.id}`}>
                          <Td>
                            <Input
                              size="xs"
                              value={
                                linea.pricesByOffer[oferta.id]?.precio ?? ""
                              }
                              onChange={(e) =>
                                updateLineaOfferPrice(
                                  linea.id,
                                  oferta.id,
                                  "precio",
                                  e.target.value,
                                )
                              }
                              isDisabled={linea.esCategoria}
                            />
                          </Td>
                          <Td>
                            <Input
                              size="xs"
                              value={
                                linea.pricesByOffer[oferta.id]?.importe ?? ""
                              }
                              isReadOnly
                              isDisabled={linea.esCategoria}
                            />
                          </Td>
                        </React.Fragment>
                      ))}
                      <Td bg="yellow.50">
                        {typeof best?.precio === "number"
                          ? formatCurrency(best.precio)
                          : "—"}
                      </Td>
                      <Td bg="yellow.50">{best?.provider ?? "—"}</Td>
                      <Td bg="blue.50">
                        <Input
                          size="xs"
                          value={linea.costeUnitario}
                          onChange={(e) =>
                            updateLinea(
                              linea.id,
                              "costeUnitario",
                              e.target.value,
                            )
                          }
                          isDisabled={linea.esCategoria}
                        />
                      </Td>
                      <Td bg="blue.50">
                        {costeImp !== null ? formatCurrency(costeImp) : "—"}
                      </Td>
                      <Td bg="blue.50">
                        <Input
                          size="xs"
                          value={linea.precioNetoUnitario}
                          onChange={(e) =>
                            updateLinea(
                              linea.id,
                              "precioNetoUnitario",
                              e.target.value,
                            )
                          }
                          isDisabled={linea.esCategoria}
                        />
                      </Td>
                      <Td bg="blue.50">
                        {netoImp !== null ? formatCurrency(netoImp) : "—"}
                      </Td>
                      <Td>
                        <IconButton
                          aria-label="Eliminar línea"
                          size="xs"
                          variant="ghost"
                          icon={<Trash2 size={12} />}
                          onClick={() => removeLinea(linea.id)}
                        />
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
              <tfoot>
                <Tr bg={footerBg}>
                  <Td colSpan={4} fontWeight="bold" textAlign="right">
                    (A) Total ofertado proveedor
                  </Td>
                  {ofertas.map((oferta) => {
                    const total = offerTotals.get(oferta.id) ?? 0;
                    const isBest = bestOffer?.offerId === oferta.id;
                    return (
                      <Td
                        key={`tot-${oferta.id}`}
                        colSpan={2}
                        fontWeight="bold"
                        textAlign="right"
                        bg={isBest ? "brand.100" : undefined}
                      >
                        {total > 0 ? formatCurrency(total) : "—"}
                      </Td>
                    );
                  })}
                  <Td colSpan={6}></Td>
                  <Td></Td>
                </Tr>
              </tfoot>
            </Table>
          </Box>
        </Box>
      </Stack>
      <Flex
        px={6}
        py={4}
        borderTop="1px solid"
        borderColor={borderColor}
        justify={inlineEditMode ? "flex-end" : "space-between"}
        bg={useColorModeValue("gray.50", "gray.900")}
      >
        {!inlineEditMode && (
          <Button
            colorScheme="brand"
            variant="outline"
            onClick={cancelManualDisclosure.onOpen}
          >
            Cancelar
          </Button>
        )}
        <HStack spacing={3}>
          {!inlineEditMode && (
            <Button
              colorScheme="gray"
              variant="outline"
              onClick={handleSaveDraft}
              isLoading={isSavingDraft}
              isDisabled={isSavingDraft}
              opacity={
                !obraNumero.trim() || !obraNombre.trim() || !contractType
                  ? 0.5
                  : 1
              }
            >
              Guardar borrador
            </Button>
          )}
          {inlineEditMode && (
            <Button
              bg="brand.600"
              color="white"
              _hover={{ bg: "brand.700" }}
              onClick={onInlineCancel}
              isDisabled={isSavingDraft}
            >
              Cancelar
            </Button>
          )}
          <Button
            bg="brand.600"
            color="white"
            _hover={{ bg: "brand.700" }}
            onClick={handleGenerate}
            isLoading={isSavingDraft}
            isDisabled={isSavingDraft}
            opacity={
              !obraNumero.trim() || !obraNombre.trim() || !contractType
                ? 0.5
                : 1
            }
          >
            {inlineEditMode ? "Aplicar cambios" : "Generar comparativo"}
          </Button>
        </HStack>
      </Flex>

      <AlertDialog
        isOpen={cancelManualDisclosure.isOpen}
        leastDestructiveRef={cancelManualRef}
        onClose={cancelManualDisclosure.onClose}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold" textAlign="center" borderBottomWidth={0}>
              ¿Estás seguro que quieres cancelar?
            </AlertDialogHeader>
            <AlertDialogBody textAlign="center">
              Se perderán los datos si no se guarda el archivo.
            </AlertDialogBody>
            <AlertDialogFooter gap={3} justifyContent="center" borderTopWidth={0}>
              <Button
                ref={cancelManualRef}
                variant="outline"
                onClick={() => {
                  cancelManualDisclosure.onClose();
                  onNavigate("documents");
                }}
              >
                Aceptar
              </Button>
              <Button
                colorScheme="brand"
                onClick={async () => {
                  cancelManualDisclosure.onClose();
                  await handleSaveDraft();
                  onNavigate("dashboard");
                }}
                isLoading={isSavingDraft}
                isDisabled={isSavingDraft}
              >
                Guardar en borrador
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
      </Box>
    </Box>
  );
};

// ============================================================================
// COMPARATIVO REVIEW
// ============================================================================

interface ComparativoReviewProps {
  tabsNavigation?: React.ReactNode;
  data: ComparativoData | null;
  contract: Contract | null;
  contracts: Contract[];
  tenantId?: number;
  viewMode?: "ver" | "editar";
  isNewFlow?: boolean;
  isSavingIntake?: boolean;
  isSavingDraft?: boolean;
  isSubmittingComparative?: boolean;
  isValidatingRea?: boolean;
  isSendingSupplierForm?: boolean;
  initialSubTab?: "comparativo" | "informacion";
  onSubTabChange?: (subTab: "comparativo" | "informacion") => void;
  onNavigate: (view: ViewState) => void;
  onChangeContract: (contractId: number) => void;
  onSaveIntake: (payload: ContractUpdatePayload) => Promise<void> | void;
  onSaveIntakeSilently?: (payload: ContractUpdatePayload) => Promise<void> | void;
  onSaveDraft: () => Promise<void> | void;
  onSubmitComparative: () => Promise<Contract | undefined> | void;
  onValidateRea?: () => Promise<ReaValidationResult | null>;
  onSendSupplierForm?: () => Promise<void> | void;
  onSelectOffer: (offerId: number) => void;
  onEditComparativoData?: (source: "ocr" | "manual" | "excel" | null) => void;
  onSaveDraftWithData?: (payload: {
    type?: ContractType;
    title?: string;
    comparative_data?: Record<string, unknown> | null;
  }) => Promise<void>;
  onAddOffer?: (contractId: number, file: File) => Promise<void>;
  obraNumero?: string;
  setObraNumero?: (v: string) => void;
  obraNombre?: string;
  setObraNombre?: (v: string) => void;
  jefeObra?: string;
  setJefeObra?: (v: string) => void;
  contractType?: ContractType;
  setContractType?: (v: ContractType) => void;
  tituloComparativo?: string;
  setTituloComparativo?: (v: string) => void;
}

const cleanProviderDisplayName = (value: string) =>
  value
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/^\s*\d{6,8}\s+/, "")
    .replace(/^\s*(OFERTA|PRESUPUESTO|COMPARATIVO)\s+/i, "")
    .trim();

const normalizeComparativeLabel = (value: string) =>
  cleanProviderDisplayName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const resolvePriceCell = (
  pricesByProvider: Map<string, { precio: number | null; importe: number | null }>,
  providerKey: string,
) => pricesByProvider.get(providerKey);

// ============================================================================
// COMPARATIVO PREVIEW MODAL (read-only, usado desde Aprobaciones)
// ============================================================================

interface ComparativoPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: Contract | null;
  tenantId?: number;
  canApproveComparative?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  onApproveComparative?: () => void;
  onRejectComparative?: () => void;
}

const ComparativoPreviewModal: React.FC<ComparativoPreviewModalProps> = ({
  isOpen,
  onClose,
  contract,
  tenantId,
  canApproveComparative = false,
  isApproving = false,
  isRejecting = false,
  onApproveComparative,
  onRejectComparative,
}) => {
  const hasExcelSource = Boolean(
    (contract?.comparative_data as any)?.source_file_path,
  );
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ comparativoPreview: true }, "");
      const handlePopState = () => { onClose(); };
      window.addEventListener("popstate", handlePopState);
      return () => window.removeEventListener("popstate", handlePopState);
    }
  }, [isOpen, onClose]);

  const downloadExcel = async () => {
    if (!contract?.id) return;
    setIsDownloadingExcel(true);
    try {
      const { blob, filename } = await fetchComparativeSourceBlob(
        contract.id,
        contract?.tenant_id ?? tenantId,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `comparativo-CP-${contract.id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const liveOffersQuery = useQuery({
    queryKey: contractKeys.comparativeOffers(
      contract?.tenant_id ?? tenantId,
      contract?.id ?? 0,
    ),
    queryFn: () =>
      fetchComparativeOffers(
        contract!.id,
        contract?.tenant_id ?? tenantId,
      ),
    enabled: Boolean(contract?.id && isOpen),
    refetchInterval:
      contract?.status === "PENDING_SUPPLIER" ? 15000 : false,
    refetchIntervalInBackground: false,
  });

  const offers =
    (liveOffersQuery.data as any[]) ??
    (contract?.comparative_data as any)?.offers ??
    [];
  const comparativeLines = (contract?.comparative_data as any)?.lines ?? [];
  const comparativeTotals = (contract?.comparative_data as any)?.totales ?? {};

  const totalsByProvider = useMemo(() => {
    const totals = new Map<string, number>();
    if (!Array.isArray(comparativeLines)) return totals;
    comparativeLines.forEach((line: any) => {
      const prices = Array.isArray(line?.prices) ? line.prices : [];
      prices.forEach((price: any) => {
        const providerName = typeof price?.proveedor === "string" ? price.proveedor : "";
        const amount = typeof price?.importe === "number" ? price.importe : null;
        if (!providerName || amount === null) return;
        const key = normalizeComparativeLabel(providerName);
        totals.set(key, (totals.get(key) ?? 0) + amount);
      });
    });
    return totals;
  }, [comparativeLines]);

  const providerColorSchemes = ["blue", "brand", "purple", "orange", "teal"];

  const providers = useMemo(() => {
    const map = new Map<string, {
      key: string; id: number | null; name: string; totalAmount: number | null;
    }>();

    offers.forEach((offer: any, index: number) => {
      const rawName =
        offer.offer_name || offer.supplier_name || offer.supplier_tax_id ||
        offer.file || `Oferta ${index + 1}`;
      const key = normalizeComparativeLabel(String(rawName));
      if (!key) return;
      const resolvedAmount = totalsByProvider.get(key) ?? offer.total_amount ?? null;
      map.set(key, {
        key,
        id: null,
        name: cleanProviderDisplayName(String(rawName)),
        totalAmount: typeof resolvedAmount === "number" ? resolvedAmount : null,
      });
    });

    if (Array.isArray(comparativeLines)) {
      comparativeLines.forEach((line: any) => {
        const prices = Array.isArray(line?.prices) ? line.prices : [];
        prices.forEach((price: any) => {
          const providerName = typeof price?.proveedor === "string" ? price.proveedor : "";
          const key = normalizeComparativeLabel(providerName);
          if (!key || map.has(key)) return;
          map.set(key, {
            key,
            id: null,
            name: cleanProviderDisplayName(providerName),
            totalAmount: totalsByProvider.get(key) ?? null,
          });
        });
      });
    }

    return Array.from(map.values()).map((p, index) => ({
      ...p,
      colorScheme: providerColorSchemes[index % providerColorSchemes.length],
    }));
  }, [offers, comparativeLines, totalsByProvider]);

  const lineRows = useMemo(() => {
    if (!Array.isArray(comparativeLines)) return [];
    return comparativeLines.map((line: any, lineIndex: number) => {
      const prices = Array.isArray(line?.prices) ? line.prices : [];
      const pricesByProvider = new Map<string, { precio: number | null; importe: number | null }>();
      prices.forEach((price: any) => {
        const providerName = typeof price?.proveedor === "string" ? price.proveedor : "";
        const key = normalizeComparativeLabel(providerName);
        if (!key) return;
        pricesByProvider.set(key, {
          precio: typeof price?.precio_unitario === "number" ? price.precio_unitario : null,
          importe: typeof price?.importe === "number" ? price.importe : null,
        });
      });

      const bestByImporte = providers
        .map((provider) => ({
          providerKey: provider.key,
          providerName: provider.name,
          importe: resolvePriceCell(pricesByProvider, provider.key)?.importe ?? null,
        }))
        .filter((item) => typeof item.importe === "number" && (item.importe ?? 0) > 0)
        .sort((a, b) =>
          (a.importe ?? Number.MAX_SAFE_INTEGER) - (b.importe ?? Number.MAX_SAFE_INTEGER),
        )[0];

      return {
        key: `${line?.cod_capitulo ?? "line"}-${lineIndex}`,
        medicion: typeof line?.cantidad === "number" ? formatNumber(line.cantidad) : "—",
        unidad: line?.unidad || "Ud.",
        descripcion: line?.descripcion || "Sin descripción",
        pricesByProvider,
        bestByImporte,
      };
    });
  }, [comparativeLines, providers]);

  const fallbackRows = useMemo(() => {
    if (lineRows.length > 0 || providers.length === 0) return [];
    const pricesByProvider = new Map<string, { precio: number | null; importe: number | null }>();
    providers.forEach((provider) => {
      pricesByProvider.set(provider.key, {
        precio: provider.totalAmount ?? null,
        importe: provider.totalAmount ?? null,
      });
    });
    const bestByImporte = [...providers]
      .filter((p) => p.totalAmount !== null && (p.totalAmount ?? 0) > 0)
      .sort((a, b) => (a.totalAmount ?? Number.MAX_SAFE_INTEGER) - (b.totalAmount ?? Number.MAX_SAFE_INTEGER))[0];
    return [{
      key: "fallback-total-row",
      medicion: "—",
      unidad: "—",
      descripcion: "Total ofertado (sin desglose de líneas)",
      pricesByProvider,
      bestByImporte: bestByImporte
        ? { providerKey: bestByImporte.key, providerName: bestByImporte.name, importe: bestByImporte.totalAmount }
        : undefined,
    }];
  }, [lineRows, providers]);

  const rowsToRender = lineRows.length > 0 ? lineRows : fallbackRows;

  const bestPriceProvider = [...providers]
    .filter((p) => p.totalAmount !== null)
    .sort((a, b) => (a.totalAmount ?? Number.MAX_SAFE_INTEGER) - (b.totalAmount ?? Number.MAX_SAFE_INTEGER))[0];

  const data = (contract?.comparative_data as any) ?? {};
  const obraNumero =
    (typeof data.obra_numero === "string" && data.obra_numero.trim()) ||
    (typeof data.obra_num === "string" && data.obra_num.trim()) || "—";
  const obraNombre =
    (typeof data.obra_nombre === "string" && data.obra_nombre.trim()) || "—";
  const jefeObra =
    (typeof data.jefe_obra === "string" && data.jefe_obra.trim()) || "—";

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent borderRadius={0}>
        <ModalHeader borderBottom="1px solid" borderColor="gray.200" pb={4}>
          <HStack spacing={4} align="baseline">
            <Text>
              {contract ? `CP-${contract.id}` : "Comparativo"}
              {contract?.title ? ` · ${contract.title}` : ""}
            </Text>
            <Text fontSize="sm" fontWeight="normal" color="gray.500">
              Vista del comparativo
            </Text>
          </HStack>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mt={3} fontSize="sm">
            <Box>
              <Text color="gray.500" fontSize="xs">Nº obra</Text>
              <Text fontWeight="medium">{obraNumero}</Text>
            </Box>
            <Box>
              <Text color="gray.500" fontSize="xs">Nombre obra</Text>
              <Text fontWeight="medium">{obraNombre}</Text>
            </Box>
            <Box>
              <Text color="gray.500" fontSize="xs">Jefe de obra</Text>
              <Text fontWeight="medium">{jefeObra}</Text>
            </Box>
            <Box>
              <Text color="gray.500" fontSize="xs">Tipo</Text>
              <Text fontWeight="medium">
                {formatContractType(
                  (data.contract_type as ContractType | undefined) ?? contract?.type,
                )}
              </Text>
            </Box>
          </SimpleGrid>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody p={0}>
          {hasExcelSource && (
            <Flex
              px={6}
              py={3}
              borderBottom="1px solid"
              borderColor="gray.200"
              bg="gray.50"
              justify="flex-end"
              align="center"
            >
              <Button
                size="sm"
                leftIcon={<Download size={14} />}
                colorScheme="brand"
                variant="outline"
                onClick={downloadExcel}
                isLoading={isDownloadingExcel}
                loadingText="Descargando"
              >
                Descargar Excel original
              </Button>
            </Flex>
          )}
          {liveOffersQuery.isLoading ? (
            <Flex justify="center" align="center" py={16}>
              <Spinner size="md" color="brand.500" />
            </Flex>
          ) : providers.length === 0 ? (
            <Box p={6}>
              <Text fontSize="sm" color="gray.500">
                No hay datos de comparativo disponibles.
              </Text>
            </Box>
          ) : (
            <Box>
              <Box overflowX="auto">
                <Table size="sm" style={{ borderCollapse: "collapse" }}>
                  <Thead>
                    <Tr>
                      <Th bg="gray.700" color="white" textTransform="uppercase" fontSize="xs">Medición</Th>
                      <Th bg="gray.700" color="white" textTransform="uppercase" fontSize="xs">U.D.</Th>
                      <Th bg="gray.700" color="white" textTransform="uppercase" fontSize="xs" minW="320px">Descripción</Th>
                      {providers.map((provider) => (
                        <Th
                          key={provider.key}
                          bg={`${provider.colorScheme}.600`}
                          color="white"
                          textAlign="center"
                          textTransform="uppercase"
                          fontSize="xs"
                          colSpan={2}
                        >
                          {provider.name}
                        </Th>
                      ))}
                      <Th bg="yellow.600" color="white" textAlign="center" textTransform="uppercase" fontSize="xs" minW="160px">
                        Mejor oferta
                      </Th>
                    </Tr>
                    <Tr>
                      <Th bg="gray.600" />
                      <Th bg="gray.600" />
                      <Th bg="gray.600" />
                      {providers.map((provider) => (
                        <React.Fragment key={`${provider.key}-subhead`}>
                          <Th bg={`${provider.colorScheme}.500`} color="white" textAlign="center" textTransform="uppercase" fontSize="xs">
                            Precio
                          </Th>
                          <Th bg={`${provider.colorScheme}.500`} color="white" textAlign="center" textTransform="uppercase" fontSize="xs">
                            Importe
                          </Th>
                        </React.Fragment>
                      ))}
                      <Th bg="yellow.500" />
                    </Tr>
                  </Thead>
                  <Tbody>
                    {rowsToRender.map((row, rowIndex) => (
                      <Tr key={row.key} bg={rowIndex % 2 === 1 ? "gray.50" : "transparent"}>
                        <Td fontWeight="semibold">{row.medicion}</Td>
                        <Td>{row.unidad}</Td>
                        <Td>{row.descripcion}</Td>
                        {providers.map((provider) => {
                          const cell = resolvePriceCell(row.pricesByProvider, provider.key);
                          const isBest = row.bestByImporte?.providerKey === provider.key;
                          const baseBg = isBest ? `${provider.colorScheme}.100` : `${provider.colorScheme}.50`;
                          const textColor = isBest ? `${provider.colorScheme}.800` : `${provider.colorScheme}.700`;
                          return (
                            <React.Fragment key={`${row.key}-${provider.key}`}>
                              <Td bg={baseBg} textAlign="center" color={textColor} fontWeight={isBest ? "bold" : "semibold"}>
                                {cell?.precio !== null && cell?.precio !== undefined ? formatCurrency(cell.precio) : "—"}
                              </Td>
                              <Td bg={baseBg} textAlign="center" color={textColor} fontWeight={isBest ? "bold" : "semibold"}>
                                {cell?.importe !== null && cell?.importe !== undefined ? formatCurrency(cell.importe) : "—"}
                              </Td>
                            </React.Fragment>
                          );
                        })}
                        <Td bg={row.bestByImporte ? "brand.50" : "gray.50"} textAlign="center">
                          {row.bestByImporte ? (
                            <Stack spacing={0} align="center">
                              <Text fontWeight="bold" color="brand.700">{row.bestByImporte.providerName}</Text>
                              <Text fontSize="sm" color="brand.600">{formatCurrency(row.bestByImporte.importe ?? 0)}</Text>
                            </Stack>
                          ) : (
                            <Text color="gray.500" fontSize="sm">Pendiente</Text>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>

              {bestPriceProvider && (
                <Box p={4} bg="brand.50" border="1px solid" borderColor="brand.200" mx={0}>
                  <Text fontSize="sm" fontWeight="semibold" color="brand.800">
                    Recomendación del Sistema: {bestPriceProvider.name}
                    {bestPriceProvider.totalAmount !== null
                      ? ` · ${formatCurrency(bestPriceProvider.totalAmount)}`
                      : ""}
                  </Text>
                </Box>
              )}

              {comparativeTotals && (
                <Box p={4} borderTop="1px solid" borderColor="gray.200">
                  <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} fontSize="sm">
                    {comparativeTotals.plazos && (
                      <Box>
                        <Text color="gray.500" fontSize="xs">Plazos</Text>
                        <Text fontWeight="medium">{comparativeTotals.plazos}</Text>
                      </Box>
                    )}
                    {comparativeTotals.garantias && (
                      <Box>
                        <Text color="gray.500" fontSize="xs">Garantías</Text>
                        <Text fontWeight="medium">{comparativeTotals.garantias}</Text>
                      </Box>
                    )}
                    {comparativeTotals.forma_pago && (
                      <Box>
                        <Text color="gray.500" fontSize="xs">Forma de pago</Text>
                        <Text fontWeight="medium">{comparativeTotals.forma_pago}</Text>
                      </Box>
                    )}
                  </SimpleGrid>
                </Box>
              )}
            </Box>
          )}
        </ModalBody>
        <ModalFooter borderTop="1px solid" borderColor="gray.200" justifyContent="space-between">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {(onApproveComparative || onRejectComparative) && (
            <HStack spacing={3}>
              {onRejectComparative && (
                <Button
                  colorScheme="red"
                  variant="outline"
                  isLoading={isRejecting}
                  loadingText="Rechazando"
                  onClick={onRejectComparative}
                >
                  Rechazar comparativo
                </Button>
              )}
              {onApproveComparative && (
                <Button
                  colorScheme="brand"
                  isDisabled={!canApproveComparative}
                  isLoading={isApproving}
                  loadingText="Aprobando"
                  onClick={onApproveComparative}
                >
                  Aprobar comparativo
                </Button>
              )}
            </HStack>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const ReaResultPanel: React.FC<{
  result: ReaValidationResult;
  supplierTaxId?: string;
}> = ({ result, supplierTaxId }) => {
  const isOk = result.next_action === "send_to_approval";
  const reaAlta = result.rea.estado === "ALTA";
  return (
    <Stack spacing={3} w="full">
      <Flex
        align="center"
        gap={3}
        p={3}
        bg={isOk ? "green.50" : "yellow.50"}
        border="1px solid"
        borderColor={isOk ? "green.300" : "yellow.300"}
        rounded="md"
      >
        <Box
          w={9}
          h={9}
          rounded="full"
          bg={isOk ? "green.500" : "yellow.500"}
          color="white"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          {isOk ? <Check size={20} /> : <AlertCircle size={20} />}
        </Box>
        <Box>
          <Text fontWeight="semibold" color={isOk ? "green.800" : "yellow.800"}>
            {isOk
              ? "El comparativo se enviará a aprobación"
              : "El proveedor debe completar sus datos"}
          </Text>
          <Text fontSize="sm" color={isOk ? "green.700" : "yellow.700"}>
            {isOk
              ? "Proveedor acreditado en REA y validado en el sistema."
              : reaAlta
              ? "El proveedor está en REA pero no existe en el sistema. Se enviará formulario."
              : "El proveedor no figura como acreditado en REA. Se enviará formulario para completar datos."}
          </Text>
        </Box>
      </Flex>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} fontSize="sm">
        <Box>
          <Text color="gray.500" fontSize="xs">CIF/NIF consultado</Text>
          <Text fontWeight="medium">{result.rea.numero || supplierTaxId || "—"}</Text>
        </Box>
        <Box>
          <Text color="gray.500" fontSize="xs">Estado REA</Text>
          <Text fontWeight="medium">{result.rea.estado}</Text>
        </Box>
        <Box>
          <Text color="gray.500" fontSize="xs">Existe en sistema</Text>
          <Text fontWeight="medium">{result.supplier_in_db ? "Sí" : "No"}</Text>
        </Box>
        <Box>
          <Text color="gray.500" fontSize="xs">Tipo identificador</Text>
          <Text fontWeight="medium">
            {result.rea.tipo_identificacion === "1"
              ? "NIF"
              : result.rea.tipo_identificacion === "2"
              ? "NIE"
              : "CIF"}
          </Text>
        </Box>
      </SimpleGrid>
    </Stack>
  );
};

const ComparativoReview: React.FC<ComparativoReviewProps> = ({
  tabsNavigation,
  contract,
  contracts,
  tenantId,
  viewMode = "ver",
  isNewFlow = false,
  isSavingIntake = false,
  isSavingDraft = false,
  isSubmittingComparative = false,
  isValidatingRea = false,
  isSendingSupplierForm = false,
  initialSubTab,
  onSubTabChange,
  onNavigate,
  onChangeContract,
  onSaveIntake,
  onSaveIntakeSilently,
  onSaveDraft,
  onSubmitComparative,
  onValidateRea,
  onSendSupplierForm,
  onSelectOffer,
  onEditComparativoData,
  onSaveDraftWithData,
  onAddOffer,
  obraNumero: obraNumeroProp,
  setObraNumero: setObraNumeroProp,
  obraNombre: obraNombreProp,
  setObraNombre: setObraNombreProp,
  jefeObra: jefeObraProp,
  setJefeObra: setJefeObraProp,
  contractType: contractTypeProp,
  setContractType: setContractTypeProp,
  tituloComparativo: tituloComparativoProp,
  setTituloComparativo: setTituloComparativoProp,
}) => {
  const toast = useToast();
  const cancelReviewDisclosure = useDisclosure();
  const cancelReviewRef = useRef<HTMLButtonElement>(null);
  const hasAttemptedOfferSyncRef = useRef(false);
  const liveContractQuery = useQuery({
    queryKey: contractKeys.detail(tenantId, contract?.id ?? 0),
    queryFn: () =>
      fetchContractById(contract!.id, contract?.tenant_id ?? tenantId),
    enabled: Boolean(contract?.id),
    refetchInterval: (query) =>
      (query.state.data as any)?.status === "PENDING_SUPPLIER" ? 15000 : false,
    refetchIntervalInBackground: false,
  });
  const currentContract = useMemo(() => {
    const liveContract = liveContractQuery.data;
    if (!liveContract) return contract;
    if (!contract) return liveContract;
    const liveUpdatedAt = Date.parse(liveContract.updated_at || "");
    const propUpdatedAt = Date.parse(contract.updated_at || "");
    if (Number.isFinite(propUpdatedAt) && Number.isFinite(liveUpdatedAt)) {
      return propUpdatedAt > liveUpdatedAt ? contract : liveContract;
    }
    return contract ?? liveContract;
  }, [liveContractQuery.data, contract]);

  const isInfoReadOnly =
    viewMode === "ver" || currentContract?.comparative_status === "APPROVED";

  const liveOffersQuery = useQuery({
    queryKey: contractKeys.comparativeOffers(
      currentContract?.tenant_id ?? tenantId,
      currentContract?.id ?? 0,
    ),
    queryFn: () =>
      fetchComparativeOffers(
        currentContract!.id,
        currentContract?.tenant_id ?? contract?.tenant_id ?? tenantId,
      ),
    enabled: Boolean(currentContract?.id),
    refetchInterval:
      currentContract?.status === "PENDING_SUPPLIER" ? 15000 : false,
    refetchIntervalInBackground: false,
  });
  const offers =
    (liveOffersQuery.data as any[]) ??
    (currentContract?.comparative_data as any)?.offers ??
    [];
  const resolveOfferIdentityKey = (offerLike: any, fallbackIndex = 0) => {
    const rawName =
      offerLike?.offer_name ||
      offerLike?.supplier_name ||
      offerLike?.supplier_tax_id ||
      offerLike?.file ||
      `Oferta ${fallbackIndex + 1}`;
    return normalizeComparativeLabel(String(rawName));
  };
  const offerIdCandidates = (offerLike: any): unknown[] => [
    offerLike?.id,
    offerLike?.offer_id,
    offerLike?.contract_offer_id,
    offerLike?.contractOfferId,
  ];
  const comparativeTotals =
    (currentContract?.comparative_data as any)?.totales ?? {};
  const comparativeLines =
    (currentContract?.comparative_data as any)?.lines ?? [];
  const resolveOfferId = (raw: unknown): number | null => {
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
    if (typeof raw === "string") {
      const parsed = Number(raw.trim());
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    return null;
  };
  const selectedOfferId = resolveOfferId(
    (currentContract?.comparative_data as any)?.selected_offer_id ??
      currentContract?.selected_offer_id ??
      null,
  );
  const [selectedProvider, setSelectedProvider] = useState(
    selectedOfferId ? String(selectedOfferId) : "",
  );
  const [pendingOfferSelection, setPendingOfferSelection] = useState<string | null>(null);
  const [hydratedContractId, setHydratedContractId] = useState<number | null>(null);
  const [supplierTaxId, setSupplierTaxId] = useState("");
  const [empresaContratada, setEmpresaContratada] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierLookupFound, setSupplierLookupFound] = useState(false);
  const [isSupplierLookupLoading, setIsSupplierLookupLoading] = useState(false);
  const supplierAutofilledRef = useRef(false);
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [contactoEmail, setContactoEmail] = useState("");
  const [duracionEjecucion, setDuracionEjecucion] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [hitosClave, setHitosClave] = useState("");
  type MilestoneItem = { name: string; start: string; end: string; description: string };
  const [milestonesEnabled, setMilestonesEnabled] = useState(false);
  const [milestoneItems, setMilestoneItems] = useState<MilestoneItem[]>([
    { name: "Hito 1", start: "", end: "", description: "" },
  ]);
  const [descripcionUds, setDescripcionUds] = useState("");
  const [descripcionUdsCheck, setDescripcionUdsCheck] = useState(false);
  const [descripcionUdsFile, setDescripcionUdsFile] = useState<File | null>(null);
  const descripcionUdsFileRef = useRef<HTMLInputElement>(null);
  const descripcionUdsTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [modoPrecio, setModoPrecio] = useState<"CERRADO" | "REAL">("CERRADO");
  const [precioTotalEjecucion, setPrecioTotalEjecucion] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [formaPagoPactada, setFormaPagoPactada] = useState("");
  const [formaPagoEsOtro, setFormaPagoEsOtro] = useState(false);
  const [formaPagoOtroTexto, setFormaPagoOtroTexto] = useState("");
  const [trabajadoresObra, setTrabajadoresObra] = useState("");
  const [retencion, setRetencion] = useState<"SI" | "NO">("SI");
  const [retencionDescripcion, setRetencionDescripcion] = useState("");
  const [observacionesAdicionales, setObservacionesAdicionales] = useState("");
  const [portes, setPortes] = useState("");
  const [localInfoSubTab, setLocalInfoSubTab] = useState<
    "comparativo" | "informacion"
  >(initialSubTab ?? "comparativo");
  useEffect(() => {
    if (initialSubTab) {
      setLocalInfoSubTab(initialSubTab);
    }
  }, [initialSubTab]);
  const infoSubTab: "comparativo" | "informacion" =
    initialSubTab ?? localInfoSubTab;
  const setInfoSubTab = (next: "comparativo" | "informacion") => {
    setLocalInfoSubTab(next);
    onSubTabChange?.(next);
  };
  const topAnchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const scrollTop = () => {
      const root = document.querySelector('[data-scroll-root="true"]');
      if (root) (root as HTMLElement).scrollTop = 0;
      window.scrollTo({ top: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scrollTop();
    const r1 = requestAnimationFrame(scrollTop);
    let r2 = 0;
    const r3 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(scrollTop);
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      cancelAnimationFrame(r3);
    };
  }, [infoSubTab]);
  useEffect(() => {
    const el = descripcionUdsTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [descripcionUds, descripcionUdsCheck]);
  const [descarga, setDescarga] = useState("");
  // Modo de edición inline de datos del comparativo en borrador.
  const [inlineEditMode, setInlineEditMode] = useState<null | "ocr" | "manual">(null);
  // OCR inline: archivos y estado de subida
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [ocrFileStates, setOcrFileStates] = useState<FileUploadState[]>([]);
  const [ocrIsDragging, setOcrIsDragging] = useState(false);
  const [ocrIsProcessing, setOcrIsProcessing] = useState(false);
  const ocrFileInputRef = useRef<HTMLInputElement>(null);
  // Estado local editable para los campos del header (solo activo en modo borrador editable).
  const [localObraNumero, setLocalObraNumero] = useState("");
  const [localObraNombre, setLocalObraNombre] = useState("");
  const [localJefeObra, setLocalJefeObra] = useState("");
  const [localContractType, setLocalContractType] = useState<ContractType | undefined>(undefined);
  const [localTitulo, setLocalTitulo] = useState("");
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const footerBg = useColorModeValue("gray.50", "gray.900");
  const formaPagoMetodo = useMemo(() => {
    if (formaPagoEsOtro) return "Otro";
    if (/transferencia/i.test(formaPagoPactada)) return "Transferencia";
    if (/confirming/i.test(formaPagoPactada)) return "Confirming";
    return "";
  }, [formaPagoPactada, formaPagoEsOtro]);
  const formaPagoDias = useMemo(() => {
    if (/120/.test(formaPagoPactada)) return "120";
    if (/60/.test(formaPagoPactada)) return "60";
    return "";
  }, [formaPagoPactada]);
  const composeFormaPago = (metodo: string, dias: string, otroTexto = "") => {
    const label = metodo === "Otro" ? otroTexto.trim() : metodo;
    if (label && dias) return `${label} ${dias} días`;
    if (label) return label;
    if (dias) return `${dias} días`;
    return "";
  };


  const totalsByProvider = useMemo(() => {
    const totals = new Map<string, number>();
    if (!Array.isArray(comparativeLines)) return totals;

    comparativeLines.forEach((line: any) => {
      const prices = Array.isArray(line?.prices) ? line.prices : [];
      prices.forEach((price: any) => {
        const providerName =
          typeof price?.proveedor === "string" ? price.proveedor : "";
        const amount =
          typeof price?.importe === "number" ? price.importe : null;
        if (!providerName || amount === null) return;
        const key = normalizeComparativeLabel(providerName);
        totals.set(key, (totals.get(key) ?? 0) + amount);
      });
    });

    return totals;
  }, [comparativeLines]);

  const resolveOfferAmount = (offer: any) => {
    const supplierName =
      (typeof offer.offer_name === "string" && offer.offer_name) ||
      (typeof offer.supplier_name === "string" && offer.supplier_name) ||
      "";
    const supplierKey = normalizeComparativeLabel(supplierName);
    if (supplierKey && totalsByProvider.has(supplierKey)) {
      return totalsByProvider.get(supplierKey) ?? null;
    }

    const fileName =
      typeof offer.file === "string" ? normalizeComparativeLabel(offer.file) : "";
    if (fileName && totalsByProvider.has(fileName)) {
      return totalsByProvider.get(fileName) ?? null;
    }

    if (offer.total_amount) return offer.total_amount;

    return comparativeTotals.total_ofertado_proveedor ?? null;
  };

  const providerColorSchemes = ["blue", "brand", "purple", "orange", "teal"];

  const providers = useMemo(() => {
    const providersMap = new Map<
      string,
      {
        key: string;
        id: number | null;
        name: string;
        warning: boolean;
        totalAmount: number | null;
        plazo: string;
        garantia: string;
        pago: string;
      }
    >();

    offers.forEach((offer: any, index: number) => {
      const rawName =
        offer.offer_name ||
        offer.supplier_name ||
        offer.supplier_tax_id ||
        offer.file ||
        `Oferta ${index + 1}`;
      const key = normalizeComparativeLabel(String(rawName));
      if (!key) return;
      const resolvedAmount = resolveOfferAmount(offer);
      providersMap.set(key, {
        key,
        id: offerIdCandidates(offer)
          .map((candidate) => resolveOfferId(candidate))
          .find((id): id is number => id !== null) ?? null,
        name: cleanProviderDisplayName(String(rawName)),
        warning:
          Array.isArray(offer.pending_fields) &&
          offer.pending_fields.length > 0,
        totalAmount: typeof resolvedAmount === "number" ? resolvedAmount : null,
        plazo: offer.plazo || comparativeTotals.plazos || "Pendiente",
        garantia: offer.garantia || comparativeTotals.garantias || "Pendiente",
        pago: offer.pago || comparativeTotals.forma_pago || "Pendiente",
      });
    });

    if (Array.isArray(comparativeLines)) {
      comparativeLines.forEach((line: any) => {
        const prices = Array.isArray(line?.prices) ? line.prices : [];
        prices.forEach((price: any) => {
          const providerName =
            typeof price?.proveedor === "string" ? price.proveedor : "";
          const key = normalizeComparativeLabel(providerName);
          if (!key || providersMap.has(key)) return;
          providersMap.set(key, {
            key,
            id: null,
            name: cleanProviderDisplayName(providerName),
            warning: false,
            totalAmount: totalsByProvider.get(key) ?? null,
            plazo: comparativeTotals.plazos || "Pendiente",
            garantia: comparativeTotals.garantias || "Pendiente",
            pago: comparativeTotals.forma_pago || "Pendiente",
          });
        });
      });
    }

    return Array.from(providersMap.values()).map((provider, index) => ({
      ...provider,
      colorScheme: providerColorSchemes[index % providerColorSchemes.length],
      importe:
        provider.totalAmount !== null
          ? formatCurrency(provider.totalAmount)
          : "Pendiente",
    }));
  }, [offers, comparativeLines, comparativeTotals, totalsByProvider]);

  const lineRows = useMemo(() => {
    if (!Array.isArray(comparativeLines)) return [];

    return comparativeLines.map((line: any, lineIndex: number) => {
      const prices = Array.isArray(line?.prices) ? line.prices : [];
      const pricesByProvider = new Map<
        string,
        {
          precio: number | null;
          importe: number | null;
        }
      >();

      prices.forEach((price: any) => {
        const providerName =
          typeof price?.proveedor === "string" ? price.proveedor : "";
        const key = normalizeComparativeLabel(providerName);
        if (!key) return;
        pricesByProvider.set(key, {
          precio:
            typeof price?.precio_unitario === "number"
              ? price.precio_unitario
              : null,
          importe: typeof price?.importe === "number" ? price.importe : null,
        });
      });

      const bestByImporte = providers
        .map((provider) => ({
          providerKey: provider.key,
          providerName: provider.name,
          importe:
            resolvePriceCell(pricesByProvider, provider.key)
              ?.importe ?? null,
        }))
        .filter(
          (item) => typeof item.importe === "number" && (item.importe ?? 0) > 0,
        )
        .sort(
          (a, b) =>
            (a.importe ?? Number.MAX_SAFE_INTEGER) -
            (b.importe ?? Number.MAX_SAFE_INTEGER),
        )[0];

      return {
        key: `${line?.cod_capitulo ?? "line"}-${lineIndex}`,
        medicion:
          typeof line?.cantidad === "number"
            ? formatNumber(line.cantidad)
            : "—",
        unidad: line?.unidad || "Ud.",
        descripcion: line?.descripcion || "Sin descripción",
        pricesByProvider,
        precioMinimo:
          typeof line?.precio_minimo === "number" ? line.precio_minimo : null,
        proveedorMinimo:
          typeof line?.proveedor_minimo === "string"
            ? line.proveedor_minimo
            : null,
        costeUnitario:
          typeof line?.coste_unitario === "number" ? line.coste_unitario : null,
        costeImporte:
          typeof line?.coste_importe === "number" ? line.coste_importe : null,
        precioNetoUnitario:
          typeof line?.precio_neto_unitario === "number"
            ? line.precio_neto_unitario
            : null,
        precioNetoImporte:
          typeof line?.precio_neto_importe === "number"
            ? line.precio_neto_importe
            : null,
        bestByImporte,
      };
    });
  }, [comparativeLines, providers]);

  const fallbackRows = useMemo(() => {
    if (lineRows.length > 0 || providers.length === 0) return [];

    const pricesByProvider = new Map<
      string,
      {
        precio: number | null;
        importe: number | null;
      }
    >();

    providers.forEach((provider) => {
      pricesByProvider.set(provider.key, {
        // Si no hay desglose por lineas, mostramos el total tambien en precio
        // para evitar celda vacía y facilitar comparación básica.
        precio: provider.totalAmount ?? null,
        importe: provider.totalAmount ?? null,
      });
    });

    const bestByImporte = providers
      .filter(
        (provider) =>
          provider.totalAmount !== null && (provider.totalAmount ?? 0) > 0,
      )
      .sort(
        (a, b) =>
          (a.totalAmount ?? Number.MAX_SAFE_INTEGER) -
          (b.totalAmount ?? Number.MAX_SAFE_INTEGER),
      )[0];

    return [
      {
        key: "fallback-total-row",
        medicion: "—",
        unidad: "—",
        descripcion: "Total ofertado (sin desglose de líneas)",
        pricesByProvider,
        precioMinimo: null,
        proveedorMinimo: null,
        costeUnitario: null,
        costeImporte: null,
        precioNetoUnitario: null,
        precioNetoImporte: null,
        bestByImporte: bestByImporte
          ? {
              providerKey: bestByImporte.key,
              providerName: bestByImporte.name,
              importe: bestByImporte.totalAmount,
            }
          : undefined,
      },
    ];
  }, [lineRows, providers]);

  const rowsToRender = lineRows.length > 0 ? lineRows : fallbackRows;

  const pendingFieldsCount = offers.reduce((acc: number, offer: any) => {
    if (!Array.isArray(offer?.pending_fields)) return acc;
    return acc + offer.pending_fields.length;
  }, 0);

  const bestPriceProvider = providers
    .filter((provider) => provider.totalAmount !== null)
    .sort(
      (a, b) =>
        (a.totalAmount ?? Number.MAX_SAFE_INTEGER) -
        (b.totalAmount ?? Number.MAX_SAFE_INTEGER),
    )[0];
  const rebuildComparativeMutation = useMutation({
    mutationFn: (contractId: number) =>
      rebuildComparative(
        contractId,
        currentContract?.tenant_id ?? contract?.tenant_id ?? tenantId,
      ),
    onError: () => {
      toast({
        status: "warning",
        title: "No se pudo reconstruir el comparativo",
      });
    },
  });
  const syncComparativeOfferIdsMutation = useMutation({
    mutationFn: async () => {
      if (!currentContract?.id) return [];
      return syncComparativeOffers(
        currentContract.id,
        currentContract.tenant_id ?? contract?.tenant_id ?? tenantId,
      );
    },
    onError: () => {
      toast({
        status: "warning",
        title: "No se pudieron sincronizar las ofertas",
        description:
          "Recarga el comparativo o vuelve a subir ofertas si el problema persiste.",
      });
    },
  });

  useEffect(() => {
    if (selectedOfferId) {
      setSelectedProvider(String(selectedOfferId));
    }
  }, [selectedOfferId]);

  useEffect(() => {
    if (pendingOfferSelection === null) return;
    const value = pendingOfferSelection;
    setPendingOfferSelection(null);
    const numeric = resolveOfferId(value);
    if (numeric !== null) {
      onSelectOffer(numeric);
      return;
    }
    const providerKey = value.startsWith("invalid-") ? value.slice(8) : value;
    syncComparativeOfferIdsMutation.mutateAsync().then(() =>
      liveOffersQuery.refetch()
    ).then((freshOffers) => {
      const refreshedList = (freshOffers.data as any[]) ?? [];
      const matched = refreshedList.find((offer: any, index: number) => {
        const key = resolveOfferIdentityKey(offer, index);
        return key === providerKey;
      });
      const resolvedId =
        offerIdCandidates(matched)
          .map((candidate) => resolveOfferId(candidate))
          .find((id): id is number => id !== null) ?? null;
      if (resolvedId !== null) {
        onSelectOffer(resolvedId);
        setSelectedProvider(String(resolvedId));
        liveContractQuery.refetch();
        return;
      }
      toast({
        status: "warning",
        title: "No se pudo seleccionar la oferta",
        description: "No se encontró un identificador válido para esta oferta. Recarga el comparativo.",
      });
      setSelectedProvider("");
    }).catch(() => {
      setSelectedProvider("");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOfferSelection]);

  useEffect(() => {
    if (hydratedContractId !== currentContract?.id) return;
    const resolvedId = resolveOfferId(selectedProvider) ?? selectedOfferId;
    const selectedFromProviders = providers.find(
      (p) => p.id !== null && p.id === resolvedId,
    );
    const candidate =
      selectedFromProviders?.totalAmount ??
      (comparativeTotals?.total_ofertado_proveedor as number | null | undefined) ??
      (currentContract?.total_amount as number | null | undefined) ??
      null;
    if (candidate === null || candidate === undefined) return;
    setPrecioTotalEjecucion(formatExecutionPriceInput(candidate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydratedContractId,
    currentContract?.id,
    selectedProvider,
    providers,
    selectedOfferId,
    comparativeTotals?.total_ofertado_proveedor,
  ]);

  const formatExecutionPriceInput = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "";
    const raw = String(value).trim();
    if (!raw) return "";
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed)) return raw;
    return parsed.toFixed(2);
  };

  const formatExecutionDuration = (start: string, end: string): string => {
    if (!start || !end) return "";
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return "";
    if (endDate < startDate) return "";
    let years = endDate.getFullYear() - startDate.getFullYear();
    let months = endDate.getMonth() - startDate.getMonth();
    let days = endDate.getDate() - startDate.getDate();
    if (days < 0) {
      months -= 1;
      const prevMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    const parts: string[] = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
    if (days >= 7) {
      const weeks = Math.floor(days / 7);
      const restDays = days % 7;
      parts.push(`${weeks} ${weeks === 1 ? "semana" : "semanas"}`);
      if (restDays > 0) parts.push(`${restDays} ${restDays === 1 ? "día" : "días"}`);
    } else if (days > 0) {
      parts.push(`${days} ${days === 1 ? "día" : "días"}`);
    }
    if (parts.length === 0) return "0 días";
    if (parts.length === 1) return parts[0];
    return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
  };

  useEffect(() => {
    const computed = formatExecutionDuration(fechaInicio, fechaFin);
    if (computed && computed !== duracionEjecucion) setDuracionEjecucion(computed);
    if (!computed && duracionEjecucion && (!fechaInicio || !fechaFin)) {
      setDuracionEjecucion("");
    }
  }, [fechaInicio, fechaFin]);

  const filterNonEmptyMilestones = (items: MilestoneItem[]): MilestoneItem[] =>
    items.filter((item) => {
      const trimmedName = item.name.trim();
      const isDefaultName = /^Hito \d+$/.test(trimmedName);
      const hasCustomName = trimmedName.length > 0 && !isDefaultName;
      return Boolean(
        hasCustomName ||
          item.start ||
          item.end ||
          item.description.trim(),
      );
    });

  const serializeMilestones = (items: MilestoneItem[]): string =>
    filterNonEmptyMilestones(items)
      .map((item, idx) => {
        const name = item.name.trim() || `Hito ${idx + 1}`;
        const range = [item.start, item.end].filter(Boolean).join(" – ");
        const desc = item.description.trim();
        return [name, range, desc].filter(Boolean).join(": ").replace(/^([^:]+): ([^:]+): /, "$1: $2 — ");
      })
      .join("; ");

  const updateMilestone = (index: number, patch: Partial<MilestoneItem>) => {
    setMilestoneItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };
  const renumberMilestones = (items: MilestoneItem[]): MilestoneItem[] =>
    items.map((item, i) => {
      const isDefault = /^Hito \d+$/.test(item.name.trim());
      return isDefault ? { ...item, name: `Hito ${i + 1}` } : item;
    });
  const addMilestone = () =>
    setMilestoneItems((prev) =>
      renumberMilestones([
        ...prev,
        { name: `Hito ${prev.length + 1}`, start: "", end: "", description: "" },
      ]),
    );
  const removeMilestone = (index: number) =>
    setMilestoneItems((prev) =>
      prev.length <= 1 ? prev : renumberMilestones(prev.filter((_, i) => i !== index)),
    );

  useEffect(() => {
    if (!currentContract?.id) return;
    if (hasAttemptedOfferSyncRef.current) return;
    const hasOffersWithoutId =
      providers.length > 0 && providers.some((provider) => provider.id === null);
    if (!hasOffersWithoutId) return;
    hasAttemptedOfferSyncRef.current = true;
    syncComparativeOfferIdsMutation
      .mutateAsync()
      .then(async () => {
        await liveOffersQuery.refetch();
        await liveContractQuery.refetch();
      })
      .catch(() => {
        // Error already handled in mutation onError
      });
  }, [
    currentContract?.id,
    providers,
    liveOffersQuery,
    liveContractQuery,
    syncComparativeOfferIdsMutation,
  ]);

  useEffect(() => {
    if (!currentContract?.id) return;
    if (hydratedContractId === currentContract.id) return;
    const contractData =
      (currentContract?.contract_data as Record<string, any> | null) ?? {};
    const comparativeData =
      (currentContract?.comparative_data as Record<string, any> | null) ?? {};
    const header =
      (comparativeData.header as Record<string, any> | undefined) ?? {};
    const schedule =
      (contractData.schedule as Record<string, any> | undefined) ?? {};
    const resources =
      (contractData.resources as Record<string, any> | undefined) ?? {};
    const additional =
      (contractData.additional as Record<string, any> | undefined) ?? {};
    const economic =
      (contractData.economic as Record<string, any> | undefined) ?? {};
    const project =
      (contractData.project as Record<string, any> | undefined) ?? {};
    const selectedOffer = providers.find(
      (provider) => provider.id !== null && String(provider.id) === selectedProvider,
    );

    setSupplierTaxId(currentContract?.supplier_tax_id ?? "");
    setEmpresaContratada(
      currentContract?.supplier_name ?? "",
    );
    setSupplierAddress(currentContract?.supplier_address ?? "");
    setSupplierLookupFound(Boolean(currentContract?.supplier_tax_id && currentContract?.supplier_name));
    setContactoNombre(currentContract?.supplier_contact_name ?? "");
    setContactoTelefono(
      currentContract?.supplier_phone ??
        additional.telefono_contacto ??
        additional.phone ??
        "",
    );
    setContactoEmail(currentContract?.supplier_email ?? "");
    setDuracionEjecucion(String(schedule.duration ?? additional.execution_duration ?? ""));
    setFechaInicio(String(schedule.start_date ?? project.fecha_inicio ?? ""));
    setFechaFin(String(schedule.end_date ?? project.fecha_fin ?? ""));
    setHitosClave(String(additional.milestones ?? ""));
    const rawItems = Array.isArray(additional.milestones_items) ? additional.milestones_items : [];
    const normalizedItems: MilestoneItem[] = rawItems
      .map((raw: any, i: number) => ({
        name: String(raw?.name ?? "") || `Hito ${i + 1}`,
        start: String(raw?.start ?? ""),
        end: String(raw?.end ?? ""),
        description: String(raw?.description ?? ""),
      }));
    setMilestoneItems(
      normalizedItems.length > 0
        ? normalizedItems
        : [{ name: "Hito 1", start: "", end: "", description: "" }],
    );
    setMilestonesEnabled(normalizedItems.length > 0);
    const savedUnitsDesc = String(additional.units_description ?? "");
    setDescripcionUds(savedUnitsDesc);
    setDescripcionUdsCheck(savedUnitsDesc.trim().length > 0);
    setModoPrecio(economic.price_type === "REAL" ? "REAL" : "CERRADO");
    setPrecioTotalEjecucion(
      formatExecutionPriceInput(
        economic.total_execution_price ??
          currentContract?.total_amount ??
          selectedOffer?.totalAmount ??
          "",
      ),
    );
    setFormaPago(String(economic.payment_method ?? ""));
    const pactadaHidratada = String(economic.payment_method_agreed ?? "");
    setFormaPagoPactada(pactadaHidratada);
    const esOtroHidratado =
      pactadaHidratada.trim().length > 0 &&
      !/transferencia/i.test(pactadaHidratada) &&
      !/confirming/i.test(pactadaHidratada);
    setFormaPagoEsOtro(esOtroHidratado);
    setFormaPagoOtroTexto(
      esOtroHidratado
        ? pactadaHidratada.replace(/\s*(60|120)\s*d[ií]as\s*$/i, "").trim()
        : "",
    );
    setRetencion(economic.retention === "NO" ? "NO" : "SI");
    setRetencionDescripcion(String(economic.retention_description ?? ""));
    setObservacionesAdicionales(
      String(
        comparativeData.observations ??
          additional.observations ??
          "",
      ),
    );
    setTrabajadoresObra(
      String(resources.workers_on_site ?? resources.workers_count ?? ""),
    );
    setPortes(String(additional.freight_party ?? ""));
    setDescarga(String(additional.unloading_party ?? ""));
    setHydratedContractId(currentContract?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentContract?.id, hydratedContractId]);

  useEffect(() => {
    const clearAutofilledEmpresa = () => {
      if (supplierAutofilledRef.current) {
        setEmpresaContratada("");
        supplierAutofilledRef.current = false;
      }
    };
    const normalized = supplierTaxId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (normalized.length < 8) {
      setSupplierLookupFound(false);
      clearAutofilledEmpresa();
      return;
    }
    const resolvedTenantId = currentContract?.tenant_id ?? tenantId;
    if (!resolvedTenantId) return;
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      try {
        setIsSupplierLookupLoading(true);
        const supplier = await lookupSupplierByTaxId(
          normalized,
          contractTypeProp,
          resolvedTenantId,
        );
        if (cancelled) return;
        if (!supplier) {
          setSupplierLookupFound(false);
          clearAutofilledEmpresa();
          return;
        }
        setSupplierLookupFound(true);
        if (supplier.name) {
          setEmpresaContratada(supplier.name);
          supplierAutofilledRef.current = true;
        }
      } catch {
        if (!cancelled) {
          setSupplierLookupFound(false);
          clearAutofilledEmpresa();
        }
      } finally {
        if (!cancelled) setIsSupplierLookupLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [supplierTaxId, contractTypeProp, currentContract?.tenant_id, tenantId]);

  const buildIntakePayload = (): ContractUpdatePayload => {
    const totalAmount = Number(String(precioTotalEjecucion).replace(",", "."));
    const roundedTotalAmount = Number.isFinite(totalAmount)
      ? Number(totalAmount.toFixed(2))
      : null;
    const normalizedExecutionPrice =
      roundedTotalAmount !== null
        ? roundedTotalAmount.toFixed(2)
        : precioTotalEjecucion;
    const existingComparativeData =
      (currentContract?.comparative_data as Record<string, unknown> | null) ?? {};
    const existingHeader =
      ((existingComparativeData as Record<string, any>).header as Record<string, unknown> | undefined) ?? {};
    const existingProject =
      ((existingComparativeData as Record<string, any>).project as Record<string, unknown> | undefined) ?? {};
    // Usar effective values que ya reflejan edición local en modo borrador.
    const trimmedObraNumero = effectiveObraNumero.trim();
    const trimmedObraNombre = effectiveObraNombre.trim();
    const trimmedJefeObra = effectiveJefeObra.trim();
    const comparativeDataMerged: Record<string, unknown> = {
      ...existingComparativeData,
      ...(trimmedObraNumero ? { obra_numero: trimmedObraNumero } : {}),
      ...(trimmedObraNombre ? { obra_nombre: trimmedObraNombre } : {}),
      ...(trimmedJefeObra ? { jefe_obra: trimmedJefeObra } : {}),
      ...(isDraftEditable && localContractType ? { contract_type: localContractType } : {}),
      observations: observacionesAdicionales,
      header: {
        ...existingHeader,
        ...(trimmedObraNumero ? { obra_num: trimmedObraNumero } : {}),
        ...(trimmedObraNombre ? { obra_nombre: trimmedObraNombre } : {}),
      },
      project: {
        ...existingProject,
        ...(trimmedObraNombre ? { nombre_obra: trimmedObraNombre } : {}),
      },
    };
    return {
      ...(isDraftEditable && localTitulo.trim() ? { title: localTitulo.trim() } : {}),
      // Solo enviar type cuando el usuario lo haya hidratado o cambiado.
      // Nunca enviar undefined; nunca enviar un valor que coincida con el actual
      // (evita pisar Contract.type con un default cuando la hidratación aún no
      // ha corrido o el dropdown no se ha tocado).
      ...(isDraftEditable && localContractType && localContractType !== currentContract?.type
        ? { type: localContractType }
        : {}),
      supplier_tax_id: supplierTaxId,
      supplier_name: empresaContratada,
      supplier_contact_name: contactoNombre,
      supplier_phone: contactoTelefono,
      supplier_email: contactoEmail,
      supplier_address: supplierAddress,
      total_amount: roundedTotalAmount,
      comparative_data: comparativeDataMerged,
      contract_data: {
        ...((currentContract?.contract_data as Record<string, unknown>) ?? {}),
        resources: {
          ...(((currentContract?.contract_data as Record<string, any> | undefined)?.resources as Record<string, unknown> | undefined) ?? {}),
          work_number: trimmedObraNumero || "",
          workers_on_site: trabajadoresObra,
          workers_count: trabajadoresObra,
        },
        schedule: {
          ...(((currentContract?.contract_data as Record<string, any> | undefined)?.schedule as Record<string, unknown> | undefined) ?? {}),
          start_date: fechaInicio,
          end_date: fechaFin,
          duration: duracionEjecucion,
        },
        economic: {
          ...(((currentContract?.contract_data as Record<string, any> | undefined)?.economic as Record<string, unknown> | undefined) ?? {}),
          price_type: modoPrecio,
          total_execution_price: normalizedExecutionPrice,
          payment_method: formaPago,
          payment_method_agreed: formaPagoPactada,
          retention: retencion,
          retention_description: retencionDescripcion,
        },
        additional: {
          ...(((currentContract?.contract_data as Record<string, any> | undefined)?.additional as Record<string, unknown> | undefined) ?? {}),
          milestones: milestonesEnabled ? serializeMilestones(milestoneItems) : "",
          milestones_items: milestonesEnabled ? filterNonEmptyMilestones(milestoneItems) : [],
          units_description: descripcionUds,
          freight_party: portes,
          unloading_party: descarga,
          observations: observacionesAdicionales,
          price_execution_mode:
            modoPrecio === "CERRADO"
              ? "Precio cerrado"
              : "Se facturará lo realmente ejecutado",
        },
      },
    };
  };

  const handleContinueToContract = async () => {
    await (onSaveIntakeSilently ?? onSaveIntake)(buildIntakePayload());
    onNavigate("contrato-form");
  };

  const handleSaveDraftFull = async () => {
    if (!currentContract) {
      await onSaveDraft();
      return;
    }
    await (onSaveIntakeSilently ?? onSaveIntake)(buildIntakePayload());
    await onSaveDraft();
  };

  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  // Fases del modal de envío:
  //   "review"    → resumen + botón "Validar y enviar"
  //   "rea"       → spinner consulta REA + envío automático si está ALTA
  //   "no_consta" → REA no acreditado: ofrecer guardar borrador o cancelar
  const [reaStep, setReaStep] = useState<"review" | "rea" | "no_consta">("review");
  const [reaResult, setReaResult] = useState<ReaValidationResult | null>(null);

  const closeSubmitModal = () => {
    setIsSubmitConfirmOpen(false);
    setReaStep("review");
    setReaResult(null);
  };

  const validateComparativeForSubmit = (): boolean => {
    if (!currentContract) return false;
    const selectedByKey = providers.find(
      (provider) => provider.key === selectedProvider,
    );
    const selectedId =
      resolveOfferId(selectedProvider) ??
      selectedByKey?.id ??
      selectedOfferId;
    if (!selectedId) {
      toast({
        status: "warning",
        title: "Selecciona una oferta ganadora",
        description: "No puedes enviar el comparativo sin una oferta seleccionada.",
      });
      return false;
    }
    // Validar solo campos visibles segun tipo y estado del formulario.
    const missing: string[] = [];
    const pushIfEmpty = (label: string, value: string | undefined | null) => {
      if (!value || String(value).trim().length === 0) missing.push(label);
    };
    pushIfEmpty("CIF/NIF", supplierTaxId);
    pushIfEmpty("Razón social", empresaContratada);
    pushIfEmpty("Email proveedor", contactoEmail);
    if (
      contactoEmail.trim() &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactoEmail.trim())
    ) {
      missing.push("Email proveedor con formato válido");
    }
    pushIfEmpty("Fecha inicio", fechaInicio);
    pushIfEmpty("Fecha fin", fechaFin);
    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      missing.push("Fecha fin posterior a inicio");
    }
    if (descripcionUdsCheck) {
      pushIfEmpty("Descripcion UDs contratadas", descripcionUds);
    }
    if (
      effectiveContractType === "SUMINISTRO" ||
      effectiveContractType === "SERVICIO"
    ) {
      pushIfEmpty("Portes", portes);
      pushIfEmpty("Descarga", descarga);
    }
    if (effectiveContractType === "SUBCONTRATACION") {
      pushIfEmpty("Modalidad de precio", modoPrecio);
    }
    pushIfEmpty("Número de trabajadores en obra", trabajadoresObra);
    pushIfEmpty("Precio total ejecucion", precioTotalEjecucion);
    pushIfEmpty("Forma de pago", formaPagoMetodo);
    if (formaPagoEsOtro) {
      pushIfEmpty("Detalle forma de pago", formaPagoOtroTexto);
    } else {
      pushIfEmpty("Dias forma de pago", formaPagoDias);
    }
    if (missing.length > 0) {
      toast({
        status: "warning",
        title: "Faltan campos obligatorios para enviar",
        description: `Revisa: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "..." : ""}`,
      });
      return false;
    }
    return true;
  };

  const handleSubmitComparative = async () => {
    if (!currentContract) return;
    if (!validateComparativeForSubmit()) return;
    const canSubmit =
      currentContract.comparative_status === "DRAFT" ||
      currentContract.comparative_status === "REJECTED" ||
      currentContract.comparative_status === "NEEDS_CHANGES";
    if (!canSubmit) {
      toast({
        status: "info",
        title: "Comparativo ya enviado",
        description: `Estado actual: ${formatComparativeStatus(
          currentContract.comparative_status,
        )}.`,
      });
      onNavigate("approval-panel");
      return;
    }
    await (onSaveIntakeSilently ?? onSaveIntake)(buildIntakePayload());
    const result = await onSubmitComparative();
    if (result && (result as Contract).status === "PENDING_SUPPLIER") {
      // Comparativo gateado a la espera de que el proveedor complete onboarding.
      // No navegamos a aprobaciones: el usuario debe poder editar y reenviar.
      return;
    }
    onNavigate("approval-panel");
  };

  const handleStartReaValidation = async () => {
    if (!onValidateRea) {
      // Sin validador REA, comportamiento legacy.
      await handleSubmitComparative();
      closeSubmitModal();
      return;
    }
    setReaStep("rea");
    try {
      // Persistir el formulario (con el CIF/NIF) antes de consultar REA.
      await (onSaveIntakeSilently ?? onSaveIntake)(buildIntakePayload());
      const res = await onValidateRea();
      if (!res) {
        setReaStep("review");
        return;
      }
      setReaResult(res);
      if (res.rea.estado === "ALTA") {
        // REA OK → enviamos directamente a aprobación (con o sin proveedor en BD).
        await handleSubmitComparative();
        closeSubmitModal();
      } else {
        // No acreditado en REA → ofrecer guardar borrador.
        setReaStep("no_consta");
      }
    } catch (err: any) {
      const httpStatus = err?.response?.status;
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Reintenta en unos segundos.";
      toast({
        status: "warning",
        title: "No se pudo validar en REA",
        description: httpStatus ? `[${httpStatus}] ${detail}` : detail,
        duration: 9000,
        isClosable: true,
      });
      setReaStep("review");
    }
  };

  const handleSaveDraftFromNoConsta = async () => {
    try {
      await (onSaveIntakeSilently ?? onSaveIntake)(buildIntakePayload());
      await onSaveDraft();
      toast({
        status: "info",
        title: "Comparativo guardado en borrador",
        description: "El proveedor no figura como acreditado en REA. Revisa los datos antes de reintentar.",
      });
    } finally {
      closeSubmitModal();
    }
  };

  const lockedDataFromContract = (currentContract?.comparative_data as any) ?? {};
  const contractDataAny = (currentContract?.contract_data as any) ?? {};
  const contractResources = (contractDataAny.resources as any) ?? {};
  const contractProject = (contractDataAny.project as any) ?? {};
  const contractObraNumeroFallback =
    (typeof lockedDataFromContract.obra_numero === "string" && lockedDataFromContract.obra_numero.trim()) ||
    (typeof contractResources.work_number === "string" && contractResources.work_number.trim()) ||
    "";
  const contractObraNombreFallback =
    (typeof lockedDataFromContract.obra_nombre === "string" && lockedDataFromContract.obra_nombre.trim()) ||
    (typeof contractProject.nombre_obra === "string" && contractProject.nombre_obra.trim()) ||
    "";
  const fallbackProjectId = currentContract?.project_id ?? null;
  const fallbackProjectQuery = useQuery({
    queryKey: ["erp-project-fallback", fallbackProjectId, currentContract?.tenant_id ?? tenantId ?? null],
    queryFn: () =>
      fetchErpProject(fallbackProjectId as number, currentContract?.tenant_id ?? tenantId),
    enabled: Boolean(
      fallbackProjectId && !contractObraNumeroFallback && !contractObraNombreFallback,
    ),
    staleTime: 60_000,
  });

  // Decidir si el header es editable (borrador o tras rechazo/devolución).
  const isDraftEditable =
    viewMode === "editar" &&
    (currentContract?.comparative_status === "DRAFT" ||
      currentContract?.comparative_status === "REJECTED" ||
      currentContract?.comparative_status === "NEEDS_CHANGES");

  // Hidratar estados locales del header cuando carga/cambia el contrato.
  useEffect(() => {
    if (!currentContract) return;
    const data = (currentContract.comparative_data as any) ?? {};
    const resources = ((currentContract.contract_data as any)?.resources as any) ?? {};
    const num =
      (typeof data.obra_numero === "string" && data.obra_numero.trim()) ||
      (typeof resources.work_number === "string" && resources.work_number.trim()) ||
      obraNumeroProp?.trim() || "";
    const nom =
      (typeof data.obra_nombre === "string" && data.obra_nombre.trim()) ||
      obraNombreProp?.trim() || "";
    const jefe =
      (typeof data.jefe_obra === "string" && data.jefe_obra.trim()) ||
      jefeObraProp?.trim() || "";
    // Prioriza SIEMPRE el type real del contrato (columna Contract.type) sobre
    // contract_type del JSON o el prop, porque el JSON puede no estar sincronizado
    // y antes había un fallback "SUBCONTRATACION" que pisaba el dato real.
    const tipo: ContractType | undefined =
      (currentContract.type === "SUBCONTRATACION" ||
       currentContract.type === "SUMINISTRO" ||
       currentContract.type === "SERVICIO"
        ? currentContract.type
        : undefined) ??
      (data.contract_type === "SUBCONTRATACION" ||
       data.contract_type === "SUMINISTRO" ||
       data.contract_type === "SERVICIO"
        ? data.contract_type
        : undefined) ??
      contractTypeProp;
    const titulo =
      (typeof currentContract.title === "string" && currentContract.title.trim()) ||
      tituloComparativoProp?.trim() || "";
    setLocalObraNumero(num);
    setLocalObraNombre(nom);
    setLocalJefeObra(jefe);
    setLocalContractType(tipo);
    setLocalTitulo(titulo);
  }, [currentContract?.id]);
  // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentContract) {
    return (
      <Stack spacing={6}>
        <TabVisualBanner
          icon={<Eye size={18} />}
          title="Revisión del comparativo"
          description="Analiza resultados, valida importes y selecciona la oferta ganadora antes de pasar a contrato."
          eyebrow="Comparativos"
        />
        {tabsNavigation}
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          rounded="xl"
          overflow="hidden"
        >
          <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
            <Heading size="md">Selecciona un comparativo para revisar</Heading>
            <Text fontSize="sm" color="gray.500" mt={1}>
              Puedes abrir cualquier comparativo directamente desde aquí.
            </Text>
          </Box>
          <Stack spacing={4} p={6}>
            {contracts.length === 0 ? (
              <Alert status="info" borderRadius="md">
                <AlertIcon />
                No hay comparativos disponibles en el tenant activo.
              </Alert>
            ) : (
              <>
                <Box maxW="420px">
                  <FormLabel fontSize="sm" mb={2}>
                    Comparativo
                  </FormLabel>
                  <Select
                    placeholder="Selecciona comparativo"
                    onChange={(event) => {
                      const nextId = Number(event.target.value);
                      if (Number.isFinite(nextId) && nextId > 0) {
                        onChangeContract(nextId);
                      }
                    }}
                  >
                    {contracts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {`CT-${item.id} · ${item.title || item.supplier_name || "Sin título"}`}
                      </option>
                    ))}
                  </Select>
                </Box>
                <Box border="1px solid" borderColor={borderColor} rounded="lg" overflow="hidden">
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th>ID</Th>
                        <Th>Título</Th>
                        <Th>Estado</Th>
                        <Th textAlign="right">Acción</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {contracts.map((item) => (
                        <Tr key={item.id}>
                          <Td>{`CT-${item.id}`}</Td>
                          <Td>{item.title || item.supplier_name || "Sin título"}</Td>
                          <Td>
                            <ComparativeStatusChip status={item.comparative_status} />
                          </Td>
                          <Td textAlign="right">
                            <Button
                              size="xs"
                              colorScheme="brand"
                              variant="outline"
                              onClick={() => onChangeContract(item.id)}
                            >
                              Abrir
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              </>
            )}
          </Stack>
        </Box>
      </Stack>
    );
  }

  const fallbackProject = fallbackProjectQuery.data;
  const fallbackObraNumero =
    obraNumeroProp?.trim() ||
    contractObraNumeroFallback ||
    (fallbackProject ? String(fallbackProject.id) : "");
  const fallbackObraNombre =
    obraNombreProp?.trim() ||
    contractObraNombreFallback ||
    (fallbackProject?.name?.trim() ?? "");
  const persistedJefeObra =
    typeof lockedDataFromContract.jefe_obra === "string"
      ? lockedDataFromContract.jefe_obra.trim()
      : "";
  const fallbackJefeObra = persistedJefeObra || jefeObraProp?.trim() || "";
  // Prioriza SIEMPRE el dato persistido en BD (currentContract.type) sobre el
  // prop heredado del wizard padre (sharedContractType, que por defecto vale
  // "SUBCONTRATACION") y sobre el JSON del comparativo. Esto evita que la
  // vista en modo no editable muestre "SUBCONTRATACIÓN" cuando en BD el tipo
  // real es SUMINISTRO/SERVICIO.
  const fallbackContractType =
    currentContract?.type ??
    (lockedDataFromContract.contract_type as ContractType | undefined) ??
    contractTypeProp;
  // En modo borrador editable se usan los local states (editables por el usuario).
  const effectiveObraNumero = isDraftEditable ? localObraNumero : fallbackObraNumero;
  const effectiveObraNombre = isDraftEditable ? localObraNombre : fallbackObraNombre;
  const effectiveJefeObra = isDraftEditable ? localJefeObra : fallbackJefeObra;
  const effectiveContractType = isDraftEditable ? localContractType : fallbackContractType;

  const lockedHeaderFields = (
    <Stack spacing={4}>
      {isDraftEditable && (
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>Título del comparativo</Text>
          <Input
            value={localTitulo}
            onChange={(e) => setLocalTitulo(e.target.value)}
            placeholder="Título del comparativo"
          />
        </Box>
      )}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>Nº de obra</Text>
          {isDraftEditable ? (
            <Input
              value={localObraNumero}
              onChange={(e) => setLocalObraNumero(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Nº de obra"
            />
          ) : (
            <Input
              value={effectiveObraNumero || "—"}
              isReadOnly
              bg="gray.100"
              color="gray.600"
              borderColor="gray.200"
              cursor="not-allowed"
              _hover={{ borderColor: "gray.200" }}
              _focus={{ borderColor: "gray.200", boxShadow: "none" }}
            />
          )}
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>Nombre de obra</Text>
          {isDraftEditable ? (
            <Input
              value={localObraNombre}
              onChange={(e) => setLocalObraNombre(e.target.value)}
              placeholder="Nombre de obra"
            />
          ) : (
            <Input
              value={effectiveObraNombre || "—"}
              isReadOnly
              bg="gray.100"
              color="gray.600"
              borderColor="gray.200"
              cursor="not-allowed"
              _hover={{ borderColor: "gray.200" }}
              _focus={{ borderColor: "gray.200", boxShadow: "none" }}
            />
          )}
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>Jefe de obra</Text>
          {isDraftEditable ? (
            <Input
              value={localJefeObra}
              onChange={(e) => setLocalJefeObra(e.target.value)}
              placeholder="Jefe de obra"
            />
          ) : (
            <Input
              value={effectiveJefeObra || "—"}
              isReadOnly
              bg="gray.100"
              color="gray.600"
              borderColor="gray.200"
              cursor="not-allowed"
              _hover={{ borderColor: "gray.200" }}
              _focus={{ borderColor: "gray.200", boxShadow: "none" }}
            />
          )}
        </Box>
        <Box>
          <Text fontSize="sm" fontWeight="medium" mb={2}>Tipo de contrato</Text>
          {isDraftEditable ? (
            <Select
              value={localContractType ?? ""}
              placeholder="Selecciona el tipo"
              onChange={(e) => {
                const v = e.target.value;
                setLocalContractType(v ? (v as ContractType) : undefined);
              }}
            >
              <option value="SUBCONTRATACION">Subcontratación</option>
              <option value="SUMINISTRO">Suministro</option>
              <option value="SERVICIO">Servicio</option>
            </Select>
          ) : (
            <Input
              value={formatContractType(effectiveContractType)}
              isReadOnly
              bg="gray.100"
              color="gray.600"
              borderColor="gray.200"
              cursor="not-allowed"
              _hover={{ borderColor: "gray.200" }}
              _focus={{ borderColor: "gray.200", boxShadow: "none" }}
            />
          )}
        </Box>
      </SimpleGrid>
      {isDraftEditable && infoSubTab === "comparativo" && (
        <HStack spacing={2} pt={6}>
          <Button
            size="sm"
            px={4}
            borderRadius="10px"
            fontWeight={inlineEditMode === "ocr" ? 600 : 500}
            bg={inlineEditMode === "ocr" ? "brand.600" : "transparent"}
            color={inlineEditMode === "ocr" ? "white" : "inherit"}
            _hover={{ bg: inlineEditMode === "ocr" ? "brand.600" : "gray.50" }}
            onClick={() => setInlineEditMode(inlineEditMode === "ocr" ? null : "ocr")}
          >
            Subir comparativo
          </Button>
          <Button
            size="sm"
            px={4}
            borderRadius="10px"
            fontWeight={inlineEditMode === "manual" ? 600 : 500}
            bg={inlineEditMode === "manual" ? "brand.600" : "transparent"}
            color={inlineEditMode === "manual" ? "white" : "inherit"}
            _hover={{ bg: inlineEditMode === "manual" ? "brand.600" : "gray.50" }}
            onClick={() => setInlineEditMode(inlineEditMode === "manual" ? null : "manual")}
          >
            Editar manual
          </Button>
        </HStack>
      )}
    </Stack>
  );

  return (
    <Box mb={6}>
      <Box ref={topAnchorRef} aria-hidden="true" />
      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        overflow="hidden"
      >
      <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
        <Heading size="md" mb={currentContract.title ? 1 : 3}>
          {`CP-${currentContract.id}`}
        </Heading>
        {currentContract.title && (
          <Text
            fontSize="md"
            fontWeight="medium"
            color="gray.700"
            mb={3}
          >
            {currentContract.title}
          </Text>
        )}
        <HStack spacing={2}>
          <Button
            size="sm"
            px={4}
            borderRadius="10px"
            fontWeight={infoSubTab === "comparativo" ? 600 : 500}
            bg={infoSubTab === "comparativo" ? "brand.600" : "transparent"}
            color={infoSubTab === "comparativo" ? "white" : "inherit"}
            _hover={{ bg: infoSubTab === "comparativo" ? "brand.600" : "gray.50" }}
            onClick={() => setInfoSubTab("comparativo")}
          >
            Comparativo
          </Button>
          <Button
            size="sm"
            px={4}
            borderRadius="10px"
            fontWeight={infoSubTab === "informacion" ? 600 : 500}
            bg={infoSubTab === "informacion" ? "brand.600" : "transparent"}
            color={infoSubTab === "informacion" ? "white" : "inherit"}
            _hover={{ bg: infoSubTab === "informacion" ? "brand.600" : "gray.50" }}
            onClick={() => setInfoSubTab("informacion")}
          >
            Información
          </Button>
          {!isNewFlow && isInfoReadOnly && (
            <Button
              size="sm"
              px={4}
              borderRadius="10px"
              fontWeight={500}
              bg="transparent"
              color="inherit"
              _hover={{ bg: "gray.50" }}
              onClick={async () => {
                onNavigate("approval-panel");
              }}
            >
              Aprobaciones
            </Button>
          )}
        </HStack>
      </Box>

      {currentContract?.id && hydratedContractId !== currentContract.id ? (
        <Flex justify="center" align="center" py={16}>
          <Spinner size="md" color="brand.500" />
        </Flex>
      ) : infoSubTab === "informacion" ? (
        <>
        <Stack spacing={10} p={6}>
          {lockedHeaderFields}
              {currentContract?.status === "PENDING_SUPPLIER" && (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="semibold">
                      Esperando que el proveedor complete sus datos
                    </Text>
                    <Text fontSize="sm">
                      Se envió un enlace email del proveedor. Cuando termine,
                      los datos quedarán capturados aquí.
                    </Text>
                  </Box>
                </Alert>
              )}
              {currentContract?.comparative_status === "APPROVED" &&
                (currentContract?.comparative_data as any)
                  ?.needs_supplier_form_after_approval === true && (
                <Alert status="info" borderRadius="md" alignItems="flex-start">
                  <AlertIcon mt={1} />
                  <Box flex={1}>
                    <Text fontWeight="semibold">
                      Comparativo aprobado
                    </Text>
                    <Text fontSize="sm" mb={3}>
                      El proveedor está acreditado en REA pero aún no tiene
                      datos completos en nuestro sistema. Envíale el formulario
                      para que complete su información antes de generar el contrato.
                    </Text>
                    <Button
                      size="sm"
                      colorScheme="brand"
                      isLoading={isSendingSupplierForm}
                      loadingText="Enviando"
                      onClick={async () => {
                        if (onSendSupplierForm) await onSendSupplierForm();
                      }}
                    >
                      Enviar formulario al proveedor
                    </Button>
                  </Box>
                </Alert>
              )}
              {(currentContract?.comparative_data as any)
                ?.pending_jefe_review_after_supplier === true && (
                <Alert status="success" borderRadius="md" alignItems="flex-start">
                  <AlertIcon mt={1} />
                  <Box flex={1}>
                    <Text fontWeight="semibold">
                      Datos del proveedor capturados
                    </Text>
                    <Text fontSize="sm" mb={3}>
                      El proveedor ha completado el formulario y sus datos se han
                      volcado en el comparativo. Revisa que todo esté correcto y
                      pulsa <strong>Enviar a aprobación</strong> para mandarlo a
                      Gerencia.
                    </Text>
                    <Button
                      size="sm"
                      colorScheme="green"
                      isLoading={isSubmittingComparative}
                      loadingText="Enviando"
                      onClick={async () => {
                        // Fast-track: el backend detecta el flag y salta REA.
                        // Validar campos obligatorios igual que el flujo normal.
                        if (!validateComparativeForSubmit()) return;
                        await onSaveIntake(buildIntakePayload());
                        await onSubmitComparative();
                      }}
                    >
                      Enviar a aprobación
                    </Button>
                  </Box>
                </Alert>
              )}
              {/* Sección 1: Datos del proveedor */}
              <Section icon={<Truck size={18} />} title="Datos del proveedor">
                {isSupplierLookupLoading && (
                  <Text fontSize="xs" color="gray.500" mb={3}>Buscando proveedor…</Text>
                )}
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <InputField
                    label="CIF/NIF"
                    value={supplierTaxId}
                    required
                    onChange={(value) => {
                      setSupplierTaxId(value);
                      if (value.trim() === "") {
                        setEmpresaContratada("");
                        setContactoNombre("");
                        setContactoTelefono("");
                        setContactoEmail("");
                        setSupplierAddress("");
                        setSupplierLookupFound(false);
                        supplierAutofilledRef.current = false;
                      }
                    }}
                    disabled={isInfoReadOnly}
                  />
                  {supplierLookupFound ? (
                    <InputField label="Razón social" value={empresaContratada} disabled />
                  ) : (
                    <InputField label="Razón social" value={empresaContratada} required onChange={setEmpresaContratada} disabled={isInfoReadOnly} />
                  )}
                  <InputField label="Nombre" value={contactoNombre} onChange={setContactoNombre} disabled={isInfoReadOnly} />
                  <InputField label="Teléfono" value={contactoTelefono} onChange={setContactoTelefono} disabled={isInfoReadOnly} />
                  <InputField label="Email" value={contactoEmail} onChange={setContactoEmail} required disabled={isInfoReadOnly} />
                </SimpleGrid>
                {!isSupplierLookupLoading &&
                  supplierTaxId.replace(/[^A-Za-z0-9]/g, "").length >= 8 &&
                  (supplierLookupFound ? (
                    <Alert status="success" mt={3} borderRadius="md">
                      <AlertIcon />
                      Proveedor encontrado en base de datos. El contrato se generará automáticamente.
                    </Alert>
                  ) : (
                    <Alert status="warning" mt={3} borderRadius="md">
                      <AlertIcon />
                      Proveedor no encontrado en base de datos. Se requerirá esta información al proveedor.
                    </Alert>
                  ))}
              </Section>

              {/* Sección 2: Plazos */}
              <Section icon={<Clock size={18} />} title="Plazos">
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <InputField
                    label="Fecha inicio"
                    value={fechaInicio}
                    type="date"
                    required
                    max={fechaFin || undefined}
                    onChange={(value) => {
                      if (value && fechaFin && value > fechaFin) {
                        toast({
                          status: "warning",
                          title: "Fecha inválida",
                          description: "La fecha de inicio no puede ser posterior a la fecha de fin.",
                        });
                        return;
                      }
                      setFechaInicio(value);
                    }}
                    disabled={isInfoReadOnly}
                  />
                  <InputField
                    label="Fecha fin"
                    value={fechaFin}
                    type="date"
                    required
                    min={fechaInicio || undefined}
                    onChange={(value) => {
                      if (value && fechaInicio && value < fechaInicio) {
                        toast({
                          status: "warning",
                          title: "Fecha inválida",
                          description: "La fecha de fin no puede ser anterior a la fecha de inicio.",
                        });
                        return;
                      }
                      setFechaFin(value);
                    }}
                    disabled={isInfoReadOnly}
                  />
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" mb={2}>
                      Duración de la ejecución de los trabajos
                    </Text>
                    <Input value={duracionEjecucion} isReadOnly />
                  </Box>
                </SimpleGrid>
                <Box mt={4}>
                  <Checkbox
                    isChecked={milestonesEnabled}
                    onChange={(e) => setMilestonesEnabled(e.target.checked)}
                    isDisabled={isInfoReadOnly}
                  >
                    Indicar fechas por hitos o aspectos clave (describir si es necesario)
                  </Checkbox>
                  {milestonesEnabled && (
                    <Stack spacing={3} mt={4}>
                      {milestoneItems.map((item, index) => (
                        <React.Fragment key={index}>
                          {index === 0 && (
                            <HStack align="center" spacing={2} mb={1}>
                              <Box w="28px" flexShrink={0} />
                              <Box flex={1} minW={0}>
                                <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">Nombre del hito</Text>
                              </Box>
                              <Box flex={1} minW={0}>
                                <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">Inicio</Text>
                              </Box>
                              <Box flex={1} minW={0}>
                                <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">Fin</Text>
                              </Box>
                              <Box flex={3} minW={0}>
                                <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide">Descripción</Text>
                              </Box>
                              <Box w="32px" flexShrink={0} />
                            </HStack>
                          )}
                        <HStack align="center" spacing={2}>
                          <Flex
                            align="center"
                            justify="center"
                            w="28px"
                            h="28px"
                            rounded="full"
                            bg="green.50"
                            color="green.600"
                            fontSize="xs"
                            fontWeight="bold"
                            flexShrink={0}
                          >
                            {index + 1}
                          </Flex>
                          <Box flex={1} minW={0}>
                            <Input
                              value={item.name}
                              onChange={(e) => updateMilestone(index, { name: e.target.value })}
                              isDisabled={isInfoReadOnly}
                              size="sm"
                            />
                          </Box>
                          <Box flex={1} minW={0}>
                            <Input
                              type="date"
                              value={item.start}
                              max={item.end || undefined}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value && item.end && value > item.end) {
                                  toast({
                                    status: "warning",
                                    title: "Fecha inválida",
                                    description: "El inicio del hito no puede ser posterior al fin.",
                                  });
                                  return;
                                }
                                updateMilestone(index, { start: value });
                              }}
                              isDisabled={isInfoReadOnly}
                              size="sm"
                            />
                          </Box>
                          <Box flex={1} minW={0}>
                            <Input
                              type="date"
                              value={item.end}
                              min={item.start || undefined}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value && item.start && value < item.start) {
                                  toast({
                                    status: "warning",
                                    title: "Fecha inválida",
                                    description: "El fin del hito no puede ser anterior al inicio.",
                                  });
                                  return;
                                }
                                updateMilestone(index, { end: value });
                              }}
                              isDisabled={isInfoReadOnly}
                              size="sm"
                            />
                          </Box>
                          <Box flex={3} minW={0}>
                            <Input
                              value={item.description}
                              onChange={(e) => updateMilestone(index, { description: e.target.value })}
                              isDisabled={isInfoReadOnly}
                              size="sm"
                            />
                          </Box>
                          <IconButton
                            aria-label="Eliminar hito"
                            icon={<Trash2 size={16} />}
                            size="sm"
                            variant="ghost"
                            onClick={() => removeMilestone(index)}
                            isDisabled={isInfoReadOnly || milestoneItems.length <= 1}
                            flexShrink={0}
                          />
                        </HStack>
                        </React.Fragment>
                      ))}
                      {!isInfoReadOnly && (
                        <Box>
                          <Button
                            size="sm"
                            leftIcon={<Plus size={14} />}
                            variant="outline"
                            onClick={addMilestone}
                          >
                            Añadir hito
                          </Button>
                        </Box>
                      )}
                    </Stack>
                  )}
                </Box>
                <Box mt={4}>
                  <Checkbox
                    isChecked={descripcionUdsCheck}
                    isDisabled={isInfoReadOnly}
                    onChange={(e) => {
                      setDescripcionUdsCheck(e.target.checked);
                      if (!e.target.checked) {
                        setDescripcionUds("");
                        setDescripcionUdsFile(null);
                      }
                    }}
                  >
                    Indicar si se debe añadir descripción a las uds. contratadas
                  </Checkbox>
                  {descripcionUdsCheck && (
                    <Stack spacing={3} mt={3}>
                      <input
                        ref={descripcionUdsFileRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setDescripcionUdsFile(file);
                          if (e.target) e.target.value = "";
                        }}
                      />
                      <Textarea
                        ref={descripcionUdsTextareaRef}
                        placeholder="Descripción de las unidades contratadas..."
                        value={descripcionUds}
                        onChange={(e) => setDescripcionUds(e.target.value)}
                        isDisabled={isInfoReadOnly}
                        rows={3}
                        resize="none"
                        overflow="hidden"
                      />
                      {!isInfoReadOnly && (
                        <HStack spacing={3}>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => descripcionUdsFileRef.current?.click()}
                          >
                            Subir archivo
                          </Button>
                          {descripcionUdsFile && (
                            <HStack spacing={2}>
                              <FileText size={14} />
                              <Text fontSize="sm">{descripcionUdsFile.name}</Text>
                              <Button
                                size="xs"
                                variant="ghost"
                                colorScheme="red"
                                onClick={() => setDescripcionUdsFile(null)}
                              >
                                ✕
                              </Button>
                            </HStack>
                          )}
                        </HStack>
                      )}
                      {isInfoReadOnly && descripcionUdsFile && (
                        <HStack spacing={2} p={3} border="1px solid" borderColor="gray.200" rounded="md">
                          <FileText size={14} />
                          <Text fontSize="sm">{descripcionUdsFile.name}</Text>
                        </HStack>
                      )}
                    </Stack>
                  )}
                </Box>
              </Section>

              {/* Sección 3: Alcance de los Trabajos */}
              {(effectiveContractType === "SUMINISTRO" ||
                effectiveContractType === "SERVICIO") && (
                <Section icon={<Wrench size={18} />} title="">
                  <Stack spacing={4}>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      <Box>
                        <Text fontSize="sm" fontWeight="medium" mb={2}>
                          Portes (a cargo de quién)
                        </Text>
                        <Select
                          value={portes}
                          onChange={(event) => setPortes(event.target.value)}
                          isDisabled={isInfoReadOnly}
                        >
                          <option value="">Selecciona una opción</option>
                          <option value="Proveedor">Proveedor</option>
                          <option value="Urdecon">Urdecon</option>
                        </Select>
                      </Box>
                      <Box>
                        <Text fontSize="sm" fontWeight="medium" mb={2}>
                          Descarga (a cargo de quién)
                        </Text>
                        <Select
                          value={descarga}
                          onChange={(event) => setDescarga(event.target.value)}
                          isDisabled={isInfoReadOnly}
                        >
                          <option value="">Selecciona una opción</option>
                          <option value="Proveedor">Proveedor</option>
                          <option value="Urdecon">Urdecon</option>
                        </Select>
                      </Box>
                    </SimpleGrid>
                  </Stack>
                </Section>
              )}

              {/* Sección 4: Condiciones */}
              <Section icon={<FileText size={18} />} title="Condiciones">
                <Stack spacing={4}>
                  {effectiveContractType === "SUBCONTRATACION" && (
                    <Box>
                      <Text fontSize="sm" fontWeight="medium" mb={2}>
                        Indicar si es precio CERRADO o si se facturará lo realmente ejecutado en obra *
                      </Text>
                      <RadioGroup value={modoPrecio} onChange={(val) => !isInfoReadOnly && setModoPrecio(val as "CERRADO" | "REAL")}>
                        <HStack spacing={6}>
                          <Radio value="CERRADO" size="sm" isDisabled={isInfoReadOnly}>Precio cerrado</Radio>
                          <Radio value="REAL" size="sm" isDisabled={isInfoReadOnly}>Se facturará lo realmente ejecutado</Radio>
                        </HStack>
                      </RadioGroup>
                    </Box>
                  )}
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                    <InputField label="Precio total ejecución obra" value={precioTotalEjecucion} required disabled />
                  </SimpleGrid>
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" mb={1}>Pagos</Text>
                    <Stack spacing={1}>
                      <Text fontSize="xs" color="gray.500">Importes inferiores a 50.000€: Pagar 60 días, será confirming cuando exista disponibilidad</Text>
                      <Text fontSize="xs" color="gray.500">Importes superiores a 50.000€: Confirming 120 días</Text>
                    </Stack>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mt={2}>
                      <FormControl isRequired>
                        <FormLabel fontSize="sm" mb={2}>
                          Forma de pago
                        </FormLabel>
                        <Select
                          value={formaPagoMetodo}
                          onChange={(event) => {
                            const next = event.target.value;
                            if (next === "Otro") {
                              setFormaPagoEsOtro(true);
                              setFormaPagoPactada(
                                composeFormaPago("Otro", formaPagoDias, formaPagoOtroTexto),
                              );
                            } else {
                              setFormaPagoEsOtro(false);
                              setFormaPagoOtroTexto("");
                              setFormaPagoPactada(composeFormaPago(next, formaPagoDias));
                            }
                          }}
                          isDisabled={isInfoReadOnly}
                        >
                          <option value="">Selecciona forma de pago</option>
                          <option value="Confirming">Confirming</option>
                          <option value="Transferencia">Transferencia</option>
                          <option value="Otro">Otro</option>
                        </Select>
                      </FormControl>
                      {formaPagoEsOtro ? (
                        <FormControl isRequired>
                          <FormLabel fontSize="sm" mb={2}>
                            Especificar cuál
                          </FormLabel>
                          <Input
                            value={formaPagoOtroTexto}
                            onChange={(event) => {
                              const nextTexto = event.target.value;
                              setFormaPagoOtroTexto(nextTexto);
                              setFormaPagoPactada(
                                composeFormaPago("Otro", formaPagoDias, nextTexto),
                              );
                            }}
                            isDisabled={isInfoReadOnly}
                            placeholder="Especifica el método de pago"
                          />
                        </FormControl>
                      ) : (
                        <FormControl isRequired>
                          <FormLabel fontSize="sm" mb={2}>
                            Términos de pago
                          </FormLabel>
                          <Select
                            value={formaPagoDias}
                            onChange={(event) =>
                              setFormaPagoPactada(
                                composeFormaPago(
                                  formaPagoMetodo,
                                  event.target.value,
                                  formaPagoOtroTexto,
                                ),
                              )
                            }
                            isDisabled={isInfoReadOnly}
                          >
                            <option value="">Selecciona días</option>
                            <option value="60">60</option>
                            <option value="120">120</option>
                          </Select>
                        </FormControl>
                      )}
                    </SimpleGrid>
                    <Text fontSize="xs" color="red.500" fontWeight="semibold" mt={2}>
                      No se admite otra forma de pago si no es aprobada por la empresa (Compras, Jurídico y/o Administración).
                    </Text>
                  </Box>
                </Stack>
              </Section>

              {/* Sección 5: Recursos y Garantías */}
              <Section icon={<Users size={18} />} title="Recursos y garantías">
                <Stack spacing={4}>
                  <InputField
                    label="Trabajadores en obra (poner un mínimo de trabajadores para la correcta ejecución)"
                    type="number"
                    value={trabajadoresObra}
                    fullWidth
                    required
                    onChange={(v) => setTrabajadoresObra(v.replace(/[^0-9]/g, ""))}
                    disabled={isInfoReadOnly}
                  />
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" mb={2}>
                      Retención por garantía (Sí/No)
                    </Text>
                    <Text fontSize="xs" color="gray.500" mb={1}>
                      Todas las obras llevan retención por garantía del 5% con posibilidad de cambiar por un aval, si se modifica o elimina, debe ser aprobado por la empresa (Compras, Jurídico y/o Administración).
                    </Text>
                    <Text fontSize="xs" color="gray.500" mb={2}>
                      Todas las obras llevan penalización en caso de incumplimiento. En caso de no aplicar retención, comunicarlo para ser aprobado por la empresa (Compras, Jurídico y/o Administración).
                    </Text>
                    <RadioGroup value={retencion} onChange={(val) => !isInfoReadOnly && setRetencion(val as "SI" | "NO")}>
                      <HStack spacing={6}>
                        <Radio value="SI" size="sm" isDisabled={isInfoReadOnly}>Sí</Radio>
                        <Radio value="NO" size="sm" isDisabled={isInfoReadOnly}>No</Radio>
                      </HStack>
                    </RadioGroup>
                    <Box mt={3}>
                      <Text fontSize="sm" fontWeight="medium" mb={2}>
                        Descripción
                      </Text>
                      <Textarea
                        rows={3}
                        value={retencionDescripcion}
                        onChange={(e) => setRetencionDescripcion(e.target.value)}
                        isDisabled={isInfoReadOnly}
                        placeholder="Detalle de la retención por garantía…"
                      />
                    </Box>
                  </Box>
                </Stack>
              </Section>

        </Stack>
        <Flex
          px={6}
          py={4}
          borderTop="1px solid"
          borderColor={borderColor}
          justify="flex-end"
          bg={footerBg}
        >
          <HStack spacing={3}>
            <Button
              colorScheme="brand"
              variant="outline"
              isLoading={isSavingDraft || isSavingIntake}
              loadingText="Guardando"
              onClick={handleSaveDraftFull}
              isDisabled={isInfoReadOnly}
            >
              Guardar borrador
            </Button>
            <Button
              colorScheme="brand"
              isLoading={isSubmittingComparative}
              loadingText="Enviando"
              onClick={() => {
                if (!validateComparativeForSubmit()) return;
                setIsSubmitConfirmOpen(true);
              }}
              isDisabled={isInfoReadOnly}
            >
              {currentContract?.status === "PENDING_SUPPLIER"
                ? "Reenviar al proveedor"
                : "Enviar"}
            </Button>
          </HStack>
        </Flex>
        <Modal
          isOpen={isSubmitConfirmOpen}
          onClose={() => {
            if (reaStep === "rea") return;
            closeSubmitModal();
          }}
          size="2xl"
          scrollBehavior="inside"
          isCentered
          closeOnOverlayClick={reaStep === "review" || reaStep === "no_consta"}
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>
              {reaStep === "review" && "Revisa los datos antes de enviar"}
              {reaStep === "rea" && "Validando y enviando comparativo"}
              {reaStep === "no_consta" && "Proveedor no acreditado en REA"}
            </ModalHeader>
            {(reaStep === "review" || reaStep === "no_consta") && <ModalCloseButton />}
            <ModalBody>
              {reaStep === "review" && (
                <Stack spacing={3} fontSize="sm">
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <Box>
                      <Text color="gray.500" fontSize="xs">CIF/NIF</Text>
                      <Text fontWeight="medium">{supplierTaxId || "—"}</Text>
                    </Box>
                    <Box>
                      <Text color="gray.500" fontSize="xs">Razón social</Text>
                      <Text fontWeight="medium">{empresaContratada || "—"}</Text>
                    </Box>
                    <Box>
                      <Text color="gray.500" fontSize="xs">Contacto</Text>
                      <Text fontWeight="medium">{contactoNombre || "—"}</Text>
                    </Box>
                    <Box>
                      <Text color="gray.500" fontSize="xs">Email</Text>
                      <Text fontWeight="medium">{contactoEmail || "—"}</Text>
                    </Box>
                    <Box>
                      <Text color="gray.500" fontSize="xs">Fecha inicio</Text>
                      <Text fontWeight="medium">{fechaInicio ? formatDate(fechaInicio) : "—"}</Text>
                    </Box>
                    <Box>
                      <Text color="gray.500" fontSize="xs">Fecha fin</Text>
                      <Text fontWeight="medium">{fechaFin ? formatDate(fechaFin) : "—"}</Text>
                    </Box>
                    {effectiveContractType === "SUBCONTRATACION" && (
                      <Box>
                        <Text color="gray.500" fontSize="xs">Tipo de precio</Text>
                        <Text fontWeight="medium">{modoPrecio === "CERRADO" ? "Precio cerrado" : "Se facturará lo realmente ejecutado"}</Text>
                      </Box>
                    )}
                    <Box>
                      <Text color="gray.500" fontSize="xs">Precio total ejecución</Text>
                      <Text fontWeight="medium">{precioTotalEjecucion ? `${precioTotalEjecucion} €` : "—"}</Text>
                    </Box>
                    <Box>
                      <Text color="gray.500" fontSize="xs">Forma de pago pactada</Text>
                      <Text fontWeight="medium">{formaPagoPactada || "—"}</Text>
                    </Box>
                    <Box>
                      <Text color="gray.500" fontSize="xs">Retención por garantía</Text>
                      <Text fontWeight="medium">{retencion === "SI" ? "Sí" : "No"}</Text>
                    </Box>
                  </SimpleGrid>
                  {retencionDescripcion && (
                    <Box>
                      <Text color="gray.500" fontSize="xs">Descripción retención</Text>
                      <Text fontWeight="medium">{retencionDescripcion}</Text>
                    </Box>
                  )}
                  {milestonesEnabled && filterNonEmptyMilestones(milestoneItems).length > 0 && (
                    <Box>
                      <Text color="gray.500" fontSize="xs" mb={1}>Hitos</Text>
                      <Stack spacing={1}>
                        {filterNonEmptyMilestones(milestoneItems).map((item, idx) => {
                          const startLabel = item.start ? formatDate(item.start) : "—";
                          const endLabel = item.end ? formatDate(item.end) : "—";
                          return (
                            <Text key={idx} fontSize="sm">
                              {item.name.trim() || `Hito ${idx + 1}`}: {startLabel} → {endLabel}
                              {item.description.trim() ? ` — ${item.description.trim()}` : ""}
                            </Text>
                          );
                        })}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              )}
              {reaStep === "rea" && (
                <Stack spacing={4} align="center" py={6}>
                  <Spinner size="xl" thickness="3px" color="brand.500" />
                  <Text fontSize="sm" color="gray.700" textAlign="center">
                    {isValidatingRea || !reaResult
                      ? "Consultando el Registro de Empresas Acreditadas…"
                      : "Enviando comparativo a aprobación…"}
                  </Text>
                  <Text fontSize="xs" color="gray.500" textAlign="center">
                    CIF/NIF: {supplierTaxId || "—"}
                  </Text>
                </Stack>
              )}
              {reaStep === "no_consta" && (
                <Stack spacing={4}>
                  <Flex
                    align="flex-start"
                    gap={3}
                    p={4}
                    bg="yellow.50"
                    border="1px solid"
                    borderColor="yellow.300"
                    rounded="md"
                  >
                    <Box color="yellow.600" mt={0.5}>
                      <AlertCircle size={22} />
                    </Box>
                    <Box>
                      <Text fontWeight="semibold" color="yellow.800">
                        Este proveedor no está en REA
                      </Text>
                      <Text fontSize="sm" color="yellow.800" mt={1}>
                        El comparativo se guardará en borrador. Revisa el CIF/NIF
                        del proveedor o sus datos antes de reintentar el envío.
                      </Text>
                    </Box>
                  </Flex>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} fontSize="sm">
                    <Box>
                      <Text color="gray.500" fontSize="xs">CIF/NIF consultado</Text>
                      <Text fontWeight="medium">{reaResult?.rea.numero || supplierTaxId || "—"}</Text>
                    </Box>
                    <Box>
                      <Text color="gray.500" fontSize="xs">Estado REA</Text>
                      <Text fontWeight="medium">{reaResult?.rea.estado || "—"}</Text>
                    </Box>
                  </SimpleGrid>
                </Stack>
              )}
            </ModalBody>
            <ModalFooter justifyContent="flex-end" gap={3}>
              {reaStep === "review" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      closeSubmitModal();
                      cancelReviewDisclosure.onOpen();
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    colorScheme="brand"
                    isLoading={isValidatingRea || isSubmittingComparative}
                    loadingText="Procesando"
                    onClick={handleStartReaValidation}
                  >
                    Validar y enviar
                  </Button>
                </>
              )}
              {reaStep === "no_consta" && (
                <>
                  <Button variant="outline" onClick={closeSubmitModal}>
                    Cancelar
                  </Button>
                  <Button
                    colorScheme="brand"
                    isLoading={isSavingDraft || isSavingIntake}
                    loadingText="Guardando"
                    onClick={handleSaveDraftFromNoConsta}
                  >
                    Guardar en borrador
                  </Button>
                </>
              )}
            </ModalFooter>
          </ModalContent>
        </Modal>
        </>
      ) : (
        <>
      <Stack spacing={6} p={6}>
        {currentContract?.comparative_status === "REJECTED" &&
          (() => {
            const reason =
              (currentContract.comparative_data as any)?.rejected_reason ||
              (currentContract as any).rejected_reason;
            if (!reason) return null;
            return (
              <Alert status="error" borderRadius="md" alignItems="flex-start">
                <AlertIcon mt={0.5} />
                <Box>
                  <Text fontWeight="semibold">Comparativo rechazado</Text>
                  <Text fontSize="sm" color="gray.500" mt={1}>Motivo de rechazo</Text>
                  <Text fontSize="sm" mt={1}>{reason}</Text>
                </Box>
              </Alert>
            );
          })()}
        {viewMode !== "editar" && pendingFieldsCount > 0 && (
          <Flex
            align="center"
            gap={3}
            p={4}
            bg="yellow.50"
            border="1px solid"
            borderColor="yellow.200"
            rounded="lg"
          >
            <AlertCircle size={18} color="#d97706" />
            <Text fontSize="sm" color="yellow.800">
              Campos pendientes de revisión: {pendingFieldsCount}
            </Text>
          </Flex>
        )}

        {lockedHeaderFields}

        {/* Widget inline para editar datos del comparativo en borrador */}
        {inlineEditMode === "manual" && (
          <ComparativoManual
            contract={currentContract}
            onNavigate={() => {}}
            onComplete={() => {}}
            obraNumero={localObraNumero}
            setObraNumero={setLocalObraNumero}
            obraNombre={localObraNombre}
            setObraNombre={setLocalObraNombre}
            jefeObra={localJefeObra}
            setJefeObra={setLocalJefeObra}
            contractType={localContractType}
            setContractType={setLocalContractType}
            tituloComparativo={localTitulo}
            setTituloComparativo={setLocalTitulo}
            tenantId={tenantId}
            inlineEditMode
            onInlineCancel={() => setInlineEditMode(null)}
            onInlineApply={async (payload) => {
              if (!currentContract || !onSaveDraftWithData) return;
              await onSaveDraftWithData({
                type: payload.type,
                title: localTitulo.trim() || undefined,
                comparative_data: payload.comparative_data,
              });
              await liveContractQuery.refetch();
              await liveOffersQuery.refetch();
              setInlineEditMode(null);
            }}
            onSaveDraft={async () => ({ id: 0 } as any)}
          />
        )}

        {inlineEditMode === "ocr" && (
          <Box
            border="1px solid"
            borderColor={borderColor}
            rounded="xl"
            overflow="hidden"
            bg={cardBg}
          >
            <Box px={6} py={4} borderBottom="1px solid" borderColor={borderColor}>
              <Text fontWeight="semibold" fontSize="sm" color="gray.600">
                Subir nuevo comparativo — sobreescribirá los datos actuales
              </Text>
            </Box>
            <Stack spacing={4} p={6}>
              <Box
                border="2px dashed"
                borderColor={ocrIsDragging ? "brand.500" : borderColor}
                bg={ocrIsDragging ? "brand.50" : "transparent"}
                rounded="lg"
                p={8}
                textAlign="center"
                cursor="pointer"
                transition="all 0.15s"
                onClick={() => ocrFileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setOcrIsDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setOcrIsDragging(true); }}
                onDragLeave={() => setOcrIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOcrIsDragging(false);
                  const dropped = Array.from(e.dataTransfer.files);
                  const valid = dropped.filter((f) => /\.(pdf|jpg|jpeg|png|xlsx|xls)$/i.test(f.name) && f.size <= 5 * 1024 * 1024);
                  if (valid.length === 0) return;
                  setOcrFiles(valid);
                  setOcrFileStates(valid.map((f, i) => ({ id: Date.now() + i, name: f.name, size: f.size, file: f, status: "pending" as const, progress: 0 })));
                }}
              >
                <Stack spacing={2} align="center" pointerEvents="none">
                  <Upload size={28} color={ocrIsDragging ? "#3b82f6" : "#94a3b8"} />
                  <Text fontWeight="semibold" fontSize="sm">Arrastra o haz clic para subir</Text>
                  <Text fontSize="xs" color="gray.500">PDF, JPG, PNG, XLSX · máx. 5 MB · máx. 10 archivos</Text>
                </Stack>
                <input
                  ref={ocrFileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const sel = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (sel.length === 0) return;
                    setOcrFiles(sel);
                    setOcrFileStates(sel.map((f, i) => ({ id: Date.now() + i, name: f.name, size: f.size, file: f, status: "pending" as const, progress: 0 })));
                  }}
                />
              </Box>
              {ocrFileStates.length > 0 && (
                <Stack spacing={2}>
                  {ocrFileStates.map((f) => (
                    <FileUploadItem
                      key={f.id}
                      file={f}
                      onRemove={() => {
                        setOcrFileStates((prev) => prev.filter((x) => x.id !== f.id));
                        setOcrFiles((prev) => prev.filter((x) => x.name !== f.name));
                      }}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
            <Flex
              px={6} py={4}
              borderTop="1px solid" borderColor={borderColor}
              justify="flex-end"
              gap={3}
              bg={useColorModeValue("gray.50", "gray.900")}
            >
              <Button
                variant="outline"
                colorScheme="brand"
                isDisabled={ocrIsProcessing}
                onClick={() => { setInlineEditMode(null); setOcrFiles([]); setOcrFileStates([]); }}
              >
                Cancelar
              </Button>
              <Button
                colorScheme="brand"
                isLoading={ocrIsProcessing}
                isDisabled={ocrFiles.length === 0 || !currentContract}
                onClick={async () => {
                  if (!currentContract || ocrFiles.length === 0 || !onAddOffer) return;
                  const isExcel = (f: File) => /\.(xlsx|xls)$/i.test(f.name);
                  const excelFiles = ocrFiles.filter(isExcel);
                  const otherFiles = ocrFiles.filter((f) => !isExcel(f));
                  if (excelFiles.length > 1) {
                    toast({
                      status: "warning",
                      title: "Solo un Excel por importación",
                      description: "Sube un único archivo Excel para reemplazar el comparativo.",
                    });
                    return;
                  }
                  if (excelFiles.length === 1 && otherFiles.length > 0) {
                    toast({
                      status: "warning",
                      title: "No mezcles archivos",
                      description: "Sube solo Excel o solo documentos OCR, no ambos a la vez.",
                    });
                    return;
                  }
                  setOcrIsProcessing(true);
                  setOcrFileStates((prev) => prev.map((f) => ({ ...f, status: "processing" as const })));
                  try {
                    if (excelFiles.length === 1) {
                      await replaceComparativeSource(
                        currentContract.id,
                        excelFiles[0],
                        currentContract.tenant_id ?? tenantId,
                      );
                      setSelectedProvider("");
                    } else {
                      for (const file of otherFiles) {
                        await onAddOffer(currentContract.id, file);
                      }
                    }
                    setOcrFileStates((prev) => prev.map((f) => ({ ...f, status: "completed" as const, progress: 100 })));
                    await liveContractQuery.refetch();
                    await liveOffersQuery.refetch();
                    setOcrFiles([]); setOcrFileStates([]);
                    setInlineEditMode(null);
                    toast({ status: "success", title: "Comparativo actualizado" });
                  } catch (err: any) {
                    setOcrFileStates((prev) => prev.map((f) => ({ ...f, status: "warning" as const })));
                    toast({ status: "error", title: "Error al procesar", description: err?.response?.data?.detail ?? err?.message ?? "Error desconocido" });
                  } finally {
                    setOcrIsProcessing(false);
                  }
                }}
              >
                Aplicar
              </Button>
            </Flex>
          </Box>
        )}

        {inlineEditMode === null && (<><Box overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th
                  bg="gray.700"
                  color="white"
                  textTransform="uppercase"
                  fontSize="xs"
                >
                  Medición
                </Th>
                <Th
                  bg="gray.700"
                  color="white"
                  textTransform="uppercase"
                  fontSize="xs"
                >
                  U.D.
                </Th>
                <Th
                  bg="gray.700"
                  color="white"
                  textTransform="uppercase"
                  fontSize="xs"
                  minW="360px"
                >
                  Descripción
                </Th>
                {providers.map((provider) => (
                  <Th
                    key={provider.key}
                    bg={`${provider.colorScheme}.600`}
                    color="white"
                    textAlign="center"
                    textTransform="uppercase"
                    fontSize="xs"
                    colSpan={2}
                  >
                    {provider.name}
                  </Th>
                ))}
                <Th
                  bg="yellow.500"
                  color="white"
                  textAlign="center"
                  textTransform="uppercase"
                  fontSize="xs"
                  rowSpan={2}
                >
                  Precio mínimo
                </Th>
                <Th
                  bg="yellow.500"
                  color="white"
                  textAlign="center"
                  textTransform="uppercase"
                  fontSize="xs"
                  rowSpan={2}
                >
                  Proveedor mín.
                </Th>
                <Th
                  bg="gray.600"
                  color="white"
                  textAlign="center"
                  textTransform="uppercase"
                  fontSize="xs"
                  rowSpan={2}
                >
                  Coste un.
                </Th>
                <Th
                  bg="gray.600"
                  color="white"
                  textAlign="center"
                  textTransform="uppercase"
                  fontSize="xs"
                  rowSpan={2}
                >
                  Coste imp.
                </Th>
                <Th
                  bg="blue.600"
                  color="white"
                  textAlign="center"
                  textTransform="uppercase"
                  fontSize="xs"
                  rowSpan={2}
                >
                  P. neto un.
                </Th>
                <Th
                  bg="blue.600"
                  color="white"
                  textAlign="center"
                  textTransform="uppercase"
                  fontSize="xs"
                  rowSpan={2}
                >
                  P. neto imp.
                </Th>
                <Th
                  bg="yellow.600"
                  color="white"
                  textAlign="center"
                  textTransform="uppercase"
                  fontSize="xs"
                  rowSpan={2}
                  minW="180px"
                >
                  Mejor oferta
                </Th>
              </Tr>
              <Tr>
                <Th bg="gray.600" />
                <Th bg="gray.600" />
                <Th bg="gray.600" />
                {providers.map((provider) => (
                  <React.Fragment key={`${provider.key}-subhead`}>
                    <Th
                      bg={`${provider.colorScheme}.500`}
                      color="white"
                      textAlign="center"
                      textTransform="uppercase"
                      fontSize="xs"
                    >
                      Precio
                    </Th>
                    <Th
                      bg={`${provider.colorScheme}.500`}
                      color="white"
                      textAlign="center"
                      textTransform="uppercase"
                      fontSize="xs"
                    >
                      Importe
                    </Th>
                  </React.Fragment>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rowsToRender.map((row, rowIndex) => (
                <Tr
                  key={row.key}
                  bg={rowIndex % 2 === 1 ? "gray.50" : "transparent"}
                >
                  <Td fontWeight="semibold">{row.medicion}</Td>
                  <Td>{row.unidad}</Td>
                  <Td>{row.descripcion}</Td>
                  {providers.map((provider) => {
                    const cell = resolvePriceCell(
                      row.pricesByProvider,
                      provider.key,
                    );
                    const isBest =
                      row.bestByImporte?.providerKey === provider.key;
                    const baseBg = isBest
                      ? `${provider.colorScheme}.100`
                      : `${provider.colorScheme}.50`;
                    const textColor = isBest
                      ? `${provider.colorScheme}.800`
                      : `${provider.colorScheme}.700`;

                    return (
                      <React.Fragment key={`${row.key}-${provider.key}`}>
                        <Td
                          bg={baseBg}
                          textAlign="center"
                          color={textColor}
                          fontWeight={isBest ? "bold" : "semibold"}
                        >
                          {cell?.precio !== null && cell?.precio !== undefined
                            ? formatCurrency(cell.precio)
                            : "—"}
                        </Td>
                        <Td
                          bg={baseBg}
                          textAlign="center"
                          color={textColor}
                          fontWeight={isBest ? "bold" : "semibold"}
                        >
                          {cell?.importe !== null && cell?.importe !== undefined
                            ? formatCurrency(cell.importe)
                            : "—"}
                        </Td>
                      </React.Fragment>
                    );
                  })}
                  <Td bg="yellow.50" textAlign="center" fontWeight="semibold">
                    {row.precioMinimo !== null && row.precioMinimo !== undefined
                      ? formatCurrency(row.precioMinimo)
                      : "—"}
                  </Td>
                  <Td bg="yellow.50" textAlign="center" fontWeight="semibold">
                    {row.proveedorMinimo ?? "—"}
                  </Td>
                  <Td bg="gray.50" textAlign="center" fontWeight="semibold">
                    {row.costeUnitario !== null &&
                    row.costeUnitario !== undefined
                      ? formatCurrency(row.costeUnitario)
                      : "—"}
                  </Td>
                  <Td bg="gray.50" textAlign="center" fontWeight="semibold">
                    {row.costeImporte !== null && row.costeImporte !== undefined
                      ? formatCurrency(row.costeImporte)
                      : "—"}
                  </Td>
                  <Td bg="blue.50" textAlign="center" fontWeight="semibold">
                    {row.precioNetoUnitario !== null &&
                    row.precioNetoUnitario !== undefined
                      ? formatCurrency(row.precioNetoUnitario)
                      : "—"}
                  </Td>
                  <Td bg="blue.50" textAlign="center" fontWeight="semibold">
                    {row.precioNetoImporte !== null &&
                    row.precioNetoImporte !== undefined
                      ? formatCurrency(row.precioNetoImporte)
                      : "—"}
                  </Td>
                  <Td
                    bg={row.bestByImporte ? "brand.50" : "gray.50"}
                    textAlign="center"
                  >
                    {row.bestByImporte ? (
                      <Stack spacing={0} align="center">
                        <Text fontWeight="bold" color="brand.700">
                          {row.bestByImporte.providerName}
                        </Text>
                        <Text fontSize="sm" color="brand.600">
                          {formatCurrency(row.bestByImporte.importe ?? 0)}
                        </Text>
                      </Stack>
                    ) : (
                      <Text color="gray.500" fontSize="sm">
                        Pendiente
                      </Text>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
        {providers.length === 0 && (
          <Text fontSize="sm" color="gray.500">
            No hay líneas de comparativo disponibles todavía.
          </Text>
        )}

        <Box
          p={4}
          bg="brand.50"
          border="1px solid"
          borderColor="brand.200"
          rounded="lg"
        >
          <Text fontSize="sm" fontWeight="semibold" color="brand.800">
            Recomendación del Sistema: {bestPriceProvider?.name ?? "Pendiente"}
          </Text>
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Oferta Seleccionada
          </Text>
          <RadioGroup
            value={selectedProvider}
            onChange={(value) => {
              setSelectedProvider(value);
              setPendingOfferSelection(value);
            }}
          >
            <HStack spacing={6}>
              {providers.map((provider) => {
                const hasValidOfferId = provider.id !== null;
                const radioValue = hasValidOfferId
                  ? String(provider.id)
                  : `invalid-${provider.key}`;
                return (
                  <Radio key={provider.key} value={radioValue}>
                    {provider.name}
                  </Radio>
                );
              })}
            </HStack>
          </RadioGroup>
        </Box>

        <Box>
          <Text fontSize="sm" fontWeight="semibold" mb={2}>
            Observaciones adicionales
          </Text>
          <Textarea
            placeholder="Comentarios del Jefe de Obra..."
            rows={4}
            value={observacionesAdicionales}
            onChange={(event) => setObservacionesAdicionales(event.target.value)}
            isReadOnly={isInfoReadOnly}
          />
        </Box>
        </>)}
      </Stack>

      <Flex
        px={6}
        py={4}
        borderTop="1px solid"
        borderColor={borderColor}
        justify="space-between"
        bg={footerBg}
      >
        <Button
          colorScheme="brand"
          variant="outline"
          onClick={cancelReviewDisclosure.onOpen}
        >
          Cancelar
        </Button>
        <HStack spacing={3}>
          <Button
            colorScheme="brand"
            variant="outline"
            isLoading={isSavingDraft || isSavingIntake}
            loadingText="Guardando"
            onClick={handleSaveDraftFull}
          >
            Guardar borrador
          </Button>
          <Button
            colorScheme="brand"
            onClick={async () => {
              const effectiveOfferId =
                resolveOfferId(selectedProvider) ?? selectedOfferId;
              if (!effectiveOfferId) {
                toast({
                  status: "warning",
                  title: "No se puede avanzar sin seleccionar oferta",
                  description:
                    "Debes elegir la oferta ganadora antes de continuar.",
                });
                return;
              }
              if (!isInfoReadOnly && currentContract) {
                try {
                  await (onSaveIntakeSilently ?? onSaveIntake)(
                    buildIntakePayload(),
                  );
                } catch {
                  // Si falla el guardado, igualmente avanzamos a Información.
                }
              }
              setInfoSubTab("informacion");
            }}
            opacity={
              !(resolveOfferId(selectedProvider) ?? selectedOfferId)
                ? 0.5
                : 1
            }
          >
            Siguiente
          </Button>
        </HStack>
      </Flex>
        </>
      )}

      <AlertDialog
        isOpen={cancelReviewDisclosure.isOpen}
        leastDestructiveRef={cancelReviewRef}
        onClose={() => {}}
        isCentered
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold" textAlign="center" borderBottomWidth={0}>
              ¿Estás seguro que quieres cancelar?
            </AlertDialogHeader>
            <AlertDialogBody textAlign="center">
              Se perderán los datos si no se guarda el archivo.
            </AlertDialogBody>
            <AlertDialogFooter gap={3} justifyContent="center" borderTopWidth={0}>
              <Button
                ref={cancelReviewRef}
                variant="outline"
                onClick={() => {
                  cancelReviewDisclosure.onClose();
                  onNavigate("documents");
                }}
              >
                Aceptar
              </Button>
              <Button
                colorScheme="brand"
                onClick={async () => {
                  cancelReviewDisclosure.onClose();
                  await handleSaveDraftFull();
                  onNavigate("dashboard");
                }}
                isLoading={isSavingDraft || isSavingIntake}
                isDisabled={isSavingDraft || isSavingIntake}
              >
                Guardar en borrador
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
      </Box>
    </Box>
  );
};

// ============================================================================
// FORMULARIO DE CONTRATO
// ============================================================================

interface ContratoFormProps {
  tabsNavigation?: React.ReactNode;
  comparativoData: ComparativoData | null;
  contract: Contract | null;
  tenantId?: number;
  isSuperAdmin?: boolean;
  allowAutofirma?: boolean;
  canManageWorkflow?: boolean;
  viewMode?: "ver" | "editar";
  onSwitchToEdit?: () => void;
  isSubmittingGerencia?: boolean;
  isPreparingDocs?: boolean;
  isRegeneratingContract?: boolean;
  onNavigate: (view: ViewState) => void;
  onSave: (payload: ContractUpdatePayload) => void | Promise<void>;
  onRegenerateContract: () => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
}

const ContratoForm: React.FC<ContratoFormProps> = ({
  tabsNavigation,
  contract,
  tenantId,
  isSuperAdmin = false,
  allowAutofirma = false,
  canManageWorkflow = false,
  viewMode = "ver",
  onSwitchToEdit,
  isSubmittingGerencia = false,
  isPreparingDocs = false,
  isRegeneratingContract = false,
  onNavigate,
  onSave,
  onRegenerateContract,
  onSubmit,
}) => {
  // Caps de contrato del usuario actual (OR Dept/Position). Si no las tiene,
  // el botón de regenerar no se muestra activo aunque otras condiciones lo
  // permitan.
  const { data: currentUserForCaps } = useCurrentUser();
  const userCanRegenerateContract = Boolean(
    isSuperAdmin || currentUserForCaps?.can_regenerate_contract,
  );
  const userCanEditContract = Boolean(
    isSuperAdmin || currentUserForCaps?.can_edit_contract,
  );
  const isAssignedAdminDraft =
    (contract?.status ?? "DRAFT") === "PENDING_DATA_VALIDATION" &&
    !!currentUserForCaps?.id &&
    contract?.assigned_admin_user_id === currentUserForCaps.id;
  // Ventanas editables reales:
  // - DRAFT
  // - PENDING_DATA_VALIDATION para el administrativo asignado
  const isLockedByStatus =
    !["DRAFT", "PENDING_DATA_VALIDATION"].includes(
      contract?.status ?? "DRAFT",
    ) || (
      (contract?.status ?? "DRAFT") === "PENDING_DATA_VALIDATION" &&
      !isAssignedAdminDraft &&
      !isSuperAdmin
    );
  // El formulario es read-only si:
  //  (a) el modo actual es "ver" (entró con el botón "Ver", no con "Editar"), o
  //  (b) el contrato está en un estado que bloquea ediciones, o
  //  (c) el usuario no tiene permiso de edición (JO/DT solo aprueban/rechazan).
  // El botón "Editar" sigue apareciendo cuando solo (a) es cierto, para que
  // el usuario con permiso pueda pasar a edición sin volver al listado.
  const isReadOnlyView =
    viewMode === "ver" || isLockedByStatus || !userCanEditContract;
  const toast = useToast();
  // No usar fallback duro a "SUBCONTRATACION": si el contrato aún no tiene
  // type (o llega vacío en un refresh transitorio) NO debemos persistirlo a
  // SUBCONTRATACION al primer save. La hidratación rellena este valor con
  // contract.type real.
  const [tipoContrato, setTipoContrato] = useState<ContractType | undefined>(
    contract?.type as ContractType | undefined,
  );
  const [title, setTitle] = useState(contract?.title ?? "");
  const [supplierName, setSupplierName] = useState(
    contract?.supplier_name ?? "",
  );
  const [supplierTaxId, setSupplierTaxId] = useState(
    contract?.supplier_tax_id ?? "",
  );
  const [supplierEmail, setSupplierEmail] = useState(
    contract?.supplier_email ?? "",
  );
  const [supplierPhone, setSupplierPhone] = useState(
    contract?.supplier_phone ?? "",
  );
  const [supplierAddress, setSupplierAddress] = useState(
    contract?.supplier_address ?? "",
  );
  const [supplierCity, setSupplierCity] = useState(
    contract?.supplier_city ?? "",
  );
  const [supplierPostalCode, setSupplierPostalCode] = useState(
    contract?.supplier_postal_code ?? "",
  );
  const [supplierCountry, setSupplierCountry] = useState(
    contract?.supplier_country ?? "",
  );
  const [supplierContactName, setSupplierContactName] = useState(
    contract?.supplier_contact_name ?? "",
  );
  const [supplierBankIban, setSupplierBankIban] = useState(
    contract?.supplier_bank_iban ?? "",
  );
  const [supplierBankBic, setSupplierBankBic] = useState(
    contract?.supplier_bank_bic ?? "",
  );
  const [nombreGerente, setNombreGerente] = useState("");
  const [nifGerente, setNifGerente] = useState("");
  const [terminoPago, setTerminoPago] = useState("");
  const [duracionObra, setDuracionObra] = useState("");
  const [formaPagoPactadaDisplay, setFormaPagoPactadaDisplay] = useState("");
  const [priceType, setPriceType] = useState("CERRADO");
  const [priceText, setPriceText] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CONFIRMING 60");
  const [insuranceAmount, setInsuranceAmount] = useState("");
  const [retention, setRetention] = useState("SI");
  const [requestDate, setRequestDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [workersCount, setWorkersCount] = useState("");
  const [workNumber, setWorkNumber] = useState("");
  const [shippingType, setShippingType] = useState("URDECON");
  const [unloadingType, setUnloadingType] = useState("URDECON");
  const [serviceCategory, setServiceCategory] = useState("");
  const [totalExecutionPrice, setTotalExecutionPrice] = useState("");
  const [milestones, setMilestones] = useState("");
  const [generalObservations, setGeneralObservations] = useState("");
  const [isLookupLoading, setIsLookupLoading] = useState(false);
  const [isGeneratingSupplierLink, setIsGeneratingSupplierLink] =
    useState(false);
  const [isStartingSignaturit, setIsStartingSignaturit] = useState(false);
  const [isStartingAutofirma, setIsStartingAutofirma] = useState(false);
  const [lastLookupAutofillCount, setLastLookupAutofillCount] = useState(0);
  // SUMINISTRO form fields (columnas dedicadas en `contract`)
  const [projectNumber, setProjectNumber] = useState(contract?.project_number ?? "");
  const [promoter, setPromoter] = useState(contract?.promoter ?? "");
  const [paymentDays, setPaymentDays] = useState(
    contract?.payment_days != null ? String(contract.payment_days) : "",
  );
  const [paymentMethodOtherText, setPaymentMethodOtherText] = useState(
    contract?.payment_method_other_text ?? "",
  );
  // SUBCONTRATACION deed fields (columnas dedicadas en `contract`, migración d4b8e7a2c9f1 + a2c8e4f1b6d9)
  const [deedType, setDeedType] = useState(contract?.deed_type ?? "");
  const [deedDate, setDeedDate] = useState(
    contract?.deed_date ? String(contract.deed_date).slice(0, 10) : "",
  );
  const [notaryName, setNotaryName] = useState(contract?.notary_name ?? "");
  const [notaryProtocol, setNotaryProtocol] = useState(
    contract?.notary_protocol ?? "",
  );
  const [warrantyText, setWarrantyText] = useState(contract?.warranty_text ?? "");
  const canSubmitGerencia =
    contract?.status === "PENDING_JEFE_OBRA" || contract?.status === "DRAFT";
  const supplierEmailNormalized = supplierEmail.trim().toLowerCase();
  const isSupplierEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    supplierEmailNormalized,
  );
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  const formatAmountEs = (value: number): string =>
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const numberToWordsEs = (input: number): string => {
    const units: Record<number, string> = {
      0: "CERO",
      1: "UNO",
      2: "DOS",
      3: "TRES",
      4: "CUATRO",
      5: "CINCO",
      6: "SEIS",
      7: "SIETE",
      8: "OCHO",
      9: "NUEVE",
      10: "DIEZ",
      11: "ONCE",
      12: "DOCE",
      13: "TRECE",
      14: "CATORCE",
      15: "QUINCE",
      16: "DIECISEIS",
      17: "DIECISIETE",
      18: "DIECIOCHO",
      19: "DIECINUEVE",
      20: "VEINTE",
      21: "VEINTIUNO",
      22: "VEINTIDOS",
      23: "VEINTITRES",
      24: "VEINTICUATRO",
      25: "VEINTICINCO",
      26: "VEINTISEIS",
      27: "VEINTISIETE",
      28: "VEINTIOCHO",
      29: "VEINTINUEVE",
    };
    const tens: Record<number, string> = {
      30: "TREINTA",
      40: "CUARENTA",
      50: "CINCUENTA",
      60: "SESENTA",
      70: "SETENTA",
      80: "OCHENTA",
      90: "NOVENTA",
    };
    const hundreds: Record<number, string> = {
      100: "CIEN",
      200: "DOSCIENTOS",
      300: "TRESCIENTOS",
      400: "CUATROCIENTOS",
      500: "QUINIENTOS",
      600: "SEISCIENTOS",
      700: "SETECIENTOS",
      800: "OCHOCIENTOS",
      900: "NOVECIENTOS",
    };

    const under1000 = (value: number): string => {
      if (value < 30) return units[value];
      if (value < 100) {
        const ten = Math.floor(value / 10) * 10;
        const rest = value % 10;
        if (rest === 0) return tens[ten];
        return `${tens[ten]} Y ${units[rest]}`;
      }
      if (value === 100) return "CIEN";
      const hundred = Math.floor(value / 100) * 100;
      const rest = value % 100;
      const prefix = hundred === 100 ? "CIENTO" : hundreds[hundred];
      if (rest === 0) return prefix;
      return `${prefix} ${under1000(rest)}`;
    };

    const full = (value: number): string => {
      if (value === 0) return "CERO";
      if (value < 0) return `MENOS ${full(Math.abs(value))}`;
      if (value < 1000) return under1000(value);
      if (value < 1_000_000) {
        const thousands = Math.floor(value / 1000);
        const rest = value % 1000;
        const left = thousands === 1 ? "MIL" : `${under1000(thousands)} MIL`;
        return rest ? `${left} ${under1000(rest)}` : left;
      }
      if (value < 1_000_000_000) {
        const millions = Math.floor(value / 1_000_000);
        const rest = value % 1_000_000;
        const left =
          millions === 1 ? "UN MILLON" : `${full(millions)} MILLONES`;
        if (!rest) return left;
        if (rest < 1000) return `${left} ${under1000(rest)}`;
        const thousands = Math.floor(rest / 1000);
        const tail = rest % 1000;
        const mid = thousands === 1 ? "MIL" : `${under1000(thousands)} MIL`;
        if (!tail) return `${left} ${mid}`;
        return `${left} ${mid} ${under1000(tail)}`;
      }
      return String(value);
    };

    return full(Math.trunc(input));
  };

  const numberToPriceWordsEs = (value: number): string => {
    if (!Number.isFinite(value)) return "N/A";
    const safe = Math.abs(value);
    const rounded = Math.round(safe * 100) / 100;
    const integerPart = Math.trunc(rounded);
    const centsPart = Math.round((rounded - integerPart) * 100);
    const euros = numberToWordsEs(integerPart);
    const cents = numberToWordsEs(centsPart);
    return `${euros} EUROS CON ${cents} CENTIMOS`;
  };

  const computeInsuranceByPrice = (value: number): number => {
    const safe = Math.abs(value);
    if (safe <= 100000) return 100000;
    return Math.ceil(safe / 500000) * 500000;
  };

  const parseAmount = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, "");
    let normalized = compact;
    const hasComma = compact.includes(",");
    const hasDot = compact.includes(".");
    if (hasComma && hasDot) {
      // El separador decimal es el ultimo que aparece.
      const lastComma = compact.lastIndexOf(",");
      const lastDot = compact.lastIndexOf(".");
      if (lastComma > lastDot) {
        // Formato europeo: 1.234,56
        normalized = compact.replace(/\./g, "").replace(",", ".");
      } else {
        // Formato anglosajón: 1,234.56
        normalized = compact.replace(/,/g, "");
      }
    } else if (hasComma) {
      normalized = compact.replace(/\./g, "").replace(",", ".");
    } else {
      // Solo punto o sin separador: respeta punto decimal.
      normalized = compact.replace(/,/g, "");
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getApiErrorDetail = (error: unknown, fallback: string) => {
    const axiosErr = error as AxiosError<{ detail?: string }>;
    const detail = axiosErr?.response?.data?.detail;
    return detail || fallback;
  };

  const getExecutionTotal = (): number | null => {
    const fromContract = parseAmount(contract?.total_amount ?? null);
    if (fromContract && fromContract > 0) return fromContract;

    const contractData =
      (contract?.comparative_data as Record<string, any> | null) ?? {};
    const totals =
      (contractData.totales as Record<string, any> | undefined) ?? {};
    const fromTotals = parseAmount(totals.total_ofertado_proveedor);
    if (fromTotals && fromTotals > 0) return fromTotals;

    const offers = Array.isArray(contractData.offers)
      ? contractData.offers
      : [];
    const selectedOfferId =
      contractData.selected_offer_id ?? contract?.selected_offer_id;
    if (selectedOfferId && offers.length > 0) {
      const selected = offers.find((item: any) => item?.id === selectedOfferId);
      const selectedAmount = parseAmount(selected?.total_amount);
      if (selectedAmount && selectedAmount > 0) return selectedAmount;
    }

    return null;
  };

  const formatDateYmd = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const parseYmd = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    ) {
      return null;
    }
    return date;
  };

  const computeRequestDate = (startDateValue: string) => {
    const today = new Date();
    const todayYmd = formatDateYmd(today);
    const start = parseYmd(startDateValue);
    if (!start) return todayYmd;

    const req = parseYmd(todayYmd);
    if (req && req.getTime() > start.getTime()) {
      const dayBeforeStart = new Date(start);
      dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
      return formatDateYmd(dayBeforeStart);
    }
    return todayYmd;
  };

  useEffect(() => {
    const contractData =
      (contract?.contract_data as Record<string, any> | null) ?? {};
    const comparativeData =
      (contract?.comparative_data as Record<string, any> | null) ?? {};
    const header =
      (comparativeData.header as Record<string, any> | undefined) ?? {};
    const offers = Array.isArray(comparativeData.offers)
      ? (comparativeData.offers as Array<Record<string, any>>)
      : [];
    const selectedOffer = offers.find(
      (item) =>
        item?.id != null &&
        String(item.id) === String(comparativeData.selected_offer_id ?? contract?.selected_offer_id ?? ""),
    );
    const economic =
      (contractData.economic as Record<string, any> | undefined) ?? {};
    const schedule =
      (contractData.schedule as Record<string, any> | undefined) ?? {};
    const resources =
      (contractData.resources as Record<string, any> | undefined) ?? {};
    const logistics =
      (contractData.logistics as Record<string, any> | undefined) ?? {};
    const service =
      (contractData.service as Record<string, any> | undefined) ?? {};
    const additional =
      (contractData.additional as Record<string, any> | undefined) ?? {};
    const project =
      (contractData.project as Record<string, any> | undefined) ?? {};

    // Solo hidratar si el contrato ya tiene type fijado. No fallback duro
    // (ver useState arriba): evita pisar Contract.type a SUBCONTRATACION
    // cuando un refresh transitorio trae type vacío.
    if (contract?.type) {
      setTipoContrato(contract.type as ContractType);
    }
    setTitle(contract?.title ?? "");
    setSupplierName(contract?.supplier_name ?? "");
    setSupplierTaxId(contract?.supplier_tax_id ?? "");
    setSupplierEmail(
      contract?.supplier_email ?? selectedOffer?.supplier_email ?? "",
    );
    setSupplierPhone(
      contract?.supplier_phone ??
        selectedOffer?.supplier_phone ??
        additional.telefono_contacto ??
        additional.phone ??
        "",
    );
    setSupplierAddress(contract?.supplier_address ?? "");
    setSupplierCity(contract?.supplier_city ?? "");
    setSupplierPostalCode(contract?.supplier_postal_code ?? "");
    setSupplierCountry(contract?.supplier_country ?? "");
    setSupplierContactName(contract?.supplier_contact_name ?? "");
    setSupplierBankIban(contract?.supplier_bank_iban ?? "");
    setSupplierBankBic(contract?.supplier_bank_bic ?? "");
    setPriceType(economic.price_type ?? "CERRADO");
    setPriceText(economic.price_text ?? "");
    setPaymentMethod(economic.payment_method ?? "CONFIRMING 60");
    setInsuranceAmount(economic.insurance_amount ?? "");
    setRetention(economic.retention ?? "SI");
    setRequestDate(schedule.request_date ?? "");
    setStartDate(schedule.start_date ?? project.fecha_inicio ?? "");
    setEndDate(schedule.end_date ?? project.fecha_fin ?? "");
    setWorkersCount(
      resources.workers_count ?? resources.workers_on_site ?? "",
    );
    // Nº de obra: NO precargar; debe escribirlo el usuario.
    setWorkNumber("");
    setShippingType(logistics.shipping_type ?? "URDECON");
    setUnloadingType(logistics.unloading_type ?? "URDECON");
    setServiceCategory(service.category ?? "");
    setTotalExecutionPrice(
      economic.total_execution_price ??
        (contract?.total_amount !== null && contract?.total_amount !== undefined
          ? String(contract.total_amount)
          : ""),
    );
    setMilestones(additional.milestones ?? "");
    setGeneralObservations(additional.observations ?? "");
    const manager =
      (contractData.manager as Record<string, any> | undefined) ?? {};
    const legal =
      (contractData.legal as Record<string, any> | undefined) ?? {};
    // REGLA: el firmante del proveedor proviene de la BBDD (tabla `proveedores`,
    // o columna dedicada `supplier_legal_rep_*` editada por el usuario en el
    // form). NUNCA del JSONB del comparativo (manager/legal/additional) — ahí
    // viven nombres internos de URDECON (jefe de obra, creador, aprobadores)
    // que NO son el gerente del proveedor.
    // Si la columna dedicada está vacía, el lookup CIF (efecto más abajo)
    // hidrata desde `proveedores`. Dejar "" mientras tanto es preferible a
    // mostrar un nombre incorrecto.
    setNombreGerente(contract?.supplier_legal_rep_name ?? "");
    setNifGerente(contract?.supplier_legal_rep_dni ?? "");
    // Forma de pago: para SUMINISTRO viene del comparativo (payment_method_agreed).
    // Lo descomponemos en método + días para los campos readonly del form.
    const pactadaStr = String(
      economic.payment_method_agreed ??
        additional.forma_pago_pactada ??
        economic.payment_method ??
        "",
    ).trim();
    const diasMatch =
      pactadaStr.match(/(\d{1,3})\s*d[íi]as?/i) ??
      pactadaStr.match(/\b(\d{1,3})\b/);
    const diasDelPactada = diasMatch ? diasMatch[1] : "";
    setTerminoPago(
      diasDelPactada
        ? `${diasDelPactada} días`
        : additional.termino_pago ??
          economic.payment_term ??
          economic.payment_days ??
          "",
    );
    // En el campo "Forma de pago" mostramos solo el método (Confirming /
    // Transferencia / Otros), nunca los días: estos se exhiben en "Término
    // de pago" en su propio campo.
    let metodoSolo = pactadaStr;
    if (diasMatch) {
      const before = pactadaStr.slice(0, diasMatch.index ?? 0);
      const after = pactadaStr.slice((diasMatch.index ?? 0) + diasMatch[0].length);
      metodoSolo = (before + after).trim();
    }
    metodoSolo = metodoSolo.replace(/d[íi]as?/gi, "").replace(/[\s:,;.\-]+$/g, "").trim();
    // Normalizar a MAYÚSCULAS para que coincida con las opciones del select del
    // SuministroForm (CONFIRMING, TRANSFERENCIA, PAGARÉ, OTROS). El comparativo
    // guarda "Confirming"/"Transferencia" en CamelCase y sin normalizar el
    // browser no encuentra match y muestra el primer option (CONFIRMING).
    metodoSolo = metodoSolo.toUpperCase();
    setFormaPagoPactadaDisplay(metodoSolo);
    setDuracionObra(
      contract?.duration_text ??
        project.duracion_obra ??
        schedule.duration ??
        schedule.duration_months ??
        "",
    );
    // SUMINISTRO columnas dedicadas (con fallback a comparative_data legacy)
    const compHeader =
      ((contract?.comparative_data as Record<string, any> | undefined) ?? {});
    setProjectNumber(
      contract?.project_number ??
        (project.num_obra as string | undefined) ??
        (compHeader.obra_numero as string | undefined) ??
        (compHeader.obra_num as string | undefined) ??
        (compHeader.num_obra as string | undefined) ??
        "",
    );
    setPromoter(
      contract?.promoter ??
        (project.promotora as string | undefined) ??
        (compHeader.promotora as string | undefined) ??
        "",
    );
    setPaymentDays(
      contract?.payment_days != null
        ? String(contract.payment_days)
        : diasDelPactada || "",
    );
    setPaymentMethodOtherText(
      contract?.payment_method_other_text ??
        (additional.payment_method_other_text as string | undefined) ??
        "",
    );
    // SUBCONTRATACION deed fields (columnas dedicadas en `contract`)
    setDeedType(contract?.deed_type ?? "");
    setDeedDate(
      contract?.deed_date ? String(contract.deed_date).slice(0, 10) : "",
    );
    setNotaryName(contract?.notary_name ?? "");
    setNotaryProtocol(contract?.notary_protocol ?? "");
    setWarrantyText(contract?.warranty_text ?? "");
    // Portes / descargas: el comparativo guarda en additional.freight_party /
    // additional.unloading_party. logistics.shipping_type es legacy de
    // SUBCONTRATACION. El comparativo guarda CamelCase ("Proveedor"/"Urdecon")
    // pero las opciones del SuministroForm están en MAYÚSCULAS → normalizamos
    // para evitar que el browser caiga al primer option (URDECON).
    const rawFreight =
      contract?.freight_responsible ??
        (additional.freight_party as string | undefined) ??
        (logistics.shipping_type as string | undefined) ??
        "";
    const rawUnloading =
      contract?.unloading_responsible ??
        (additional.unloading_party as string | undefined) ??
        (logistics.unloading_type as string | undefined) ??
        "";
    setShippingType(rawFreight ? String(rawFreight).toUpperCase() : "URDECON");
    setUnloadingType(rawUnloading ? String(rawUnloading).toUpperCase() : "URDECON");
    // Forma de pago (método): para SUMINISTRO el comparativo es la fuente
    // autoritativa (payment_method_agreed → metodoSolo). Solo respetamos
    // contract.payment_method si el usuario lo cambió manualmente a un valor
    // distinto y válido (uno de los PAYMENT_OPTIONS del SuministroForm).
    const SUMINISTRO_PAYMENT_OPTIONS = ["CONFIRMING", "TRANSFERENCIA", "PAGARÉ", "OTROS"];
    const stored = (contract?.payment_method ?? "").toUpperCase().trim();
    const storedMatches = SUMINISTRO_PAYMENT_OPTIONS.includes(stored);
    if (storedMatches && stored !== metodoSolo && stored) {
      // Usuario eligió otra forma de pago a mano y la guardó.
      setPaymentMethod(stored);
    } else if (metodoSolo) {
      setPaymentMethod(metodoSolo);
    } else if (storedMatches) {
      setPaymentMethod(stored);
    } else {
      setPaymentMethod("");
    }
  }, [contract?.id, contract?.updated_at]);

  useEffect(() => {
    setRequestDate(computeRequestDate(startDate));
  }, [startDate]);

  useEffect(() => {
    const executionTotal = getExecutionTotal();
    if (!executionTotal || executionTotal <= 0) return;
    if (totalExecutionPrice.trim().length === 0) {
      setTotalExecutionPrice(executionTotal.toFixed(2));
    }
  }, [contract?.id, totalExecutionPrice]);

  useEffect(() => {
    const parsed = parseAmount(totalExecutionPrice);
    if (parsed === null || parsed < 0) {
      setPriceText("");
      setInsuranceAmount("");
      return;
    }
    setPriceText(numberToPriceWordsEs(parsed));
    setInsuranceAmount(formatAmountEs(computeInsuranceByPrice(parsed)));
  }, [totalExecutionPrice]);

  useEffect(() => {
    const normalizedTaxId = supplierTaxId
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
    if (normalizedTaxId.length < 8) return;
    const resolvedTenantId = contract?.tenant_id ?? tenantId;
    if (!resolvedTenantId) {
      toast({
        status: "warning",
        title: "No se puede autocompletar el CIF",
        description: "Falta seleccionar tenant para consultar proveedores.",
      });
      return;
    }

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(async () => {
      try {
        setIsLookupLoading(true);
        const supplier = await lookupSupplierByTaxId(
          normalizedTaxId,
          tipoContrato,
          resolvedTenantId,
        );
        if (!supplier) {
          setLastLookupAutofillCount(0);
          toast({
            status: "info",
            title: "Proveedor no encontrado",
            description: `No hay datos para el CIF ${normalizedTaxId}.`,
          });
          return;
        }

        // Solo sobreescribimos con datos no vacíos para no perder edición manual.
        let autofilledCount = 0;
        if (supplier.name) {
          setSupplierName(supplier.name);
          autofilledCount += 1;
        }
        if (supplier.email) {
          setSupplierEmail(supplier.email);
          autofilledCount += 1;
        }
        if (supplier.phone) {
          setSupplierPhone(supplier.phone);
          autofilledCount += 1;
        }
        if (supplier.address) {
          setSupplierAddress(supplier.address);
          autofilledCount += 1;
        }
        if (supplier.city) {
          setSupplierCity(supplier.city);
          autofilledCount += 1;
        }
        if (supplier.postal_code) {
          setSupplierPostalCode(supplier.postal_code);
          autofilledCount += 1;
        }
        if (supplier.country) {
          setSupplierCountry(supplier.country);
          autofilledCount += 1;
        }
        if (supplier.contact_name) {
          setSupplierContactName(supplier.contact_name);
          autofilledCount += 1;
        }
        if (supplier.bank_iban) {
          setSupplierBankIban(supplier.bank_iban);
          autofilledCount += 1;
        }
        if (supplier.bank_bic) {
          setSupplierBankBic(supplier.bank_bic);
          autofilledCount += 1;
        }
        // Representante legal del proveedor: hidrata el form SUMINISTRO con
        // el nombre/NIF del gerente. Sin esto, el form cae al
        // supplier_contact_name del contrato (que muchas veces guarda el
        // nombre del usuario creador, no del firmante).
        if (supplier.legal_rep_name) {
          setNombreGerente(supplier.legal_rep_name);
          autofilledCount += 1;
        }
        if (supplier.legal_rep_dni) {
          setNifGerente(supplier.legal_rep_dni);
          autofilledCount += 1;
        }
        // Datos de escritura del proveedor (SUBCONTRATACION): cadena
        // canónica `proveedores` por CIF. Sobrescribe igual que los demás
        // campos del lookup — la edición manual del usuario se respeta en
        // `buildSavePayload` (donde el valor del state local prevalece).
        if (supplier.deed_type) {
          setDeedType(supplier.deed_type);
          autofilledCount += 1;
        }
        if (supplier.deed_date) {
          // proveedores.fecha_escritura puede venir como ISO (YYYY-MM-DD) o
          // con hora; quedarnos solo con la parte de fecha para el input date.
          const dateStr = String(supplier.deed_date).slice(0, 10);
          setDeedDate(dateStr);
          autofilledCount += 1;
        }
        if (supplier.notary_name) {
          setNotaryName(supplier.notary_name);
          autofilledCount += 1;
        }
        if (supplier.notary_protocol) {
          setNotaryProtocol(supplier.notary_protocol);
          autofilledCount += 1;
        }
        setLastLookupAutofillCount(autofilledCount);
      } catch {
        setLastLookupAutofillCount(0);
        toast({
          status: "warning",
          title: "No se pudo consultar el proveedor por CIF",
          description: `Revisa sesión/tenant. CIF: ${normalizedTaxId}`,
        });
      } finally {
        setIsLookupLoading(false);
      }
    }, 450);

    return () => clearTimeout(timeoutId);
  }, [supplierTaxId, tipoContrato, contract?.tenant_id, toast]);

  const buildSavePayload = (): ContractUpdatePayload => {
    const parsedTotalExecutionPrice = parseAmount(totalExecutionPrice);
    const executionTotal = getExecutionTotal();
    const resolvedTotal = parsedTotalExecutionPrice ?? executionTotal ?? null;
    const currentData = ((contract?.contract_data as Record<string, any>) ?? {});
    const currentEconomic = (currentData.economic as Record<string, unknown> | undefined) ?? {};
    const currentSchedule = (currentData.schedule as Record<string, unknown> | undefined) ?? {};
    const currentResources = (currentData.resources as Record<string, unknown> | undefined) ?? {};
    const currentAdditional = (currentData.additional as Record<string, unknown> | undefined) ?? {};
    const currentLogistics = (currentData.logistics as Record<string, unknown> | undefined) ?? {};
    const currentService = (currentData.service as Record<string, unknown> | undefined) ?? {};
    const isNonEmpty = (value: unknown) =>
      typeof value === "string" ? value.trim().length > 0 : value != null;
    const pickNonEmpty = (...values: unknown[]) =>
      values.find((value) => isNonEmpty(value));
    const agreedPayment =
      pickNonEmpty(
        currentEconomic.payment_method_agreed,
        currentAdditional.forma_pago_pactada,
        paymentMethod,
      ) ?? "";
    const resolvedDuration =
      (pickNonEmpty(
        duracionObra,
        currentSchedule.duration,
        currentSchedule.duration_months,
      ) as string | undefined) ??
      (startDate && endDate ? `${startDate} - ${endDate}` : "");

    const isSuministroPayload = tipoContrato === "SUMINISTRO";
    const isSubcontratacionPayload = tipoContrato === "SUBCONTRATACION";
    const isServicioPayload = tipoContrato === "SERVICIO";
    const parsedPaymentDays = paymentDays.trim()
      ? Number.parseInt(paymentDays, 10)
      : null;
    const parsedNumWorkers = workersCount.trim()
      ? Number.parseInt(workersCount, 10)
      : null;
    return {
      title,
      // Solo enviar `type` cuando el usuario haya cambiado el valor en este
      // formulario. Si tipoContrato es undefined (hidratación aún no ha
      // corrido) o coincide con el del contrato en BD, no lo enviamos para
      // evitar pisarlo con un default.
      ...(tipoContrato && tipoContrato !== contract?.type
        ? { type: tipoContrato }
        : {}),
      supplier_name: supplierName,
      supplier_tax_id: supplierTaxId,
      supplier_email: supplierEmail,
      supplier_phone: supplierPhone,
      supplier_address: supplierAddress,
      supplier_city: supplierCity,
      supplier_postal_code: supplierPostalCode,
      supplier_country: supplierCountry,
      supplier_contact_name: supplierContactName,
      supplier_bank_iban: supplierBankIban,
      supplier_bank_bic: supplierBankBic,
      total_amount: resolvedTotal,
      currency: contract?.currency ?? "EUR",
      ...(isSuministroPayload
        ? {
            supplier_legal_rep_name: nombreGerente,
            supplier_legal_rep_dni: nifGerente,
            project_number: projectNumber,
            promoter,
            work_start_date: startDate || null,
            work_end_date: endDate || null,
            duration_text: duracionObra,
            payment_method: paymentMethod,
            payment_days: Number.isFinite(parsedPaymentDays as number)
              ? (parsedPaymentDays as number)
              : null,
            payment_method_other_text: paymentMethodOtherText,
            milestones_text: milestones,
            freight_responsible: shippingType,
            unloading_responsible: unloadingType,
          }
        : {}),
      ...(isSubcontratacionPayload
        ? {
            supplier_legal_rep_name: nombreGerente,
            supplier_legal_rep_dni: nifGerente,
            project_number: projectNumber,
            promoter,
            work_start_date: startDate || null,
            work_end_date: endDate || null,
            duration_text: duracionObra,
            payment_method: paymentMethod,
            payment_days: Number.isFinite(parsedPaymentDays as number)
              ? (parsedPaymentDays as number)
              : null,
            payment_method_other_text: paymentMethodOtherText,
            milestones_text: milestones,
            deed_type: deedType,
            deed_date: deedDate || null,
            notary_name: notaryName,
            notary_protocol: notaryProtocol,
            warranty_text: warrantyText,
            min_workers: Number.isFinite(parsedNumWorkers as number)
              ? (parsedNumWorkers as number)
              : null,
          }
        : {}),
      ...(isServicioPayload
        ? {
            supplier_legal_rep_name: nombreGerente,
            supplier_legal_rep_dni: nifGerente,
            work_start_date: startDate || null,
            payment_method: paymentMethod,
            payment_days: Number.isFinite(parsedPaymentDays as number)
              ? (parsedPaymentDays as number)
              : null,
            payment_method_other_text: paymentMethodOtherText,
            service_category: serviceCategory,
          }
        : {}),
      contract_data: {
        ...currentData,
        economic: {
          ...currentEconomic,
          price_type: priceType,
          price_numeric: totalExecutionPrice,
          total_execution_price: totalExecutionPrice,
          price_text: priceText,
          // SUMINISTRO: la forma de pago la manda SIEMPRE el comparativo
          // (payment_method_agreed). Conservamos el valor previo de payment_method
          // sin pisarlo desde el form para evitar residuos tipo "CONFIRMING 60".
          payment_method:
            tipoContrato === "SUMINISTRO"
              ? (currentEconomic.payment_method as string | undefined) ?? ""
              : paymentMethod,
          // Mantener forma de pago pactada si ya viene de intake.
          payment_method_agreed: agreedPayment,
          insurance_amount: insuranceAmount,
          retention,
        },
        schedule: {
          ...currentSchedule,
          request_date: computeRequestDate(startDate),
          start_date: startDate,
          end_date: endDate,
          // Persistir siempre una duración para cumplir validación de inicio de contrato.
          duration: resolvedDuration,
        },
        resources: {
          ...currentResources,
          workers_count: workersCount,
          workers_on_site: workersCount,
          work_number: workNumber,
        },
        logistics: {
          ...currentLogistics,
          shipping_type: shippingType,
          unloading_type: unloadingType,
        },
        service: {
          ...currentService,
          category: serviceCategory,
        },
        additional: {
          ...currentAdditional,
          milestones,
          // Preservar descripción de UDs si viene de intake.
          units_description:
            currentAdditional.units_description ??
            currentAdditional.descripcion_uds ??
            currentAdditional.descripcion_unidades,
          observations: generalObservations,
          // termino_pago se mantiene como espejo informativo; la fuente real es
          // economic.payment_method_agreed (parseado por el backend).
          termino_pago:
            terminoPago || (currentAdditional.termino_pago as string | undefined) || "",
        },
        manager: {
          ...((currentData.manager as Record<string, unknown> | undefined) ?? {}),
          nombre_gerente: nombreGerente,
          nif_gerente: nifGerente,
        },
      },
    };
  };

  const requiredFieldErrors = useMemo(() => {
    const errors: string[] = [];
    const pushIfEmpty = (label: string, value: string) => {
      if (!value || value.trim().length === 0) errors.push(label);
    };

    pushIfEmpty("Título", title);
    pushIfEmpty("Razón social / Empresa", supplierName);
    pushIfEmpty("NIF/CIF", supplierTaxId);

    if (tipoContrato === "SUBCONTRATACION") {
      pushIfEmpty("Fecha inicio", startDate);
      pushIfEmpty("Fecha fin", endDate);
      pushIfEmpty("Dirección empresa", supplierAddress);
      pushIfEmpty("Nombre gerente", nombreGerente);
      pushIfEmpty("NIF gerente", nifGerente);
      pushIfEmpty("Número de obra", projectNumber);
      pushIfEmpty("Promotora", promoter);
      pushIfEmpty("Precio total de la ejecución", totalExecutionPrice);
      pushIfEmpty("Número de Trabajadores", workersCount);
    }

    if (tipoContrato === "SUMINISTRO") {
      pushIfEmpty("Fecha inicio", startDate);
      pushIfEmpty("Fecha fin", endDate);
      pushIfEmpty("Dirección empresa", supplierAddress);
      pushIfEmpty("Nombre gerente", nombreGerente);
      pushIfEmpty("NIF gerente", nifGerente);
      pushIfEmpty("Forma de pago", formaPagoPactadaDisplay);
      pushIfEmpty("Portes", shippingType);
      pushIfEmpty("Descargas", unloadingType);
    }

    if (tipoContrato === "SERVICIO") {
      pushIfEmpty("Fecha inicio", startDate);
      pushIfEmpty("Fecha fin", endDate);
      pushIfEmpty("Dirección empresa", supplierAddress);
      pushIfEmpty("Nombre gerente", nombreGerente);
      pushIfEmpty("NIF gerente", nifGerente);
      pushIfEmpty("Tipo de servicio prestado", serviceCategory);
    }

    // El form legacy de SUBCONTRATACION (fallback) sí pide email válido;
    // los forms dedicados de SUMINISTRO/SUBCONTRATACION/SERVICIO no piden
    // email (no aparece como token de la plantilla).
    const dedicatedFormTypes = new Set(["SUBCONTRATACION", "SUMINISTRO", "SERVICIO"]);
    if (!dedicatedFormTypes.has(tipoContrato ?? "") && !isSupplierEmailValid) {
      errors.push("Email con formato válido");
    }

    return errors;
  }, [
    title,
    supplierName,
    supplierTaxId,
    supplierPhone,
    supplierEmail,
    totalExecutionPrice,
    priceText,
    insuranceAmount,
    requestDate,
    startDate,
    endDate,
    milestones,
    generalObservations,
    tipoContrato,
    workNumber,
    workersCount,
    shippingType,
    unloadingType,
    serviceCategory,
    supplierAddress,
    nombreGerente,
    nifGerente,
    paymentMethod,
    terminoPago,
    formaPagoPactadaDisplay,
    isSupplierEmailValid,
    projectNumber,
    promoter,
    deedType,
    notaryName,
    notaryProtocol,
    warrantyText,
  ]);

  const isContractFormValid = requiredFieldErrors.length === 0;
  const isSuministro = tipoContrato === "SUMINISTRO";
  const isSubcontratacion = tipoContrato === "SUBCONTRATACION";
  const isServicio = tipoContrato === "SERVICIO";
  const hasDedicatedForm = isSuministro || isSubcontratacion || isServicio;
  const dedicatedContractDate = (() => {
    const raw = contract?.created_at ? new Date(contract.created_at) : new Date();
    const dd = String(raw.getDate()).padStart(2, "0");
    const mm = String(raw.getMonth() + 1).padStart(2, "0");
    const yyyy = raw.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  })();
  const dedicatedProjectName = (() => {
    const cd = (contract?.comparative_data as Record<string, any> | undefined) ?? {};
    return (
      (cd.obra_nombre as string | undefined) ??
      (cd.nombre_obra as string | undefined) ??
      ""
    );
  })();
  const shouldAutoRefreshPdf =
    Boolean(contract?.id) &&
    ["DRAFT", "PENDING_DATA_VALIDATION", "PENDING_REVIEW"].includes(
      contract?.status ?? "",
    ) &&
    userCanRegenerateContract;

  const persistContractAndRefreshPdf = async () => {
    await onSave(buildSavePayload());
    if (shouldAutoRefreshPdf) {
      await onRegenerateContract();
    }
  };

  return (
    <Stack spacing={6}>
      {tabsNavigation}
      {isReadOnlyView && (
        <HStack justify="flex-end">
          <Badge colorScheme="gray" px={2} py={1} rounded="md">
            Modo lectura
          </Badge>
          {/* "Editar" solo aparece en las fases realmente editables del flujo:
              DRAFT y el borrador administrativo asignado. */}
          {userCanEditContract && !isLockedByStatus && onSwitchToEdit && (
            <Button
              size="sm"
              colorScheme="blue"
              variant="outline"
              leftIcon={<FileText size={14} />}
              onClick={onSwitchToEdit}
            >
              Editar
            </Button>
          )}
        </HStack>
      )}
      <Grid
        templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) minmax(0, 1fr)" }}
        gap={6}
        alignItems="start"
      >
        <GridItem
          order={{ base: 1, lg: 0 }}
          alignSelf={{ base: "auto", lg: "stretch" }}
        >
          <ContractPdfViewer
            contractId={contract?.id}
            tenantId={tenantId}
            canRegenerate={!isReadOnlyView && userCanRegenerateContract}
            onRegenerate={onRegenerateContract}
            isRegenerating={isRegeneratingContract}
          />
        </GridItem>
        <GridItem minW={0}>
      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        overflow="hidden"
      >
        <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
          <Heading size="md" mb={title ? 1 : 3}>
            {contract ? `CT-${contract.id}` : "Contrato nuevo"}
          </Heading>
          {title && (
            <Text
              fontSize="md"
              fontWeight="medium"
              color="gray.700"
              mb={3}
            >
              {title}
            </Text>
          )}
          <HStack spacing={2}>
            <Badge
              colorScheme="brand"
              px={3}
              py={1}
              borderRadius="10px"
              fontWeight={600}
              textTransform="none"
            >
              {formatContractType(tipoContrato)}
            </Badge>
            {contract?.status && (
              <Badge
                colorScheme="gray"
                px={3}
                py={1}
                borderRadius="10px"
                fontWeight={500}
                textTransform="none"
              >
                {formatContractStatus(contract.status)}
              </Badge>
            )}
          </HStack>
        </Box>

      <Box as="fieldset" disabled={isReadOnlyView} border="none" m={0} p={0}>
      {isSuministro ? (
        <Box p={6}>
          <SuministroForm
            contractDate={dedicatedContractDate}
            supplierLegalRepName={nombreGerente}
            supplierLegalRepDni={nifGerente}
            supplierAddress={supplierAddress}
            supplierName={supplierName}
            supplierTaxId={supplierTaxId}
            projectName={dedicatedProjectName}
            projectNumber={projectNumber}
            promoter={promoter}
            workStartDate={startDate}
            workEndDate={endDate}
            durationText={duracionObra}
            milestonesText={milestones}
            paymentMethod={paymentMethod}
            paymentDays={paymentDays}
            paymentMethodOtherText={paymentMethodOtherText}
            freightResponsible={shippingType}
            unloadingResponsible={unloadingType}
            onSupplierLegalRepNameChange={setNombreGerente}
            onSupplierLegalRepDniChange={setNifGerente}
            onSupplierAddressChange={setSupplierAddress}
            onSupplierNameChange={setSupplierName}
            onSupplierTaxIdChange={setSupplierTaxId}
            onProjectNumberChange={setProjectNumber}
            onPromoterChange={setPromoter}
            onWorkStartDateChange={setStartDate}
            onWorkEndDateChange={setEndDate}
            onDurationTextChange={setDuracionObra}
            onMilestonesTextChange={setMilestones}
            onPaymentMethodChange={setPaymentMethod}
            onPaymentDaysChange={setPaymentDays}
            onPaymentMethodOtherTextChange={setPaymentMethodOtherText}
            onFreightResponsibleChange={setShippingType}
            onUnloadingResponsibleChange={setUnloadingType}
          />
          {!isContractFormValid && (
            <Alert status="warning" borderRadius="md" mt={6}>
              <AlertIcon />
              Faltan datos obligatorios:{" "}
              {requiredFieldErrors.slice(0, 4).join(", ")}
              {requiredFieldErrors.length > 4 ? "..." : ""}
            </Alert>
          )}
        </Box>
      ) : isSubcontratacion ? (
        <Box p={6}>
          <SubcontratacionForm
            contractDate={dedicatedContractDate}
            supplierLegalRepName={nombreGerente}
            supplierLegalRepDni={nifGerente}
            supplierAddress={supplierAddress}
            supplierName={supplierName}
            supplierTaxId={supplierTaxId}
            deedType={deedType}
            deedDate={deedDate}
            notaryName={notaryName}
            notaryProtocol={notaryProtocol}
            projectName={dedicatedProjectName}
            projectNumber={projectNumber}
            promoter={promoter}
            workStartDate={startDate}
            workEndDate={endDate}
            durationText={duracionObra}
            milestonesText={milestones}
            paymentMethod={paymentMethod}
            paymentDays={paymentDays}
            paymentMethodOtherText={paymentMethodOtherText}
            priceNumber={totalExecutionPrice}
            priceText={priceText}
            numWorkers={workersCount}
            warrantyText={warrantyText}
            onSupplierLegalRepNameChange={setNombreGerente}
            onSupplierLegalRepDniChange={setNifGerente}
            onSupplierAddressChange={setSupplierAddress}
            onSupplierNameChange={setSupplierName}
            onSupplierTaxIdChange={setSupplierTaxId}
            onDeedTypeChange={setDeedType}
            onDeedDateChange={setDeedDate}
            onNotaryNameChange={setNotaryName}
            onNotaryProtocolChange={setNotaryProtocol}
            onProjectNumberChange={setProjectNumber}
            onPromoterChange={setPromoter}
            onWorkStartDateChange={setStartDate}
            onWorkEndDateChange={setEndDate}
            onDurationTextChange={setDuracionObra}
            onMilestonesTextChange={setMilestones}
            onPaymentMethodChange={setPaymentMethod}
            onPaymentDaysChange={setPaymentDays}
            onPaymentMethodOtherTextChange={setPaymentMethodOtherText}
            onPriceNumberChange={setTotalExecutionPrice}
            onNumWorkersChange={setWorkersCount}
            onWarrantyTextChange={setWarrantyText}
          />
          {!isContractFormValid && (
            <Alert status="warning" borderRadius="md" mt={6}>
              <AlertIcon />
              Faltan datos obligatorios:{" "}
              {requiredFieldErrors.slice(0, 4).join(", ")}
              {requiredFieldErrors.length > 4 ? "..." : ""}
            </Alert>
          )}
        </Box>
      ) : isServicio ? (
        <Box p={6}>
          <ServicioForm
            contractDate={dedicatedContractDate}
            supplierLegalRepName={nombreGerente}
            supplierLegalRepDni={nifGerente}
            supplierAddress={supplierAddress}
            supplierName={supplierName}
            supplierTaxId={supplierTaxId}
            projectName={dedicatedProjectName}
            serviceType={serviceCategory}
            workStartDate={startDate}
            workEndDate={endDate}
            paymentMethod={paymentMethod}
            paymentDays={paymentDays}
            paymentMethodOtherText={paymentMethodOtherText}
            onSupplierLegalRepNameChange={setNombreGerente}
            onSupplierLegalRepDniChange={setNifGerente}
            onSupplierAddressChange={setSupplierAddress}
            onSupplierNameChange={setSupplierName}
            onSupplierTaxIdChange={setSupplierTaxId}
            onServiceTypeChange={setServiceCategory}
            onWorkStartDateChange={setStartDate}
            onWorkEndDateChange={setEndDate}
            onPaymentMethodChange={setPaymentMethod}
            onPaymentDaysChange={setPaymentDays}
            onPaymentMethodOtherTextChange={setPaymentMethodOtherText}
          />
          {!isContractFormValid && (
            <Alert status="warning" borderRadius="md" mt={6}>
              <AlertIcon />
              Faltan datos obligatorios:{" "}
              {requiredFieldErrors.slice(0, 4).join(", ")}
              {requiredFieldErrors.length > 4 ? "..." : ""}
            </Alert>
          )}
        </Box>
      ) : (
      <Stack spacing={8} p={6}>
        <Section
          icon={<FileText size={18} />}
          title="Información general"
        >
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <InputField
              label="ID Contrato"
              defaultValue={contract ? `CT-${contract.id}` : "Auto-generado"}
              disabled
              helper="Generado automáticamente"
            />
            <SelectField label="Tipo Documento" options={["CONTRATO"]} />
            <SelectField
              label="Tipo Contrato"
              options={["SUBCONTRATACIÓN", "SUMINISTRO", "SERVICIO"]}
              value={formatContractType(tipoContrato)}
              onChange={(e) =>
                setTipoContrato(
                  (e.target.value as string).replace(
                    "SUBCONTRATACIÓN",
                    "SUBCONTRATACION",
                  ) as ContractType,
                )
              }
            />
            <InputField
              label="Título"
              value={title}
              onChange={setTitle}
              required
            />
          </SimpleGrid>
        </Section>

        <Section
          icon={<Users size={18} />}
          title="Datos del proveedor"
        >
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <InputField
              label="Razón social / Empresa"
              value={supplierName}
              onChange={setSupplierName}
              required
            />
            <InputField
              label="NIF/CIF"
              value={supplierTaxId}
              onChange={setSupplierTaxId}
              required
            />
            {isSuministro && (
              <Box gridColumn={{ base: "span 1", md: "span 2" }}>
                <InputField
                  label="Dirección empresa"
                  value={supplierAddress}
                  onChange={setSupplierAddress}
                  required
                  fullWidth
                />
              </Box>
            )}
            {!isSuministro && (
              <>
                <Box gridColumn={{ base: "span 1", md: "span 2" }}>
                  <Divider />
                </Box>
                <InputField
                  label="Nombre gerente / contacto"
                  value={supplierContactName}
                  onChange={setSupplierContactName}
                />
                <InputField
                  label="Teléfono"
                  value={supplierPhone}
                  onChange={setSupplierPhone}
                />
                <InputField
                  label="Email"
                  value={supplierEmail}
                  onChange={setSupplierEmail}
                  isInvalid={
                    supplierEmailNormalized.length > 0 && !isSupplierEmailValid
                  }
                  fullWidth
                />
                <InputField
                  label="Ciudad"
                  value={supplierCity}
                  onChange={setSupplierCity}
                />
                <InputField
                  label="CP"
                  value={supplierPostalCode}
                  onChange={setSupplierPostalCode}
                />
                <InputField
                  label="País"
                  value={supplierCountry}
                  onChange={setSupplierCountry}
                />
              </>
            )}
          </SimpleGrid>
          <Text
            fontSize="xs"
            color={isLookupLoading ? "blue.600" : "gray.500"}
            mt={3}
          >
            {isLookupLoading
              ? "Buscando proveedor por CIF..."
              : lastLookupAutofillCount > 0
                ? `CIF encontrado: se autocompletaron ${lastLookupAutofillCount} campos desde BD.`
                : "Al cambiar CIF se autocompleta desde BD."}
          </Text>
          {supplierEmailNormalized.length > 0 && !isSupplierEmailValid && (
            <Text fontSize="xs" color="red.500" mt={2}>
              Si informas email, debe tener formato válido.
            </Text>
          )}
          <HStack spacing={3} mt={3}>
            <Button
              size="sm"
              variant="outline"
              isLoading={isGeneratingSupplierLink}
              loadingText="Generando..."
              onClick={async () => {
                if (!contract) return;
                try {
                  setIsGeneratingSupplierLink(true);
                  // Asegura persistir NIF/CIF y resto de datos visibles en formulario
                  // antes de pedir el enlace de onboarding.
                  await persistContractAndRefreshPdf();
                  const linkPayload = await regenerateSupplierOnboardingLink(
                    contract.id,
                    {
                      supplier_tax_id: supplierTaxId.trim() || undefined,
                      supplier_email: supplierEmail.trim().toLowerCase() || undefined,
                    },
                    contract.tenant_id ?? tenantId,
                  );
                  const publicUrl = `${window.location.origin}/#/supplier-onboarding?token=${linkPayload.token}`;
                  let copied = false;
                  try {
                    await navigator.clipboard.writeText(publicUrl);
                    copied = true;
                  } catch {
                    copied = false;
                  }
                  toast({
                    status: "success",
                    title: "Enlace de proveedor generado",
                    description: linkPayload.email_sent
                      ? `Enlace enviado por correo a ${linkPayload.recipient_email ?? "proveedor"}${copied ? " y copiado al portapapeles." : "."}`
                      : copied
                        ? "Enlace copiado al portapapeles."
                        : "Enlace generado. No se pudo copiar automáticamente.",
                  });
                } catch (error) {
                  toast({
                    status: "warning",
                    title: "No se pudo generar el enlace",
                    description: getApiErrorDetail(
                      error,
                      "Revisa NIF/CIF y email del proveedor.",
                    ),
                  });
                } finally {
                  setIsGeneratingSupplierLink(false);
                }
              }}
            >
              Regenerar enlace proveedor
            </Button>
          </HStack>
        </Section>

        {isSuministro && (
          <Section icon={<User size={18} />} title="Representante">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <InputField
                label="Nombre gerente"
                value={nombreGerente}
                onChange={setNombreGerente}
                required
              />
              <InputField
                label="NIF gerente"
                value={nifGerente}
                onChange={setNifGerente}
                required
              />
            </SimpleGrid>
          </Section>
        )}

        <Section
          icon={<span>⏱</span>}
          title="Condiciones económicas"
        >
          <Stack spacing={4}>
            {!isSuministro && (
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Tipo Precio
                </Text>
                <RadioGroup value={priceType} onChange={setPriceType}>
                  <HStack spacing={6}>
                    <Radio value="CERRADO">CERRADO</Radio>
                    <Radio value="EJECUTADO EN OBRA">EJECUTADO EN OBRA</Radio>
                  </HStack>
                </RadioGroup>
              </Box>
            )}
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {!isSuministro && (
                <>
                  <InputField
                    label="Precio total de la ejecución"
                    value={totalExecutionPrice}
                    onChange={setTotalExecutionPrice}
                    suffix="€"
                    required
                  />
                  <InputField
                    label="Precio (letras)"
                    value={priceText}
                    onChange={setPriceText}
                    required
                  />
                </>
              )}
              {isSuministro ? (
                <InputField
                  label="Forma de pago"
                  value={formaPagoPactadaDisplay}
                  onChange={() => {}}
                  disabled
                />
              ) : (
                <SelectField
                  label="Forma de Pago"
                  options={["CONFIRMING 60", "CONFIRMING 120", "OTRAS"]}
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                />
              )}
              {isSuministro && (
                <InputField
                  label="Término de pago"
                  value={terminoPago}
                  onChange={() => {}}
                  disabled
                />
              )}
              {!isSuministro && (
                <InputField
                  label="Seguro"
                  value={insuranceAmount}
                  onChange={setInsuranceAmount}
                  suffix="€"
                  required
                />
              )}
            </SimpleGrid>
            {!isSuministro && paymentMethod === "OTRAS" && (
              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                El contrato queda bloqueado hasta aprobacion de Administracion,
                Compras y Jurídico.
              </Alert>
            )}
            {!isSuministro && (
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Retención
                </Text>
                <RadioGroup value={retention} onChange={setRetention}>
                  <HStack spacing={6}>
                    <Radio value="SI">Sí</Radio>
                    <Radio value="NO">NO</Radio>
                  </HStack>
                </RadioGroup>
              </Box>
            )}
          </Stack>
        </Section>

        <Section icon={<span>⏱</span>} title="Plazos">
          <SimpleGrid columns={{ base: 1, md: isSuministro ? 3 : 3 }} spacing={4}>
            {!isSuministro && (
              <InputField
                label="Fecha Petición"
                type="date"
                value={requestDate}
                onChange={setRequestDate}
                disabled
                helper="Automática: fecha actual o 1 día antes de inicio si corresponde."
                required
              />
            )}
            <InputField
              label="Fecha Inicio"
              type="date"
              value={startDate}
              onChange={setStartDate}
              required
            />
            <InputField
              label="Fecha Fin"
              type="date"
              value={endDate}
              onChange={setEndDate}
              required
            />
            {isSuministro && (
              <InputField
                label="Duración"
                value={duracionObra}
                onChange={setDuracionObra}
                helper="Texto libre, ej: 3 meses"
              />
            )}
          </SimpleGrid>
          {!isSuministro && (
            <Text fontSize="sm" color="gray.600" mt={2}>
              Duración calculada: <strong>60 días</strong>
            </Text>
          )}
        </Section>

        {tipoContrato === "SUBCONTRATACION" && (
          <Section icon={<Users size={18} />} title="Recursos">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <InputField
                label="Número de Obra"
                value={workNumber}
                onChange={setWorkNumber}
                required
              />
              <InputField
                label="Número de Trabajadores"
                type="number"
                value={workersCount}
                onChange={setWorkersCount}
                required
              />
            </SimpleGrid>
          </Section>
        )}

        {tipoContrato === "SUMINISTRO" && (
          <Section icon={<Truck size={18} />} title="Logística">
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <SelectField
                label="Portes"
                options={["URDECON", "PROVEEDOR"]}
                value={shippingType}
                onChange={(event) => setShippingType(event.target.value)}
              />
              <SelectField
                label="Descargas"
                options={["URDECON", "PROVEEDOR"]}
                value={unloadingType}
                onChange={(event) => setUnloadingType(event.target.value)}
              />
            </SimpleGrid>
          </Section>
        )}

        {tipoContrato === "SERVICIO" && (
          <Section
            icon={<Wrench size={18} />}
            title="Detalles del servicio"
          >
            <InputField
              label="Tipo de servicio prestado"
              value={serviceCategory}
              onChange={setServiceCategory}
              required
            />
          </Section>
        )}

        <Section
          icon={<span>⏱</span>}
          title="Información adicional"
        >
          <Stack spacing={4}>
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Hitos/Fases
              </Text>
              <Textarea
                rows={3}
                placeholder="Definir hitos del contrato..."
                value={milestones}
                onChange={(event) => setMilestones(event.target.value)}
                required
              />
            </Box>
            {!isSuministro && (
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Observaciones
                </Text>
                <Textarea
                  rows={4}
                  placeholder="Observaciones generales..."
                  value={generalObservations}
                  onChange={(event) => setGeneralObservations(event.target.value)}
                  required
                />
              </Box>
            )}
          </Stack>
        </Section>

        {!isContractFormValid && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon />
            Faltan datos obligatorios:{" "}
            {requiredFieldErrors.slice(0, 4).join(", ")}
            {requiredFieldErrors.length > 4 ? "..." : ""}
          </Alert>
        )}

        <Box
          p={4}
          bg="blue.50"
          border="1px solid"
          borderColor="blue.200"
          rounded="lg"
        >
          <Text fontSize="sm" color="blue.800">
            <strong>Estado actual:</strong>{" "}
            {contract ? formatContractStatus(contract.status) : "Borrador"}
          </Text>
        </Box>
      </Stack>
      )}
      </Box>

      {!isReadOnlyView && (
        <Flex
          px={6}
          py={4}
          borderTop="1px solid"
          borderColor={borderColor}
          justify="flex-end"
          bg={useColorModeValue("gray.50", "gray.900")}
        >
          <HStack spacing={3}>
            <Button
              leftIcon={<Eye size={16} />}
              variant="outline"
              colorScheme="blue"
              onClick={async () => {
                if (supplierEmailNormalized.length > 0 && !isSupplierEmailValid) {
                  toast({
                    status: "warning",
                    title: "Email inválido",
                    description:
                      "Corrige el formato del email del proveedor para guardar.",
                  });
                  return;
                }
                try {
                  await persistContractAndRefreshPdf();
                } catch {
                  // El error ya se muestra en el onError de la mutación.
                }
              }}
            >
              Guardar cambios
            </Button>
            <Button
              leftIcon={<Send size={16} />}
              colorScheme="brand"
              isDisabled={!canSubmitGerencia || !isContractFormValid}
              isLoading={isSubmittingGerencia || isPreparingDocs}
              loadingText={isPreparingDocs ? "Preparando..." : "Enviando"}
              onClick={async () => {
                if (!isContractFormValid) {
                  toast({
                    status: "warning",
                    title: "Formulario incompleto",
                    description:
                      "Completa todos los campos obligatorios antes de enviar.",
                  });
                  return;
                }
                try {
                  await persistContractAndRefreshPdf();
                  await onSubmit();
                } catch {
                  // Las mutaciones muestran el detalle en sus propios onError.
                }
              }}
            >
              Enviar a aprobación
            </Button>
          </HStack>
        </Flex>
      )}
      </Box>
        </GridItem>
      </Grid>
    </Stack>
  );
};

// ============================================================================
// CONFIGURACIÓN DE WORKFLOW
// ============================================================================

interface WorkflowConfigPanelProps {
  tabsNavigation?: React.ReactNode;
  onNavigate: (view: ViewState) => void;
  tenantId?: number;
}

interface WorkflowStepDraft {
  department_id: number;
  department_name: string;
}

const WorkflowConfigPanel: React.FC<WorkflowConfigPanelProps> = ({
  tabsNavigation,
  onNavigate,
  tenantId,
}) => {
  const toast = useToast();
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const [draftSteps, setDraftSteps] = useState<WorkflowStepDraft[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");

  const departmentsQuery = useHrDepartments(tenantId, Boolean(tenantId));

  const workflowQuery = useQuery({
    queryKey: contractKeys.workflow(tenantId),
    queryFn: () => fetchContractWorkflow(tenantId),
    enabled: Boolean(tenantId),
  });

  useEffect(() => {
    if (!workflowQuery.data || !departmentsQuery.data) return;
    const byId = new Map(
      departmentsQuery.data.map((department) => [department.id, department]),
    );
    const byName = new Map(
      departmentsQuery.data.map((department) => [
        department.name.trim().toLowerCase(),
        department,
      ]),
    );
    const parsed: WorkflowStepDraft[] = [];
    for (const step of workflowQuery.data.steps) {
      const byIdMatch =
        step.department_id != null ? byId.get(step.department_id) : undefined;
      const byNameMatch = byName.get(
        (step.department_name ?? "").trim().toLowerCase(),
      );
      const department = byIdMatch ?? byNameMatch;
      if (!department) continue;
      parsed.push({
        department_id: department.id,
        department_name: department.name,
      });
    }
    setDraftSteps(parsed);
  }, [workflowQuery.data, departmentsQuery.data]);

  const saveWorkflowMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) {
        throw new Error("Tenant no definido");
      }
      if (draftSteps.length === 0) {
        throw new Error("El workflow debe tener al menos un departamento.");
      }
      return updateContractWorkflow(
        {
          steps: draftSteps.map((step, index) => ({
            department_id: step.department_id,
            step_order: index + 1,
          })),
        },
        tenantId,
      );
    },
    onSuccess: () => {
      toast({
        status: "success",
        title: "Workflow guardado",
        description: "El flujo de aprobación se actualizó para este tenant.",
      });
      void workflowQuery.refetch();
    },
    onError: (error) => {
      const axiosErr = error as AxiosError<{ detail?: string }>;
      toast({
        status: "error",
        title: "No se pudo guardar el workflow",
        description:
          axiosErr?.response?.data?.detail ??
          "Revisa la configuración de pasos.",
      });
    },
  });

  const usedIds = new Set(draftSteps.map((step) => step.department_id));
  const availableDepartments = (departmentsQuery.data ?? []).filter(
    (department) => department.is_active && !usedIds.has(department.id),
  );

  const addDepartment = () => {
    const departmentId = Number(selectedDepartmentId);
    if (!departmentId) return;
    const department = (departmentsQuery.data ?? []).find(
      (item) => item.id === departmentId,
    );
    if (!department) return;
    setDraftSteps((prev) => [
      ...prev,
      { department_id: department.id, department_name: department.name },
    ]);
    setSelectedDepartmentId("");
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftSteps.length) return;
    setDraftSteps((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const removeStep = (index: number) => {
    setDraftSteps((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  if (!tenantId) {
    return (
      <Alert status="warning" borderRadius="md">
        <AlertIcon />
        Selecciona un tenant para configurar su flujo de aprobaciones.
      </Alert>
    );
  }

  return (
    <Stack spacing={6}>
      <TabVisualBanner
        icon={<Wrench size={18} />}
        title="Configuración de workflow"
        description="Define el orden de departamentos que deben aprobar cada contrato en tu tenant."
      />
      {tabsNavigation}

      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        p={5}
      >
        <Text fontSize="sm" color="gray.500" mb={4}>
          Define el orden de departamentos que aprobarán los contratos para este
          tenant.
        </Text>
        <HStack align="end" spacing={3}>
          <FormControl maxW="420px">
            <FormLabel fontSize="sm" fontWeight="semibold">
              Añadir departamento
            </FormLabel>
            <Select
              value={selectedDepartmentId}
              onChange={(event) => setSelectedDepartmentId(event.target.value)}
              placeholder="Selecciona departamento"
              isDisabled={
                departmentsQuery.isLoading || availableDepartments.length === 0
              }
            >
              {availableDepartments.map((department: Department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </FormControl>
          <Button onClick={addDepartment} isDisabled={!selectedDepartmentId}>
            Añadir
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void workflowQuery.refetch();
              void departmentsQuery.refetch();
            }}
            isLoading={workflowQuery.isFetching || departmentsQuery.isFetching}
          >
            Recargar
          </Button>
        </HStack>
      </Box>

      <Box
        bg={cardBg}
        border="1px solid"
        borderColor={borderColor}
        rounded="xl"
        overflow="hidden"
      >
        <Box px={6} py={4} borderBottom="1px solid" borderColor={borderColor}>
          <Text fontWeight="semibold">Pasos del workflow</Text>
        </Box>
        <Stack spacing={0}>
          {draftSteps.length === 0 && (
            <Box px={6} py={4}>
              <Text fontSize="sm" color="gray.500">
                No hay pasos configurados. Añade al menos un departamento.
              </Text>
            </Box>
          )}
          {draftSteps.map((step, index) => (
            <Flex
              key={step.department_id}
              px={6}
              py={4}
              align="center"
              justify="space-between"
              borderTop={index === 0 ? "none" : "1px solid"}
              borderColor={borderColor}
            >
              <HStack>
                <Badge colorScheme="blue">Paso {index + 1}</Badge>
                <Text fontWeight="medium">{step.department_name}</Text>
              </HStack>
              <HStack spacing={2}>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => moveStep(index, -1)}
                  isDisabled={index === 0}
                >
                  Subir
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => moveStep(index, 1)}
                  isDisabled={index === draftSteps.length - 1}
                >
                  Bajar
                </Button>
                <Button
                  size="xs"
                  colorScheme="red"
                  variant="outline"
                  onClick={() => removeStep(index)}
                >
                  Quitar
                </Button>
              </HStack>
            </Flex>
          ))}
        </Stack>
      </Box>

      <HStack justify="flex-end">
        <Button
          colorScheme="blue"
          onClick={() => saveWorkflowMutation.mutate()}
          isLoading={saveWorkflowMutation.isPending}
          isDisabled={draftSteps.length === 0}
        >
          Guardar workflow
        </Button>
      </HStack>
    </Stack>
  );
};

// ============================================================================
// PANEL DE APROBACIONES
// ============================================================================

interface ApprovalPanelProps {
  tabsNavigation?: React.ReactNode;
  onNavigate: (view: ViewState) => void;
  contract: Contract | null;
  viewMode?: "ver" | "editar";
  scope?: ContractsModuleScope;
  tenantId?: number;
  isSuperAdmin?: boolean;
  currentRoleName?: string;
  currentUserId?: number | null;
  canApproveComparativeByPosition?: boolean;
  canRejectComparativeByPosition?: boolean;
  canCreateComparativeByPosition?: boolean;
  canEditComparativeByPosition?: boolean;
  canDeleteComparativeByPosition?: boolean;
  approvalErrorDetail?: string | null;
  isApproving?: boolean;
  isReturning?: boolean;
  isRejecting?: boolean;
  isSendingSupplierForm?: boolean;
  onOpenDocumentPreview: (
    contractId: number,
    docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
    tenantId?: number,
  ) => Promise<void>;
  onDownloadDocument: (
    contractId: number,
    docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
    tenantId?: number,
  ) => Promise<void>;
  onApproveComparative: (comment?: string) => void;
  onApproveContract: (comment?: string) => void;
  onApproveAllPhases: (comment?: string) => void;
  onReturnComparative: (comment: string) => void;
  onRejectComparative: (reason: string) => void;
  onSendSupplierForm?: () => Promise<void> | void;
}

interface TimelineEventItem {
  status: "completed" | "current" | "pending" | "warning";
  title: string;
  meta?: string;
  comment?: string;
  indent?: boolean;
  isHistorical?: boolean;
}

const ApprovalPanel: React.FC<ApprovalPanelProps> = ({
  tabsNavigation,
  onNavigate,
  contract,
  viewMode = "ver",
  scope = "all",
  tenantId,
  isSuperAdmin = false,
  currentRoleName,
  currentUserId = null,
  canApproveComparativeByPosition = false,
  canRejectComparativeByPosition = false,
  canCreateComparativeByPosition = false,
  canEditComparativeByPosition = false,
  canDeleteComparativeByPosition = false,
  approvalErrorDetail = null,
  isApproving = false,
  isReturning = false,
  isRejecting = false,
  isSendingSupplierForm = false,
  onOpenDocumentPreview,
  onDownloadDocument,
  onApproveComparative,
  onApproveContract,
  onApproveAllPhases,
  onReturnComparative,
  onRejectComparative,
  onSendSupplierForm,
}) => {
  const router = useRouter();
  // Caps de contrato del usuario actual para gatear botones Aprobar/Rechazar
  // del contrato. Independientes de las caps de comparativo.
  const { data: currentUserForCaps } = useCurrentUser();
  useEffect(() => {
    const scrollTop = () => {
      const root = document.querySelector('[data-scroll-root="true"]');
      if (root) (root as HTMLElement).scrollTop = 0;
      window.scrollTo({ top: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scrollTop();
    const r1 = requestAnimationFrame(scrollTop);
    let r2 = 0;
    const r3 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(scrollTop);
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      cancelAnimationFrame(r3);
    };
  }, []);
  const [decisionComment, setDecisionComment] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("Documento");
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const rejectTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isRejectModalOpen) return;
    const id = requestAnimationFrame(() => {
      const el = rejectTextareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
    return () => cancelAnimationFrame(id);
  }, [isRejectModalOpen, rejectComment]);
  const [showComparativoPreview, setShowComparativoPreview] = useState(false);
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const role = (currentRoleName ?? "").toLowerCase();
  const isGerenciaRole =
    role === "gerencia" ||
    role === "gerente" ||
    role === "manager" ||
    role === "management" ||
    role === "tenant_admin";
  const isComparativesScope = scope === "comparatives";
  const isContractsScope = scope === "contracts";
  const showComparativeActions = !isContractsScope;
  const showContractActions = !isComparativesScope;

  const canApproveComparative = Boolean(
    contract?.comparative_status === "PENDING_MGMT_APPROVAL" &&
      (isSuperAdmin || canApproveComparativeByPosition),
  );
  const canRejectComparative = Boolean(
    contract?.comparative_status === "PENDING_MGMT_APPROVAL" &&
      (isSuperAdmin || canRejectComparativeByPosition),
  );
  // Gate por cap usuario: solo si tiene can_approve_contract / can_reject_contract
  // efectivo (OR Dept/Position) puede ejecutar la acción aunque el contrato
  // esté en estado pendiente.
  const userCanApproveContract = Boolean(
    isSuperAdmin || currentUserForCaps?.can_approve_contract,
  );
  const userCanRejectContract = Boolean(
    isSuperAdmin || currentUserForCaps?.can_reject_contract,
  );
  const canApproveContract = Boolean(
    contract &&
      (contract.status === "PENDING_GERENCIA" ||
        contract.status === "PENDING_DEPARTAMENTOS" ||
        contract.status === "PENDING_REVIEW") &&
      userCanApproveContract,
  );
  const canApproveAllPhases = Boolean(
    isSuperAdmin &&
      contract &&
      contract.comparative_status === "APPROVED" &&
      (contract.status === "PENDING_GERENCIA" ||
        contract.status === "PENDING_DEPARTAMENTOS"),
  );
  // Recalculado mas abajo tras conocer comparativeApprovalsQuery
  const canApproveCurrentRaw =
    (showComparativeActions && canApproveComparative) ||
    (showContractActions && canApproveContract);
  const missingFieldsFromError = useMemo(() => {
    if (!approvalErrorDetail) return [];
    const marker = "contrato:";
    const markerIndex = approvalErrorDetail.toLowerCase().indexOf(marker);
    if (markerIndex === -1) return [];
    const raw = approvalErrorDetail.slice(markerIndex + marker.length).trim();
    if (!raw) return [];
    return raw
      .replace(/\.$/, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }, [approvalErrorDetail]);
  const resolvedTenantId = contract?.tenant_id ?? tenantId;
  const contractDocsQuery = useQuery({
    queryKey: contractKeys.documents(tenantId, contract?.id ?? 0),
    queryFn: () =>
      fetchContractDocuments(contract!.id, contract?.tenant_id ?? tenantId),
    enabled: Boolean(contract?.id),
  });
  const workflowTimelineQuery = useQuery({
    queryKey: contractKeys.workflowTimeline(resolvedTenantId),
    queryFn: () => fetchContractWorkflow(resolvedTenantId),
    enabled: Boolean(contract?.id && resolvedTenantId),
  });
  const workflowApprovalsQuery = useQuery({
    queryKey: contractKeys.workflowApprovals(resolvedTenantId, contract?.id ?? 0),
    queryFn: () =>
      fetchContractWorkflowApprovals(contract!.id, contract?.tenant_id ?? tenantId),
    enabled: Boolean(contract?.id),
  });
  const contractReviewApprovalsQuery = useQuery({
    queryKey: ["review-approvals", contract?.id ?? 0, resolvedTenantId],
    queryFn: () =>
      fetchReviewApprovals(contract!.id, contract?.tenant_id ?? tenantId),
    enabled: Boolean(
      contract?.id &&
        contract?.status &&
        [
          "PENDING_DATA_VALIDATION",
          "PENDING_REVIEW",
          "FULLY_APPROVED",
          "SENT_FOR_SIGNATURE",
          "SIGNED",
          "REJECTED",
        ].includes(contract.status),
    ),
  });
  const comparativeApprovalsQuery = useQuery({
    queryKey: contractKeys.comparativeApprovals(resolvedTenantId, contract?.id ?? 0),
    queryFn: () =>
      fetchContractComparativeApprovals(contract!.id, contract?.tenant_id ?? tenantId),
    enabled: Boolean(contract?.id),
  });
  const livePanelContractQuery = useQuery({
    queryKey: contractKeys.detail(resolvedTenantId, contract?.id ?? 0),
    queryFn: () =>
      fetchContractById(contract!.id, contract?.tenant_id ?? tenantId),
    enabled: Boolean(contract?.id),
    refetchInterval: (query) => {
      const data = query.state.data as any;
      const status = data?.status ?? contract?.status;
      const cmpStatus = data?.comparative_status ?? contract?.comparative_status;
      const cd = (data?.comparative_data ?? contract?.comparative_data) as any;
      const awaitingSupplier =
        status === "PENDING_SUPPLIER" ||
        (cmpStatus === "APPROVED" &&
          (cd?.needs_supplier_form_after_approval === true ||
            (Boolean(cd?.supplier_form_sent_at) && !cd?.supplier_data_captured_at)));
      return awaitingSupplier ? 15000 : false;
    },
    refetchIntervalInBackground: false,
  });
  const livePanelContract = (livePanelContractQuery.data as Contract | undefined) ?? contract;
  const userAlreadyApprovedBranch = Boolean(
    currentUserId &&
      (comparativeApprovalsQuery.data ?? []).some(
        (row) => row.status === "APPROVED" && row.decided_by_id === currentUserId,
      ),
  );
  const canApproveCurrent = canApproveCurrentRaw && !userAlreadyApprovedBranch;

  const timelineEvents = useMemo<TimelineEventItem[]>(() => {
    if (!contract) return [];

    // Agrupamos los slots de revisión por cycle_number. Cada ciclo tiene
    // 4 ramas (ADMIN, JURIDICO, JEFE_OBRA, DIRECTOR_TECNICO). El historial
    // se construye apilando los ciclos cerrados antes del ciclo en curso.
    type ReviewRole = "ADMIN" | "JURIDICO" | "JEFE_OBRA" | "DIRECTOR_TECNICO";
    type CycleSlots = Record<ReviewRole, ReviewApproval | null>;
    const REVIEW_ROLE_ORDER: ReviewRole[] = [
      "ADMIN",
      "JURIDICO",
      "JEFE_OBRA",
      "DIRECTOR_TECNICO",
    ];
    const REVIEW_ROLE_LABELS: Record<ReviewRole, string> = {
      ADMIN: "ADMINISTRACION",
      JURIDICO: "JURIDICO",
      JEFE_OBRA: "JEFE DE OBRA",
      DIRECTOR_TECNICO: "DIRECTOR TECNICO",
    };

    const reviewRows = contractReviewApprovalsQuery.data ?? [];
    const byCycle = new Map<number, CycleSlots>();
    for (const row of reviewRows) {
      const role = (row.approver_role ?? "").toUpperCase();
      if (!REVIEW_ROLE_ORDER.includes(role as ReviewRole)) continue;
      const cycle = row.cycle_number ?? 1;
      const slot = byCycle.get(cycle) ?? {
        ADMIN: null,
        JURIDICO: null,
        JEFE_OBRA: null,
        DIRECTOR_TECNICO: null,
      };
      slot[role as ReviewRole] = row;
      byCycle.set(cycle, slot);
    }

    const sortedCycles = Array.from(byCycle.keys()).sort((a, b) => a - b);
    const maxCycle = sortedCycles.length > 0 ? sortedCycles[sortedCycles.length - 1] : 0;
    const isReturnedToAdmin =
      contract.status === "PENDING_DATA_VALIDATION" && sortedCycles.length > 0;
    // Ciclo activo: si el contrato volvió a fase Admin tras un rechazo, el
    // ciclo "abierto" todavía no tiene filas (las creará el próximo
    // admin-approve-draft), así que el activo es maxCycle+1.
    const activeCycle = isReturnedToAdmin ? maxCycle + 1 : maxCycle;
    const historicalCycles = sortedCycles.filter((n) => n < activeCycle);

    const events: TimelineEventItem[] = [];

    events.push({
      status: "completed",
      title: "CREADO",
      meta: formatDateTime(contract.created_at),
      comment: `Contrato CT-${contract.id}`,
    });

    const buildBranch = (
      row: ReviewApproval | null,
      role: ReviewRole,
      isParentPending: boolean,
      historical: boolean,
    ): TimelineEventItem => {
      const label = REVIEW_ROLE_LABELS[role];
      if (row?.status === "APPROVED") {
        return {
          status: "completed",
          title: `APROBADO POR ${label}`,
          meta: row.decided_at ? formatDateTime(row.decided_at) : undefined,
          comment: row.decided_by_name ?? undefined,
          indent: true,
          isHistorical: historical,
        };
      }
      if (row?.status === "REJECTED") {
        return {
          status: "warning",
          title:
            role === "JURIDICO" &&
            (row.comment ?? "").toLowerCase().includes("modific")
              ? "DEVUELTO POR JURIDICO TRAS MODIFICACION"
              : `RECHAZADO POR ${label}`,
          meta: row.decided_at ? formatDateTime(row.decided_at) : undefined,
          comment: row.comment ?? row.decided_by_name ?? undefined,
          indent: true,
          isHistorical: historical,
        };
      }
      return {
        status: isParentPending && !historical ? "current" : "pending",
        title: `ESPERANDO APROBACION DE ${label}`,
        meta: "Fecha y hora de aprobacion pendiente",
        indent: true,
        isHistorical: historical,
      };
    };

    // Ciclos históricos cerrados (anteriores al activo).
    for (const cycleNum of historicalCycles) {
      const slots = byCycle.get(cycleNum)!;
      const slotsList = REVIEW_ROLE_ORDER.map((r) => slots[r]);
      const anyRejected = slotsList.some((s) => s?.status === "REJECTED");
      const decided = slotsList
        .map((s) => s?.decided_at)
        .filter(Boolean) as string[];
      const lastDecidedAt = decided.length > 0 ? decided.sort().slice(-1)[0] : undefined;

      events.push({
        status: "warning",
        title: anyRejected ? "CICLO RECHAZADO" : "CICLO CERRADO",
        meta: lastDecidedAt ? formatDateTime(lastDecidedAt) : undefined,
        comment: `Ciclo ${cycleNum}`,
        isHistorical: true,
      });
      for (const role of REVIEW_ROLE_ORDER) {
        events.push(buildBranch(slots[role], role, false, true));
      }
      // Marcador de reapertura por Admin (si hay ciclo posterior con filas o
      // si el contrato volvió a fase Admin esperando re-aprobación).
      const nextHasRows = byCycle.has(cycleNum + 1);
      events.push({
        status: nextHasRows ? "completed" : "pending",
        title: "DEVUELTO A ADMINISTRACION",
        meta: undefined,
        comment: nextHasRows
          ? "Administración reabrió la revisión en un nuevo ciclo."
          : "Pendiente de re-aprobación por Administración.",
        isHistorical: true,
      });
    }

    // Ciclo activo.
    const inDraftPhase =
      contract.status === "DRAFT" ||
      contract.status === "PENDING_TEMPLATE" ||
      contract.status === "PENDING_DATA_VALIDATION";
    const inReview = contract.status === "PENDING_REVIEW";
    const isFullyApproved =
      contract.status === "FULLY_APPROVED" ||
      contract.status === "SENT_FOR_SIGNATURE" ||
      contract.status === "SIGNED";

    if (inDraftPhase) {
      events.push({
        status: isReturnedToAdmin ? "warning" : "current",
        title: isReturnedToAdmin
          ? "PENDIENTE DE NUEVA APROBACION POR ADMINISTRACION"
          : "BORRADOR EN ADMINISTRACION",
        meta: formatDateTime(contract.updated_at),
        comment: isReturnedToAdmin
          ? "El contrato volvió a Administración tras un rechazo o modificación de Jurídico."
          : "Administración revisa y completa el contrato antes de enviarlo a aprobación.",
      });
    }

    const activeSlots = byCycle.get(activeCycle);
    if (activeSlots && (inReview || isFullyApproved)) {
      const allApproved = REVIEW_ROLE_ORDER.every(
        (r) => activeSlots[r]?.status === "APPROVED",
      );
      events.push({
        status: allApproved
          ? "completed"
          : inReview
            ? "current"
            : "pending",
        title: allApproved
          ? "CONTRATO APROBADO"
          : "A LA ESPERA DE APROBACIONES",
        meta: allApproved && contract.approved_at
          ? formatDateTime(contract.approved_at)
          : `Administración | Jurídico | Jefe de Obra | Director Técnico`,
      });
      for (const role of REVIEW_ROLE_ORDER) {
        events.push(buildBranch(activeSlots[role], role, inReview, false));
      }
    }

    if (contract.status === "SENT_FOR_SIGNATURE") {
      events.push({
        status: "current",
        title: "EN FIRMA",
        meta: contract.approved_at ? formatDateTime(contract.approved_at) : undefined,
        comment: "Enviado a firma digital.",
      });
    }

    if (contract.status === "SIGNED") {
      events.push({
        status: "completed",
        title: "CONTRATO FIRMADO",
        meta: contract.signed_at ? formatDateTime(contract.signed_at) : undefined,
      });
    }

    if (contract.status === "REJECTED") {
      events.push({
        status: "warning",
        title: "CONTRATO RECHAZADO",
        meta: formatDateTime(contract.updated_at),
        comment: contract.rejected_reason ?? undefined,
      });
    }

    return events;
  }, [
    contract,
    contractReviewApprovalsQuery.data,
  ]);

  const comparativeApprovalsByCycle = useMemo(() => {
    const rows = comparativeApprovalsQuery.data ?? [];
    const byCycle = new Map<number, { obra: ContractComparativeApproval | null; gerencia: ContractComparativeApproval | null }>();
    for (const row of rows) {
      const cycle = row.cycle_number ?? 1;
      const entry = byCycle.get(cycle) ?? { obra: null, gerencia: null };
      if (row.department === "OBRA") entry.obra = row;
      else if (row.department === "GERENCIA") entry.gerencia = row;
      byCycle.set(cycle, entry);
    }
    return byCycle;
  }, [comparativeApprovalsQuery.data]);

  // Ciclo activo efectivo: si el max cycle en DB está cerrado (alguna rama REJECTED
  // o ambas APPROVED) y el comparativo volvió a PENDING_* por reenvío, hay un ciclo
  // nuevo abierto sin filas todavía (backend solo incrementa contador, no inserta
  // filas hasta primera decisión).
  const effectiveCurrentCycle = useMemo(() => {
    if (comparativeApprovalsByCycle.size === 0) return 1;
    const maxCycle = Math.max(...Array.from(comparativeApprovalsByCycle.keys()));
    const maxData = comparativeApprovalsByCycle.get(maxCycle);
    const cmpStatus = livePanelContract?.comparative_status;
    const isPending =
      cmpStatus === "PENDING_REVIEW" || cmpStatus === "PENDING_MGMT_APPROVAL";
    const maxClosed =
      maxData?.obra?.status === "REJECTED" ||
      maxData?.gerencia?.status === "REJECTED" ||
      (maxData?.obra?.status === "APPROVED" &&
        maxData?.gerencia?.status === "APPROVED");
    if (maxClosed && isPending) return maxCycle + 1;
    return maxCycle;
  }, [comparativeApprovalsByCycle, livePanelContract?.comparative_status]);

  const comparativeBranches = useMemo(() => {
    if (comparativeApprovalsByCycle.size === 0) {
      return { obra: null as ContractComparativeApproval | null, gerencia: null as ContractComparativeApproval | null };
    }
    return (
      comparativeApprovalsByCycle.get(effectiveCurrentCycle) ?? {
        obra: null,
        gerencia: null,
      }
    );
  }, [comparativeApprovalsByCycle, effectiveCurrentCycle]);

  const supplierWaitState = useMemo(() => {
    const c = livePanelContract;
    if (!c) {
      return { awaiting: false, sentAt: undefined as string | undefined, capturedAt: undefined as string | undefined };
    }
    const cd = (c.comparative_data as any) ?? {};
    const fullyApproved = c.comparative_status === "APPROVED";
    const flagActive = cd?.needs_supplier_form_after_approval === true;
    const capturedAt: string | undefined =
      typeof cd?.supplier_data_captured_at === "string" ? cd.supplier_data_captured_at : undefined;
    const sentAt: string | undefined =
      typeof cd?.supplier_form_sent_at === "string" ? cd.supplier_form_sent_at : undefined;
    const shouldShow =
      fullyApproved &&
      (flagActive ||
        c.status === "PENDING_SUPPLIER" ||
        Boolean(sentAt) ||
        Boolean(capturedAt));
    const awaiting = shouldShow && !capturedAt;
    return { awaiting, sentAt, capturedAt };
  }, [livePanelContract]);

  const comparativeTimelineEvents = useMemo<TimelineEventItem[]>(() => {
    const c = livePanelContract;
    if (!c) return [];
    const events: TimelineEventItem[] = [];
    const cmpStatus = c.comparative_status;
    const isApproved = cmpStatus === "APPROVED";
    const isPendingApproval =
      cmpStatus === "PENDING_REVIEW" || cmpStatus === "PENDING_MGMT_APPROVAL";
    const isReturned = cmpStatus === "NEEDS_CHANGES";
    const isRejected = cmpStatus === "REJECTED";

    events.push({
      status: "completed",
      title: "CREADO",
      meta: formatDateTime(c.submitted_at ?? c.created_at),
      comment: `Comparativo CP-${c.id}`,
    });

    // Ciclos historicos cerrados (todos menos el actual): se apilan en orden
    // cronologico, mostrando todo lo que ocurrio en intentos previos antes
    // del ciclo en curso.
    const sortedCycles = Array.from(comparativeApprovalsByCycle.keys()).sort((a, b) => a - b);
    const currentCycle = effectiveCurrentCycle;
    const historicalCycles = sortedCycles.filter((n) => n < currentCycle);

    const isReturnedDecision = (row: ContractComparativeApproval | null): boolean =>
      Boolean(row?.status === "REJECTED" && row?.comment?.startsWith("[Devolución]"));

    for (const cycleNum of historicalCycles) {
      const cycleData = comparativeApprovalsByCycle.get(cycleNum);
      const obraRow = cycleData?.obra ?? null;
      const gerRow = cycleData?.gerencia ?? null;
      const anyReturned = isReturnedDecision(obraRow) || isReturnedDecision(gerRow);
      const anyRejectedHist =
        (obraRow?.status === "REJECTED" && !isReturnedDecision(obraRow)) ||
        (gerRow?.status === "REJECTED" && !isReturnedDecision(gerRow));
      const decidedDates = [obraRow?.decided_at, gerRow?.decided_at].filter(Boolean) as string[];
      const lastDecidedAt = decidedDates.length > 0
        ? decidedDates.sort().slice(-1)[0]
        : undefined;
      events.push({
        status: "warning",
        title: anyRejectedHist
          ? "RECHAZADO"
          : anyReturned
            ? "DEVUELTO PARA CAMBIOS"
            : "CERRADO",
        meta: lastDecidedAt ? formatDateTime(lastDecidedAt) : undefined,
        isHistorical: true,
      });
      const buildHistoricalBranch = (
        row: ContractComparativeApproval | null,
        approvedLabel: string,
        rejectedLabel: string,
        returnedLabel: string,
        pendingLabel: string,
      ): TimelineEventItem => {
        if (row?.status === "APPROVED") {
          return {
            status: "completed",
            title: approvedLabel,
            meta: row.decided_at ? formatDateTime(row.decided_at) : undefined,
            comment: row.decided_by_name ?? undefined,
            indent: true,
            isHistorical: true,
          };
        }
        if (row?.status === "REJECTED") {
          const isReturn = isReturnedDecision(row);
          return {
            status: "warning",
            title: isReturn ? returnedLabel : rejectedLabel,
            meta: row.decided_at ? formatDateTime(row.decided_at) : undefined,
            comment: row.comment ?? row.decided_by_name ?? undefined,
            indent: true,
            isHistorical: true,
          };
        }
        return {
          status: "pending",
          title: pendingLabel,
          meta: undefined,
          indent: true,
          isHistorical: true,
        };
      };
      events.push(
        buildHistoricalBranch(
          obraRow,
          "APROBADO POR DIRECTOR TECNICO",
          "RECHAZADO POR DIRECTOR TECNICO",
          "DEVUELTO POR DIRECTOR TECNICO",
          "SIN DECISION DE DIRECTOR TECNICO",
        ),
      );
      events.push(
        buildHistoricalBranch(
          gerRow,
          "APROBADO POR GERENCIA",
          "RECHAZADO POR GERENCIA",
          "DEVUELTO POR GERENCIA",
          "SIN DECISION DE GERENCIA",
        ),
      );
      const nextCycleData = comparativeApprovalsByCycle.get(cycleNum + 1);
      const nextCycleCreatedDates = [
        nextCycleData?.obra?.created_at,
        nextCycleData?.gerencia?.created_at,
      ].filter(Boolean) as string[];
      const resendAt = nextCycleCreatedDates.length > 0
        ? nextCycleCreatedDates.sort()[0]
        : undefined;
      events.push({
        status: "completed",
        title: "REENVIADO",
        meta: resendAt ? formatDateTime(resendAt) : undefined,
        comment: "Comparativo reenviado tras correcciones.",
        isHistorical: true,
      });
    }

    const { obra, gerencia } = comparativeBranches;
    const obraApproved = obra?.status === "APPROVED";
    const gerenciaApproved = gerencia?.status === "APPROVED";
    const bothApproved = obraApproved && gerenciaApproved;
    const anyRejected =
      obra?.status === "REJECTED" || gerencia?.status === "REJECTED";

    const aggregateStatus: TimelineEventItem["status"] = bothApproved
      ? "completed"
      : isRejected || anyRejected
        ? "warning"
        : isReturned
          ? "warning"
          : isPendingApproval || isApproved
            ? "current"
            : "pending";

    events.push({
      status: aggregateStatus,
      title: aggregateStatus === "completed"
        ? "COMPARATIVO APROBADO"
        : aggregateStatus === "warning"
          ? "APROBACIONES INTERRUMPIDAS"
          : aggregateStatus === "current"
            ? "A ESPERA DE APROBACIONES"
            : "PENDIENTE DE ENVIO A APROBACIONES",
      meta:
        bothApproved && c.approved_at
          ? formatDateTime(c.approved_at)
          : "Director Tecnico | Gerencia",
    });

    const buildBranch = (
      row: ContractComparativeApproval | null,
      pendingLabel: string,
      approvedLabel: string,
      rejectedLabel: string,
      isParentPending: boolean,
    ): TimelineEventItem => {
      if (row?.status === "APPROVED") {
        return {
          status: "completed",
          title: approvedLabel,
          meta: row.decided_at ? formatDateTime(row.decided_at) : undefined,
          comment: row.decided_by_name ?? undefined,
          indent: true,
        };
      }
      if (row?.status === "REJECTED") {
        return {
          status: "warning",
          title: rejectedLabel,
          meta: row.decided_at ? formatDateTime(row.decided_at) : undefined,
          comment: row.comment ?? row.decided_by_name ?? undefined,
          indent: true,
        };
      }
      return {
        status: isParentPending ? "current" : "pending",
        title: pendingLabel,
        meta: "Fecha y hora de aprobacion pendiente",
        indent: true,
      };
    };

    events.push(
      buildBranch(
        obra,
        "ESPERANDO APROBACION DE DIRECTOR TECNICO",
        "APROBADO POR DIRECTOR TECNICO",
        "RECHAZADO POR DIRECTOR TECNICO",
        isPendingApproval,
      ),
    );
    events.push(
      buildBranch(
        gerencia,
        "ESPERANDO APROBACION DE GERENCIA",
        "APROBADO POR GERENCIA",
        "RECHAZADO POR GERENCIA",
        isPendingApproval,
      ),
    );

    if (isReturned || anyRejected) {
      events.push({
        status: "warning",
        title: isReturned ? "DEVUELTO PARA CAMBIOS" : "COMPARATIVO RECHAZADO",
        meta: formatDateTime(c.updated_at),
        comment: "Al reenviar se reiniciará el flujo. El histórico previo se conserva más arriba.",
      });
      events.push({
        status: "pending",
        title: "REINICIO TRAS RECHAZO",
        meta: "Pendiente de reenvío. El flujo se reiniciará desde la creación.",
      });
      events.push({
        status: "pending",
        title: "CREADO",
        comment: `Comparativo CP-${c.id} (pendiente de reenvío)`,
        indent: true,
      });
      events.push({
        status: "pending",
        title: "ESPERANDO APROBACIÓN DE DIRECTOR TÉCNICO",
        indent: true,
      });
      events.push({
        status: "pending",
        title: "ESPERANDO APROBACIÓN DE GERENCIA",
        indent: true,
      });
      return events;
    }

    if (isRejected) {
      events.push({
        status: "warning",
        title: "COMPARATIVO RECHAZADO",
        meta: formatDateTime(c.updated_at),
      });
      return events;
    }

    const comparativeFullyApproved = bothApproved;

    const cd = (c.comparative_data as any) ?? {};
    const supplierFlagActive = cd?.needs_supplier_form_after_approval === true;
    const supplierDataCapturedAt: string | undefined =
      typeof cd?.supplier_data_captured_at === "string"
        ? cd.supplier_data_captured_at
        : undefined;
    const supplierFormSentAt: string | undefined =
      typeof cd?.supplier_form_sent_at === "string" ? cd.supplier_form_sent_at : undefined;
    const supplierStepShouldShow =
      comparativeFullyApproved &&
      (supplierFlagActive ||
        c.status === "PENDING_SUPPLIER" ||
        Boolean(supplierFormSentAt) ||
        Boolean(supplierDataCapturedAt));
    const supplierStepCompleted = Boolean(supplierDataCapturedAt);
    const awaitingSupplier = supplierStepShouldShow && !supplierStepCompleted;

    if (supplierStepShouldShow) {
      events.push({
        status: supplierStepCompleted ? "completed" : "current",
        title: supplierStepCompleted
          ? "DATOS DEL PROVEEDOR RECIBIDOS"
          : "A LA ESPERA DE DATOS DEL PROVEEDOR",
        meta: supplierStepCompleted
          ? formatDateTime(supplierDataCapturedAt)
          : supplierFormSentAt
            ? `Formulario enviado: ${formatDateTime(supplierFormSentAt)}`
            : "Formulario pendiente de envio",
      });
    }

    const contractGenerated =
      comparativeFullyApproved &&
      !awaitingSupplier &&
      c.status !== "DRAFT" &&
      c.status !== "PENDING_JEFE_OBRA" &&
      c.status !== "PENDING_SUPPLIER";

    const awaitingAdmin =
      comparativeFullyApproved &&
      !awaitingSupplier &&
      (c.status === "DRAFT" || c.status === "PENDING_TEMPLATE");
    events.push({
      status: contractGenerated
        ? "completed"
        : comparativeFullyApproved && !awaitingSupplier
          ? "current"
          : "pending",
      title: contractGenerated
        ? "CONTRATO GENERADO"
        : awaitingSupplier
          ? "CONTRATO PENDIENTE DE GENERACION"
          : awaitingAdmin
            ? "PENDIENTE DE ACTIVACION POR ADMINISTRACION"
            : comparativeFullyApproved
              ? "GENERANDO CONTRATO"
              : "CONTRATO PENDIENTE DE GENERACION",
      meta: contractGenerated ? formatDateTime(c.updated_at) : undefined,
    });

    return events;
  }, [livePanelContract, comparativeBranches, comparativeApprovalsByCycle, effectiveCurrentCycle]);

  if (!contract) {
    return (
      <Alert status="info" borderRadius="md">
        <AlertIcon />
        Selecciona un contrato desde el panel principal para ver sus aprobaciones.
      </Alert>
    );
  }

  const tabsHeader = contract && isComparativesScope ? (
    <Box px={6} py={5} borderBottom="1px solid" borderColor={borderColor}>
      <Heading size="md" mb={contract.title ? 1 : 3}>
        {`CP-${contract.id}`}
      </Heading>
      {contract.title && (
        <Text fontSize="md" fontWeight="medium" color="gray.700" mb={3}>
          {contract.title}
        </Text>
      )}
      <HStack spacing={2}>
        <Button
          size="sm"
          px={4}
          borderRadius="10px"
          fontWeight={500}
          bg="transparent"
          color="inherit"
          _hover={{ bg: "gray.50" }}
          onClick={() =>
            router.history.push(
              viewMode === "editar"
                ? `/comparatives/${contract.id}/edit`
                : `/comparatives/${contract.id}/info`,
            )
          }
        >
          Comparativo
        </Button>
        <Button
          size="sm"
          px={4}
          borderRadius="10px"
          fontWeight={500}
          bg="transparent"
          color="inherit"
          _hover={{ bg: "gray.50" }}
          onClick={() =>
            router.history.push(
              viewMode === "editar"
                ? `/comparatives/${contract.id}/edit-info`
                : `/comparatives/${contract.id}/view-info`,
            )
          }
        >
          Información
        </Button>
        <Button
          size="sm"
          px={4}
          borderRadius="10px"
          fontWeight={600}
          bg="brand.600"
          color="white"
          _hover={{ bg: "brand.600" }}
          cursor="default"
        >
          Aprobaciones
        </Button>
      </HStack>
    </Box>
  ) : null;

  return (
    <Stack spacing={6}>
      {approvalErrorDetail && (
        <Alert status="warning" borderRadius="md">
          <AlertIcon />
          <Box>
            <Text fontWeight="semibold">{approvalErrorDetail}</Text>
            {missingFieldsFromError.length > 0 && (
              <Text fontSize="sm" mt={1}>
                Campos pendientes: {missingFieldsFromError.join(", ")}
              </Text>
            )}
          </Box>
        </Alert>
      )}

      {!contract && (
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          No hay aprobaciones pendientes.
        </Alert>
      )}

      {contract && (
        <Box
          bg={cardBg}
          border="1px solid"
          borderColor={borderColor}
          rounded="xl"
          overflow="hidden"
        >
          {tabsHeader}
          <Stack spacing={4} p={6}>
            {contract.comparative_status === "APPROVED" &&
              (contract.comparative_data as any)
                ?.needs_supplier_form_after_approval === true && (
                <Alert status="info" borderRadius="md" alignItems="flex-start">
                  <AlertIcon mt={1} />
                  <Box flex={1}>
                    <Text fontWeight="semibold">Comparativo aprobado</Text>
                    <Text fontSize="sm" mb={3}>
                      El proveedor está acreditado en REA pero aún no tiene
                      datos completos en nuestro sistema. Envíale el
                      formulario para que complete su información antes de
                      generar el contrato.
                    </Text>
                    <Button
                      size="sm"
                      colorScheme="brand"
                      isLoading={isSendingSupplierForm}
                      loadingText="Enviando"
                      onClick={async () => {
                        if (onSendSupplierForm) await onSendSupplierForm();
                      }}
                    >
                      Enviar formulario al proveedor
                    </Button>
                  </Box>
                </Alert>
              )}
            {showComparativeActions && (
              <>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} fontSize="sm">
                  <Text>
                    <strong>Estado comparativo:</strong>{" "}
                    {formatComparativeStatus(contract.comparative_status)}
                  </Text>
                  <Text>
                    <strong>Proveedor:</strong>{" "}
                    {contract.supplier_name ?? "Pendiente"}
                  </Text>
                  <Text>
                    <strong>Importe:</strong>{" "}
                    {contract.total_amount
                      ? formatCurrency(contract.total_amount)
                      : "Pendiente"}
                  </Text>
                  <Text>
                    <strong>Contrato:</strong> CT-{contract.id}
                  </Text>
                  <Text>
                    <strong>Ultima actualizacion:</strong>{" "}
                    {formatDate(contract.updated_at)}
                  </Text>
                </SimpleGrid>
                <Divider />
                <Box>
                  <Text fontSize="sm" color="gray.500" mb={2}>
                    Observaciones
                  </Text>
                  <Text fontStyle="italic">
                    {(() => {
                      const cd = (contract.contract_data as any) ?? {};
                      const compd = (contract.comparative_data as any) ?? {};
                      const candidates: Array<string | undefined> = [
                        cd?.additional?.observations,
                        compd?.observations,
                        compd?.additional?.observations,
                        compd?.header?.observations,
                        compd?.totales?.observaciones_oferta,
                        compd?.notes,
                      ];
                      const fromCandidates = candidates.find(
                        (value): value is string =>
                          typeof value === "string" && value.trim().length > 0,
                      );
                      if (fromCandidates) return fromCandidates;
                      const offers = Array.isArray(compd?.offers)
                        ? (compd.offers as Array<{ notes?: string; supplier_name?: string }>)
                        : [];
                      const offerNotes = offers
                        .map((offer) => {
                          const notes = (offer?.notes ?? "").toString().trim();
                          if (!notes) return null;
                          const name = (offer?.supplier_name ?? "").toString().trim();
                          return name ? `${name}: ${notes}` : notes;
                        })
                        .filter((value): value is string => Boolean(value));
                      return offerNotes.length > 0
                        ? offerNotes.join(" · ")
                        : "Sin observaciones registradas.";
                    })()}
                  </Text>
                </Box>
                <Divider />
              </>
            )}

            {showContractActions && (
              <>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} fontSize="sm">
                  <Text>
                    <strong>Estado contrato:</strong>{" "}
                    {formatContractStatus(contract.status)}
                  </Text>
                  <Text>
                    <strong>Pendiente de:</strong>{" "}
                    {contract.current_pending_department ?? "N/A"}
                  </Text>
                  <Text>
                    <strong>Tipo:</strong> {formatContractType(contract.type)}
                  </Text>
                  <Text>
                    <strong>Contrato:</strong> CT-{contract.id}
                  </Text>
                </SimpleGrid>
                <Divider />
              </>
            )}

            <HStack spacing={3}>
              {showContractActions && (
                <Button
                  leftIcon={<FileText size={16} />}
                  colorScheme="blue"
                  variant="outline"
                  onClick={() => onNavigate("contrato-form")}
                >
                  Abrir contrato
                </Button>
              )}
              {showComparativeActions && (
                <Button
                  leftIcon={<Eye size={16} />}
                  colorScheme="blue"
                  variant="outline"
                  onClick={() => setShowComparativoPreview(true)}
                >
                  Ver Comparativo
                </Button>
              )}
            </HStack>
            {isComparativesScope &&
              contract.comparative_status === "DRAFT" && (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  El comparativo está en borrador. Debes enviarlo desde "Editar"
                  para habilitar la aprobación.
                </Alert>
              )}
            <Box
              p={3}
              border="1px solid"
              borderColor={borderColor}
              rounded="md"
            >
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Documentos del expediente
              </Text>
              {contractDocsQuery.isFetching && (
                <Text fontSize="sm" color="gray.500">
                  Cargando documentos...
                </Text>
              )}
              {!contractDocsQuery.isFetching &&
                (contractDocsQuery.data?.length ?? 0) === 0 && (
                  <Text fontSize="sm" color="gray.500">
                    No hay documentos generados todavía.
                  </Text>
                )}
              <Stack spacing={2}>
                {(contractDocsQuery.data ?? [])
                  .filter((doc) => doc.doc_type !== "COMPARATIVE")
                  .map((doc) => {
                    return (
                      <HStack key={doc.id} justify="space-between">
                        <Text fontSize="sm">
                          {doc.doc_type} - {formatDate(doc.created_at)}
                        </Text>
                        <HStack spacing={2}>
                          <Button
                            size="xs"
                            colorScheme="blue"
                            variant="outline"
                            onClick={() => {
                              void onOpenDocumentPreview(
                                contract.id,
                                doc.doc_type,
                                contract.tenant_id ?? tenantId,
                              );
                            }}
                          >
                            Ver
                          </Button>
                          <Button
                            size="xs"
                            colorScheme="blue"
                            onClick={() => {
                              void onDownloadDocument(
                                contract.id,
                                doc.doc_type,
                                contract.tenant_id ?? tenantId,
                              );
                            }}
                          >
                            Descargar
                          </Button>
                        </HStack>
                      </HStack>
                    );
                  })}
              </Stack>
              {showComparativeActions && (() => {
                const comparativeDoc = (contractDocsQuery.data ?? []).find(
                  (doc) => doc.doc_type === "COMPARATIVE",
                );
                const comparativeDate = formatDate(
                  comparativeDoc?.created_at ?? contract.created_at,
                );
                const handleDownloadExcel = async () => {
                  if (!contract?.id) return;
                  try {
                    const { blob, filename } = await fetchComparativeSourceBlob(
                      contract.id,
                      contract.tenant_id ?? tenantId,
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = filename || `comparativo-CP-${contract.id}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error("Error descargando excel comparativo", err);
                  }
                };
                return (
                  <Text fontSize="sm" mt={3}>
                    <Text
                      as="span"
                      color="brand.600"
                      cursor="pointer"
                      _hover={{ textDecoration: "underline" }}
                      onClick={() => {
                        void handleDownloadExcel();
                      }}
                    >
                      COMPARATIVO - {comparativeDate}
                    </Text>
                  </Text>
                );
              })()}
            </Box>
            {showComparativeActions &&
              contract.comparative_status === "REJECTED" &&
              (() => {
                const reason =
                  (contract.comparative_data as any)?.rejected_reason ||
                  (contract as any).rejected_reason;
                if (!reason) return null;
                return (
                  <Box
                    p={3}
                    border="1px solid"
                    borderColor="red.200"
                    bg="red.50"
                    rounded="md"
                  >
                    <Text fontSize="sm" fontWeight="semibold" color="red.700" mb={1}>
                      Comparativo rechazado
                    </Text>
                    <Text fontSize="sm" color="gray.500" mb={1}>
                      Motivo de rechazo
                    </Text>
                    <Text fontSize="sm" color="gray.800">
                      {reason}
                    </Text>
                  </Box>
                );
              })()}
            <Modal
              isOpen={Boolean(previewUrl)}
              onClose={() => setPreviewUrl(null)}
              size="6xl"
              isCentered
            >
              <ModalOverlay />
              <ModalContent minH="80vh">
                <ModalHeader>{previewTitle}</ModalHeader>
                <ModalCloseButton />
                <ModalBody pb={4}>
                  {previewUrl ? (
                    <Box borderWidth="1px" rounded="md" overflow="hidden" h="70vh">
                      <iframe
                        src={previewUrl}
                        title={previewTitle}
                        style={{ width: "100%", height: "100%", border: "none" }}
                      />
                    </Box>
                  ) : null}
                </ModalBody>
              </ModalContent>
            </Modal>

            <HStack spacing={3} flexWrap="wrap">
              {showContractActions && canApproveAllPhases && (
                <Button
                  leftIcon={<Check size={16} />}
                  colorScheme="blue"
                  variant="solid"
                  isLoading={isApproving}
                  loadingText="Aprobando todo"
                  isDisabled={!canApproveContract}
                  onClick={() => onApproveAllPhases(decisionComment)}
                >
                  Aprobar todas las fases
                </Button>
              )}
              {showContractActions && (
                <Button
                  leftIcon={<Check size={16} />}
                  colorScheme="brand"
                  isDisabled={!canApproveContract}
                  isLoading={isApproving}
                  loadingText="Aprobando"
                  onClick={() => onApproveContract(decisionComment)}
                >
                  Aprobar contrato
                </Button>
              )}
            </HStack>

            <Modal
              isOpen={isRejectModalOpen}
              onClose={() => {
                if (isRejecting) return;
                setIsRejectModalOpen(false);
              }}
              size="2xl"
              isCentered
            >
              <ModalOverlay />
              <ModalContent>
                <ModalHeader>Rechazar comparativo</ModalHeader>
                <ModalCloseButton isDisabled={isRejecting} />
                <ModalBody>
                  <Text fontSize="sm" color="gray.500" mb={2}>
                    Comentarios de rechazo
                  </Text>
                  <Textarea
                    ref={rejectTextareaRef}
                    placeholder="Motivo del rechazo..."
                    value={rejectComment}
                    onChange={(event) => {
                      setRejectComment(event.target.value);
                      const el = event.target;
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }}
                    resize="none"
                    overflow="hidden"
                    minH="120px"
                  />
                </ModalBody>
                <ModalFooter justifyContent="flex-end" gap={3}>
                  <Button
                    variant="outline"
                    isDisabled={isRejecting}
                    onClick={() => setIsRejectModalOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    colorScheme="red"
                    isLoading={isRejecting}
                    loadingText="Rechazando"
                    isDisabled={!rejectComment.trim()}
                    onClick={() => {
                      onRejectComparative(rejectComment.trim());
                      setIsRejectModalOpen(false);
                    }}
                  >
                    Aceptar
                  </Button>
                </ModalFooter>
              </ModalContent>
            </Modal>
          </Stack>
        </Box>
      )}

      {isComparativesScope && (
        <Timeline
          title={`Historial del comparativo CP-${contract.id}`}
          subtitle="Seguimiento completo del flujo de aprobación"
          events={comparativeTimelineEvents}
          isLoading={comparativeApprovalsQuery.isLoading}
          cardBg={cardBg}
          borderColor={borderColor}
          footer={
            supplierWaitState.awaiting ? (
              <HStack mt={4} justify="flex-end">
                <Button
                  size="sm"
                  colorScheme="brand"
                  variant="outline"
                  isLoading={isSendingSupplierForm}
                  loadingText="Reenviando"
                  onClick={async () => {
                    if (onSendSupplierForm) await onSendSupplierForm();
                  }}
                >
                  {supplierWaitState.sentAt
                    ? "Reenviar formulario al proveedor"
                    : "Enviar formulario al proveedor"}
                </Button>
              </HStack>
            ) : null
          }
        />
      )}

      {showContractActions && (
        <Timeline
          title={`Historial del contrato CT-${contract.id}`}
          subtitle="Seguimiento completo del flujo de aprobación"
          events={timelineEvents}
          isLoading={contractReviewApprovalsQuery.isLoading}
          cardBg={cardBg}
          borderColor={borderColor}
        />
      )}

      <ComparativoPreviewModal
        isOpen={showComparativoPreview}
        onClose={() => setShowComparativoPreview(false)}
        contract={contract}
        tenantId={tenantId}
        canApproveComparative={canApproveComparative}
        isApproving={isApproving}
        isRejecting={isRejecting}
        onApproveComparative={showComparativeActions && canApproveComparative ? () => { onApproveComparative(decisionComment); setShowComparativoPreview(false); } : undefined}
        onRejectComparative={showComparativeActions && canRejectComparative ? () => { setShowComparativoPreview(false); setRejectComment(""); setIsRejectModalOpen(true); } : undefined}
      />
    </Stack>
  );
};

interface ContractsTabsNavProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  canManageWorkflow: boolean;
  viewTabs: ViewState[];
  viewMeta: ContractsViewMeta;
  navCardBg: string;
  navBorderColor: string;
  navGradient: string;
  navIconBg: string;
  navDescriptionColor: string;
  showHeader: boolean;
  onNewComparative?: () => void;
  canCreateComparative?: boolean;
}

const ContractsTabsNav: React.FC<ContractsTabsNavProps> = ({
  currentView,
  onChangeView,
  canManageWorkflow,
  viewTabs,
  viewMeta,
  navCardBg,
  navBorderColor,
  navGradient,
  navIconBg,
  navDescriptionColor,
  showHeader,
  onNewComparative,
  canCreateComparative = true,
}) => {
  const isNuevoActive = ["comparativo-upload", "comparativo-manual"].includes(currentView);
  const isComparativosActive = currentView === "documents";

  if (onNewComparative) {
    return (
      <Box position="relative" pt="44px">
        <Flex
          position="absolute"
          top="0"
          left={4}
          alignItems="flex-end"
          gap={2}
        >
          <Button
            display="inline-flex"
            alignItems="center"
            gap={2}
            px={5}
            h={isComparativosActive ? "44px" : "40px"}
            bg={isComparativosActive ? "brand.600" : "white"}
            color={isComparativosActive ? "white" : "gray.900"}
            fontSize="sm"
            fontWeight="semibold"
            borderTopRadius="xl"
            borderBottomRadius="0"
            border="1px solid"
            borderColor={isComparativosActive ? "brand.600" : "gray.200"}
            boxShadow="sm"
            zIndex={isComparativosActive ? 2 : 1}
            _hover={{ bg: isComparativosActive ? "brand.700" : "gray.50" }}
            transition="all 0.15s"
            onClick={() => onChangeView("documents")}
          >
            {viewMeta["documents"].icon}
            {viewMeta["documents"].navLabel}
          </Button>
          {canCreateComparative && (
            <Button
              display="inline-flex"
              alignItems="center"
              gap={2}
              px={5}
              h={isNuevoActive ? "44px" : "40px"}
              bg={isNuevoActive ? "brand.600" : "white"}
              color={isNuevoActive ? "white" : "gray.900"}
              fontSize="sm"
              fontWeight="semibold"
              borderTopRadius="xl"
              borderBottomRadius="0"
              border="1px solid"
              borderColor={isNuevoActive ? "brand.600" : "gray.200"}
              boxShadow="sm"
              zIndex={isNuevoActive ? 2 : 1}
              _hover={{ bg: isNuevoActive ? "brand.700" : "gray.50" }}
              transition="all 0.15s"
              onClick={onNewComparative}
            >
              <Plus size={16} />
              Nuevo comparativo
            </Button>
          )}
        </Flex>
      </Box>
    );
  }

  return (
    <Box
      border="1px solid"
      borderColor={navBorderColor}
      rounded="xl"
      bg={navCardBg}
      overflow="hidden"
      mb={6}
    >
      {showHeader && (
        <Box
          px={6}
          py={5}
          bgGradient={navGradient}
          borderBottom="1px solid"
          borderColor={navBorderColor}
        >
          <Flex
            align={{ base: "start", md: "center" }}
            justify="space-between"
            direction={{ base: "column", md: "row" }}
            gap={3}
          >
            <HStack spacing={3}>
              <Box p={2} rounded="md" bg={navIconBg}>
                {viewMeta[currentView].icon}
              </Box>
              <Box>
                <Text fontWeight="bold">{viewMeta[currentView].label}</Text>
                <Text fontSize="sm" color={navDescriptionColor}>
                  {viewMeta[currentView].description}
                </Text>
              </Box>
            </HStack>
            {currentView !== "dashboard" && (
              <Button
                colorScheme="brand"
                variant="solid"
                onClick={() => onChangeView("dashboard")}
              >
                Volver al panel
              </Button>
            )}
          </Flex>
        </Box>
      )}
      <Flex
        gap={1}
        flexWrap="wrap"
        px={4}
        py={3}
      >
        {viewTabs.filter((v) => !["comparativo-upload", "comparativo-review", "comparativo-manual", "approval-panel"].includes(v)).map((view) => {
          const isDisabled = view === "workflow-config" && !canManageWorkflow;
          const isActive = currentView === view;
          return (
            <Button
              key={view}
              leftIcon={viewMeta[view].icon}
              px={4}
              py={2}
              borderRadius="10px"
              fontSize="sm"
              fontWeight={isActive ? 600 : 500}
              bg={isActive ? "brand.600" : "transparent"}
              color={isActive ? "white" : "inherit"}
              _hover={{
                bg: isActive ? "brand.600" : "gray.50",
                color: isActive ? "white" : "inherit",
              }}
              onClick={() => onChangeView(view)}
              isDisabled={isDisabled}
            >
              {viewMeta[view].navLabel}
            </Button>
          );
        })}
      </Flex>
    </Box>
  );
};

const timelinePulse = keyframes`
  0%   { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.45); }
  70%  { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
  100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
`;

const timelineSpin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;

type TimelineStatus = TimelineEventItem["status"];

const TIMELINE_PALETTE: Record<
  TimelineStatus,
  {
    dotBg: string;
    dotBorder: string;
    iconColor: string;
    line: string;
    badgeBg: string;
    badgeColor: string;
    badgeLabel: string;
    commentBg: string;
    commentBorder: string;
    commentColor: string;
  }
> = {
  completed: {
    dotBg: "green.500",
    dotBorder: "green.500",
    iconColor: "white",
    line: "green.300",
    badgeBg: "green.50",
    badgeColor: "green.700",
    badgeLabel: "Completado",
    commentBg: "green.50",
    commentBorder: "green.200",
    commentColor: "green.800",
  },
  current: {
    dotBg: "blue.500",
    dotBorder: "blue.500",
    iconColor: "white",
    line: "blue.200",
    badgeBg: "blue.50",
    badgeColor: "blue.700",
    badgeLabel: "En curso",
    commentBg: "blue.50",
    commentBorder: "blue.200",
    commentColor: "blue.800",
  },
  pending: {
    dotBg: "white",
    dotBorder: "gray.300",
    iconColor: "gray.400",
    line: "gray.200",
    badgeBg: "gray.100",
    badgeColor: "gray.600",
    badgeLabel: "Pendiente",
    commentBg: "gray.50",
    commentBorder: "gray.200",
    commentColor: "gray.600",
  },
  warning: {
    dotBg: "red.500",
    dotBorder: "red.500",
    iconColor: "white",
    line: "red.200",
    badgeBg: "red.50",
    badgeColor: "red.700",
    badgeLabel: "Atención",
    commentBg: "red.50",
    commentBorder: "red.200",
    commentColor: "red.800",
  },
};

const renderTimelineIcon = (status: TimelineStatus) => {
  if (status === "completed") return <Check size={14} strokeWidth={3} />;
  if (status === "current")
    return (
      <Box
        as={Loader2}
        boxSize="14px"
        animation={`${timelineSpin} 1.4s linear infinite`}
      />
    );
  if (status === "warning") return <AlertTriangle size={14} strokeWidth={2.5} />;
  return <Clock size={13} strokeWidth={2.5} />;
};

const looksLikeDate = (s?: string) => Boolean(s && /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}/.test(s));

type TimelineGroup =
  | { kind: "root"; event: TimelineEventItem; index: number }
  | { kind: "children"; parentIndex: number; items: TimelineEventItem[] };

const groupTimelineEvents = (events: TimelineEventItem[]): TimelineGroup[] => {
  const groups: TimelineGroup[] = [];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.indent) {
      const last = groups[groups.length - 1];
      if (last && last.kind === "children") {
        last.items.push(ev);
      } else {
        groups.push({ kind: "children", parentIndex: i - 1, items: [ev] });
      }
    } else {
      groups.push({ kind: "root", event: ev, index: i });
    }
  }
  return groups;
};

const deriveGlobalStatus = (
  events: TimelineEventItem[],
): { status: TimelineStatus; label: string; lastUpdate?: string } => {
  if (events.length === 0) {
    return { status: "pending", label: "Sin eventos" };
  }
  // Los eventos de ciclos pasados (isHistorical) no condicionan el estado
  // global: un rechazo histórico no debe pintar el timeline como "Rechazado"
  // cuando el ciclo en curso ya está aprobado o avanzando.
  const activeEvents = events.filter((e) => !e.isHistorical);
  const scope = activeEvents.length > 0 ? activeEvents : events;
  const hasWarning = scope.some((e) => e.status === "warning");
  const hasCurrent = scope.some((e) => e.status === "current");
  const allCompleted = scope.every((e) => e.status === "completed");
  const status: TimelineStatus = hasWarning
    ? "warning"
    : allCompleted
      ? "completed"
      : hasCurrent
        ? "current"
        : "pending";
  const labelByStatus: Record<TimelineStatus, string> = {
    completed: "Aprobado",
    current: "En curso",
    pending: "Pendiente",
    warning: "Rechazado",
  };
  const datedMeta = [...events]
    .reverse()
    .map((e) => e.meta)
    .find((m) => looksLikeDate(m));
  return { status, label: labelByStatus[status], lastUpdate: datedMeta };
};

const Timeline: React.FC<{
  events: TimelineEventItem[];
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
  cardBg?: string;
  borderColor?: string;
  footer?: React.ReactNode;
}> = ({
  events,
  isLoading = false,
  title,
  subtitle,
  cardBg = "white",
  borderColor = "gray.200",
  footer,
}) => {
  const groups = useMemo(() => groupTimelineEvents(events), [events]);
  const global = useMemo(() => deriveGlobalStatus(events), [events]);
  const globalPalette = TIMELINE_PALETTE[global.status];

  const header = title ? (
    <Box
      px={6}
      py={4}
      borderBottom="1px solid"
      borderColor={borderColor}
    >
      <HStack justify="space-between" align="start" spacing={4} flexWrap="wrap">
        <Box minW={0}>
          <Text fontWeight="bold" fontSize="md" color="gray.800">
            {title}
          </Text>
          {subtitle && (
            <Text fontSize="xs" color="gray.500" mt={0.5}>
              {subtitle}
            </Text>
          )}
        </Box>
        <Box textAlign="right" minW={0}>
          {!isLoading && events.length > 0 && (
            <Badge
              px={2.5}
              py={1}
              borderRadius="full"
              fontSize="xs"
              fontWeight="semibold"
              bg={globalPalette.badgeBg}
              color={globalPalette.badgeColor}
              display="inline-flex"
              alignItems="center"
              gap="6px"
            >
              <Box
                as="span"
                display="inline-block"
                w="8px"
                h="8px"
                borderRadius="full"
                bg={globalPalette.dotBg}
              />
              {global.label}
            </Badge>
          )}
          {global.lastUpdate && (
            <HStack
              spacing={1.5}
              color="gray.500"
              fontSize="xs"
              mt={1.5}
              justify="flex-end"
            >
              <Box as={Calendar} boxSize="12px" flexShrink={0} />
              <Text>Última actualización: {global.lastUpdate}</Text>
            </HStack>
          )}
        </Box>
      </HStack>
    </Box>
  ) : null;

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <HStack spacing={3} color="gray.500" py={2}>
        <Spinner size="sm" color="brand.500" />
        <Text fontSize="sm">Cargando historial...</Text>
      </HStack>
    );
  } else if (events.length === 0) {
    body = (
      <Box
        py={6}
        textAlign="center"
        color="gray.500"
        fontSize="sm"
        border="1px dashed"
        borderColor="gray.200"
        rounded="lg"
      >
        Sin eventos registrados.
      </Box>
    );
  } else {
    const DOT = 36;
    const TRUNK_LEFT = (DOT / 2) - 1;

    const rootGroups = groups.filter((g) => g.kind === "root") as Extract<
      TimelineGroup,
      { kind: "root" }
    >[];
    const childrenByParent = new Map<number, TimelineEventItem[]>();
    groups.forEach((g) => {
      if (g.kind === "children") {
        childrenByParent.set(g.parentIndex, g.items);
      }
    });

    body = (
      <Stack spacing={5}>
        {rootGroups.map((g, idx) => {
          const event = g.event;
          const palette = TIMELINE_PALETTE[event.status];
          const isLast = idx === rootGroups.length - 1;
          const nextEvent = rootGroups[idx + 1]?.event;
          const nextPalette = nextEvent
            ? TIMELINE_PALETTE[nextEvent.status]
            : palette;
          const trunkColor =
            event.status === "completed" ? palette.line : nextPalette.line;
          const trunkStyle: "solid" | "dashed" =
            event.status === "completed" ? "solid" : "dashed";
          const metaIsDate = looksLikeDate(event.meta);
          const children = childrenByParent.get(g.index) ?? [];

          return (
            <Box
              key={`${event.title}-${event.meta ?? ""}-${event.comment ?? ""}-${g.index}`}
              position="relative"
              role="group"
            >
              {!isLast && (
                <Box
                  position="absolute"
                  left={`${TRUNK_LEFT}px`}
                  top={`${DOT}px`}
                  bottom="-20px"
                  width={trunkStyle === "solid" ? "2px" : "0"}
                  borderLeft={
                    trunkStyle === "dashed"
                      ? `2px dashed`
                      : undefined
                  }
                  borderLeftColor={
                    trunkStyle === "dashed" ? trunkColor : undefined
                  }
                  bg={trunkStyle === "solid" ? trunkColor : undefined}
                  borderRadius={trunkStyle === "solid" ? "full" : undefined}
                  transition="background 0.2s ease"
                />
              )}

              <HStack align="start" spacing={4} position="relative">
                <Box
                  flexShrink={0}
                  w={`${DOT}px`}
                  h={`${DOT}px`}
                  rounded="full"
                  border="2px solid"
                  borderColor={palette.dotBorder}
                  bg={palette.dotBg}
                  color={palette.iconColor}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  position="relative"
                  zIndex={1}
                  boxShadow={event.status === "pending" ? "none" : "sm"}
                  animation={
                    event.status === "current"
                      ? `${timelinePulse} 2s ease-out infinite`
                      : undefined
                  }
                  transition="all 0.2s ease"
                >
                  {renderTimelineIcon(event.status)}
                </Box>

                <Box flex="1" minW={0} pt={0.5}>
                  <HStack
                    spacing={2}
                    align="center"
                    flexWrap="wrap"
                    mb={event.meta ? 1 : 0}
                  >
                    <Text
                      fontWeight="semibold"
                      fontSize="sm"
                      color={
                        event.status === "pending" ? "gray.500" : "gray.800"
                      }
                      letterSpacing="0.01em"
                    >
                      {event.title}
                    </Text>
                    <Badge
                      px={2}
                      py={0.5}
                      borderRadius="full"
                      fontSize="2xs"
                      fontWeight="semibold"
                      bg={palette.badgeBg}
                      color={palette.badgeColor}
                      letterSpacing="0.02em"
                    >
                      {palette.badgeLabel}
                    </Badge>
                  </HStack>

                  {event.meta && (
                    <HStack
                      spacing={1.5}
                      color="gray.500"
                      fontSize="xs"
                      mb={event.comment || children.length > 0 ? 2 : 0}
                    >
                      <Box
                        as={metaIsDate ? Calendar : User}
                        boxSize="12px"
                        flexShrink={0}
                      />
                      <Text noOfLines={1}>{event.meta}</Text>
                    </HStack>
                  )}

                  {event.comment && (
                    <HStack
                      align="start"
                      spacing={2}
                      mt={1}
                      px={3}
                      py={2.5}
                      bg={palette.commentBg}
                      border="1px solid"
                      borderColor={palette.commentBorder}
                      borderRadius="md"
                    >
                      <Box
                        as={
                          event.status === "warning"
                            ? AlertTriangle
                            : event.status === "current"
                              ? Clock
                              : event.status === "pending"
                                ? AlertCircle
                                : FileText
                        }
                        boxSize="14px"
                        mt="2px"
                        color={palette.commentColor}
                        flexShrink={0}
                      />
                      <Text
                        fontSize="xs"
                        color={palette.commentColor}
                        lineHeight="1.5"
                      >
                        {event.comment}
                      </Text>
                    </HStack>
                  )}

                  {children.length > 0 && (
                    <Box
                      mt={3}
                      bg={palette.commentBg}
                      border="1px solid"
                      borderColor={palette.commentBorder}
                      borderRadius="md"
                      overflow="hidden"
                    >
                      <Box
                        px={3}
                        py={2}
                        borderBottom="1px solid"
                        borderColor={palette.commentBorder}
                      >
                        <Text
                          fontSize="xs"
                          fontWeight="semibold"
                          color={palette.commentColor}
                          textTransform="none"
                        >
                          Aprobaciones internas
                        </Text>
                      </Box>
                      <Stack spacing={0}>
                        {children.map((child, ci) => {
                          const cp = TIMELINE_PALETTE[child.status];
                          const childMetaIsDate = looksLikeDate(child.meta);
                          return (
                            <HStack
                              key={`child-${ci}-${child.title}`}
                              align="center"
                              spacing={3}
                              px={3}
                              py={2.5}
                              borderTop={ci === 0 ? undefined : "1px solid"}
                              borderColor="blackAlpha.100"
                              flexWrap="wrap"
                            >
                              <Box
                                flexShrink={0}
                                w="22px"
                                h="22px"
                                rounded="full"
                                border="1.5px solid"
                                borderColor={cp.dotBorder}
                                bg={cp.dotBg}
                                color={cp.iconColor}
                                display="flex"
                                alignItems="center"
                                justifyContent="center"
                              >
                                {child.status === "completed" ? (
                                  <Check size={11} strokeWidth={3} />
                                ) : child.status === "warning" ? (
                                  <X size={11} strokeWidth={3} />
                                ) : child.status === "current" ? (
                                  <Box
                                    as={Loader2}
                                    boxSize="11px"
                                    animation={`${timelineSpin} 1.4s linear infinite`}
                                  />
                                ) : (
                                  <Clock size={10} strokeWidth={2.5} />
                                )}
                              </Box>
                              <Text
                                fontSize="sm"
                                fontWeight="medium"
                                color="gray.800"
                                flexShrink={0}
                              >
                                {child.title}
                              </Text>
                              {child.comment && (
                                <Text
                                  fontSize="sm"
                                  color="gray.700"
                                  flex="1"
                                  minW="120px"
                                  noOfLines={1}
                                >
                                  {child.comment}
                                </Text>
                              )}
                              {child.meta && (
                                <HStack
                                  spacing={1.5}
                                  color="gray.500"
                                  fontSize="xs"
                                  flexShrink={0}
                                >
                                  <Box
                                    as={childMetaIsDate ? Calendar : User}
                                    boxSize="12px"
                                  />
                                  <Text>{child.meta}</Text>
                                </HStack>
                              )}
                              <Badge
                                px={2}
                                py={0.5}
                                borderRadius="full"
                                fontSize="2xs"
                                fontWeight="semibold"
                                bg={cp.badgeBg}
                                color={cp.badgeColor}
                              >
                                {cp.badgeLabel}
                              </Badge>
                            </HStack>
                          );
                        })}
                      </Stack>
                    </Box>
                  )}
                </Box>
              </HStack>
            </Box>
          );
        })}
      </Stack>
    );
  }

  if (!title) {
    return (
      <Box>
        {body}
        {footer}
      </Box>
    );
  }

  return (
    <Box
      bg={cardBg}
      border="1px solid"
      borderColor={borderColor}
      rounded="xl"
      overflow="hidden"
    >
      {header}
      <Box p={6}>
        {body}
        {footer}
      </Box>
    </Box>
  );
};

// ============================================================================
// COMPONENTES AUXILIARES
// ============================================================================

interface SectionProps {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => {
  return (
    <Box>
      {title ? (
        <Text
          fontWeight="bold"
          textTransform="uppercase"
          letterSpacing="wider"
          fontSize="sm"
          color="gray.700"
          mb={4}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </Box>
  );
};

interface InputFieldProps {
  label: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  helper?: string;
  suffix?: string;
  type?: string;
  required?: boolean;
  isInvalid?: boolean;
  fullWidth?: boolean;
  locked?: boolean;
  min?: string;
  max?: string;
  onChange?: (value: string) => void;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  value,
  defaultValue,
  disabled,
  helper,
  suffix,
  type = "text",
  required = false,
  isInvalid = false,
  fullWidth,
  locked,
  min,
  max,
  onChange,
}) => {
  return (
    <Box gridColumn={fullWidth ? { base: "span 1", md: "span 2" } : undefined}>
      <Text fontSize="sm" fontWeight="medium" mb={2}>
        {label}
        {required ? " *" : ""}
      </Text>
      <Box position="relative">
        <Input
          type={type}
          {...(value !== undefined ? { value } : { defaultValue })}
          isRequired={required}
          isInvalid={isInvalid}
          isReadOnly={disabled && !locked}
          isDisabled={locked}
          bg={disabled || locked ? "gray.50" : undefined}
          pr={suffix ? 10 : undefined}
          min={min}
          max={max}
          onChange={(event) => onChange?.(event.target.value)}
        />
        {suffix && (
          <Text
            position="absolute"
            right={3}
            top="50%"
            transform="translateY(-50%)"
            fontSize="sm"
            color="gray.500"
          >
            {suffix}
          </Text>
        )}
      </Box>
      {helper && (
        <Text fontSize="xs" color="gray.500" mt={1}>
          {helper}
        </Text>
      )}
    </Box>
  );
};

interface SelectFieldProps {
  label: string;
  options: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

const SelectField: React.FC<SelectFieldProps> = ({
  label,
  options,
  value,
  defaultValue,
  onChange,
}) => {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" mb={2}>
        {label}
      </Text>
      <Box
        as="select"
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        border="1px solid"
        borderColor="gray.200"
        rounded="md"
        px={3}
        py={2}
      >
        {options.map((option) => (
          <Box as="option" key={option} value={option}>
            {option}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// ============================================================================
// PANEL DE FLUJO FASES 3-8
// ============================================================================

interface WorkflowActionsPanelProps {
  contract: Contract;
  tenantId?: number;
  isAdmin?: boolean;
  roleName?: string;
  onActivate: (subtype?: string) => void;
  onSelectTemplate: (templateId: number) => void;
  onGenerateDocument: () => void;
  onAdminApproveDraft: () => void;
  onReviewDecision: (approved: boolean, comment?: string) => void;
  onSendForSignature: () => void;
  onOpenDocumentPreview: (
    contractId: number,
    docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
    tenantId?: number,
  ) => Promise<void>;
  onDownloadDocument: (
    contractId: number,
    docType: "COMPARATIVE" | "CONTRACT" | "SIGNED",
    tenantId?: number,
  ) => Promise<void>;
  isLoading?: boolean;
}

const WorkflowActionsPanel: React.FC<WorkflowActionsPanelProps> = ({
  contract,
  tenantId,
  isAdmin,
  roleName,
  onActivate,
  onSelectTemplate,
  onGenerateDocument,
  onAdminApproveDraft,
  onReviewDecision,
  onSendForSignature,
  onOpenDocumentPreview,
  onDownloadDocument,
  isLoading,
}) => {
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const toast = useToast();
  const [reviewComment, setReviewComment] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const autoTemplateSelectionKeyRef = useRef<string | null>(null);
  const autoGenerateKeyRef = useRef<string | null>(null);
  const { data: currentUserForActions } = useCurrentUser();

  const normalizedRole = (roleName ?? "").toLowerCase();
  const isAdminRole = Boolean(isAdmin);
  const isComprasRole = normalizedRole.includes("compras");
  const isJuridicoRole = normalizedRole.includes("juridico") || normalizedRole.includes("jur");
  const canReview = isAdminRole || isComprasRole || isJuridicoRole;

  const templatesQuery = useQuery({
    queryKey: ["contract-templates", tenantId, contract.type],
    queryFn: () => fetchContractTemplates(tenantId, contract.type?.toLowerCase()),
    enabled: contract.status === "PENDING_TEMPLATE",
  });

  const reviewApprovalsQuery = useQuery<ReviewApproval[]>({
    queryKey: ["review-approvals", contract.id],
    queryFn: () => fetchReviewApprovals(contract.id, tenantId),
    enabled:
      contract.status === "PENDING_DATA_VALIDATION" ||
      contract.status === "PENDING_REVIEW" ||
      contract.status === "FULLY_APPROVED" ||
      contract.status === "SENT_FOR_SIGNATURE" ||
      contract.status === "SIGNED" ||
      contract.status === "REJECTED",
  });

  const { status } = contract;

  useEffect(() => {
    if (!isAdminRole) return;
    if (status !== "PENDING_TEMPLATE") return;
    if (templatesQuery.isLoading) return;
    if (isLoading) return;

    const templates = templatesQuery.data ?? [];
    if (templates.length !== 1) return;

    const template = templates[0];
    const key = `${contract.id}:${template.id}`;
    if (autoTemplateSelectionKeyRef.current === key) return;
    autoTemplateSelectionKeyRef.current = key;

    setSelectedTemplateId(template.id);
    onSelectTemplate(template.id);
    toast({
      status: "info",
      title: "Plantilla seleccionada automáticamente",
      description: `Se aplicó "${template.name}" por tipo de contrato.`,
    });
  }, [
    contract.id,
    isAdminRole,
    isLoading,
    onSelectTemplate,
    status,
    templatesQuery.data,
    templatesQuery.isLoading,
    toast,
  ]);

  useEffect(() => {
    if (!isAdminRole) return;
    if (status !== "PENDING_DATA_VALIDATION") return;
    if (isLoading) return;
    // Solo auto-generar la primera vez (cuando aún no hay slots de revisión).
    // Si el contrato vuelve a PENDING_DATA_VALIDATION tras un rechazo o tras
    // que Jurídico lo modificara, la regeneración debe ser explícita: Admin
    // revisa los cambios antes de enviar a revisión.
    if (reviewApprovalsQuery.isLoading) return;
    const hasReviewHistory = (reviewApprovalsQuery.data ?? []).length > 0;
    if (hasReviewHistory) return;

    const key = `${contract.id}:${status}:${contract.updated_at}`;
    if (autoGenerateKeyRef.current === key) return;
    autoGenerateKeyRef.current = key;

    onGenerateDocument();
    toast({
      status: "info",
      title: "Generación automática iniciada",
      description: "Se está generando el documento del contrato.",
    });
  }, [
    contract.id,
    contract.updated_at,
    isAdminRole,
    isLoading,
    onGenerateDocument,
    reviewApprovalsQuery.data,
    reviewApprovalsQuery.isLoading,
    status,
    toast,
  ]);

  if (!["PENDING_TEMPLATE", "PENDING_DATA_VALIDATION", "PENDING_REVIEW", "FULLY_APPROVED", "SENT_FOR_SIGNATURE", "SIGNED"].includes(status) &&
      !(status === "DRAFT" && contract.comparative_status === "APPROVED")) {
    return null;
  }

  return (
    <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" overflow="hidden" mt={4}>
      <Box px={6} py={3} bg="blue.50" borderBottom="1px solid" borderColor={borderColor}>
        <HStack spacing={2}>
          <FileText size={16} color="#2b6cb0" />
          <Text fontWeight="bold" fontSize="sm" color="blue.700">
            Flujo de contrato — {formatContractStatus(status)}
          </Text>
        </HStack>
      </Box>
      <Stack spacing={4} p={6}>

        {/* BORRADOR ADMINISTRATIVO AUTO-GENERADO */}
        {status === "DRAFT" && contract.comparative_status === "APPROVED" && isAdminRole && (
          <Stack spacing={3}>
            <Alert status="success" borderRadius="md">
              <AlertIcon />
              El contrato se ha generado automáticamente y queda en borrador para Administración.
            </Alert>
          </Stack>
        )}

        {/* FASE 4 — Seleccionar plantilla */}
        {status === "PENDING_TEMPLATE" && isAdminRole && (
          <Stack spacing={3}>
            <Text fontSize="sm" fontWeight="semibold">Selecciona la plantilla del contrato:</Text>
            {templatesQuery.isLoading && <Spinner size="sm" />}
            {(templatesQuery.data ?? []).length === 0 && !templatesQuery.isLoading && (
              <Alert status="warning" borderRadius="md">
                <AlertIcon />
                No hay plantillas activas para el tipo {contract.type}. Sube una desde la configuración.
              </Alert>
            )}
            <Stack spacing={2}>
              {(templatesQuery.data ?? []).map((tpl: ContractTemplate) => (
                <HStack
                  key={tpl.id}
                  p={3}
                  border="2px solid"
                  borderColor={selectedTemplateId === tpl.id ? "blue.400" : borderColor}
                  rounded="md"
                  cursor="pointer"
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  bg={selectedTemplateId === tpl.id ? "blue.50" : undefined}
                >
                  <FileText size={16} />
                  <Box flex={1}>
                    <Text fontSize="sm" fontWeight="semibold">{tpl.name}</Text>
                    <Text fontSize="xs" color="gray.500">{tpl.original_filename} · {tpl.variables.length} variables</Text>
                  </Box>
                  {selectedTemplateId === tpl.id && <Check size={16} color="blue" />}
                </HStack>
              ))}
            </Stack>
            <Button
              colorScheme="blue"
              leftIcon={<Check size={16} />}
              isDisabled={!selectedTemplateId}
              isLoading={isLoading}
              onClick={() => { if (selectedTemplateId) onSelectTemplate(selectedTemplateId); }}
            >
              Confirmar plantilla
            </Button>
          </Stack>
        )}

        {/* FASE 5/6 — Generar documento + 6.5 Aprobar borrador (Admin) */}
        {status === "PENDING_DATA_VALIDATION" && isAdminRole && (
          <Stack spacing={3}>
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              Fase borrador. Solo Administración puede editar y aprobar.
              Tras aprobar, se notificará a Jurídico, Jefe de Obra y Director
              Técnico para revisión paralela.
            </Alert>
            <HStack spacing={3} flexWrap="wrap">
              <Button
                variant="outline"
                colorScheme="blue"
                leftIcon={<Eye size={16} />}
                onClick={() => {
                  void onOpenDocumentPreview(
                    contract.id,
                    "CONTRACT",
                    contract.tenant_id ?? tenantId,
                  );
                }}
              >
                Ver borrador
              </Button>
              <Button
                variant="outline"
                colorScheme="gray"
                leftIcon={<Send size={16} />}
                isLoading={isLoading}
                onClick={onGenerateDocument}
              >
                Regenerar documento
              </Button>
              <Button
                colorScheme="green"
                leftIcon={<Check size={16} />}
                isLoading={isLoading}
                onClick={onAdminApproveDraft}
              >
                Aprobar borrador y enviar a revisión
              </Button>
            </HStack>
          </Stack>
        )}

        {/* FASE 7 — Revisión multi-rol */}
        {status === "PENDING_REVIEW" && (() => {
          // Filas del ciclo activo (último cycle_number).
          const allRows = reviewApprovalsQuery.data ?? [];
          const maxCycle = allRows.reduce(
            (m, r) => Math.max(m, r.cycle_number ?? 1),
            0,
          ) || 1;
          const activeRows = allRows.filter(
            (r) => (r.cycle_number ?? 1) === maxCycle,
          );
          const ROLE_ORDER = ["ADMIN", "JURIDICO", "JEFE_OBRA", "DIRECTOR_TECNICO"] as const;
          const ROLE_LABEL: Record<(typeof ROLE_ORDER)[number], string> = {
            ADMIN: "Administración",
            JURIDICO: "Jurídico",
            JEFE_OBRA: "Jefe de Obra",
            DIRECTOR_TECNICO: "Director Técnico",
          };
          const byRole = new Map<string, ReviewApproval>(
            activeRows.map((r) => [(r.approver_role ?? "").toUpperCase(), r]),
          );
          // Slot del usuario actual (si tiene uno PENDING en este ciclo).
          const myRows = activeRows.filter(
            (r) =>
              r.status === "PENDING" &&
              ((isAdminRole && (r.approver_role ?? "").toUpperCase() === "ADMIN") ||
                (isJuridicoRole && (r.approver_role ?? "").toUpperCase() === "JURIDICO") ||
                (normalizedRole.includes("jefe") &&
                  (r.approver_role ?? "").toUpperCase() === "JEFE_OBRA") ||
                ((normalizedRole.includes("director") ||
                  normalizedRole.includes("dt")) &&
                  (r.approver_role ?? "").toUpperCase() === "DIRECTOR_TECNICO")),
          );
          const hasPendingSlot = myRows.length > 0;
          const userCapApprove = Boolean(
            isAdmin || currentUserForActions?.can_approve_contract,
          );
          const userCapReject = Boolean(
            isAdmin || currentUserForActions?.can_reject_contract,
          );
          // Gate secuencial: hasta que Administración no apruebe su slot, los
          // demás roles (JURIDICO/JO/DT) no pueden decidir. ADMIN sí (es su
          // turno). Espejo de la regla del backend en submit_role_decision.
          const adminSlotApproved =
            (byRole.get("ADMIN")?.status ?? "PENDING") === "APPROVED";
          const isAdminTurn = myRows.some(
            (r) => (r.approver_role ?? "").toUpperCase() === "ADMIN",
          );
          const blockedByAdminFirst = !adminSlotApproved && !isAdminTurn;
          const showDecisionButtons =
            hasPendingSlot && (userCapApprove || userCapReject);

          return (
            <Stack spacing={4}>
              <HStack spacing={3} flexWrap="wrap">
                <Button
                  variant="outline"
                  colorScheme="blue"
                  leftIcon={<Eye size={16} />}
                  onClick={() => {
                    void onOpenDocumentPreview(
                      contract.id,
                      "CONTRACT",
                      contract.tenant_id ?? tenantId,
                    );
                  }}
                >
                  Ver contrato generado
                </Button>
                <Button
                  variant="outline"
                  colorScheme="gray"
                  leftIcon={<Download size={16} />}
                  onClick={() => {
                    void onDownloadDocument(
                      contract.id,
                      "CONTRACT",
                      contract.tenant_id ?? tenantId,
                    );
                  }}
                >
                  Descargar contrato
                </Button>
              </HStack>
              <Box
                border="1px solid"
                borderColor={borderColor}
                rounded="md"
                overflow="hidden"
                bg="gray.50"
                _dark={{ bg: "gray.700" }}
              >
                <Box
                  px={3}
                  py={2}
                  borderBottom="1px solid"
                  borderColor={borderColor}
                >
                  <Text fontSize="xs" fontWeight="semibold" color="gray.700">
                    Aprobaciones internas (ciclo {maxCycle})
                  </Text>
                </Box>
                <Stack spacing={0} bg={cardBg}>
                  {ROLE_ORDER.map((role, idx) => {
                    const row = byRole.get(role);
                    const slotStatus = row?.status ?? "PENDING";
                    const palette =
                      slotStatus === "APPROVED"
                        ? { dotBg: "green.500", dotBorder: "green.500", iconColor: "white" }
                        : slotStatus === "REJECTED"
                          ? { dotBg: "red.500", dotBorder: "red.500", iconColor: "white" }
                          : { dotBg: "gray.100", dotBorder: "gray.300", iconColor: "gray.500" };
                    return (
                      <HStack
                        key={role}
                        align="center"
                        spacing={3}
                        px={3}
                        py={2.5}
                        borderTop={idx === 0 ? undefined : "1px solid"}
                        borderColor="blackAlpha.100"
                        flexWrap="wrap"
                      >
                        <Box
                          flexShrink={0}
                          w="22px"
                          h="22px"
                          rounded="full"
                          border="1.5px solid"
                          borderColor={palette.dotBorder}
                          bg={palette.dotBg}
                          color={palette.iconColor}
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                        >
                          {slotStatus === "APPROVED" ? (
                            <Check size={11} strokeWidth={3} />
                          ) : slotStatus === "REJECTED" ? (
                            <X size={11} strokeWidth={3} />
                          ) : (
                            <Clock size={10} strokeWidth={2.5} />
                          )}
                        </Box>
                        <Text
                          fontSize="sm"
                          fontWeight="medium"
                          color="gray.800"
                          flexShrink={0}
                          _dark={{ color: "gray.100" }}
                        >
                          {slotStatus === "APPROVED"
                            ? `APROBADO POR ${ROLE_LABEL[role].toUpperCase()}`
                            : slotStatus === "REJECTED"
                              ? `RECHAZADO POR ${ROLE_LABEL[role].toUpperCase()}`
                              : ROLE_LABEL[role]}
                        </Text>
                        {row?.decided_by_name && (
                          <Text
                            fontSize="sm"
                            color="gray.700"
                            flex="1"
                            minW="120px"
                            noOfLines={1}
                            _dark={{ color: "gray.300" }}
                          >
                            {row.decided_by_name}
                          </Text>
                        )}
                        {row?.decided_at && (
                          <Text fontSize="xs" color="gray.500">
                            {formatDateTime(row.decided_at)}
                          </Text>
                        )}
                        <Badge
                          colorScheme={
                            slotStatus === "APPROVED"
                              ? "green"
                              : slotStatus === "REJECTED"
                                ? "red"
                                : "gray"
                          }
                          ml="auto"
                        >
                          {slotStatus === "APPROVED"
                            ? "COMPLETADO"
                            : slotStatus === "REJECTED"
                              ? "RECHAZADO"
                              : "PENDIENTE"}
                        </Badge>
                      </HStack>
                    );
                  })}
                </Stack>
              </Box>

              {showDecisionButtons && (
                <>
                  {blockedByAdminFirst && (
                    <Alert status="warning" borderRadius="md">
                      <AlertIcon />
                      Administración aún no ha aprobado este ciclo. Tu
                      decisión queda bloqueada hasta entonces.
                    </Alert>
                  )}
                  <Textarea
                    placeholder="Comentario (obligatorio si rechazas)..."
                    rows={2}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    isDisabled={blockedByAdminFirst}
                  />
                  <HStack spacing={3} flexWrap="wrap">
                    <Button
                      colorScheme="brand"
                      leftIcon={<Check size={16} />}
                      isLoading={isLoading}
                      isDisabled={!userCapApprove || blockedByAdminFirst}
                      onClick={() => onReviewDecision(true, reviewComment || undefined)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      colorScheme="orange"
                      variant="outline"
                      leftIcon={<AlertCircle size={16} />}
                      isLoading={isLoading}
                      isDisabled={
                        !userCapReject ||
                        !reviewComment.trim() ||
                        blockedByAdminFirst
                      }
                      onClick={() => {
                        if (!reviewComment.trim()) {
                          toast({ status: "warning", title: "Comentario obligatorio al rechazar" });
                          return;
                        }
                        onReviewDecision(false, reviewComment);
                      }}
                    >
                      Rechazar
                    </Button>
                  </HStack>
                </>
              )}
              {!showDecisionButtons && hasPendingSlot && (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  Tu rol tiene un slot pendiente, pero no dispone de los
                  permisos can_approve_contract / can_reject_contract.
                </Alert>
              )}
              {!hasPendingSlot && (
                <Alert status="info" borderRadius="md">
                  <AlertIcon />
                  {isAdminRole
                    ? "Administración ya aprobó este ciclo. Esperando a Jurídico, Jefe de Obra y Director Técnico."
                    : `No tienes ninguna aprobación pendiente sobre este contrato en el ciclo actual.`}
                </Alert>
              )}
              {isJuridicoRole && (
                <Alert status="info" borderRadius="md" variant="left-accent">
                  <AlertIcon />
                  <Box fontSize="sm">
                    Como Jurídico también puedes <strong>editar</strong> el
                    contrato desde el formulario. Al guardar cambios, se
                    devolverá automáticamente a Administración con los
                    datos actualizados (un ciclo nuevo se abrirá tras la
                    re-aprobación).
                  </Box>
                </Alert>
              )}
            </Stack>
          );
        })()}

        {/* FASE 8 — Enviar a firma */}
        {status === "FULLY_APPROVED" && isAdminRole && (
          <Stack spacing={3}>
            <Alert status="success" borderRadius="md">
              <AlertIcon />
              Todos los departamentos han aprobado. Puedes enviar el contrato a Viafirma para firma digital.
            </Alert>
            {(reviewApprovalsQuery.data ?? []).map((approval: ReviewApproval) => (
              <HStack key={approval.id} p={2} fontSize="sm">
                <Badge colorScheme="green">✓</Badge>
                <Text textTransform="capitalize">{approval.department_name}</Text>
                {approval.decided_at && <Text color="gray.500">{formatDate(approval.decided_at)}</Text>}
              </HStack>
            ))}
            <HStack spacing={3} flexWrap="wrap">
              <Button
                variant="outline"
                colorScheme="blue"
                leftIcon={<Eye size={16} />}
                onClick={() => {
                  void onOpenDocumentPreview(
                    contract.id,
                    "CONTRACT",
                    contract.tenant_id ?? tenantId,
                  );
                }}
              >
                Previsualizar contrato
              </Button>
              <Button
                variant="outline"
                colorScheme="gray"
                leftIcon={<Download size={16} />}
                onClick={() => {
                  void onDownloadDocument(
                    contract.id,
                    "CONTRACT",
                    contract.tenant_id ?? tenantId,
                  );
                }}
              >
                Descargar contrato
              </Button>
            </HStack>
            <Button
              colorScheme="brand"
              leftIcon={<Send size={16} />}
              isLoading={isLoading}
              onClick={onSendForSignature}
            >
              Enviar a firma (Viafirma)
            </Button>
          </Stack>
        )}

        {/* FASE 8 — Esperando firma */}
        {status === "SENT_FOR_SIGNATURE" && (
          <Alert status="info" borderRadius="md">
            <AlertIcon />
            Contrato enviado a Viafirma. En espera de firma del proveedor.
            {contract.supplier_email && <Text fontSize="xs" mt={1}>Email firmante: {contract.supplier_email}</Text>}
          </Alert>
        )}

        {/* FIRMADO */}
        {status === "SIGNED" && (
          <Alert status="success" borderRadius="md">
            <AlertIcon />
            Contrato firmado digitalmente.
            {contract.signed_at && <Text fontSize="xs" mt={1}>Fecha firma: {formatDate(contract.signed_at)}</Text>}
          </Alert>
        )}
      </Stack>
    </Box>
  );
};

// ============================================================================
// HELPERS
// ============================================================================

const formatContractStatus = (status?: string | null) => {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "PENDING_SUPPLIER":
      return "Pendiente proveedor";
    case "PENDING_JEFE_OBRA":
      return "Pendiente Jefe de Obra";
    case "PENDING_GERENCIA":
      return "Pendiente Gerencia";
    case "PENDING_DEPARTAMENTOS":
      return "Pendiente Departamento";
    case "PENDING_ADMIN":
      return "Pendiente Administracion";
    case "PENDING_COMPRAS":
      return "Pendiente Compras";
    case "PENDING_JURIDICO":
      return "Pendiente Jurídico";
    case "IN_SIGNATURE":
      return "En firma";
    case "SIGNED":
      return "Firmado";
    case "REJECTED":
      return "Rechazado";
    // FASE 3-8
    case "PENDING_TEMPLATE":
      return "Pendiente plantilla";
    case "PENDING_DATA_VALIDATION":
      return "Pendiente datos";
    case "PENDING_REVIEW":
      return "En revisión";
    case "FULLY_APPROVED":
      return "Totalmente aprobado";
    case "SENT_FOR_SIGNATURE":
      return "Enviado a firma";
    default:
      return "Pendiente";
  }
};

type ContractStatusChipScheme = "gray" | "orange" | "green" | "red" | "blue";

const getContractStatusScheme = (
  status?: string | null,
): ContractStatusChipScheme => {
  switch (status) {
    case "SIGNED":
    case "FULLY_APPROVED":
      return "green";
    case "REJECTED":
      return "red";
    case "SENT_FOR_SIGNATURE":
    case "IN_SIGNATURE":
      return "blue";
    case "DRAFT":
      return "gray";
    default:
      return "orange";
  }
};

const CONTRACT_STATUS_CHIP_COLORS: Record<
  ContractStatusChipScheme,
  { bg: string; color: string }
> = {
  gray: { bg: "#e5e7eb", color: "#374151" },
  orange: { bg: "#ffedd5", color: "#9a3412" },
  green: { bg: "#dcfce7", color: "#166534" },
  red: { bg: "#fee2e2", color: "#991b1b" },
  blue: { bg: "#dbeafe", color: "#1d4ed8" },
};

interface ContractStatusChipProps {
  status?: string | null;
}

const ContractStatusChip: React.FC<ContractStatusChipProps> = ({ status }) => {
  const scheme = getContractStatusScheme(status);
  const palette = CONTRACT_STATUS_CHIP_COLORS[scheme];
  return (
    <Badge
      bg={palette.bg}
      color={palette.color}
      px={3}
      py={1}
      borderRadius="full"
      textTransform="none"
      fontWeight="medium"
      fontSize="xs"
      letterSpacing="0"
    >
      {formatContractStatus(status)}
    </Badge>
  );
};

const getComparativeObraNumero = (contract: Contract): string => {
  const data = (contract.comparative_data as any) ?? {};
  const candidates = [data.obra_numero, data.obra_num];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    } else if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  if (typeof data.obra === "string" && data.obra.trim()) {
    const [first] = data.obra.trim().split(/\s*-\s*/);
    if (first && /^\d+$/.test(first)) return first;
  }
  if (contract.project_id) return String(contract.project_id);
  return "—";
};

const formatComparativeStatus = (status?: string | null) => {
  switch (status) {
    case "DRAFT":
      return "Borrador";
    case "PENDING_REVIEW":
    case "PENDING_MGMT_APPROVAL":
      return "Pendiente";
    case "NEEDS_CHANGES":
    case "REJECTED":
      return "Rechazado";
    case "APPROVED":
      return "Aprobado";
    default:
      return "Borrador";
  }
};

type ComparativeStatusChipScheme = "gray" | "orange" | "green" | "red";

const getComparativeStatusScheme = (
  status?: string | null,
): ComparativeStatusChipScheme => {
  switch (status) {
    case "APPROVED":
      return "green";
    case "REJECTED":
    case "NEEDS_CHANGES":
      return "red";
    case "PENDING_REVIEW":
    case "PENDING_MGMT_APPROVAL":
      return "orange";
    case "DRAFT":
    default:
      return "gray";
  }
};

const COMPARATIVE_STATUS_CHIP_COLORS: Record<
  ComparativeStatusChipScheme,
  { bg: string; color: string }
> = {
  gray: { bg: "#e5e7eb", color: "#374151" },
  orange: { bg: "#ffedd5", color: "#9a3412" },
  green: { bg: "#dcfce7", color: "#166534" },
  red: { bg: "#fee2e2", color: "#991b1b" },
};

interface ComparativeStatusChipProps {
  status?: string | null;
}

const ComparativeStatusChip: React.FC<ComparativeStatusChipProps> = ({
  status,
}) => {
  const scheme = getComparativeStatusScheme(status);
  const palette = COMPARATIVE_STATUS_CHIP_COLORS[scheme];
  return (
    <Badge
      bg={palette.bg}
      color={palette.color}
      px={3}
      py={1}
      borderRadius="full"
      textTransform="none"
      fontWeight="medium"
      fontSize="xs"
      letterSpacing="0"
    >
      {formatComparativeStatus(status)}
    </Badge>
  );
};

const formatContractType = (type?: string | null) => {
  switch (type) {
    case "SUBCONTRATACION":
      return "SUBCONTRATACIÓN";
    case "SUBCONTRATACIÓN":
      return "SUBCONTRATACIÓN";
    case "SUMINISTRO":
      return "SUMINISTRO";
    case "SERVICIO":
      return "SERVICIO";
    default:
      return "SUBCONTRATACIÓN";
  }
};

const mapActivityStatus = (status: string) => {
  if (status === "SIGNED" || status === "IN_SIGNATURE" || status === "FULLY_APPROVED" || status === "SENT_FOR_SIGNATURE") return "approved";
  if (status === "DRAFT") return "created";
  return "pending";
};

const formatNumber = (value: number | string, maximumFractionDigits = 3) => {
  const numeric =
    typeof value === "string"
      ? Number(value.replace(/\./g, "").replace(",", "."))
      : value;
  if (Number.isNaN(numeric)) return String(value);
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits }).format(
    numeric,
  );
};

const formatCurrency = (value: number | string) => {
  let numeric: number;
  if (typeof value === "string") {
    const raw = value.trim();
    const compact = raw.replace(/\s+/g, "");
    const hasComma = compact.includes(",");
    const hasDot = compact.includes(".");
    let normalized = compact;
    if (hasComma && hasDot) {
      const lastComma = compact.lastIndexOf(",");
      const lastDot = compact.lastIndexOf(".");
      normalized =
        lastComma > lastDot
          ? compact.replace(/\./g, "").replace(",", ".")
          : compact.replace(/,/g, "");
    } else if (hasComma) {
      normalized = compact.replace(/\./g, "").replace(",", ".");
    }
    numeric = Number(normalized);
  } else {
    numeric = value;
  }
  if (Number.isNaN(numeric)) return String(value);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(numeric);
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
