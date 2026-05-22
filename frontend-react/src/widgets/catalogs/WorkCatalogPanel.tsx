import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useDisclosure,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProvider,
  createWorkSite,
  deleteProvider,
  deleteWorkSite,
  fetchProviders,
  fetchWorkSites,
  ProviderItem,
  ProviderWriteInput,
  updateProvider,
  updateWorkSite,
  WorkSite,
  WorkSiteWriteInput,
} from "@api/workCatalog";

type CatalogResource = "worksites" | "providers";

interface WorkCatalogPanelProps {
  resource: CatalogResource;
  canView: boolean;
  canEdit: boolean;
}

const emptyWorkSite: WorkSiteWriteInput = {
  code: "",
  name: "",
  client_name: "",
};

const emptyProvider: ProviderWriteInput = {
  cif: "",
  razon_social: "",
  empresa: "",
  nombre_gerente: "",
  nif_gerente: "",
  direccion_empresa: "",
  tipo_escritura: "",
  fecha_escritura: "",
  nombre_notario: "",
  numero_protocolo: "",
};

export const WorkCatalogPanel: React.FC<WorkCatalogPanelProps> = ({
  resource,
  canView,
  canEdit,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const subtleBg = useColorModeValue("gray.50", "gray.900");
  const isWorksites = resource === "worksites";
  const isProviders = resource === "providers";
  const title = isWorksites ? "Visor de obras" : "Visor de proveedores";

  const [search, setSearch] = useState("");
  const [providerPage, setProviderPage] = useState(0);
  const [workForm, setWorkForm] = useState<WorkSiteWriteInput>(emptyWorkSite);
  const [providerForm, setProviderForm] =
    useState<ProviderWriteInput>(emptyProvider);
  const [editingWorkId, setEditingWorkId] = useState<number | null>(null);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(
    null,
  );
  const workModal = useDisclosure();
  const providerModal = useDisclosure();
  const providerPageSize = 25;

  const worksitesQuery = useQuery({
    queryKey: ["work-catalog-worksites", search],
    queryFn: () => fetchWorkSites(search),
    enabled: canView && isWorksites,
  });

  const providersQuery = useQuery({
    queryKey: ["work-catalog-providers", search, providerPage],
    queryFn: () =>
      fetchProviders({
        search,
        offset: providerPage * providerPageSize,
        limit: providerPageSize,
      }),
    enabled: canView && isProviders,
  });

  const refreshCatalogs = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["work-catalog-worksites"] }),
      queryClient.invalidateQueries({ queryKey: ["work-catalog-providers"] }),
      queryClient.invalidateQueries({ queryKey: ["erp-projects-autocomplete"] }),
    ]);
  };

  const closeWorkModal = () => {
    setEditingWorkId(null);
    setWorkForm(emptyWorkSite);
    workModal.onClose();
  };

  const closeProviderModal = () => {
    setEditingProviderId(null);
    setProviderForm(emptyProvider);
    providerModal.onClose();
  };

  const workMutation = useMutation({
    mutationFn: async (payload: WorkSiteWriteInput) =>
      editingWorkId === null
        ? createWorkSite(payload)
        : updateWorkSite(editingWorkId, payload),
    onSuccess: async () => {
      await refreshCatalogs();
      toast({ status: "success", title: "Obra guardada" });
      closeWorkModal();
    },
    onError: (error: any) => {
      toast({
        status: "error",
        title: "No se pudo guardar la obra",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
      });
    },
  });

  const deleteWorkMutation = useMutation({
    mutationFn: (id: number) => deleteWorkSite(id),
    onSuccess: async () => {
      await refreshCatalogs();
      toast({ status: "success", title: "Obra eliminada" });
    },
    onError: (error: any) => {
      toast({
        status: "error",
        title: "No se pudo eliminar la obra",
        description: error?.response?.data?.detail ?? "Revisa si está en uso.",
      });
    },
  });

  const providerMutation = useMutation({
    mutationFn: async (payload: ProviderWriteInput) =>
      editingProviderId === null
        ? createProvider(payload)
        : updateProvider(editingProviderId, payload),
    onSuccess: async () => {
      await refreshCatalogs();
      toast({ status: "success", title: "Proveedor guardado" });
      closeProviderModal();
    },
    onError: (error: any) => {
      toast({
        status: "error",
        title: "No se pudo guardar el proveedor",
        description: error?.response?.data?.detail ?? "Revisa los datos.",
      });
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: (id: string) => deleteProvider(id),
    onSuccess: async () => {
      await refreshCatalogs();
      toast({ status: "success", title: "Proveedor eliminado" });
    },
    onError: (error: any) => {
      toast({
        status: "error",
        title: "No se pudo eliminar el proveedor",
        description: error?.response?.data?.detail ?? "Revisa si está en uso.",
      });
    },
  });

  const providerTotalPages = useMemo(() => {
    const total = providersQuery.data?.total ?? 0;
    return Math.max(1, Math.ceil(total / providerPageSize));
  }, [providersQuery.data?.total]);

  const openCreateWork = () => {
    setEditingWorkId(null);
    setWorkForm(emptyWorkSite);
    workModal.onOpen();
  };

  const openEditWork = (item: WorkSite) => {
    setEditingWorkId(item.id);
    setWorkForm({
      code: item.code,
      name: item.name,
      client_name: item.client_name,
    });
    workModal.onOpen();
  };

  const openCreateProvider = () => {
    setEditingProviderId(null);
    setProviderForm(emptyProvider);
    providerModal.onOpen();
  };

  const openEditProvider = (item: ProviderItem) => {
    setEditingProviderId(item.id);
    setProviderForm({
      cif: item.cif,
      razon_social: item.razon_social,
      empresa: item.empresa ?? "",
      nombre_gerente: item.nombre_gerente ?? "",
      nif_gerente: item.nif_gerente ?? "",
      direccion_empresa: item.direccion_empresa ?? "",
      tipo_escritura: item.tipo_escritura ?? "",
      fecha_escritura: item.fecha_escritura ?? "",
      nombre_notario: item.nombre_notario ?? "",
      numero_protocolo: item.numero_protocolo ?? "",
    });
    providerModal.onOpen();
  };

  if (!canView) {
    return (
      <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" p={5}>
        <Heading size="sm" mb={2}>
          Sin acceso
        </Heading>
        <Text color="gray.500">
          No tienes permisos para ver este visor.
        </Text>
      </Box>
    );
  }

  return (
    <>
      <Stack spacing={4}>
        <Box bg={cardBg} border="1px solid" borderColor={borderColor} rounded="xl" p={5}>
          <HStack justify="space-between" mb={4}>
            <VStack align="start" spacing={1}>
              <Heading size="sm">{title}</Heading>
              <Text fontSize="sm" color="gray.500">
                {isWorksites
                  ? "Consulta y mantenimiento del catálogo interno de obras."
                  : "Consulta y mantenimiento del catálogo interno de proveedores."}
              </Text>
            </VStack>
            {canEdit ? (
              <Button
                colorScheme="brand"
                onClick={isWorksites ? openCreateWork : openCreateProvider}
              >
                {isWorksites ? "Añadir obra" : "Añadir proveedor"}
              </Button>
            ) : null}
          </HStack>

          <HStack justify="space-between" mb={4}>
            <Input
              maxW="360px"
              placeholder={isWorksites ? "Buscar obra o cliente" : "Buscar proveedor"}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setProviderPage(0);
              }}
            />
          </HStack>

          {isWorksites ? (
            <Box overflowX="auto">
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Nº obra</Th>
                    <Th>Nombre</Th>
                    <Th>Cliente</Th>
                    {canEdit ? <Th textAlign="right">Acciones</Th> : null}
                  </Tr>
                </Thead>
                <Tbody>
                  {(worksitesQuery.data ?? []).map((item) => (
                    <Tr key={item.id}>
                      <Td>{item.code}</Td>
                      <Td>{item.name}</Td>
                      <Td>{item.client_name}</Td>
                      {canEdit ? (
                        <Td>
                          <HStack justify="flex-end">
                            <Button size="xs" variant="outline" onClick={() => openEditWork(item)}>
                              Editar
                            </Button>
                            <Button
                              size="xs"
                              colorScheme="red"
                              variant="outline"
                              onClick={() => deleteWorkMutation.mutate(item.id)}
                            >
                              Eliminar
                            </Button>
                          </HStack>
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          ) : (
            <>
              <Box overflowX="auto">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>CIF</Th>
                      <Th>Razón social</Th>
                      <Th>Empresa</Th>
                      <Th>Gerente</Th>
                      <Th>Dirección</Th>
                      {canEdit ? <Th textAlign="right">Acciones</Th> : null}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {(providersQuery.data?.items ?? []).map((item) => (
                      <Tr key={item.id}>
                        <Td>{item.cif}</Td>
                        <Td>{item.razon_social}</Td>
                        <Td>{item.empresa ?? "—"}</Td>
                        <Td>{item.nombre_gerente ?? "—"}</Td>
                        <Td>{item.direccion_empresa ?? "—"}</Td>
                        {canEdit ? (
                          <Td>
                            <HStack justify="flex-end">
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => openEditProvider(item)}
                              >
                                Editar
                              </Button>
                              <Button
                                size="xs"
                                colorScheme="red"
                                variant="outline"
                                onClick={() =>
                                  deleteProviderMutation.mutate(item.id)
                                }
                              >
                                Eliminar
                              </Button>
                            </HStack>
                          </Td>
                        ) : null}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>

              <HStack justify="space-between" mt={4} bg={subtleBg} rounded="lg" p={3}>
                <Text fontSize="sm">
                  Página {providerPage + 1} de {providerTotalPages} ·{" "}
                  {providersQuery.data?.total ?? 0} proveedores
                </Text>
                <HStack>
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={providerPage === 0}
                    onClick={() => setProviderPage((page) => Math.max(0, page - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    isDisabled={providerPage + 1 >= providerTotalPages}
                    onClick={() => setProviderPage((page) => page + 1)}
                  >
                    Siguiente
                  </Button>
                </HStack>
              </HStack>
            </>
          )}
        </Box>
      </Stack>

      <Modal isOpen={workModal.isOpen} onClose={closeWorkModal} isCentered size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editingWorkId === null ? "Nueva obra" : "Editar obra"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl>
                <FormLabel>Nº de obra</FormLabel>
                <Input
                  value={workForm.code}
                  onChange={(e) =>
                    setWorkForm((prev) => ({
                      ...prev,
                      code: e.target.value.replace(/\D/g, "").slice(0, 4),
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Nombre de obra</FormLabel>
                <Input
                  value={workForm.name}
                  onChange={(e) =>
                    setWorkForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Cliente</FormLabel>
                <Input
                  value={workForm.client_name}
                  onChange={(e) =>
                    setWorkForm((prev) => ({
                      ...prev,
                      client_name: e.target.value,
                    }))
                  }
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeWorkModal}>
              Cancelar
            </Button>
            <Button
              colorScheme="brand"
              onClick={() => workMutation.mutate(workForm)}
              isLoading={workMutation.isPending}
            >
              Guardar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={providerModal.isOpen}
        onClose={closeProviderModal}
        isCentered
        size="2xl"
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {editingProviderId === null ? "Nuevo proveedor" : "Editar proveedor"}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl>
                <FormLabel>CIF</FormLabel>
                <Input
                  value={providerForm.cif ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      cif: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Razón social</FormLabel>
                <Input
                  value={providerForm.razon_social ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      razon_social: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Empresa corta</FormLabel>
                <Input
                  value={providerForm.empresa ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      empresa: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Gerente</FormLabel>
                <Input
                  value={providerForm.nombre_gerente ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      nombre_gerente: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>NIF gerente</FormLabel>
                <Input
                  value={providerForm.nif_gerente ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      nif_gerente: e.target.value.toUpperCase(),
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Dirección</FormLabel>
                <Input
                  value={providerForm.direccion_empresa ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      direccion_empresa: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Tipo escritura</FormLabel>
                <Input
                  value={providerForm.tipo_escritura ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      tipo_escritura: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Fecha escritura</FormLabel>
                <Input
                  type="date"
                  value={providerForm.fecha_escritura ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      fecha_escritura: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Notario</FormLabel>
                <Input
                  value={providerForm.nombre_notario ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      nombre_notario: e.target.value,
                    }))
                  }
                />
              </FormControl>
              <FormControl>
                <FormLabel>Protocolo</FormLabel>
                <Input
                  value={providerForm.numero_protocolo ?? ""}
                  onChange={(e) =>
                    setProviderForm((prev) => ({
                      ...prev,
                      numero_protocolo: e.target.value,
                    }))
                  }
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeProviderModal}>
              Cancelar
            </Button>
            <Button
              colorScheme="brand"
              onClick={() => providerMutation.mutate(providerForm)}
              isLoading={providerMutation.isPending}
            >
              Guardar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};
