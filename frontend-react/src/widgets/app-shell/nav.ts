import React from "react";
import {
  LayoutDashboard,
  Users,
  Settings,
  Wrench,
  FolderKanban,
  ClipboardList,
  BriefcaseBusiness,
  Clock,
  FileText,
  Scale,
  Building2,
  LifeBuoy,
  BadgeCheck,
  CalendarClock,
} from "lucide-react";

export type NavContext = {
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  isGerencia: boolean;
  isSupport: boolean;
  isErpEnabledForTenant: boolean;
  canShowNav: (key: string) => boolean;
  canShowChildNav: (parent: string, child: string) => boolean;
  hasAnyComparativeCap: boolean;
  canViewWorksites: boolean;
  canEditWorksites: boolean;
  canViewProviders: boolean;
  canEditProviders: boolean;
};

export type NavItem = {
  id: string;
  label: string;
  to?: string;
  icon?: React.ComponentType<any>;
  matchPrefix?: boolean;
  children?: NavItem[];
  isVisible?: (ctx: NavContext) => boolean;
};

export type NavSection = {
  id: string;
  label?: string;
  items: NavItem[];
  isVisible?: (ctx: NavContext) => boolean;
};

export const buildNavSections = (
  t: (key: string) => string,
  ctx: NavContext,
): NavSection[] => [
  {
    id: "core",
    items: [
      {
        id: "dashboard",
        label: t("layout.nav.dashboard"),
        to: "/dashboard",
        icon: LayoutDashboard as any,
        isVisible: () => ctx.canShowNav("dashboard"),
      },
    ],
  },
  {
    id: "erp",
    label: t("layout.nav.erp"),
    isVisible: () => ctx.isErpEnabledForTenant && ctx.canShowNav("erp"),
    items: [
      {
        id: "erp",
        label: t("layout.nav.erp"),
        icon: FolderKanban as any,
        children: [
          {
            id: "erp_time_control",
            label: t("layout.nav.timeControl"),
            to: "/time-control",
            icon: Clock as any,
            isVisible: () => ctx.canShowChildNav("erp", "erp_time_control"),
          },
          {
            id: "erp_tasks",
            label: t("layout.nav.tasks"),
            to: "/tasks",
            icon: ClipboardList as any,
            isVisible: () => ctx.canShowChildNav("erp", "erp_tasks"),
          },
          {
            id: "erp_projects",
            label: t("layout.nav.projects"),
            to: "/works",
            matchPrefix: true,
            icon: BriefcaseBusiness as any,
            isVisible: () => ctx.canShowChildNav("erp", "erp_projects"),
          },
          {
            id: "erp_external_collaborations",
            label: t("layout.nav.externalCollaborations"),
            to: "/external-collaborations",
            icon: CalendarClock as any,
            isVisible: () =>
              ctx.canShowChildNav("erp", "erp_external_collaborations"),
          },
          {
            id: "erp_simulations",
            label: t("layout.nav.simulations"),
            to: "/simulations",
            icon: FileText as any,
            isVisible: () => ctx.canShowChildNav("erp", "erp_simulations"),
          },
          {
            id: "erp_invoices",
            label: "Facturas",
            to: "/invoices",
            icon: FileText as any,
            isVisible: () => ctx.canShowChildNav("erp", "erp_invoices"),
          },
        ],
      },
    ],
  },
  {
    id: "work-management",
    label: t("layout.nav.workManagement"),
    isVisible: () => ctx.isErpEnabledForTenant && ctx.canShowNav("work_management"),
    items: [
      {
        id: "work_management",
        label: t("layout.nav.workManagement"),
        icon: Scale as any,
        children: [
          {
            id: "work_comparatives",
            label: t("layout.nav.comparatives"),
            to: "/comparatives",
            matchPrefix: true,
            icon: BadgeCheck as any,
            isVisible: () =>
              ctx.canShowChildNav("work_management", "work_comparatives") &&
              ctx.hasAnyComparativeCap,
          },
          {
            id: "work_contracts",
            label: "Contratos",
            to: "/contracts",
            matchPrefix: true,
            icon: FileText as any,
            isVisible: () => ctx.canShowChildNav("work_management", "work_contracts"),
          },
          {
            id: "work_worksites",
            label: "Obras",
            to: "/work-management/worksites",
            matchPrefix: true,
            icon: Building2 as any,
            isVisible: () =>
              ctx.canShowChildNav("work_management", "work_worksites") &&
              ctx.canViewWorksites,
          },
          {
            id: "work_providers",
            label: "Proveedores",
            to: "/work-management/providers",
            matchPrefix: true,
            icon: BriefcaseBusiness as any,
            isVisible: () =>
              ctx.canShowChildNav("work_management", "work_providers") &&
              ctx.canViewProviders,
          },
        ],
      },
    ],
  },
  {
    id: "hr",
    label: t("layout.nav.hr"),
    isVisible: () =>
      (ctx.isSuperAdmin || ctx.isTenantAdmin || ctx.isGerencia) &&
      ctx.canShowNav("hr"),
    items: [
      {
        id: "hr",
        label: t("layout.nav.hr"),
        icon: Building2 as any,
        children: [
          {
            id: "hr_departments",
            label: t("layout.nav.hrDepartments"),
            to: "/hr/departments",
            matchPrefix: true,
            isVisible: () => ctx.canShowChildNav("hr", "hr_departments"),
          },
          {
            id: "hr_positions",
            label: t("layout.nav.hrPositions"),
            to: "/hr/positions",
            matchPrefix: true,
            isVisible: () => ctx.canShowChildNav("hr", "hr_positions"),
          },
          {
            id: "hr_employees",
            label: t("layout.nav.hrEmployees"),
            to: "/hr/employees",
            matchPrefix: true,
            isVisible: () => ctx.canShowChildNav("hr", "hr_employees"),
          },
        ],
      },
    ],
  },
  {
    id: "departments",
    label: t("layout.sections.departments"),
    items: [
      {
        id: "legal",
        label: t("layout.nav.legal"),
        icon: Scale as any,
        isVisible: () => ctx.canShowNav("legal"),
        children: [
          {
            id: "legal_contracts",
            label: t("layout.nav.departmentContracts"),
            to: "/legal-contracts",
            matchPrefix: true,
            icon: FileText as any,
            isVisible: () => ctx.canShowChildNav("legal", "legal_contracts"),
          },
        ],
      },
      {
        id: "administration",
        label: t("layout.nav.administrationDept"),
        icon: BadgeCheck as any,
        isVisible: () => ctx.canShowNav("administration_department"),
        children: [
          {
            id: "administration_contracts",
            label: t("layout.nav.departmentContracts"),
            to: "/admin-contracts",
            matchPrefix: true,
            icon: FileText as any,
            isVisible: () =>
              ctx.canShowChildNav(
                "administration_department",
                "administration_contracts",
              ),
          },
          {
            id: "administration_worksites",
            label: "Obras",
            to: "/departments/administration/worksites",
            matchPrefix: true,
            icon: Building2 as any,
            isVisible: () =>
              ctx.canShowChildNav(
                "administration_department",
                "administration_worksites",
              ) && ctx.canViewWorksites,
          },
          {
            id: "administration_providers",
            label: "Proveedores",
            to: "/departments/administration/providers",
            matchPrefix: true,
            icon: BriefcaseBusiness as any,
            isVisible: () =>
              ctx.canShowChildNav(
                "administration_department",
                "administration_providers",
              ) && ctx.canViewProviders,
          },
        ],
      },
    ],
  },
  {
    id: "admin",
    label: t("layout.sections.administration"),
    isVisible: () => ctx.isSuperAdmin || ctx.isTenantAdmin || ctx.isGerencia || ctx.isSupport,
    items: [
      {
        id: "users",
        label: t("layout.nav.users"),
        to: "/users",
        matchPrefix: true,
        icon: Users as any,
        isVisible: () => ctx.canShowNav("users"),
      },
      {
        id: "tools",
        label: t("layout.nav.tools"),
        to: "/tools",
        matchPrefix: true,
        icon: Wrench as any,
        isVisible: () => (ctx.isSuperAdmin || ctx.isTenantAdmin) && ctx.canShowNav("tools"),
      },
      {
        id: "tenant_settings",
        label: t("layout.nav.tenantSettings"),
        to: "/tenant-settings",
        matchPrefix: true,
        icon: Settings as any,
        isVisible: () => ctx.isSuperAdmin && ctx.canShowNav("tenant_settings"),
      },
      {
        id: "settings",
        label: t("layout.nav.settings"),
        icon: Settings as any,
        isVisible: () => (ctx.isSuperAdmin || ctx.isTenantAdmin || ctx.isGerencia) && ctx.canShowNav("settings"),
        children: [
          {
            id: "settings_branding",
            label: t("layout.nav.branding"),
            to: "/tenant-branding",
            matchPrefix: true,
            isVisible: () => ctx.canShowChildNav("settings", "settings_branding"),
          },
          {
            id: "settings_department_emails",
            label: t("layout.nav.departmentEmails"),
            to: "/tenant-department-emails",
            matchPrefix: true,
            isVisible: () => ctx.canShowChildNav("settings", "settings_department_emails"),
          },
        ],
      },
      {
        id: "audit",
        label: "Logs",
        to: "/audit",
        matchPrefix: true,
        icon: FileText as any,
        isVisible: () => ctx.isSuperAdmin && ctx.canShowNav("audit_logs"),
      },
      {
        id: "support",
        label: t("layout.nav.support"),
        to: "/support",
        matchPrefix: true,
        icon: LifeBuoy as any,
        isVisible: () => (ctx.isSuperAdmin || ctx.isTenantAdmin || ctx.isGerencia || ctx.isSupport) && ctx.canShowNav("support"),
      },
    ],
  },
];
