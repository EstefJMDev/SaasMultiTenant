import React, { useMemo } from "react";
import { Box, Button, HStack, Stack, Text, useColorModeValue, useToast } from "@chakra-ui/react";
import { useParams, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@widgets/app-shell/AppShell";
import { ProjectHero } from "@widgets/projects";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { fetchErpProject } from "@api/erpReports";
import {
  fetchProjectDocuments,
  uploadProjectDocument,
  type ProjectDocument,
} from "@entities/projects";
import { apiClient } from "@shared/api/client";
import { Card } from "@shared/ui";
import {
  ProjectDocumentsList,
  ProjectDocumentsUploader,
} from "@widgets/projects-documents";
import { getParentPath } from "@shared/routing/parentPath";
import type { ErpProject } from "@entities/projects";

export const ErpProjectDocumentsPage: React.FC = () => {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.600", "gray.300");
  const sectionHeaderBg = useColorModeValue("gray.50", "gray.800");
  const sectionHeaderBorder = useColorModeValue("gray.200", "gray.600");

  const numericProjectId = projectId ? Number(projectId) : NaN;
  const isValidProject = Number.isFinite(numericProjectId);

  const { data: currentUser } = useCurrentUser();
  const isSuperAdmin = currentUser?.is_super_admin === true;
  const tenantId = currentUser?.tenant_id ?? null;
  const effectiveTenantId = isSuperAdmin ? undefined : tenantId ?? undefined;

  const projectQuery = useQuery<ErpProject>({
    queryKey: ["erp-project", numericProjectId, effectiveTenantId ?? "all"],
    queryFn: () => fetchErpProject(numericProjectId, effectiveTenantId),
    enabled: isValidProject,
  });

  const documentsQuery = useQuery<ProjectDocument[]>({
    queryKey: ["project-documents", numericProjectId, effectiveTenantId ?? "all"],
    queryFn: () => fetchProjectDocuments(numericProjectId, effectiveTenantId),
    enabled: isValidProject,
  });

  const uploadMutation = useMutation({
    mutationFn: (payload: { file: File; docType: string }) =>
      uploadProjectDocument(
        numericProjectId,
        payload.file,
        payload.docType,
        effectiveTenantId,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["project-documents", numericProjectId, effectiveTenantId ?? "all"],
      });
      toast({ title: "Documento subido", status: "success" });
    },
    onError: (error: any) => {
      toast({
        title: "Error al subir",
        description:
          error?.response?.data?.detail ?? "No se pudo subir el documento.",
        status: "error",
      });
    },
  });

  const selectedProject: ErpProject | null = useMemo(() => {
    if (!projectQuery.data) return null;
    return projectQuery.data;
  }, [projectQuery.data]);
  const baseUrl = apiClient.defaults.baseURL || window.location.origin;

  const docTypeOptions = [
    {
      value: "solicitud",
      label: "Solicitud",
      description: "Documentos de solicitud y registro inicial.",
    },
    {
      value: "resolucion",
      label: "Resolución",
      description: "Resoluciones y respuestas oficiales.",
    },
    {
      value: "justificacion",
      label: "Justificación",
      description: "Justificantes y documentación de soporte.",
    },
    {
      value: "contratos",
      label: "Contratos",
      description: "Contratos firmados y anexos del proyecto.",
    },
    {
      value: "presupuestos",
      label: "Presupuestos",
      description: "Presupuestos y desgloses económicos.",
    },
  ];
  const documentsByType = useMemo(() => {
    const grouped: Record<string, ProjectDocument[]> = {};
    docTypeOptions.forEach((opt) => {
      grouped[opt.value] = [];
    });
    (documentsQuery.data ?? []).forEach((doc) => {
      const key = doc.doc_type || "otros";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(doc);
    });
    return grouped;
  }, [documentsQuery.data, docTypeOptions]);

  return (
    <AppShell>
      <ProjectHero
        items={[]}
        title="Documentación del proyecto"
        subtitle={selectedProject?.name ?? "Gestiona documentos y entregables del proyecto."}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const parent = getParentPath(router.state.location.pathname) ?? "/works";
              router.history.push(parent);
            }}
          >
            Volver
          </Button>
        }
      />

      {!isValidProject && (
        <Text color="red.500" mt={4}>
          Proyecto no válido.
        </Text>
      )}

      {isValidProject && (
        <Stack spacing={6}>
          {docTypeOptions.map((section) => (
            <Card key={section.value} bg={cardBg}>
              <Box
                p={3}
                rounded="md"
                bg={sectionHeaderBg}
                border="1px solid"
                borderColor={sectionHeaderBorder}
              >
                <HStack justify="space-between" align="center">
                  <Box>
                    <Text fontSize="sm" fontWeight={800} letterSpacing="0.02em">
                      {section.label}
                    </Text>
                    <Text fontSize="xs" color={subtleText}>
                      {section.description}
                    </Text>
                  </Box>
                  <Text fontSize="xs" color={subtleText}>
                    {(documentsByType[section.value] ?? []).length} archivos
                  </Text>
                </HStack>
              </Box>
              <Box mt={4}>
                <ProjectDocumentsUploader
                  isDisabled={uploadMutation.isPending}
                  onUpload={(file) =>
                    uploadMutation.mutate({
                      file,
                      docType: section.value,
                    })
                  }
                />
              </Box>
              <Box mt={4}>
                <ProjectDocumentsList
                  documents={documentsByType[section.value] ?? []}
                  isLoading={documentsQuery.isLoading}
                  isError={documentsQuery.isError}
                  baseUrl={baseUrl}
                />
              </Box>
            </Card>
          ))}
        </Stack>
      )}
    </AppShell>
  );
};

export default ErpProjectDocumentsPage;

