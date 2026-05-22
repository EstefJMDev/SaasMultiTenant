import React, { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Select,
  Switch,
  Text,
  VStack,
  HStack,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects";
import { apiClient } from "@shared/api/client";
import { DataTable } from "@widgets/data-table";
import { createUserInvitation } from "@api/users";
import { useEffectiveTenantId } from "@hooks/useEffectiveTenantId";
import { Card, EmptyState, PageHeader } from "@shared/ui";
import { ColumnDef } from "@tanstack/react-table";

interface User {
  id: number;
  email: string;
  full_name?: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  tenant_id?: number | null;
  role_id?: number | null;
  role_name?: string | null;
}

interface EmployeeProfileLite {
  id: number;
  user_id?: number | null;
  full_name?: string | null;
  email?: string | null;
  position?: string | null;
  is_active?: boolean;
}

async function fetchUsers(tenantId: number): Promise<User[]> {
  const response = await apiClient.get<User[]>(
    `/api/v1/users/by-tenant/${tenantId}`,
    {
      headers: {
        "X-Tenant-Id": tenantId.toString(),
      },
    },
  );
  return response.data;
}

interface NewUserFormState {
  email: string;
  full_name: string;
  role: "tenant_admin" | "support" | "user";
}

interface EditUserFormState {
  email: string;
  full_name: string;
  role: "tenant_admin" | "support" | "user";
}

/**
 * Gestión de usuarios por tenant.
 *
 * Super Admin:
 *   - Cambia el tenant desde el selector superior.
 *
 * Admin de tenant:
 *   - Gestiona solo los usuarios de su propio tenant (sin selector).
 */
// Pantalla de Gestión de usuarios: listado, filtros y acciones.
export const UsersPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { tenantId: selectedTenantId, isSuperAdmin } = useEffectiveTenantId();

  const [form, setForm] = useState<NewUserFormState>({
    email: "",
    full_name: "",
    role: "tenant_admin",
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isGerenciaEditing, setIsGerenciaEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditUserFormState>({
    email: "",
    full_name: "",
    role: "user",
  });
  const [employeeDetailsOpen, setEmployeeDetailsOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfileLite | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "super_admin" | "tenant_admin" | "gerencia" | "support" | "user"
  >("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all",
  );

  const {
    data: users,
    isLoading: isLoadingUsers,
    isError: isErrorUsers,
  } = useQuery<User[]>({
    queryKey: ["users", selectedTenantId],
    queryFn: () => fetchUsers(selectedTenantId as number),
    enabled: selectedTenantId !== null,
  });

  const employeeProfilesQuery = useQuery<EmployeeProfileLite[]>({
    queryKey: ["hr-employees-for-users-page", selectedTenantId],
    queryFn: async () => {
      const response = await apiClient.get<EmployeeProfileLite[]>("/api/v1/hr/employees", {
        params: { tenant_id: selectedTenantId ?? undefined },
        headers: selectedTenantId
          ? { "X-Tenant-Id": String(selectedTenantId) }
          : undefined,
      });
      return response.data;
    },
    enabled: selectedTenantId !== null,
  });

  const employeeByUserId = useMemo(() => {
    const map = new Map<number, EmployeeProfileLite>();
    for (const employee of employeeProfilesQuery.data ?? []) {
      if (employee.user_id) {
        map.set(employee.user_id, employee);
      }
    }
    return map;
  }, [employeeProfilesQuery.data]);

  const createInvitationMutation = useMutation({
    mutationFn: async (payload: NewUserFormState) => {
      const { role, ...rest } = payload;
      await createUserInvitation({
        ...rest,
        tenant_id: selectedTenantId,
        role_name: role,
      });
    },
    onSuccess: () => {
      if (selectedTenantId) {
        queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
      }
      toast({
        title: t("users.messages.inviteSuccessTitle"),
        description: t("users.messages.inviteSuccessDesc"),
        status: "success",
      });
      setForm({
        email: "",
        full_name: "",
        role: "tenant_admin",
      });
      setInviteOpen(false);
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        error?.message ??
        t("users.messages.inviteErrorFallback");
      toast({
        title: t("users.messages.inviteErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createInvitationMutation.mutate(form);
  };

  const updateUserMutation = useMutation({
    mutationFn: async (payload: { id: number; email: string; full_name: string; role?: "tenant_admin" | "support" | "user" }) => {
      const { id, ...data } = payload;
      return apiClient.patch<User>(
        `/api/v1/users/${id}`,
        {
          email: data.email,
          full_name: data.full_name,
          role_name: data.role,
        },
        {
          headers: {
            "X-Tenant-Id": (selectedTenantId ?? "").toString(),
          },
        },
      );
    },
    onSuccess: () => {
      if (selectedTenantId) {
        queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
      }
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
      toast({
        title: t("users.messages.updateSuccessTitle"),
        description: t("users.messages.updateSuccessDesc"),
        status: "success",
      });
      setEditOpen(false);
      setEditingUser(null);
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        t("users.messages.updateErrorFallback");
      toast({
        title: t("users.messages.updateErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  const openEditUser = (user: User) => {
    const role =
      user.role_name === "tenant_admin"
        ? "tenant_admin"
        : user.role_name === "support"
          ? "support"
        : "user";
    setEditingUser(user);
    setEditForm({
      email: user.email,
      full_name: user.full_name ?? "",
      role,
    });
    setIsGerenciaEditing(user.role_name === "gerencia");
    setEditOpen(true);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (isGerenciaEditing) {
      updateUserMutation.mutate({
        id: editingUser.id,
        email: editForm.email,
        full_name: editForm.full_name,
        role: undefined,
      });
      return;
    }
    updateUserMutation.mutate({ id: editingUser.id, ...editForm });
  };

  const getRoleLabel = (user: User): string => {
    if (user.is_super_admin) return t("users.roles.superAdmin");
    if (user.role_name === "tenant_admin") return t("users.roles.tenantAdmin");
    if (user.role_name === "gerencia") return "Gerencia";
    if (user.role_name === "support") return "Soporte";
    return t("users.roles.standard");
  };

  const handleDeleteUser = (userId: number) => {
    apiClient
      .delete(`/api/v1/users/${userId}`)
      .then(() => {
        if (selectedTenantId) {
          queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
        }
        toast({
          title: t("users.messages.deleteSuccessTitle"),
          description: t("users.messages.deleteSuccessDesc"),
          status: "success",
        });
      })
      .catch((error: any) => {
        const detail =
          error?.response?.data?.detail ??
          t("users.messages.deleteErrorFallback");
        toast({
          title: t("users.messages.deleteErrorTitle"),
          description: detail,
          status: "error",
        });
      });
  };

  const handleToggleActive = (user: User) => {
    apiClient
      .patch<User>(
        `/api/v1/users/${user.id}/status`,
        { is_active: !user.is_active },
        {
          headers: {
            "X-Tenant-Id": (selectedTenantId ?? "").toString(),
          },
        },
      )
      .then(() => {
        if (selectedTenantId) {
          queryClient.invalidateQueries({ queryKey: ["users", selectedTenantId] });
        }
      })
      .catch((error: any) => {
        const detail =
          error?.response?.data?.detail ??
          t("users.messages.statusErrorFallback");
        toast({
          title: t("users.messages.statusErrorTitle"),
          description: detail,
          status: "error",
        });
      });
  };

  const handleViewEmployee = (user: User) => {
    const employee = employeeByUserId.get(user.id);
    if (!employee) return;
    setSelectedEmployee(employee);
    setEmployeeDetailsOpen(true);
  };

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter((user) => {
      const matchesRole =
        roleFilter === "all" ||
        (roleFilter === "super_admin" && user.is_super_admin) ||
        (roleFilter === "tenant_admin" &&
          user.role_name === "tenant_admin" &&
          !user.is_super_admin) ||
        (roleFilter === "gerencia" &&
          user.role_name === "gerencia" &&
          !user.is_super_admin) ||
        (roleFilter === "support" &&
          user.role_name === "support" &&
          !user.is_super_admin) ||
        (roleFilter === "user" &&
          !user.is_super_admin &&
          user.role_name !== "tenant_admin" &&
          user.role_name !== "gerencia" &&
          user.role_name !== "support");

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.is_active) ||
        (statusFilter === "inactive" && !user.is_active);

      return matchesRole && matchesStatus;
    });
  }, [users, roleFilter, statusFilter]);

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        accessorKey: "full_name",
        header: t("users.table.name"),
        cell: ({ row }) => row.original.full_name ?? "-",
      },
      {
        accessorKey: "email",
        header: t("users.table.email"),
      },
      {
        id: "role",
        header: t("users.table.role"),
        cell: ({ row }) => getRoleLabel(row.original),
      },
      {
        id: "status",
        header: t("users.table.status"),
        cell: ({ row }) => (
          <HStack spacing={3}>
            <Badge colorScheme={row.original.is_active ? "brand" : "red"}>
              {row.original.is_active
                ? t("users.table.active")
                : t("users.table.inactive")}
            </Badge>
            <Switch
              size="sm"
              isChecked={row.original.is_active}
              onChange={() => handleToggleActive(row.original)}
            />
          </HStack>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const user = row.original;
          const canEdit = !user.is_super_admin;
          const canDelete = !user.is_super_admin;
          if (!canEdit && !canDelete) {
            return null;
          }
          return (
            <HStack spacing={2} justify="flex-end">
              {canEdit && (
                <Button size="xs" variant="outline" onClick={() => openEditUser(user)}>
                  {t("users.table.edit")}
                </Button>
              )}
              {canDelete && (
                <Button
                  size="xs"
                  variant="outline"
                  colorScheme="red"
                  onClick={() => handleDeleteUser(user.id)}
                >
                  {t("users.table.delete")}
                </Button>
              )}
            </HStack>
          );
        },
      },
    ],
    [
      employeeByUserId,
      getRoleLabel,
      handleViewEmployee,
      openEditUser,
      handleDeleteUser,
      handleToggleActive,
      t,
    ],
  );

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box mb={8}>
        <ProjectHero
          items={[]}
          title={t("users.header.title")}
          subtitle={t("users.header.subtitle")}
          eyebrow={t("users.header.eyebrow")}
          animation={`${fadeUp} 0.6s ease-out`}
        />
      </Box>

      {isSuperAdmin ? (
        <Box mb={6}>
          <Text fontSize="sm" color="text.muted">
            {selectedTenantId
              ? `Tenant activo: ${selectedTenantId}.`
              : "No hay tenant seleccionado."}{" "}
            Cambia el tenant desde el selector superior.
          </Text>
        </Box>
      ) : null}

      <Box mb={4}>
        <PageHeader
          title={t("users.list.title")}
        />
      </Box>

      {isLoadingUsers && <Text>{t("users.list.loading")}</Text>}
      {isErrorUsers && (
        <Text color="red.500" mb={4}>
          {t("users.list.loadError")}
        </Text>
      )}

      {!isLoadingUsers && users && (
        <>
          <Card p={4} mb={6}>
            <HStack spacing={4} align="flex-end" flexWrap="wrap">
              <FormControl maxW="220px">
                <FormLabel>{t("users.filters.role")}</FormLabel>
                <Select
                  value={roleFilter}
                  onChange={(e) =>
                    setRoleFilter(e.target.value as typeof roleFilter)
                  }
                >
                  <option value="all">{t("users.filters.all")}</option>
                  <option value="super_admin">{t("users.roles.superAdmin")}</option>
                  <option value="tenant_admin">{t("users.roles.tenantAdmin")}</option>
                  <option value="gerencia">Gerencia</option>
                  <option value="support">Soporte</option>
                  <option value="user">{t("users.roles.standard")}</option>
                </Select>
              </FormControl>
              <FormControl maxW="220px">
                <FormLabel>{t("users.filters.status")}</FormLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as typeof statusFilter)
                  }
                >
                  <option value="all">{t("users.filters.all")}</option>
                  <option value="active">{t("users.filters.activeOnly")}</option>
                  <option value="inactive">{t("users.filters.inactiveOnly")}</option>
                </Select>
              </FormControl>
            </HStack>
          </Card>

          <DataTable
            data={filteredUsers}
            columns={columns}
            isLoading={isLoadingUsers}
            emptyText={t("users.table.empty")}
            emptyState={
              <EmptyState
                title={t("users.table.empty")}
                description={
                  t("users.table.emptyDescription", { defaultValue: "" }) ||
                  undefined
                }
                actionLabel={t("users.invite.submit")}
                onAction={() => setInviteOpen(true)}
              />
            }
            showSearch
            globalFilter={searchTerm}
            onGlobalFilterChange={setSearchTerm}
            toolbar={
              <Button
                colorScheme="brand"
                size="sm"
                onClick={() => setInviteOpen(true)}
                isDisabled={!selectedTenantId}
              >
                {t("users.invite.submit")}
              </Button>
            }
          />
        </>
      )}

      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent as="form" onSubmit={handleSubmit}>
          <ModalHeader>{t("users.invite.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl isRequired>
                <FormLabel>{t("users.invite.fullName")}</FormLabel>
                <Input
                  name="full_name"
                  value={form.full_name}
                  onChange={handleChange}
                  placeholder={t("users.invite.fullNamePlaceholder")}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("users.invite.email")}</FormLabel>
                <Input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder={t("users.invite.emailPlaceholder")}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("users.invite.role")}</FormLabel>
                <Select name="role" value={form.role} onChange={handleChange}>
                  <option value="tenant_admin">{t("users.roles.tenantAdmin")}</option>
                  <option value="support">Soporte</option>
                  <option value="user">{t("users.roles.standard")}</option>
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setInviteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              colorScheme="brand"
              isLoading={createInvitationMutation.isPending}
              isDisabled={!selectedTenantId}
            >
              {t("users.invite.submit")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent as="form" onSubmit={handleEditSubmit}>
          <ModalHeader>{t("users.edit.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl isRequired>
                <FormLabel>{t("users.edit.fullName")}</FormLabel>
                <Input
                  name="full_name"
                  value={editForm.full_name}
                  onChange={handleEditChange}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>{t("users.edit.email")}</FormLabel>
                <Input
                  name="email"
                  type="email"
                  value={editForm.email}
                  onChange={handleEditChange}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{t("users.edit.role")}</FormLabel>
                <Select
                  name="role"
                  value={editForm.role}
                  onChange={handleEditChange}
                  isDisabled={isGerenciaEditing}
                >
                  <option value="tenant_admin">{t("users.roles.tenantAdmin")}</option>
                  <option value="support">Soporte</option>
                  <option value="user">{t("users.roles.standard")}</option>
                </Select>
                {isGerenciaEditing && (
                  <Text fontSize="xs" color="text.muted">
                    El rol de Gerencia se asigna automaticamente por departamento.
                  </Text>
                )}
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              colorScheme="brand"
              isLoading={updateUserMutation.isPending}
              isDisabled={!selectedTenantId}
            >
              {t("users.edit.save")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={employeeDetailsOpen} onClose={() => setEmployeeDetailsOpen(false)} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalle de empleado</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {!selectedEmployee ? (
              <Text fontSize="sm" color="text.muted">
                No hay empleado asociado.
              </Text>
            ) : (
              <VStack align="stretch" spacing={2}>
                <Text><strong>ID:</strong> {selectedEmployee.id}</Text>
                <Text><strong>Nombre:</strong> {selectedEmployee.full_name ?? "-"}</Text>
                <Text><strong>Email:</strong> {selectedEmployee.email ?? "-"}</Text>
                <Text><strong>Puesto:</strong> {selectedEmployee.position ?? "-"}</Text>
                <Text>
                  <strong>Estado:</strong> {selectedEmployee.is_active ? "Activo" : "Inactivo"}
                </Text>
                <Button
                  size="sm"
                  alignSelf="flex-start"
                  onClick={() => {
                    setEmployeeDetailsOpen(false);
                    router.history.push("/hr/employees");
                  }}
                >
                  Abrir RRHH empleados
                </Button>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => setEmployeeDetailsOpen(false)}>Cerrar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </AppShell>
  );
};


