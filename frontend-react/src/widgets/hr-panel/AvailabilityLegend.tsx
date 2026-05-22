import React from "react";
import { Award, Briefcase, GraduationCap } from "lucide-react";

/**
 * Tipo de cada elemento de la leyenda.
 * - key: identifica el tipo de formación
 * - label: texto descriptivo
 * - hours: horas disponibles totales
 * - count: número de empleados
 * - color: color asociado a esa categoría
 */
type LegendItem = {
  key: "doctorado" | "universitario" | "no_universitario";
  label: string;
  hours: number;
  count: number;
  color: string;
};

/**
 * Devuelve el icono correspondiente según la categoría.
 */
const iconForKey = (key: LegendItem["key"]) => {
  switch (key) {
    case "doctorado":
      return Award; // icono medalla
    case "universitario":
      return GraduationCap; // icono birrete
    default:
      return Briefcase; // icono maletín
  }
};

interface AvailabilityLegendProps {
  items: LegendItem[]; // lista de categorías a mostrar
}

/**
 * AvailabilityLegend
 * - Renderiza una cuadrícula responsive de tarjetas.
 * - Cada tarjeta representa una categoría (doctorado, universitario, etc.).
 * - Muestra icono, horas totales, etiqueta y número de empleados.
 */
export const AvailabilityLegend: React.FC<AvailabilityLegendProps> = ({
  items,
}) => {
  const formatHours = (value: number) =>
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 16,
      }}
    >
      {items.map((item) => {
        // Selecciona el icono según la categoría
        const Icon = iconForKey(item.key);

        return (
          <div
            key={item.key}
            style={{
              background: "#f8fafc",
              borderRadius: 16,
              padding: 16,
              border: `1.5px solid ${item.color}55`, // borde con transparencia
              display: "flex",
              flexDirection: "column",
              gap: 8,
              alignItems: "center",
              textAlign: "center",
            }}
          >
            {/* Icono dentro de caja con fondo suave del color */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${item.color}22`, // color con opacidad
                color: item.color,
              }}
            >
              <Icon size={18} />
            </div>

            {/* Horas totales destacadas */}
            <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>
              {formatHours(item.hours)}
            </div>

            {/* Etiqueta descriptiva */}
            <div style={{ fontSize: 12, color: "#64748b" }}>{item.label}</div>

            {/* Número de empleados */}
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {item.count} empleados
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AvailabilityLegend;
