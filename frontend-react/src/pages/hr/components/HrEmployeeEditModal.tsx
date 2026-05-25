import React from "react";
import {
  Button,
  Checkbox,
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
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import type { Department, EmployeeEditFormState } from "@entities/hr";
import type { DirectorTecnicoOption, Position } from "@api/hr";

type Option = { value: string; label: string };

type HrEmployeeEditModalProps = {
  isOpen: boolean;
  employeeEditForm: EmployeeEditFormState;
  safeDepartments: Department[];
  safePositions: Position[];
  directoresTecnicos: DirectorTecnicoOption[];
  titulacionOptions: Option[];
  editAvailabilityLocked: boolean;
  isDeleting: boolean;
  isSaving: boolean;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
  setEmployeeEditForm: React.Dispatch<React.SetStateAction<EmployeeEditFormState>>;
};

export const HrEmployeeEditModal: React.FC<HrEmployeeEditModalProps> = ({
  isOpen,
  employeeEditForm,
  safeDepartments,
  safePositions,
  directoresTecnicos,
  titulacionOptions,
  editAvailabilityLocked,
  isDeleting,
  isSaving,
  onClose,
  onDelete,
  onSave,
  onChange,
  setEmployeeEditForm,
}) => {
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t("hr.modal.title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl>
                <FormLabel>{t("hr.employees.form.firstName", "Nombre")}</FormLabel>
                <Input name="firstName" value={employeeEditForm.firstName} onChange={onChange} />
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.employees.form.lastName", "Apellidos")}</FormLabel>
                <Input name="lastName" value={employeeEditForm.lastName} onChange={onChange} />
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel>{t("hr.modal.email")}</FormLabel>
              <Input name="email" value={employeeEditForm.email} onChange={onChange} />
            </FormControl>

            <FormControl>
              <Checkbox
                name="isDepartmentHead"
                isChecked={employeeEditForm.isDepartmentHead}
                onChange={onChange}
              >
                {t("hr.employees.form.isDepartmentHead", "Jefe de departamento")}
              </Checkbox>
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.modal.titulacion")}</FormLabel>
              <Select
                name="titulacion"
                value={employeeEditForm.titulacion}
                onChange={onChange}
                placeholder={t("hr.employees.form.titulacionPlaceholder")}
              >
                {titulacionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.modal.hourlyRate")}</FormLabel>
              <Input name="hourlyRate" type="number" value={employeeEditForm.hourlyRate} onChange={onChange} />
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.modal.availableHours", "Horas disponibles")}</FormLabel>
              <Input
                name="availableHours"
                type="number"
                value={employeeEditForm.availableHours}
                onChange={onChange}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>{t("hr.modal.primaryDepartment")}</FormLabel>
              <Select
                name="primaryDepartmentId"
                value={employeeEditForm.primaryDepartmentId === "" ? "" : employeeEditForm.primaryDepartmentId}
                onChange={onChange}
                placeholder={t("hr.modal.departmentPlaceholder")}
              >
                {safeDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.modal.position", "Puesto")}</FormLabel>
              {(() => {
                const primaryDeptId =
                  employeeEditForm.primaryDepartmentId === ""
                    ? null
                    : Number(employeeEditForm.primaryDepartmentId);
                if (!primaryDeptId) {
                  return (
                    <Text fontSize="sm" color="gray.500">
                      Selecciona primero un departamento.
                    </Text>
                  );
                }
                const filtered = safePositions.filter(
                  (pos) => pos.department_id === primaryDeptId,
                );
                if (filtered.length === 0) {
                  return (
                    <Text fontSize="sm" color="gray.500">
                      No hay puestos disponibles para este departamento.
                    </Text>
                  );
                }
                return (
                  <Select
                    name="positionId"
                    value={employeeEditForm.positionId === "" ? "" : employeeEditForm.positionId}
                    onChange={onChange}
                    placeholder={t("hr.modal.positionPlaceholder", "Selecciona un puesto")}
                  >
                    {filtered.map((pos) => (
                      <option key={pos.id} value={pos.id}>
                        {pos.name}
                      </option>
                    ))}
                  </Select>
                );
              })()}
            </FormControl>

            {(() => {
              const selectedPosition = safePositions.find(
                (p) => p.id === employeeEditForm.positionId,
              );
              if (!selectedPosition || selectedPosition.role_code !== "JO") {
                return null;
              }
              return (
                <FormControl>
                  <FormLabel>Director Técnico asignado</FormLabel>
                  <Select
                    name="directorTecnicoId"
                    value={
                      employeeEditForm.directorTecnicoId === ""
                        ? ""
                        : employeeEditForm.directorTecnicoId
                    }
                    onChange={onChange}
                    placeholder="Sin Director Técnico asignado"
                  >
                    {directoresTecnicos.map((dt) => (
                      <option key={dt.id} value={dt.id}>
                        {dt.full_name}
                      </option>
                    ))}
                  </Select>
                  {directoresTecnicos.length === 0 && (
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      No hay Directores Técnicos disponibles. Crea un puesto con rol DT y asígnalo a un empleado.
                    </Text>
                  )}
                </FormControl>
              );
            })()}

            <FormControl>
              <FormLabel>{t("hr.modal.availabilityPercentage", "% disponibilidad proyecto")}</FormLabel>
              <Input
                name="availabilityPercentage"
                type="number"
                value={employeeEditForm.availabilityPercentage}
                onChange={onChange}
                isDisabled={editAvailabilityLocked}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.employees.form.secondaryDepartment", "Segundo departamento (opcional)")}</FormLabel>
              <Select
                name="secondaryDepartmentId"
                value={employeeEditForm.secondaryDepartmentId === "" ? "" : employeeEditForm.secondaryDepartmentId}
                onChange={onChange}
                placeholder={t("hr.modal.departmentPlaceholder")}
              >
                {safeDepartments
                  .filter((department) => department.id !== employeeEditForm.primaryDepartmentId)
                  .map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
              </Select>
            </FormControl>

            <FormControl isDisabled={!employeeEditForm.secondaryDepartmentId}>
              <FormLabel>{t("hr.employees.form.secondaryPercentage", "% segundo departamento")}</FormLabel>
              <Input
                name="secondaryPercentage"
                type="number"
                min={1}
                max={99}
                value={employeeEditForm.secondaryPercentage}
                onChange={onChange}
                placeholder={t("hr.employees.form.secondaryPercentagePlaceholder", "Ej. 40")}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.modal.status")}</FormLabel>
              <Select
                value={employeeEditForm.isActive ? "active" : "inactive"}
                onChange={(event) =>
                  setEmployeeEditForm((prev) => ({
                    ...prev,
                    isActive: event.target.value === "active",
                  }))
                }
              >
                <option value="active">{t("hr.modal.statusActive")}</option>
                <option value="inactive">{t("hr.modal.statusInactive")}</option>
              </Select>
            </FormControl>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {t("hr.modal.cancel")}
          </Button>
          <Button colorScheme="red" variant="outline" mr={3} onClick={onDelete} isLoading={isDeleting}>
            {t("hr.modal.delete")}
          </Button>
          <Button colorScheme="brand" onClick={onSave} isLoading={isSaving}>
            {t("hr.modal.save")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
