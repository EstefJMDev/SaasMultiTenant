import React from "react";
import { Box, Button, HStack, Stack, Text, useColorModeValue } from "@chakra-ui/react";

import { EmptyState, ErrorBanner, SkeletonTable } from "@shared/ui";
import type { ProjectDocument } from "@entities/projects";

interface ProjectDocumentsListProps {
  documents: ProjectDocument[];
  isLoading: boolean;
  isError: boolean;
  baseUrl: string;
}

export const ProjectDocumentsList: React.FC<ProjectDocumentsListProps> = ({
  documents,
  isLoading,
  isError,
  baseUrl,
}) => {
  const subtleText = useColorModeValue("gray.600", "gray.300");

  if (isLoading) {
    return <SkeletonTable rows={4} cols={2} />;
  }

  if (isError) {
    return (
      <ErrorBanner
        title="No se pudieron cargar los documentos."
        description="Intenta recargar la sección."
      />
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        title="Sin documentación subida."
        description="Sube el primer documento para este tipo."
      />
    );
  }

  return (
    <Stack spacing={2}>
      {documents.map((doc) => (
        <HStack
          key={doc.id}
          justify="space-between"
          borderWidth="1px"
          borderRadius="md"
          p={3}
        >
          <Box>
            <Text fontSize="sm" fontWeight="semibold">
              {doc.original_name}
            </Text>
            <Text fontSize="xs" color={subtleText}>
              {(doc.size_bytes / 1024).toFixed(1)} KB
            </Text>
          </Box>
          <Button
            as="a"
            href={doc.url.startsWith("http") ? doc.url : `${baseUrl}${doc.url}`}
            target="_blank"
            rel="noreferrer"
            size="sm"
            variant="outline"
          >
            Ver
          </Button>
        </HStack>
      ))}
    </Stack>
  );
};


