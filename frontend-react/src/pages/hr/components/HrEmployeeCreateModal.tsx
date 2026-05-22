import React from "react";
import {
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
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

import type { Department, EmployeeFormState } from "@entities/hr";
import type { Position } from "@api/hr";
import type { TenantUserSummary } from "@api/users";

type Option = { value: string; label: string };

type HrEmployeeCreateModalProps = {
  isOpen: boolean;
  employeeForm: EmployeeFormState;
  safeDepartments: Department[];
  safePositions: Position[];
  titulacionOptions: Option[];
  tenantUsers?: TenantUserSummary[];
  availableTenantUsers: TenantUserSummary[];
  isLoadingTenantUsers: boolean;
  createAvailabilityLocked: boolean;
  isSubmitting: boolean;
  isSuperAdmin: boolean;
  effectiveTenantId: number | null;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLDivElement>;
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
};

export const HrEmployeeCreateModal: React.FC<HrEmployeeCreateModalProps> = ({
  isOpen,
  employeeForm,
  safeDepartments,
  safePositions,
  titulacionOptions,
  tenantUsers,
  availableTenantUsers,
  isLoadingTenantUsers,
  createAvailabilityLocked,
  isSubmitting,
  isSuperAdmin,
  effectiveTenantId,
  onClose,
  onSubmit,
  onChange,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      size="lg"
      closeOnOverlayClick={false}
      closeOnEsc={false}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t("hr.employees.form.create")}</ModalHeader>
        <ModalBody>
          <VStack as="form" align="stretch" spacing={3} onSubmit={onSubmit}>
            <FormControl>
              <FormLabel>{t("hr.employees.form.userOptional")}</FormLabel>
              {isLoadingTenantUsers && <Text>{t("hr.employees.form.loadingUsers")}</Text>}
              {tenantUsers && (
                <Select
                  name="userId"
                  value={employeeForm.userId === "" ? "" : employeeForm.userId}
                  onChange={onChange}
                  placeholder={t("hr.employees.form.userPlaceholder")}
                >
                  {availableTenantUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email || t("hr.employees.form.noEmail")}
                    </option>
                  ))}
                </Select>
              )}
            </FormControl>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <FormControl isRequired={!employeeForm.userId}>
                <FormLabel>{t("hr.employees.form.firstName", "Nombre")}</FormLabel>
                <Input name="firstName" value={employeeForm.firstName} onChange={onChange} />
              </FormControl>
              <FormControl>
                <FormLabel>{t("hr.employees.form.lastName", "Apellidos")}</FormLabel>
                <Input name="lastName" value={employeeForm.lastName} onChange={onChange} />
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel>{t("hr.employees.form.titulacion")}</FormLabel>
              <Select
                name="titulacion"
                value={employeeForm.titulacion}
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
              <FormLabel>{t("hr.employees.form.hourlyRate")}</FormLabel>
              <Input
                name="hourlyRate"
                type="number"
                value={employeeForm.hourlyRate}
                onChange={onChange}
                placeholder={t("hr.employees.form.hourlyRatePlaceholder")}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.employees.form.availableHours", "Horas disponibles")}</FormLabel>
              <Input name="availableHours" type="number" value={employeeForm.availableHours} onChange={onChange} />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>{t("hr.employees.form.primaryDepartment")}</FormLabel>
              <Select
                name="primaryDepartmentId"
                value={employeeForm.primaryDepartmentId === "" ? "" : employeeForm.primaryDepartmentId}
                onChange={onChange}
                placeholder={t("hr.employees.form.departmentPlaceholder")}
              >
                {safeDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.employees.form.position", "Puesto")}</FormLabel>
              {(() => {
                const primaryDeptId =
                  employeeForm.primaryDepartmentId === ""
                    ? null
                    : Number(employeeForm.primaryDepartmentId);
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
                    value={employeeForm.positionId === "" ? "" : employeeForm.positionId}
                    onChange={onChange}
                    placeholder={t("hr.employees.form.positionPlaceholder", "Selecciona un puesto")}
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

            <FormControl>
              <Checkbox
                name="isDepartmentHead"
                isChecked={employeeForm.isDepartmentHead}
                onChange={onChange}
              >
                {t("hr.employees.form.isDepartmentHead", "Jefe de departamento")}
              </Checkbox>
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.employees.form.availabilityPercentage", "% disponibilidad proyecto")}</FormLabel>
              <Input
                name="availabilityPercentage"
                type="number"
                value={employeeForm.availabilityPercentage}
                onChange={onChange}
                isDisabled={createAvailabilityLocked}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.employees.form.secondaryDepartment", "Segundo departamento (opcional)")}</FormLabel>
              <Select
                name="secondaryDepartmentId"
                value={employeeForm.secondaryDepartmentId === "" ? "" : employeeForm.secondaryDepartmentId}
                onChange={onChange}
                placeholder={t("hr.employees.form.departmentPlaceholder")}
              >
                {safeDepartments
                  .filter((department) => department.id !== employeeForm.primaryDepartmentId)
                  .map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
              </Select>
            </FormControl>

            <FormControl isDisabled={!employeeForm.secondaryDepartmentId}>
              <FormLabel>{t("hr.employees.form.secondaryPercentage", "% segundo departamento")}</FormLabel>
              <Input
                name="secondaryPercentage"
                type="number"
                min={1}
                max={99}
                value={employeeForm.secondaryPercentage}
                onChange={onChange}
                placeholder={t("hr.employees.form.secondaryPercentagePlaceholder", "Ej. 40")}
              />
            </FormControl>

            <Button
              type="submit"
              colorScheme="brand"
              alignSelf="flex-start"
              isLoading={isSubmitting}
              isDisabled={safeDepartments.length === 0 || (isSuperAdmin && !effectiveTenantId)}
            >
              {t("hr.employees.form.create")}
            </Button>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
