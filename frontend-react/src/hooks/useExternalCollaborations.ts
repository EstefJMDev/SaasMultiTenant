import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createExternalCollaboration,
  deleteExternalCollaboration,
  fetchExternalCollaborations,
  updateExternalCollaboration,
  type ExternalCollaborationCreate,
  type ExternalCollaborationUpdate,
} from "@api/externalCollaborations";

const QUERY_KEY = ["external-collaborations"];

export const useExternalCollaborations = (tenantId?: number) => {
  const queryClient = useQueryClient();
  const scopedKey = [...QUERY_KEY, tenantId ?? "all"];

  const listQuery = useQuery({
    queryKey: scopedKey,
    queryFn: () => fetchExternalCollaborations(tenantId),
  });

  const createMutation = useMutation({
    mutationFn: (payload: ExternalCollaborationCreate) =>
      createExternalCollaboration(payload, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scopedKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      collaborationId,
      payload,
    }: {
      collaborationId: number;
      payload: ExternalCollaborationUpdate;
    }) => updateExternalCollaboration(collaborationId, payload, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scopedKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (collaborationId: number) =>
      deleteExternalCollaboration(collaborationId, tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scopedKey });
    },
  });

  return {
    listQuery,
    createMutation,
    updateMutation,
    deleteMutation,
  };
};
