import React, { useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Stack,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { AppShell } from "@widgets/app-shell/AppShell";
import { PageHero } from "@widgets/app-shell/PageHero";
import { apiClient } from "@shared/api/client";
import { createUserInvitation } from "@api/users";
import { useCurrentUser } from "@hooks/useCurrentUser";

interface Tenant {
  id: number;
  name: string;
  subdomain: string;
  is_active: boolean;
  created_at: string;
}

async function fetchTenants(): Promise<Tenant[]> {
  const response = await apiClient.get<Tenant[]>("/api/v1/tenants/");
  return response.data;
}

interface NewTenantFormState {
  name: string;
  subdomain: string;
  is_active: boolean;
  admin_email: string;
}

interface EditTenantFormState {
  id: number | null;
  name: string;
  subdomain: string;
  is_active: boolean;
}

/**
 * Página de ajustes y gestión de tenants (empresas).
 *
 * Permite crear nuevos tenants y ver el listado actual.
 * Al crear un tenant, también se crea su administrador principal.
 */
// Pantalla de administracion de tenants y sus administradores.
export const TenantSettingsPage: React.FC = () => {
  // Utilidades y estilos base.
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableHeadBg = useColorModeValue("gray.50", "gray.800");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Estado del formulario de alta de tenant.
  const [form, setForm] = useState<NewTenantFormState>({
    name: "",
    subdomain: "",
    is_active: true,
    admin_email: "",
  });
  const [editForm, setEditForm] = useState<EditTenantFormState>({
    id: null,
    name: "",
    subdomain: "",
    is_active: true,
  });

  // Carga de tenants existentes.
  const { data: tenants, isLoading, isError } = useQuery<Tenant[]>({
    queryKey: ["tenants"],
    queryFn: fetchTenants,
    enabled: isSuperAdmin,
  });

  // Mutacion para crear tenant y admin.
  const createTenantMutation = useMutation({
    mutationFn: async (payload: NewTenantFormState) => {
      const tenantResponse = await apiClient.post<Tenant>("/api/v1/tenants/", {
        name: payload.name,
        subdomain: payload.subdomain,
        is_active: payload.is_active,
      });
      const tenant = tenantResponse.data;

      await createUserInvitation({
        email: payload.admin_email,
        full_name: `Admin ${tenant.name}`,
        tenant_id: tenant.id,
        role_name: "tenant_admin",
      });

      return tenant;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast({
        title: t("tenantSettings.messages.createSuccessTitle"),
        description: t("tenantSettings.messages.createSuccessDesc"),
        status: "success",
      });
      setForm({
        name: "",
        subdomain: "",
        is_active: true,
        admin_email: "",
      });
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        error?.message ??
        t("tenantSettings.messages.createErrorFallback");
      toast({
        title: t("tenantSettings.messages.createErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async (payload: EditTenantFormState) => {
      if (!payload.id) {
        throw new Error(t("tenantSettings.messages.updateErrorFallback"));
      }
      const response = await apiClient.put<Tenant>(
        `/api/v1/tenants/${payload.id}`,
        {
          name: payload.name,
          subdomain: payload.subdomain,
          is_active: payload.is_active,
        },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      toast({
        title: t("tenantSettings.messages.updateSuccessTitle"),
        description: t("tenantSettings.messages.updateSuccessDesc"),
        status: "success",
      });
      setEditModalOpen(false);
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail ??
        error?.message ??
        t("tenantSettings.messages.updateErrorFallback");
      toast({
        title: t("tenantSettings.messages.updateErrorTitle"),
        description: detail,
        status: "error",
      });
    },
  });

  // Actualiza el formulario segun inputs.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const openEditModal = (tenant: Tenant) => {
    setEditForm({
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      is_active: tenant.is_active,
    });
    setEditModalOpen(true);
  };

  // Envia el formulario para crear tenant.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTenantMutation.mutate(form);
  };

  // Elimina un tenant existente.
  const handleDeleteTenant = (tenantId: number) => {
    apiClient
      .delete(`/api/v1/tenants/${tenantId}`)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["tenants"] });
        toast({
          title: t("tenantSettings.messages.deleteSuccessTitle"),
          description: t("tenantSettings.messages.deleteSuccessDesc"),
          status: "success",
        });
      })
      .catch((error: any) => {
        const detail =
          error?.response?.data?.detail ??
          t("tenantSettings.messages.deleteErrorFallback");
        toast({
          title: t("tenantSettings.messages.deleteErrorTitle"),
          description: detail,
          status: "error",
        });
      });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenantMutation.mutate(editForm);
  };

  // Render principal de la pagina.
  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <PageHero
          eyebrow={t("tenantSettings.header.eyebrow")}
          title={t("tenantSettings.header.title")}
          subtitle={t("tenantSettings.header.subtitle")}
        />
      </Box>
      {!isSuperAdmin && (
        <Text mb={6}>
          {t("tenantSettings.permissions.onlySuperAdmin")}
        </Text>
      )}
      {isSuperAdmin && (
        <Text mb={6}>          {t("tenantSettings.description")}
        </Text>
      )}

      {isSuperAdmin && (
        <>
          <Box mt={2}>
            <Stack direction={{ base: "column", md: "row" }} justify="space-between" align="center" mb={4}>
              <Heading as="h3" size="sm">{t("tenantSettings.list.title")}</Heading>
              <Button colorScheme="green" size="sm" onClick={() => setCreateModalOpen(true)}>
                {t("tenantSettings.actions.create")}
              </Button>
            </Stack>

            {isLoading && <Text>{t("tenantSettings.list.loading")}</Text>}
            {isError && (
              <Text color="red.500">
                {t("tenantSettings.list.error")}
              </Text>
            )}

            {!isLoading && tenants && (
              <Box borderWidth="1px" borderRadius="md" overflow="hidden" bg={cardBg}>
                <Table size="sm">
                  <Thead bg={tableHeadBg}>
                    <Tr>
                      <Th>{t("tenantSettings.list.name")}</Th>
                      <Th>{t("tenantSettings.fields.subdomain")}</Th>
                      <Th>{t("tenantSettings.fields.active")}</Th>
                      <Th>{t("tenantSettings.list.createdAt")}</Th>
                      <Th></Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {tenants.map((tenant) => (
                      <Tr key={tenant.id}>
                        <Td>{tenant.name}</Td>
                        <Td>{tenant.subdomain}</Td>
                        <Td>{tenant.is_active
                          ? t("tenantSettings.list.yes")
                          : t("tenantSettings.list.no")}</Td>
                        <Td>{new Date(tenant.created_at).toLocaleString()}</Td>
                        <Td>
                          <HStack spacing={2} justify="flex-end">
                            <Button
                              size="xs"
                              colorScheme="blue"
                              variant="outline"
                              onClick={() => openEditModal(tenant)}
                            >
                              {t("tenantSettings.actions.edit")}
                            </Button>
                            <Button
                              size="xs"
                              colorScheme="red"
                              variant="outline"
                              onClick={() => handleDeleteTenant(tenant.id)}
                            >
                              {t("tenantSettings.actions.delete")}
                            </Button>
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </Box>

          <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} size="lg">
            <ModalOverlay />
            <ModalContent as="form" onSubmit={handleSubmit}>
              <ModalHeader>{t("tenantSettings.actions.create")}</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <Stack spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.name")}</FormLabel>
                    <Input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder={t("tenantSettings.placeholders.name")}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.subdomain")}</FormLabel>
                    <Input
                      name="subdomain"
                      value={form.subdomain}
                      onChange={handleChange}
                      placeholder={t("tenantSettings.placeholders.subdomain")}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("tenantSettings.fields.active")}</FormLabel>
                    <Switch
                      name="is_active"
                      isChecked={form.is_active}
                      onChange={handleChange}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.adminEmail")}</FormLabel>
                    <Input
                      name="admin_email"
                      type="email"
                      value={form.admin_email}
                      onChange={handleChange}
                      placeholder={t("tenantSettings.placeholders.adminEmail")}
                    />
                  </FormControl>
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" mr={3} onClick={() => setCreateModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  colorScheme="green"
                  type="submit"
                  isLoading={createTenantMutation.isPending}
                >
                  {t("tenantSettings.actions.create")}
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>

          <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)} size="lg">
            <ModalOverlay />
            <ModalContent as="form" onSubmit={handleEditSubmit}>
              <ModalHeader>{t("tenantSettings.actions.edit")}</ModalHeader>
              <ModalCloseButton />
              <ModalBody>
                <Stack spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.name")}</FormLabel>
                    <Input
                      name="name"
                      value={editForm.name}
                      onChange={handleEditChange}
                      placeholder={t("tenantSettings.placeholders.name")}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>{t("tenantSettings.fields.subdomain")}</FormLabel>
                    <Input
                      name="subdomain"
                      value={editForm.subdomain}
                      onChange={handleEditChange}
                      placeholder={t("tenantSettings.placeholders.subdomain")}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("tenantSettings.fields.active")}</FormLabel>
                    <Switch
                      name="is_active"
                      isChecked={editForm.is_active}
                      onChange={handleEditChange}
                    />
                  </FormControl>
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" mr={3} onClick={() => setEditModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  colorScheme="blue"
                  type="submit"
                  isLoading={updateTenantMutation.isPending}
                >
                  {t("tenantSettings.actions.save")}
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </>
      )}
    </AppShell>
  );
}

