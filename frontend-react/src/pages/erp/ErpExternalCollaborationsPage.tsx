import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Icon,
  Heading,
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
  Stack,
  Text,
  useColorModeValue,
  useToast,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";

import type {
  ExternalCollaboration,
  ExternalCollaborationCreate,
  ExternalCollaborationType,
} from "@api/externalCollaborations";
import { ExternalCollaborationsForm } from "@components/external-collaborations/ExternalCollaborationsForm";
import { ExternalCollaborationsTable } from "@components/external-collaborations/ExternalCollaborationsTable";
import { AppShell } from "@widgets/app-shell/AppShell";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { useExternalCollaborations } from "@hooks/useExternalCollaborations";
import { ProjectHero } from "@widgets/projects/ProjectHero";

export const ErpExternalCollaborationsPage: React.FC = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const fadeUp = keyframes`
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  `;

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const effectiveTenantId = isSuperAdmin
    ? undefined
    : currentUser?.tenant_id ?? undefined;
  const { listQuery, createMutation, updateMutation, deleteMutation } =
    useExternalCollaborations(effectiveTenantId);

  const typeOptions = useMemo<ExternalCollaborationType[]>(
    () => [
      "Universidades",
      "Auditoria",
      "Consultoras",
      "Centros tecnologicos",
    ],
    [],
  );

  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [formValues, setFormValues] = useState<ExternalCollaborationCreate>({
    collaboration_type: typeOptions[0],
    name: "",
    legal_name: "",
    cif: "",
    contact_email: "",
  });

  const resetForm = () => {
    setFormValues({
      collaboration_type: typeOptions[0],
      name: "",
      legal_name: "",
      cif: "",
      contact_email: "",
    });
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleFieldChange = (
    field: keyof ExternalCollaborationCreate,
    value: string,
  ) => {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validate = () => {
    const payload = {
      collaboration_type: formValues.collaboration_type,
      name: formValues.name.trim(),
      legal_name: formValues.legal_name.trim(),
      cif: formValues.cif.trim(),
      contact_email: formValues.contact_email.trim(),
    };
    if (
      !payload.name ||
      !payload.legal_name ||
      !payload.cif ||
      !payload.contact_email ||
      !payload.collaboration_type
    ) {
      toast({
        title: t("externalCollaborations.messages.missingTitle"),
        description: t("externalCollaborations.messages.missingDesc"),
        status: "warning",
      });
      return null;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(payload.contact_email)) {
      toast({
        title: t("externalCollaborations.messages.invalidEmailTitle"),
        description: t("externalCollaborations.messages.invalidEmailDesc"),
        status: "warning",
      });
      return null;
    }
    return payload;
  };

  const filteredItems = useMemo(() => {
    const text = filterText.trim().toLowerCase();
    return (listQuery.data ?? []).filter((entry) => {
      if (filterType !== "all" && entry.collaboration_type !== filterType) {
        return false;
      }
      if (!text) return true;
      const haystack = [
        entry.collaboration_type,
        entry.name,
        entry.legal_name,
        entry.cif,
        entry.contact_email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(text);
    });
  }, [filterText, filterType, listQuery.data]);

  const handleSubmit = () => {
    const payload = validate();
    if (!payload) return;
    if (editingId) {
      updateMutation.mutate(
        { collaborationId: editingId, payload },
        {
          onSuccess: () => {
            toast({
              title: t("externalCollaborations.messages.updateTitle"),
              status: "success",
            });
            closeModal();
          },
        },
      );
      return;
    }
    createMutation.mutate(payload, {
      onSuccess: () => {
        toast({
          title: t("externalCollaborations.messages.createTitle"),
          status: "success",
        });
        closeModal();
      },
    });
  };

  const handleEdit = (entry: ExternalCollaboration) => {
    setEditingId(entry.id);
    setFormValues({
      collaboration_type: entry.collaboration_type,
      name: entry.name,
      legal_name: entry.legal_name,
      cif: entry.cif,
      contact_email: entry.contact_email,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (entryId: number) => {
    setDeletingId(entryId);
    deleteMutation.mutate(entryId, {
      onSettled: () => setDeletingId(null),
    });
  };

  return (
    <AppShell>
      <Box animation={`${fadeUp} 0.6s ease-out`} mb={8}>
        <ProjectHero
          items={[]}
          eyebrow={t("externalCollaborations.header.eyebrow")}
          title={t("externalCollaborations.header.title")}
          subtitle={t("externalCollaborations.header.subtitle")}
          leadIcon={
            <Icon viewBox="0 0 24 24" boxSize={3.5}>
              <path
                fill="currentColor"
                d="M3,4H21V6H3V4M4,8H20V20H4V8M6,10V18H18V10H6Z"
              />
            </Icon>
          }
        />
      </Box>

      <Box mb={6} display="flex" justifyContent="flex-end">
        <Button
          bgGradient="linear(to-r, brand.500, brand.600)"
          color="white"
          borderRadius="lg"
          h="10"
          px={6}
          _hover={{ bgGradient: "linear(to-r, brand.600, brand.700)" }}
          onClick={openCreateModal}
        >
          {t("externalCollaborations.actions.addNew")}
        </Button>
      </Box>

      <Box mb={6}>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <FormControl>
            <FormLabel>{t("externalCollaborations.filters.search")}</FormLabel>
            <Input
              size="sm"
              h="9"
              bg="white"
              borderRadius="lg"
              borderColor={borderColor}
              _focus={{
                borderColor: "brand.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
              }}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={t("externalCollaborations.filters.searchPlaceholder")}
            />
          </FormControl>
          <FormControl>
            <FormLabel>{t("externalCollaborations.filters.type")}</FormLabel>
            <Select
              size="sm"
              h="9"
              bg="white"
              borderRadius="lg"
              borderColor={borderColor}
              _focus={{
                borderColor: "brand.500",
                boxShadow: "0 0 0 1px var(--chakra-colors-brand-500)",
              }}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">
                {t("externalCollaborations.filters.all")}
              </option>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>{t("externalCollaborations.filters.clear")}</FormLabel>
            <Button
              variant="outline"
              w="fit-content"
              size="sm"
              h="9"
              borderRadius="lg"
              borderWidth="2px"
              borderColor="brand.500"
              color="brand.600"
              fontWeight="semibold"
              _hover={{
                bg: "brand.50",
                borderColor: "brand.600",
              }}
              mt={2}
              onClick={() => {
                setFilterText("");
                setFilterType("all");
              }}
            >
              {t("externalCollaborations.filters.reset")}
            </Button>
          </FormControl>
        </SimpleGrid>
      </Box>

      {listQuery.isError ? (
        <Text color="red.500" fontSize="sm">
          {t("externalCollaborations.messages.loadError")}
        </Text>
      ) : (
        <ExternalCollaborationsTable
          items={filteredItems}
          onEdit={handleEdit}
          onDelete={(entry: ExternalCollaboration) => handleDelete(entry.id)}
          deletingId={deletingId}
        />
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal} size="2xl">
        <ModalOverlay />
        <ModalContent maxW="960px">
          <ModalHeader>
            {editingId
              ? t("externalCollaborations.form.update")
              : t("externalCollaborations.form.add")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <ExternalCollaborationsForm
              values={formValues}
              typeOptions={typeOptions}
              mode={editingId ? "edit" : "create"}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
              onFieldChange={handleFieldChange}
              onSubmit={handleSubmit}
              showActions={false}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button
              bgGradient="linear(to-r, brand.500, brand.600)"
              color="white"
              borderRadius="lg"
              h="10"
              px={6}
              _hover={{ bgGradient: "linear(to-r, brand.600, brand.700)" }}
              onClick={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingId
                ? t("externalCollaborations.form.update")
                : t("externalCollaborations.form.add")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </AppShell>
  );
};


