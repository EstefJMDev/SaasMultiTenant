import React from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
} from "@chakra-ui/react";

import type { Department } from "@entities/hr";

type HrDeleteDepartmentDialogProps = {
  isOpen: boolean;
  deletingDepartment: Department | null;
  cancelRef: React.RefObject<HTMLButtonElement>;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const HrDeleteDepartmentDialog: React.FC<HrDeleteDepartmentDialogProps> = ({
  isOpen,
  deletingDepartment,
  cancelRef,
  isDeleting,
  onClose,
  onConfirm,
}) => (
  <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered>
    <AlertDialogOverlay />
    <AlertDialogContent>
      <AlertDialogHeader fontSize="lg" fontWeight="bold">
        Eliminar departamento
      </AlertDialogHeader>
      <AlertDialogBody>
        {deletingDepartment
          ? `Se eliminara definitivamente "${deletingDepartment.name}". Esta accion no se puede deshacer.`
          : "Se eliminara definitivamente este departamento."}
      </AlertDialogBody>
      <AlertDialogFooter>
        <Button ref={cancelRef} onClick={onClose}>
          Cancelar
        </Button>
        <Button colorScheme="red" ml={3} onClick={onConfirm} isLoading={isDeleting}>
          Eliminar
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
