import React from "react";
import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
} from "@chakra-ui/react";
import type { ErpTask } from "@api/erpTimeTracking";

interface TimeControlModalsProps {
  isOpen: boolean;
  editingSessionId: number | null;
  draftTaskId: string;
  draftDescription: string;
  draftStart: string;
  draftEnd: string;
  tasks: ErpTask[];
  onDraftTaskChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
  onDraftStartChange: (value: string) => void;
  onDraftEndChange: (value: string) => void;
  onDeleteSession: () => void;
  onSaveSession: () => void;
  onCloseModal: () => void;
  t: (key: string, options?: any) => string;
}

export const TimeControlModals: React.FC<TimeControlModalsProps> = ({
  isOpen,
  editingSessionId,
  draftTaskId,
  draftDescription,
  draftStart,
  draftEnd,
  tasks,
  onDraftTaskChange,
  onDraftDescriptionChange,
  onDraftStartChange,
  onDraftEndChange,
  onDeleteSession,
  onSaveSession,
  onCloseModal,
  t,
}) => (
  <Modal isOpen={isOpen} onClose={onCloseModal} isCentered size="md">
    <ModalOverlay />
    <ModalContent>
      <ModalHeader>
        {editingSessionId
          ? t("timeControl.modal.editTitle")
          : t("timeControl.modal.createTitle")}
      </ModalHeader>
      <ModalCloseButton />
      <ModalBody>
        <Stack spacing={3}>
          <FormControl>
            <FormLabel>{t("timeControl.fields.task")}</FormLabel>
            <Select
              value={draftTaskId}
              onChange={(e) => onDraftTaskChange(e.target.value)}
              placeholder={t("timeControl.controls.selectTask")}
            >
              <option value="">{t("timeControl.labels.noTask")}</option>
              {tasks.map((task) => (
                <option key={task.id} value={String(task.id)}>
                  #{task.id} - {task.title}
                </option>
              ))}
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel>{t("timeControl.fields.description")}</FormLabel>
            <Input
              value={draftDescription}
              onChange={(e) => onDraftDescriptionChange(e.target.value)}
              placeholder={t("timeControl.fields.optional")}
            />
          </FormControl>
          <FormControl>
            <FormLabel>{t("timeControl.fields.start")}</FormLabel>
            <Input
              type="datetime-local"
              value={draftStart}
              onChange={(e) => onDraftStartChange(e.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel>{t("timeControl.fields.end")}</FormLabel>
            <Input
              type="datetime-local"
              value={draftEnd}
              onChange={(e) => onDraftEndChange(e.target.value)}
            />
          </FormControl>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" mr={3} onClick={onCloseModal}>
          {t("common.cancel")}
        </Button>
        {editingSessionId && (
          <Button
            colorScheme="red"
            variant="outline"
            mr={3}
            onClick={onDeleteSession}
          >
            {t("timeControl.actions.delete")}
          </Button>
        )}
        <Button colorScheme="brand" onClick={onSaveSession}>
          {editingSessionId
            ? t("timeControl.actions.update")
            : t("common.save")}
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

