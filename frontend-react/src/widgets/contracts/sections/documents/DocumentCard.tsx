import React from "react";

import { Td, Tr } from "@chakra-ui/react";

import { DocumentActions } from "./DocumentActions";

export interface DocumentsCenterDocument {
  id: number;
  doc_type: string;
  created_at?: string | null;
}

interface DocumentCardProps {
  doc: DocumentsCenterDocument;
  formattedDate: string;
  onPreview: () => void;
  onDownload: () => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  doc,
  formattedDate,
  onPreview,
  onDownload,
}) => {
  return (
    <Tr key={doc.id}>
      <Td>{doc.doc_type}</Td>
      <Td>{formattedDate}</Td>
      <Td>
        <DocumentActions onPreview={onPreview} onDownload={onDownload} />
      </Td>
    </Tr>
  );
};
