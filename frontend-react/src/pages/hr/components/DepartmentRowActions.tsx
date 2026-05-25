import React from "react";

import { Button, HStack } from "@chakra-ui/react";

interface DepartmentRowActionsProps {
  onEdit: () => void;
  onDeactivate: () => void;
  isLoading?: boolean;
}

export const DepartmentRowActions: React.FC<DepartmentRowActionsProps> = ({
  onEdit,
  onDeactivate,
  isLoading,
}) => {
  return (
    <HStack spacing={2}>
      <Button size="xs" variant="outline" colorScheme="brand" onClick={onEdit}>
        Editar
      </Button>
      <Button
        size="xs"
        variant="outline"
        colorScheme="red"
        onClick={onDeactivate}
        isLoading={isLoading}
      >
        Desactivar
      </Button>
    </HStack>
  );
};
