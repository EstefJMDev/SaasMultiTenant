import React from "react";
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
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
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

import type { DepartmentFormState } from "@entities/hr";

type HrDepartmentModalProps = {
  isOpen: boolean;
  editingDepartment: unknown;
  deptForm: DepartmentFormState;
  isSubmitting: boolean;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLDivElement>;
  onDeptChange: React.ChangeEventHandler<HTMLInputElement>;
  onDeptMenuVisibilityChange: React.ChangeEventHandler<HTMLInputElement>;
  onDeptCapabilityChange: React.ChangeEventHandler<HTMLInputElement>;
};

type DepartmentCapability = {
  name: keyof DepartmentFormState;
  label: string;
};

type DepartmentMenuItem = {
  key: string;
  label: string;
};

type DepartmentSection = {
  key: string;
  label: string;
  helperText?: string;
  capabilities: DepartmentCapability[];
  menuItems: DepartmentMenuItem[];
};

const SUPER_ADMIN_ONLY_MENU_KEYS = new Set<string>(["audit_logs"]);

const TENANT_ADMIN_OR_ABOVE_MENU_KEYS = new Set<string>([
  "tenant_settings",
  "settings_branding",
  "settings_department_emails",
]);

const ALWAYS_DISABLED_MENU_KEYS = new Set<string>(["tools"]);

const MENU_KEYS_IN_DOMAIN_ACCORDION = new Set<string>([
  "work_management",
  "work_comparatives",
  "work_contracts",
  "work_worksites",
  "work_providers",
  "legal",
  "legal_contracts",
  "administration_department",
  "administration_contracts",
  "administration_worksites",
  "administration_providers",
  "settings",
  "support",
]);

const CONTRACT_CAPABILITIES: DepartmentCapability[] = [
  { name: "can_view_contract", label: "Ver contratos" },
  { name: "can_edit_contract", label: "Editar contratos" },
  { name: "can_regenerate_contract", label: "Regenerar contratos" },
  { name: "can_approve_contract", label: "Aprobar contratos" },
  { name: "can_reject_contract", label: "Rechazar contratos" },
];

const WORKSITE_CAPABILITIES: DepartmentCapability[] = [
  { name: "can_view_worksite", label: "Ver obras" },
  { name: "can_edit_worksite", label: "Editar obras" },
];

const PROVIDER_CAPABILITIES: DepartmentCapability[] = [
  { name: "can_view_provider", label: "Ver proveedores" },
  { name: "can_edit_provider", label: "Editar proveedores" },
];

const COMMON_NAV_ITEMS: DepartmentMenuItem[] = [
  { key: "settings", label: "Ajustes" },
  { key: "support", label: "Soporte" },
];

const DOMAIN_SECTIONS: DepartmentSection[] = [
  {
    key: "comparatives",
    label: "Comparativos",
    helperText:
      "El acceso al módulo se concede aquí. Los permisos operativos finos de comparativos se asignan en el puesto.",
    capabilities: [],
    menuItems: [
      { key: "work_management", label: "Gestión de obra" },
      { key: "work_comparatives", label: "Gestión de obra › Comparativos" },
      { key: "support", label: "Soporte" },
    ],
  },
  {
    key: "contracts",
    label: "Contratos",
    capabilities: CONTRACT_CAPABILITIES,
    menuItems: [
      { key: "work_contracts", label: "Gestión de obra › Contratos" },
      { key: "legal", label: "Jurídico" },
      { key: "legal_contracts", label: "Jurídico › Contratos" },
      { key: "administration_department", label: "Administración" },
      { key: "administration_contracts", label: "Administración › Contratos" },
      { key: "settings", label: "Ajustes" },
    ],
  },
  {
    key: "providers",
    label: "Proveedores",
    capabilities: PROVIDER_CAPABILITIES,
    menuItems: [
      { key: "work_management", label: "Gestión de obra" },
      { key: "work_providers", label: "Gestión de obra › Proveedores" },
      { key: "administration_department", label: "Administración" },
      { key: "administration_providers", label: "Administración › Proveedores" },
      ...COMMON_NAV_ITEMS,
    ],
  },
  {
    key: "worksites",
    label: "Obras",
    capabilities: WORKSITE_CAPABILITIES,
    menuItems: [
      { key: "work_management", label: "Gestión de obra" },
      { key: "work_worksites", label: "Gestión de obra › Obras" },
      { key: "administration_department", label: "Administración" },
      { key: "administration_worksites", label: "Administración › Obras" },
      ...COMMON_NAV_ITEMS,
    ],
  },
];

const MENU_VISIBILITY_LABELS: Record<string, string> = {
  dashboard: "Panel de control",
  erp: "ERP",
  erp_time_control: "ERP › Control horario",
  erp_tasks: "ERP › Tareas",
  erp_projects: "ERP › Proyectos",
  erp_external_collaborations: "ERP › Colaboraciones externas",
  erp_simulations: "ERP › Simulaciones",
  erp_invoices: "ERP › Facturas",
  work_management: "Gestión de obra",
  work_comparatives: "Gestión de obra › Comparativos",
  work_contracts: "Gestión de obra › Contratos",
  work_worksites: "Gestión de obra › Obras",
  work_providers: "Gestión de obra › Proveedores",
  legal: "Jurídico",
  legal_contracts: "Jurídico › Contratos",
  administration_department: "Administración",
  administration_contracts: "Administración › Contratos",
  administration_worksites: "Administración › Obras",
  administration_providers: "Administración › Proveedores",
  hr: "Recursos Humanos",
  hr_departments: "Recursos Humanos › Departamentos",
  hr_employees: "Recursos Humanos › Empleados",
  hr_positions: "Recursos Humanos › Puestos",
  hr_talent: "Recursos Humanos › Talento",
  users: "Usuarios",
  tools: "Herramientas",
  tenant_settings: "Ajustes del tenant",
  settings: "Ajustes",
  settings_branding: "Ajustes › Branding",
  settings_department_emails: "Ajustes › Correos por departamento",
  audit_logs: "Registros de auditoría",
  support: "Soporte",
};

const isMenuKeyVisible = (
  key: string,
  isSuperAdmin: boolean,
  isTenantAdmin: boolean,
): boolean => {
  if (SUPER_ADMIN_ONLY_MENU_KEYS.has(key)) {
    return isSuperAdmin;
  }
  if (TENANT_ADMIN_OR_ABOVE_MENU_KEYS.has(key)) {
    return isSuperAdmin || isTenantAdmin;
  }
  return true;
};

export const HrDepartmentModal: React.FC<HrDepartmentModalProps> = ({
  isOpen,
  editingDepartment,
  deptForm,
  isSubmitting,
  isSuperAdmin,
  isTenantAdmin,
  onClose,
  onSubmit,
  onDeptChange,
  onDeptMenuVisibilityChange,
  onDeptCapabilityChange,
}) => {
  const { t } = useTranslation();

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {editingDepartment
            ? t("hr.departments.form.editTitle")
            : t("hr.departments.form.createTitle")}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack
            as="form"
            id="department-form"
            align="stretch"
            spacing={3}
            onSubmit={onSubmit}
          >
            <FormControl isRequired>
              <FormLabel>{t("hr.departments.form.name")}</FormLabel>
              <Input name="name" value={deptForm.name} onChange={onDeptChange} />
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.departments.form.description")}</FormLabel>
              <Input
                name="description"
                value={deptForm.description}
                onChange={onDeptChange}
              />
            </FormControl>

            <FormControl>
              <FormLabel>{t("hr.departments.form.allocation")}</FormLabel>
              <Input
                name="projectAllocationPercentage"
                type="number"
                min={0}
                max={100}
                value={deptForm.projectAllocationPercentage}
                onChange={onDeptChange}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Permisos por dominio</FormLabel>
              <Accordion allowMultiple reduceMotion>
                {DOMAIN_SECTIONS.map(
                  ({ key, label, helperText, capabilities, menuItems }) => (
                    <AccordionItem key={key}>
                      <AccordionButton px={0}>
                        <Box flex="1" textAlign="left">
                          {label}
                        </Box>
                        <AccordionIcon />
                      </AccordionButton>
                      <AccordionPanel px={0} pb={3}>
                        <VStack align="stretch" spacing={3}>
                          {helperText ? (
                            <Text fontSize="sm" color="gray.500">
                              {helperText}
                            </Text>
                          ) : null}

                          {capabilities.length > 0 ? (
                            <Box>
                              <Text mb={2}>Permisos operativos</Text>
                              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                                {capabilities.map(({ name, label: capLabel }) => (
                                  <Checkbox
                                    key={name as string}
                                    name={name as string}
                                    isChecked={Boolean(deptForm[name])}
                                    onChange={onDeptCapabilityChange}
                                  >
                                    {capLabel}
                                  </Checkbox>
                                ))}
                              </SimpleGrid>
                            </Box>
                          ) : null}

                          <Box>
                            <Text mb={2}>Acceso en menú lateral</Text>
                            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                              {menuItems.map(({ key: itemKey, label: itemLabel }) => (
                                <Checkbox
                                  key={itemKey}
                                  name={itemKey}
                                  isChecked={Boolean(
                                    deptForm.menuVisibility[
                                      itemKey as keyof typeof deptForm.menuVisibility
                                    ],
                                  )}
                                  onChange={onDeptMenuVisibilityChange}
                                >
                                  {itemLabel}
                                </Checkbox>
                              ))}
                            </SimpleGrid>
                          </Box>
                        </VStack>
                      </AccordionPanel>
                    </AccordionItem>
                  ),
                )}
              </Accordion>
            </FormControl>

            <FormControl>
              <FormLabel>Accesos generales del menú</FormLabel>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                {Object.entries(deptForm.menuVisibility)
                  .filter(
                    ([key]) =>
                      !MENU_KEYS_IN_DOMAIN_ACCORDION.has(key) &&
                      isMenuKeyVisible(key, isSuperAdmin, isTenantAdmin),
                  )
                  .map(([key, checked]) => {
                    const isDisabled = ALWAYS_DISABLED_MENU_KEYS.has(key);
                    return (
                      <Checkbox
                        key={key}
                        name={key}
                        isChecked={isDisabled ? false : Boolean(checked)}
                        isDisabled={isDisabled}
                        onChange={onDeptMenuVisibilityChange}
                      >
                        {MENU_VISIBILITY_LABELS[key] ?? key}
                      </Checkbox>
                    );
                  })}
              </SimpleGrid>
            </FormControl>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="department-form"
            colorScheme="brand"
            isLoading={isSubmitting}
          >
            {editingDepartment
              ? t("hr.departments.form.save")
              : t("hr.departments.form.create")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
