import React from "react";
import {
  Box,
  Button,
  HStack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import type { ExternalCollaboration } from "@api/externalCollaborations";

interface ExternalCollaborationsTableProps {
  items: ExternalCollaboration[];
  onEdit: (item: ExternalCollaboration) => void;
  onDelete: (item: ExternalCollaboration) => void;
  deletingId?: number | null;
}

export const ExternalCollaborationsTable: React.FC<
  ExternalCollaborationsTableProps
> = ({ items, onEdit, onDelete, deletingId }) => {
  const { t } = useTranslation();
  const cardBg = useColorModeValue("white", "gray.700");
  const tableBorder = useColorModeValue("gray.200", "gray.600");
  const tableHeadBg = useColorModeValue("gray.100", "gray.800");

  return (
    <Box bg={cardBg} borderWidth="1px" borderRadius="xl" overflow="hidden">
      <Table size="sm">
        <Thead bg={tableHeadBg}>
          <Tr>
            <Th borderColor={tableBorder}>
              {t("externalCollaborations.table.name")}
            </Th>
            <Th borderColor={tableBorder}>
              {t("externalCollaborations.table.type")}
            </Th>
            <Th borderColor={tableBorder}>
              {t("externalCollaborations.table.legalName")}
            </Th>
            <Th borderColor={tableBorder}>
              {t("externalCollaborations.table.cif")}
            </Th>
            <Th borderColor={tableBorder}>
              {t("externalCollaborations.table.contactEmail")}
            </Th>
            <Th borderColor={tableBorder}>
              {t("externalCollaborations.table.actions")}
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {items.length === 0 ? (
            <Tr>
              <Td colSpan={6} py={6} textAlign="center" color="gray.500">
                {t("externalCollaborations.table.empty")}
              </Td>
            </Tr>
          ) : (
            items.map((entry) => (
              <Tr key={entry.id}>
                <Td borderColor={tableBorder}>{entry.name}</Td>
                <Td borderColor={tableBorder}>{entry.collaboration_type}</Td>
                <Td borderColor={tableBorder}>{entry.legal_name}</Td>
                <Td borderColor={tableBorder}>{entry.cif}</Td>
                <Td borderColor={tableBorder}>{entry.contact_email}</Td>
                <Td borderColor={tableBorder}>
                  <HStack>
                    <Button
                      size="sm"
                      h="9"
                      borderRadius="lg"
                      variant="outline"
                      onClick={() => onEdit(entry)}
                    >
                      {t("externalCollaborations.table.edit")}
                    </Button>
                    <Button
                      size="sm"
                      h="9"
                      borderRadius="lg"
                      colorScheme="red"
                      variant="outline"
                      isLoading={deletingId === entry.id}
                      onClick={() => onDelete(entry)}
                    >
                      {t("externalCollaborations.table.delete")}
                    </Button>
                  </HStack>
                </Td>
              </Tr>
            ))
          )}
        </Tbody>
      </Table>
    </Box>
  );
};
