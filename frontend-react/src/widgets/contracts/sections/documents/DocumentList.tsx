import React from "react";

import { Box, Button, HStack, Table, Tbody, Text, Th, Thead, Tr } from "@chakra-ui/react";

import type { Contract } from "@entities/contracts";

import { CardContainer } from "@widgets/contracts/components/CardContainer";
import { CardHeader } from "@widgets/contracts/components/CardHeader";
import { EmptyStateText } from "@widgets/contracts/components/EmptyStateText";
import { DocumentCard, type DocumentsCenterDocument } from "./DocumentCard";

interface DocumentListProps {
  cardBg: string;
  borderColor: string;
  selectedContract: Contract | null;
  documents: DocumentsCenterDocument[];
  isLoading: boolean;
  onOpenContract: (contract: Contract) => void;
  onPreviewDocument: (doc: DocumentsCenterDocument) => void;
  onDownloadDocument: (doc: DocumentsCenterDocument) => void;
  formatDate: (value?: string | null) => string;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  cardBg,
  borderColor,
  selectedContract,
  documents,
  isLoading,
  onOpenContract,
  onPreviewDocument,
  onDownloadDocument,
  formatDate,
}) => {
  return (
    <CardContainer bg={cardBg} borderColor={borderColor} overflow="hidden">
      <CardHeader borderColor={borderColor}>
        <Text fontWeight="semibold">
          {selectedContract
            ? `Archivos de CT-${selectedContract.id}`
            : "Archivos del contrato"}
        </Text>
      </CardHeader>
      <Box p={6}>
        {!selectedContract && <EmptyStateText text="No hay contratos para mostrar." />}
        {selectedContract && isLoading && (
          <EmptyStateText text="Cargando documentos..." />
        )}
        {selectedContract && !isLoading && documents.length === 0 && (
          <EmptyStateText text="Este contrato todavía no tiene documentos generados." />
        )}
        {selectedContract && documents.length > 0 && (
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Tipo</Th>
                <Th>Fecha</Th>
                <Th textAlign="right">Acciones</Th>
              </Tr>
            </Thead>
            <Tbody>
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  formattedDate={formatDate(doc.created_at)}
                  onPreview={() => onPreviewDocument(doc)}
                  onDownload={() => onDownloadDocument(doc)}
                />
              ))}
            </Tbody>
          </Table>
        )}
        {selectedContract && (
          <HStack mt={4}>
            <Button size="sm" variant="outline" onClick={() => onOpenContract(selectedContract)}>
              Abrir ficha de contrato
            </Button>
          </HStack>
        )}
      </Box>
    </CardContainer>
  );
};
