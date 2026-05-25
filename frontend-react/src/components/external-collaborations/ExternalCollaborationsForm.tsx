import React from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Select,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import type { ExternalCollaborationType } from "@api/externalCollaborations";

export interface ExternalCollaborationFormValues {
  collaboration_type: ExternalCollaborationType;
  name: string;
  legal_name: string;
  cif: string;
  contact_email: string;
}

interface ExternalCollaborationsFormProps {
  values: ExternalCollaborationFormValues;
  typeOptions: ExternalCollaborationType[];
  mode: "create" | "edit";
  isSubmitting: boolean;
  onFieldChange: (field: keyof ExternalCollaborationFormValues, value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  showActions?: boolean;
}

export const ExternalCollaborationsForm: React.FC<
  ExternalCollaborationsFormProps
> = ({
  values,
  typeOptions,
  mode,
  isSubmitting,
  onFieldChange,
  onSubmit,
  onCancel,
  showActions = true,
}) => {
  const { t } = useTranslation();

  return (
    <Box>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={4}>
        <FormControl>
          <FormLabel>{t("externalCollaborations.form.type")}</FormLabel>
          <Select
            size="sm"
            h="9"
            bg="white"
            borderRadius="lg"
            value={values.collaboration_type}
            onChange={(e) =>
              onFieldChange("collaboration_type", e.target.value)
            }
          >
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <FormLabel>{t("externalCollaborations.form.name")}</FormLabel>
          <Input
            size="sm"
            h="9"
            bg="white"
            borderRadius="lg"
            value={values.name}
            onChange={(e) => onFieldChange("name", e.target.value)}
            placeholder={t("externalCollaborations.form.namePlaceholder")}
          />
        </FormControl>
        <FormControl>
          <FormLabel>{t("externalCollaborations.form.legalName")}</FormLabel>
          <Input
            size="sm"
            h="9"
            bg="white"
            borderRadius="lg"
            value={values.legal_name}
            onChange={(e) => onFieldChange("legal_name", e.target.value)}
            placeholder={t("externalCollaborations.form.legalPlaceholder")}
          />
        </FormControl>
        <FormControl>
          <FormLabel>{t("externalCollaborations.form.cif")}</FormLabel>
          <Input
            size="sm"
            h="9"
            bg="white"
            borderRadius="lg"
            value={values.cif}
            onChange={(e) => onFieldChange("cif", e.target.value)}
            placeholder={t("externalCollaborations.form.cifPlaceholder")}
          />
        </FormControl>
        <FormControl>
          <FormLabel>{t("externalCollaborations.form.contactEmail")}</FormLabel>
          <Input
            type="email"
            size="sm"
            h="9"
            bg="white"
            borderRadius="lg"
            value={values.contact_email}
            onChange={(e) => onFieldChange("contact_email", e.target.value)}
            placeholder={t("externalCollaborations.form.contactPlaceholder")}
          />
        </FormControl>
      </SimpleGrid>
      {showActions && (
        <>
          <Button colorScheme="brand" onClick={onSubmit} isLoading={isSubmitting}>
            {mode === "edit"
              ? t("externalCollaborations.form.update")
              : t("externalCollaborations.form.add")}
          </Button>
          {mode === "edit" && onCancel && (
            <Button ml={3} variant="ghost" onClick={onCancel}>
              <Text>{t("externalCollaborations.form.cancelEdit")}</Text>
            </Button>
          )}
        </>
      )}
    </Box>
  );
};

