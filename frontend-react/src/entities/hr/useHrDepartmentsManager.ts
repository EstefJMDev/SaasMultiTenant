import React, { useMemo, useState } from "react";
import { useDisclosure, useToast } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  updateDepartment,
  type Department,
  type DepartmentMenuVisibility,
  type DepartmentUpdatePayload,
} from "@api/hr";
import { onMutationError } from "@shared/utils/mutationError";

/**
 * Estado del formulario del modal de Departamento.
 * - projectAllocationPercentage se guarda como string para poder manejar inputs vacíos
 *   y evitar problemas de parseo mientras el usuario escribe.
 */
export interface DepartmentFormState {
  name: string;
  description: string;
  projectAllocationPercentage: string;
  menuVisibility: DepartmentMenuVisibility;
  can_create_comparative: boolean;
  can_edit_comparative: boolean;
  can_delete_comparative: boolean;
  can_approve_comparative: boolean;
  can_reject_comparative: boolean;
  can_view_contract: boolean;
  can_edit_contract: boolean;
  can_regenerate_contract: boolean;
  can_approve_contract: boolean;
  can_reject_contract: boolean;
  can_view_worksite: boolean;
  can_edit_worksite: boolean;
  can_view_provider: boolean;
  can_edit_provider: boolean;
}

const DEFAULT_MENU_VISIBILITY: DepartmentMenuVisibility = {
  dashboard: true,
  erp: true,
  erp_time_control: true,
  erp_tasks: true,
  erp_projects: true,
  erp_external_collaborations: true,
  erp_simulations: true,
  erp_invoices: true,
  work_management: true,
  work_contracts: true,
  work_comparatives: true,
  work_worksites: true,
  work_providers: true,
  legal: true,
  legal_contracts: true,
  administration_department: true,
  administration_contracts: true,
  administration_worksites: true,
  administration_providers: true,
  hr: true,
  hr_departments: true,
  hr_employees: true,
  hr_positions: true,
  hr_talent: true,
  users: true,
  tools: false,
  tenant_settings: true,
  settings: true,
  settings_branding: true,
  settings_department_emails: true,
  audit_logs: true,
  support: true,
};

export const createDefaultDepartmentForm = (): DepartmentFormState => ({
  name: "",
  description: "",
  projectAllocationPercentage: "100",
  menuVisibility: { ...DEFAULT_MENU_VISIBILITY },
  can_create_comparative: false,
  can_edit_comparative: false,
  can_delete_comparative: false,
  can_approve_comparative: false,
  can_reject_comparative: false,
  can_view_contract: false,
  can_edit_contract: false,
  can_regenerate_contract: false,
  can_approve_contract: false,
  can_reject_contract: false,
  can_view_worksite: false,
  can_edit_worksite: false,
  can_view_provider: false,
  can_edit_provider: false,
});

/**
 * Parámetros necesarios para el hook:
 * - effectiveTenantId: tenant “efectivo” seleccionado (solo relevante si eres super admin).
 * - isSuperAdmin: si es true, el fetch/CRUD puede requerir tenant explícito.
 */
interface UseHrDepartmentsParams {
  effectiveTenantId: number | null;
  isSuperAdmin: boolean;
}

/**
 * Hook de dominio HR: gestión de Departamentos.
 *
 * Qué hace:
 * - Carga departamentos (React Query).
 * - Gestiona modales (crear/editar y eliminar).
 * - Gestiona estado de formulario.
 * - Ejecuta mutaciones CRUD (create/update/delete).
 * - Mantiene consistencia invalidando queries y mostrando toasts.
 */
export const useHrDepartmentsManager = ({
  effectiveTenantId,
  isSuperAdmin,
}: UseHrDepartmentsParams) => {
  // Toasts para feedback al usuario (success/error/warning)
  const toast = useToast();

  // i18n: t() para mensajes traducibles
  const { t } = useTranslation();

  // Cliente de React Query para invalidar caché tras mutaciones
  const queryClient = useQueryClient();

  /**
   * Modal de Crear/Editar departamento (Chakra useDisclosure)
   * - isDeptOpen: estado abierto/cerrado del modal
   * - onDeptOpen/onDeptClose: handlers para abrir/cerrar
   */
  const {
    isOpen: isDeptOpen,
    onOpen: onDeptOpen,
    onClose: onDeptClose,
  } = useDisclosure();

  /**
   * Modal de Confirmación de borrado
   */
  const {
    isOpen: isDeleteDeptOpen,
    onOpen: onDeleteDeptOpen,
    onClose: onDeleteDeptClose,
  } = useDisclosure();

  /**
   * Estado local del formulario del modal (input controlado)
   * - Valores por defecto: name/description vacíos y 100% por defecto.
   */
  const [deptForm, setDeptForm] = useState<DepartmentFormState>(
    createDefaultDepartmentForm,
  );

  /**
   * editingDepartment:
   * - null => estamos creando
   * - Department => estamos editando un dept existente
   */
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null,
  );

  /**
   * deletingDepartment:
   * - Department pendiente de borrar (cuando el usuario abre el modal de confirmación)
   */
  const [deletingDepartment, setDeletingDepartment] =
    useState<Department | null>(null);

  /**
   * Cierra el modal de Crear/Editar y resetea el estado del formulario.
   * - Importante para no “arrastrar” estado cuando cambias de editar → crear.
   */
  const handleCloseDeptModal = () => {
    setEditingDepartment(null);
    setDeptForm(createDefaultDepartmentForm());
    onDeptClose();
  };

  /**
   * Query: cargar lista de departamentos.
   *
   * queryKey incluye effectiveTenantId para cachear por tenant seleccionado.
   * queryFn:
   *  - Si eres super admin: puedes pasar tenantId (si existe) para consultar ese tenant.
   *  - Si NO eres super admin: el backend asume tu tenant por auth, no envías tenantId.
   *
   * enabled:
   *  - Super admin: solo puedes consultar si has seleccionado un tenant.
   *  - No super admin: siempre se puede.
   */
  const {
    data: departments,
    isLoading: isLoadingDepartments,
    isError: isErrorDepartments,
  } = useQuery<Department[]>({
    queryKey: ["hr-departments", effectiveTenantId],
    queryFn: () =>
      fetchDepartments(
        isSuperAdmin ? (effectiveTenantId ?? undefined) : undefined,
      ),
    enabled: effectiveTenantId != null || !isSuperAdmin,
  });

  /**
   * Mutación: crear departamento.
   * - onSuccess: invalida caché para refrescar lista + cierra modal + toast éxito
   * - onError: toast error genérico
   */
  const createDeptMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: () => {
      // Refresca la lista de departamentos tras crear
      queryClient.invalidateQueries({ queryKey: ["hr-departments"] });

      // Reset UI
      handleCloseDeptModal();

      // Feedback
      toast({
        title: t("hr.messages.departmentCreated"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    },
    onError: () => {
      toast({
        title: t("hr.messages.departmentCreateErrorTitle"),
        description: t("hr.messages.genericErrorDesc"),
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    },
  });

  /**
   * Mutación: actualizar departamento.
   * - onSuccess: invalida lista + cierra modal + toast éxito
   * - onError: toast error
   */
  const updateDeptMutation = useMutation({
    mutationFn: (payload: DepartmentUpdatePayload) => updateDepartment(payload),
    onMutate: async (payload) => {
      const queryKey = ["hr-departments", effectiveTenantId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Department[]>(queryKey);
      queryClient.setQueryData<Department[]>(queryKey, (old) =>
        (old ?? []).map((dept) =>
          dept.id === payload.departmentId
            ? {
                ...dept,
                ...payload.data,
                project_allocation_percentage:
                  payload.data.project_allocation_percentage ?? dept.project_allocation_percentage,
              }
            : dept,
        ),
      );
      return { previous, queryKey };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      toast({
        title:
          t("hr.messages.departmentUpdateError") ||
          "Error al actualizar departamento",
        status: "error",
      });
    },
    onSuccess: () => {
      handleCloseDeptModal();
      toast({
        title: t("hr.messages.departmentUpdated") || "Departamento actualizado",
        status: "success",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["hr-departments"] });
    },
  });

  /**
   * Mutación: borrar departamento.
   * - onSuccess: invalida queries relacionadas (dept, employees, headcount)
   * - onError: muestra warning + detalle si viene del backend (por ejemplo si hay relaciones)
   */
  const deleteDeptMutation = useMutation({
    mutationFn: (departmentId: number) => deleteDepartment(departmentId),
    onSuccess: () => {
      // Refresca departamentos y también entidades dependientes (por si cambian agregados)
      queryClient.invalidateQueries({ queryKey: ["hr-departments"] });
      queryClient.invalidateQueries({ queryKey: ["hr-employees"] });
      queryClient.invalidateQueries({ queryKey: ["hr-headcount"] });

      toast({
        title: "Departamento eliminado",
        status: "success",
      });
    },
    onError: onMutationError(
      toast,
      "No se pudo eliminar el departamento",
      "Revisa si tiene empleados, proyectos u horas asociadas.",
      "warning",
    ),
  });

  /**
   * Handler genérico para inputs controlados.
   * - Actualiza el campo del formulario usando el name del input.
   */
  const handleDeptChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setDeptForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleDeptMenuVisibilityChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, checked } = event.target;
    setDeptForm((prev) => ({
      ...prev,
      menuVisibility: {
        ...prev.menuVisibility,
        [name]: checked,
      },
    }));
  };

  const handleDeptCapabilityChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, checked } = event.target;
    setDeptForm((prev) => ({ ...prev, [name]: checked }));
  };

  /**
   * Submit del formulario de crear/editar.
   * Validaciones:
   * - name obligatorio
   * - si es creación y eres super admin: exige tenant seleccionado
   *
   * Lógica:
   * - si editingDepartment != null => UPDATE
   * - si editingDepartment == null => CREATE
   *
   * Normalización:
   * - trim en name
   * - description vacía => undefined
   * - projectAllocationPercentage:
   *    "" => null (backend puede interpretarlo como “sin porcentaje definido”)
   *    "100" => 100
   */
  const handleSubmitDepartment = (event: React.FormEvent) => {
    event.preventDefault();

    // Validación: nombre requerido
    if (!deptForm.name.trim()) {
      toast({
        title: t("hr.messages.nameRequired"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    // Validación: super admin debe seleccionar tenant para crear
    if (!editingDepartment && isSuperAdmin && !effectiveTenantId) {
      toast({
        title: t("hr.messages.selectTenant"),
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const caps = {
      can_create_comparative: deptForm.can_create_comparative,
      can_edit_comparative: deptForm.can_edit_comparative,
      can_delete_comparative: deptForm.can_delete_comparative,
      can_approve_comparative: deptForm.can_approve_comparative,
      can_reject_comparative: deptForm.can_reject_comparative,
      can_view_contract: deptForm.can_view_contract,
      can_edit_contract: deptForm.can_edit_contract,
      can_regenerate_contract: deptForm.can_regenerate_contract,
      can_approve_contract: deptForm.can_approve_contract,
      can_reject_contract: deptForm.can_reject_contract,
      can_view_worksite: deptForm.can_view_worksite,
      can_edit_worksite: deptForm.can_edit_worksite,
      can_view_provider: deptForm.can_view_provider,
      can_edit_provider: deptForm.can_edit_provider,
    };

    // tools siempre deshabilitado: normaliza a false al guardar
    const menuVisibility: DepartmentMenuVisibility = {
      ...deptForm.menuVisibility,
      tools: false,
    };

    // UPDATE
    if (editingDepartment) {
      updateDeptMutation.mutate({
        departmentId: editingDepartment.id,
        data: {
          name: deptForm.name.trim(),
          description: deptForm.description || undefined,
          project_allocation_percentage:
            deptForm.projectAllocationPercentage.trim() === ""
              ? null
              : Number(deptForm.projectAllocationPercentage),
          menu_visibility: menuVisibility,
          ...caps,
        },
      });
      return;
    }

    // CREATE
    createDeptMutation.mutate({
      data: {
        name: deptForm.name.trim(),
        description: deptForm.description || undefined,
        is_active: true,
        project_allocation_percentage:
          deptForm.projectAllocationPercentage.trim() === ""
            ? null
            : Number(deptForm.projectAllocationPercentage),
        menu_visibility: menuVisibility,
        ...caps,
      },
      tenantId: isSuperAdmin ? (effectiveTenantId ?? undefined) : undefined,
    });
  };

  /**
   * Inicia modo edición:
   * - rellena el formulario con datos del dept
   * - setea editingDepartment
   * - abre modal
   */
  const startEditDepartment = (dept: Department) => {
    setEditingDepartment(dept);
    setDeptForm({
      name: dept.name ?? "",
      description: dept.description ?? "",
      projectAllocationPercentage:
        dept.project_allocation_percentage != null
          ? String(dept.project_allocation_percentage)
          : "100",
      menuVisibility: {
        ...DEFAULT_MENU_VISIBILITY,
        ...(dept.menu_visibility ?? {}),
      },
      can_create_comparative: Boolean(dept.can_create_comparative),
      can_edit_comparative: Boolean(dept.can_edit_comparative),
      can_delete_comparative: Boolean(dept.can_delete_comparative),
      can_approve_comparative: Boolean(dept.can_approve_comparative),
      can_reject_comparative: Boolean(dept.can_reject_comparative),
      can_view_contract: Boolean(dept.can_view_contract),
      can_edit_contract: Boolean(dept.can_edit_contract),
      can_regenerate_contract: Boolean(dept.can_regenerate_contract),
      can_approve_contract: Boolean(dept.can_approve_contract),
      can_reject_contract: Boolean(dept.can_reject_contract),
      can_view_worksite: Boolean(dept.can_view_worksite),
      can_edit_worksite: Boolean(dept.can_edit_worksite),
      can_view_provider: Boolean(dept.can_view_provider),
      can_edit_provider: Boolean(dept.can_edit_provider),
    });
    onDeptOpen();
  };

  /**
   * Inicia flujo de borrado:
   * - guarda el dept a borrar
   * - abre modal confirmación
   */
  const handleDeleteDepartment = (dept: Department) => {
    setDeletingDepartment(dept);
    onDeleteDeptOpen();
  };

  /**
   * Confirma borrado:
   * - ejecuta mutación
   * - en onSettled (éxito o error) cierra modal y limpia estado
   */
  const confirmDeleteDepartment = () => {
    if (!deletingDepartment) return;

    deleteDeptMutation.mutate(deletingDepartment.id, {
      onSettled: () => {
        setDeletingDepartment(null);
        onDeleteDeptClose();
      },
    });
  };

  /**
   * Mapa memoizado de departamentos por id para accesos O(1).
   * Útil cuando tienes que resolver dept por id en tablas, selects, etc.
   */
  const departmentById = useMemo(() => {
    const map = new Map<number, Department>();
    (departments ?? []).forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  /**
   * API pública del hook: lo que consume la página/componente.
   */
  return {
    // Form state
    deptForm,
    setDeptForm,

    // Edición / borrado
    editingDepartment,
    setEditingDepartment,
    deletingDepartment,
    setDeletingDepartment,

    // Handlers UI
    handleDeptChange,
    handleDeptMenuVisibilityChange,
    handleDeptCapabilityChange,
    handleSubmitDepartment,
    startEditDepartment,
    handleDeleteDepartment,
    confirmDeleteDepartment,
    handleCloseDeptModal,

    // Datos derivados
    departmentById,

    // Query data/state
    departments,
    isLoadingDepartments,
    isErrorDepartments,

    // Mutations (por si el UI necesita estado: isPending, error, etc.)
    createDeptMutation,
    updateDeptMutation,
    deleteDeptMutation,

    // Modales
    isDeptOpen,
    onDeptOpen,
    onDeptClose,
    isDeleteDeptOpen,
    onDeleteDeptClose,
  };
};
