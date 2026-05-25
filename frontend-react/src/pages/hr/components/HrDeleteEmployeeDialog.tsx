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
import { useTranslation } from "react-i18next";

type HrDeleteEmployeeDialogProps = {
  isOpen: boolean;
  cancelRef: React.RefObject<HTMLButtonElement>;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export const HrDeleteEmployeeDialog: React.FC<HrDeleteEmployeeDialogProps> = ({
  isOpen,
  cancelRef,
  isDeleting,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();

  return (
    <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose} isCentered>
      <AlertDialogOverlay />
      <AlertDialogContent>
        <AlertDialogHeader fontSize="lg" fontWeight="bold">
          {t("hr.alert.title")}
        </AlertDialogHeader>
        <AlertDialogBody>{t("hr.alert.body")}</AlertDialogBody>
        <AlertDialogFooter>
          <Button ref={cancelRef} onClick={onClose}>
            {t("hr.alert.cancel")}
          </Button>
          <Button colorScheme="red" onClick={onConfirm} ml={3} isLoading={isDeleting}>
            {t("hr.alert.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
