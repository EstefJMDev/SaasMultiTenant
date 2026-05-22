// Mapa jerárquico de rutas: dada una URL del front, devuelve la URL del padre.
// El botón "Volver" siempre debe navegar al padre definido aquí (no al historial).

type ParentRule = {
  // Patrón con segmentos. ":id" = cualquier valor.
  pattern: string;
  parent: string; // El padre puede usar "{id}" para reinyectar parámetros.
};

const RULES: ParentRule[] = [
  // Works (antes /erp/projects)
  { pattern: "/works/:id/budget", parent: "/works" },
  { pattern: "/works/:id/documents", parent: "/works" },
  { pattern: "/works/:id", parent: "/works" },

  // Comparativos – wizard "nuevo"
  { pattern: "/comparatives/new/resume", parent: "/comparatives/new" },
  { pattern: "/comparatives/new/info", parent: "/comparatives/new/resume" },
  { pattern: "/comparatives/new", parent: "/comparatives" },

  // Comparativos – existente
  { pattern: "/comparatives/:id/info", parent: "/comparatives" },
  { pattern: "/comparatives/:id/view-info", parent: "/comparatives/{id}/info" },
  { pattern: "/comparatives/:id/edit-info", parent: "/comparatives/{id}/edit" },
  { pattern: "/comparatives/:id/edit", parent: "/comparatives" },
  { pattern: "/comparatives/:id/aprobaciones", parent: "/comparatives/{id}/info" },

  // Contratos
  { pattern: "/contracts/:id/view", parent: "/contracts" },
  { pattern: "/contracts/:id/edit", parent: "/contracts/{id}/view" },

  // Contratos Jurídico (misma página, variante de URL)
  { pattern: "/legal-contracts/:id/view", parent: "/legal-contracts" },
  { pattern: "/legal-contracts/:id/edit", parent: "/legal-contracts/{id}/view" },

  // Contratos Administración (misma página, variante de URL)
  { pattern: "/admin-contracts/:id/view", parent: "/admin-contracts" },
  { pattern: "/admin-contracts/:id/edit", parent: "/admin-contracts/{id}/view" },

  // Tiempo
  { pattern: "/time-report", parent: "/time-control" },
];

const matchRule = (
  pathname: string,
  rule: ParentRule,
): { params: Record<string, string> } | null => {
  const pathSegments = pathname.split("/").filter(Boolean);
  const patternSegments = rule.pattern.split("/").filter(Boolean);
  if (pathSegments.length !== patternSegments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const ps = patternSegments[i];
    const seg = pathSegments[i];
    if (ps.startsWith(":")) {
      params[ps.slice(1)] = seg;
    } else if (ps !== seg) {
      return null;
    }
  }
  return { params };
};

const applyParams = (parent: string, params: Record<string, string>): string => {
  return parent.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? "");
};

/**
 * Devuelve la URL padre de la ruta actual, o null si no hay padre definido.
 * Las rutas que no figuran en el mapa se consideran de primer nivel.
 */
export const getParentPath = (pathname: string): string | null => {
  for (const rule of RULES) {
    const match = matchRule(pathname, rule);
    if (match) return applyParams(rule.parent, match.params);
  }
  return null;
};
