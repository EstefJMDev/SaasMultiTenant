import React, { useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Text,
  useColorModeValue,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { AppShell } from "@widgets/app-shell/AppShell";
import { DataTable } from "@widgets/data-table";
import { EmptyState, ErrorBanner, PageHeader } from "@shared/ui";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import {
  createPosition,
  deletePosition,
  fetchDepartments,
  fetchPositions,
  updatePosition,
  type Department,
  type Position,
  type PositionCreateInput,
  type PositionUpdateInput,
} from "@api/hr";

interface PositionFormState {
  name: string;
  department_id: string;
  level: string;
  role_code: string;
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
  is_active: boolean;
}

const defaultForm: PositionFormState = {
  name: "",
  department_id: "",
  level: "1",
  role_code: "",
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
  is_active: true,
};

const toCreateInput = (form: PositionFormState): PositionCreateInput => ({
  name: form.name.trim(),
  department_id: form.department_id ? Number(form.department_id) : null,
  level: form.level ? Number(form.level) : 1,
  role_code: form.role_code ? (form.role_code as "JO" | "DT") : null,
  can_create_comparative: form.can_create_comparative,
  can_edit_comparative: form.can_edit_comparative,
  can_delete_comparative: form.can_delete_comparative,
  can_approve_comparative: form.can_approve_comparative,
  can_reject_comparative: form.can_reject_comparative,
  can_view_contract: form.can_view_contract,
  can_edit_contract: form.can_edit_contract,
  can_regenerate_contract: form.can_regenerate_contract,
  can_approve_contract: form.can_approve_contract,
  can_reject_contract: form.can_reject_contract,
  can_view_worksite: form.can_view_worksite,
  can_edit_worksite: form.can_edit_worksite,
  can_view_provider: form.can_view_provider,
  can_edit_provider: form.can_edit_provider,
  is_active: form.is_active,
});

const fromPosition = (p: Position): PositionFormState => ({
  name: p.name ?? "",
  department_id: p.department_id != null ? String(p.department_id) : "",
  level: p.level != null ? String(p.level) : "1",
  role_code: p.role_code ?? "",
  can_create_comparative: !!p.can_create_comparative,
  can_edit_comparative: !!p.can_edit_comparative,
  can_delete_comparative: !!p.can_delete_comparative,
  can_approve_comparative: !!p.can_approve_comparative,
  can_reject_comparative: !!p.can_reject_comparative,
  can_view_contract: !!p.can_view_contract,
  can_edit_contract: !!p.can_edit_contract,
  can_regenerate_contract: !!p.can_regenerate_contract,
  can_approve_contract: !!p.can_approve_contract,
  can_reject_contract: !!p.can_reject_contract,
  can_view_worksite: !!p.can_view_worksite,
  can_edit_worksite: !!p.can_edit_worksite,
  can_view_provider: !!p.can_view_provider,
  can_edit_provider: !!p.can_edit_provider,
  is_active: p.is_active !== false,
});

type ComparativeCap =
  | "can_create_comparative"
  | "can_edit_comparative"
  | "can_delete_comparative"
  | "can_approve_comparative"
  | "can_reject_comparative";

type ContractCap =
  | "can_view_contract"
  | "can_edit_contract"
  | "can_regenerate_contract"
  | "can_approve_contract"
  | "can_reject_contract";

type CatalogCap =
  | "can_view_worksite"
  | "can_edit_worksite"
  | "can_view_provider"
  | "can_edit_provider";

const POSITION_CAPS: { name: ComparativeCap; label: string }[] = [
  { name: "can_create_comparative", label: "Crear comparativo" },
  { name: "can_edit_comparative", label: "Editar comparativo" },
  { name: "can_delete_comparative", label: "Eliminar comparativo" },
  { name: "can_approve_comparative", label: "Aprobar comparativo" },
  { name: "can_reject_comparative", label: "Rechazar comparativo" },
];

const POSITION_CONTRACT_CAPS: { name: ContractCap; label: string }[] = [
  { name: "can_view_contract", label: "Ver contratos" },
  { name: "can_edit_contract", label: "Editar contratos" },
  { name: "can_regenerate_contract", label: "Regenerar contratos" },
  { name: "can_approve_contract", label: "Aprobar contratos" },
  { name: "can_reject_contract", label: "Rechazar contratos" },
];

const POSITION_WORKSITE_CAPS: { name: CatalogCap; label: string }[] = [
  { name: "can_view_worksite", label: "Ver obras" },
  { name: "can_edit_worksite", label: "Editar obras" },
];

const POSITION_PROVIDER_CAPS: { name: CatalogCap; label: string }[] = [
  { name: "can_view_provider", label: "Ver proveedores" },
  { name: "can_edit_provider", label: "Editar proveedores" },
];

export const HrPositionsPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { tenantId: effectiveTenantId, isSuperAdmin } = useEffectiveTenantId();
  const panelBg = useColorModeValue("gray.50", "gray.800");

  const tenantEnabled = effectiveTenantId != null || isSuperAdmin;

  const positionsQuery = useQuery({
    queryKey: ["org-positions", effectiveTenantId, "all"],
    queryFn: () => fetchPositions(effectiveTenantId, true),
    enabled: tenantEnabled,
  });

  const departmentsQuery = useQuery({
    queryKey: ["hr-departments", effectiveTenantId ?? "all"],
    queryFn: () => fetchDepartments(effectiveTenantId),
    enabled: tenantEnabled,
  });

  const departments: Department[] = useMemo(
    () => departmentsQuery.data ?? [],
    [departmentsQuery.data],
  );
  const departmentById = useMemo(() => {
    const map = new Map<number, Department>();
    departments.forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  const [form, setForm] = useState<PositionFormState>(defaultForm);
  const [editing, setEditing] = useState<Position | null>(null);
  const [deleting, setDeleting] = useState<Position | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const positions: Position[] = useMemo(
    () => positionsQuery.data ?? [],
    [positionsQuery.data],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["org-positions"] });
  };

  const createMutation = useMutation({
    mutationFn: () => createPosition(toCreateInput(form), effectiveTenantId),
    onSuccess: () => {
      invalidate();
      toast({ title: t("hr.positions.messages.created"), status: "success", duration: 3000, isClosable: true });
      handleCloseModal();
    },
    onError: () => {
      toast({ title: t("hr.positions.messages.createError"), status: "error", duration: 4000, isClosable: true });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PositionUpdateInput }) => updatePosition(id, data),
    onSuccess: () => {
      invalidate();
      toast({ title: t("hr.positions.messages.updated"), status: "success", duration: 3000, isClosable: true });
      handleCloseModal();
    },
    onError: () => {
      toast({ title: t("hr.positions.messages.updateError"), status: "error", duration: 4000, isClosable: true });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePosition(id),
    onSuccess: () => {
      invalidate();
      toast({ title: t("hr.positions.messages.deleted"), status: "success", duration: 3000, isClosable: true });
      setDeleting(null);
      onDeleteClose();
    },
    onError: () => {
      toast({ title: t("hr.positions.messages.deleteError"), status: "error", duration: 4000, isClosable: true });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    onOpen();
  };

  const openEdit = (position: Position) => {
    setEditing(position);
    setForm(fromPosition(position));
    onOpen();
  };

  const handleCloseModal = () => {
    setEditing(null);
    setForm(defaultForm);
    onClose();
  };

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: toCreateInput(form) });
    } else {
      createMutation.mutate();
    }
  };

  const askDelete = (position: Position) => {
    setDeleting(position);
    onDeleteOpen();
  };

  const confirmDelete = () => {
    if (deleting) deleteMutation.mutate(deleting.id);
  };

  const columns = useMemo<ColumnDef<Position>[]>(
    () => [
      { header: t("hr.positions.table.name"), accessorKey: "name" },
      {
        header: t("hr.positions.table.department"),
        id: "department",
        cell: ({ row }) => {
          const id = row.original.department_id;
          if (!id) return t("hr.positions.table.noDepartment");
          return departmentById.get(id)?.name ?? t("hr.positions.table.noDepartment");
        },
      },
      {
        header: t("hr.positions.table.status"),
        id: "status",
        cell: ({ row }) => (
          <Badge colorScheme={row.original.is_active ? "brand" : "red"}>
            {row.original.is_active ? t("hr.status.active") : t("hr.status.inactive")}
          </Badge>
        ),
      },
      {
        header: t("hr.positions.table.actions"),
        id: "actions",
        cell: ({ row }) => (
          <HStack spacing={1}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="edit"
              icon={<Pencil size={16} />}
              onClick={() => openEdit(row.original)}
            />
            <IconButton
              size="sm"
              variant="ghost"
              colorScheme="red"
              aria-label="delete"
              icon={<Trash2 size={16} />}
              onClick={() => askDelete(row.original)}
              isLoading={deleteMutation.isPending && deleting?.id === row.original.id}
            />
          </HStack>
        ),
      },
    ],
    [t, departmentById, deleteMutation.isPending, deleting?.id],
  );

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <AppShell>
      {!effectiveTenantId && isSuperAdmin && (
        <Text color="gray.400" mb={6}>
          {t("hr.emptyTenant")}
        </Text>
      )}

      {effectiveTenantId && (
        <Box borderWidth="1px" borderRadius="xl" p={6} bg={panelBg}>
          <PageHeader
            title={t("hr.positions.title")}
            actions={
              <Button size="sm" colorScheme="brand" onClick={openCreate}>
                {t("hr.positions.form.create")}
              </Button>
            }
          />

          {positionsQuery.isError && (
            <ErrorBanner
              title={t("hr.positions.error")}
              onRetry={() =>
                queryClient.invalidateQueries({ queryKey: ["org-positions"] })
              }
            />
          )}

          <Box mt={4}>
            <DataTable
              data={positions}
              columns={columns}
              isLoading={positionsQuery.isLoading}
              emptyText={t("hr.positions.table.empty")}
              emptyState={
                <EmptyState
                  title={t("hr.positions.table.empty")}
                  description={t("hr.positions.emptyDescription")}
                  actionLabel={t("hr.positions.form.create")}
                  onAction={openCreate}
                />
              }
            />
          </Box>
        </Box>
      )}

      <Modal isOpen={isOpen} onClose={handleCloseModal} isCentered size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {editing ? t("hr.positions.form.editTitle") : t("hr.positions.form.createTitle")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack as="form" id="position-form" align="stretch" spacing={3} onSubmit={handleSubmit}>
              <FormControl isRequired>
                <FormLabel>{t("hr.positions.form.name")}</FormLabel>
                <Input
                  value={form.name}
                  placeholder={t("hr.positions.form.namePlaceholder")}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                />
              </FormControl>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl>
                  <FormLabel>{t("hr.positions.form.department")}</FormLabel>
                  <Select
                    placeholder={t("hr.positions.form.departmentPlaceholder")}
                    value={form.department_id}
                    onChange={(e) => {
                      const newId = e.target.value;
                      const newDept = newId
                        ? departmentById.get(Number(newId))
                        : null;
                      // Al cambiar el Department:
                      //  - Caps de comparativo: se resetean a False (cada
                      //    puesto define las suyas; no se heredan defaults).
                      //  - Caps de contrato: se PRE-MARCAN con los del
                      //    Department (si dept.cap=true → check marcado).
                      //    El backend refuerza esto al guardar.
                      //  - Visores de obra/proveedores: mismo patrón que
                      //    contratos, para que el puesto nazca alineado con
                      //    el departamento.
                      setForm((s) => ({
                        ...s,
                        department_id: newId,
                        can_create_comparative: false,
                        can_edit_comparative: false,
                        can_delete_comparative: false,
                        can_approve_comparative: false,
                        can_reject_comparative: false,
                        can_view_contract: Boolean(newDept?.can_view_contract),
                        can_edit_contract: Boolean(newDept?.can_edit_contract),
                        can_regenerate_contract: Boolean(
                          newDept?.can_regenerate_contract,
                        ),
                        can_approve_contract: Boolean(
                          newDept?.can_approve_contract,
                        ),
                        can_reject_contract: Boolean(
                          newDept?.can_reject_contract,
                        ),
                        can_view_worksite: Boolean(newDept?.can_view_worksite),
                        can_edit_worksite: Boolean(newDept?.can_edit_worksite),
                        can_view_provider: Boolean(newDept?.can_view_provider),
                        can_edit_provider: Boolean(newDept?.can_edit_provider),
                      }));
                    }}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>{t("hr.positions.form.level")}</FormLabel>
                  <Input
                    type="number"
                    min={1}
                    value={form.level}
                    onChange={(e) => setForm((s) => ({ ...s, level: e.target.value }))}
                  />
                </FormControl>
              </SimpleGrid>

              {(() => {
                const selectedDept = form.department_id
                  ? departmentById.get(Number(form.department_id))
                  : null;
                const label = selectedDept
                  ? `Capacidades de ${selectedDept.name}`
                  : "Capacidades";
                return (
                  <FormControl>
                    <FormLabel>{label}</FormLabel>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                      {POSITION_CAPS.map(({ name, label: capLabel }) => (
                        <Checkbox
                          key={name}
                          isChecked={Boolean(form[name])}
                          onChange={(e) =>
                            setForm((s) => ({ ...s, [name]: e.target.checked }))
                          }
                        >
                          {capLabel}
                        </Checkbox>
                      ))}
                    </SimpleGrid>
                  </FormControl>
                );
              })()}

              {(() => {
                return (
                  <VStack align="stretch" spacing={3}>
                    <FormControl>
                      <FormLabel>Contratos</FormLabel>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                        {POSITION_CONTRACT_CAPS.map(({ name, label: capLabel }) => (
                          <Checkbox
                            key={name}
                            isChecked={Boolean(form[name])}
                            onChange={(e) =>
                              setForm((s) => ({ ...s, [name]: e.target.checked }))
                            }
                          >
                            {capLabel}
                          </Checkbox>
                        ))}
                      </SimpleGrid>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Obras</FormLabel>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                        {POSITION_WORKSITE_CAPS.map(({ name, label: capLabel }) => (
                          <Checkbox
                            key={name}
                            isChecked={Boolean(form[name])}
                            onChange={(e) =>
                              setForm((s) => ({ ...s, [name]: e.target.checked }))
                            }
                          >
                            {capLabel}
                          </Checkbox>
                        ))}
                      </SimpleGrid>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Proveedores</FormLabel>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                        {POSITION_PROVIDER_CAPS.map(({ name, label: capLabel }) => (
                          <Checkbox
                            key={name}
                            isChecked={Boolean(form[name])}
                            onChange={(e) =>
                              setForm((s) => ({ ...s, [name]: e.target.checked }))
                            }
                          >
                            {capLabel}
                          </Checkbox>
                        ))}
                      </SimpleGrid>
                    </FormControl>

                    <Text fontSize="xs" color="gray.500" mt={1}>
                      El puesto define la acción concreta del usuario. El
                      departamento sigue controlando si el módulo aparece en menú.
                    </Text>
                  </VStack>
                );
              })()}

            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleCloseModal}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="position-form"
              colorScheme="brand"
              isLoading={isSubmitting}
              isDisabled={!form.name.trim()}
            >
              {editing ? t("hr.positions.form.save") : t("hr.positions.form.create")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <AlertDialog
        isOpen={isDeleteOpen}
        leastDestructiveRef={cancelRef}
        onClose={() => {
          setDeleting(null);
          onDeleteClose();
        }}
        isCentered
      >
        <AlertDialogOverlay />
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {t("hr.positions.delete.title")}
          </AlertDialogHeader>
          <AlertDialogBody>{t("hr.positions.delete.body")}</AlertDialogBody>
          <AlertDialogFooter>
            <Button
              ref={cancelRef}
              onClick={() => {
                setDeleting(null);
                onDeleteClose();
              }}
            >
              {t("hr.positions.delete.cancel")}
            </Button>
            <Button
              colorScheme="red"
              ml={3}
              onClick={confirmDelete}
              isLoading={deleteMutation.isPending}
            >
              {t("hr.positions.delete.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
};

export default HrPositionsPage;
