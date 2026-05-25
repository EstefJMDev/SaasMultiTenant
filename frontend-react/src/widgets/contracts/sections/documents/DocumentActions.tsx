import React from "react";

import { Button, HStack } from "@chakra-ui/react";

interface DocumentActionsProps {
  onPreview: () => void;
  onDownload: () => void;
}

export const DocumentActions: React.FC<DocumentActionsProps> = ({
  onPreview,
  onDownload,
}) => {
  return (
    <HStack justify="flex-end" spacing={2}>
      <Button size="xs" variant="outline" onClick={onPreview}>
        Ver
      </Button>
      <Button size="xs" colorScheme="blue" onClick={onDownload}>
        Descargar
      </Button>
    </HStack>
  );
};
