import React from "react";
import { Button, Stack } from "@chakra-ui/react";

interface TaskRowActionsProps {
  onEdit: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDelete: (event: React.MouseEvent<HTMLButtonElement>) => void;
  isDeleting: boolean;
  editLabel: string;
  deleteLabel: string;
}

export const TaskRowActions: React.FC<TaskRowActionsProps> = ({
  onEdit,
  onDelete,
  isDeleting,
  editLabel,
  deleteLabel,
}) => (
  <Stack direction="row" spacing={2}>
    <Button size="xs" variant="outline" colorScheme="brand" onClick={onEdit}>
      {editLabel}
    </Button>
    <Button
      size="xs"
      variant="ghost"
      colorScheme="red"
      onClick={onDelete}
      isLoading={isDeleting}
    >
      {deleteLabel}
    </Button>
  </Stack>
);

