// Construye un breadcrumb a partir del pathname actual.
// Cada nivel se traduce a un label legible y conserva el path acumulado para
// permitir navegación clicable.

export interface BreadcrumbItem {
  label: string;
  to: string;
}

// Mapa de segmentos estáticos -> label legible. Si un segmento no aparece
// se omite (los IDs numéricos por ejemplo no figuran en el breadcrumb).
const STATIC_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  works: "Obras",
  projects: "Proyectos",
  budget: "Presupuesto",
  documents: "Documentación",
  tasks: "Tareas",
  "external-collaborations": "Colaboraciones externas",
  simulations: "Simulaciones",
  invoices: "Facturas",
  contracts: "Contratos",
  comparatives: "Comparativos",
  "work-management": "Gestión de obra",
  "time-control": "Control horario",
  "time-report": "Parte de horas",
  hr: "RRHH",
  departments: "Departamentos",
  positions: "Puestos",
  employees: "Empleados",
  legal: "Legal",
  administration: "Administración",
  users: "Usuarios",
  tools: "Herramientas",
  audit: "Logs",
  support: "Soporte",
  "tenant-settings": "Configuración de tenant",
  "tenant-branding": "Branding",
  "tenant-department-emails": "Emails de departamentos",
  "user-settings": "Mis preferencias",
  new: "Nuevo comparativo",
  resume: "Resumen",
  info: "Información",
  edit: "Editar",
  "edit-info": "Editar información",
  aprobaciones: "Aprobaciones",
};

const isNumericId = (segment: string): boolean => /^\d+$/.test(segment);

export const buildBreadcrumb = (pathname: string): BreadcrumbItem[] => {
  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [];
  let accumulated = "";

  for (const seg of segments) {
    accumulated += "/" + seg;
    if (isNumericId(seg)) {
      // ID numérico: lo incluimos en el path acumulado pero no como entrada visible.
      continue;
    }
    const label = STATIC_LABELS[seg] ?? seg;
    items.push({ label, to: accumulated });
  }

  return items;
};
