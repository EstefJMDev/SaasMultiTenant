import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";

/**
 * Un segmento del donut.
 * - key: identificador único (para React y para hover)
 * - label: nombre del segmento (no se usa en el render actual, pero útil para leyendas)
 * - value: valor numérico que representa el tamaño del segmento
 * - color: color del segmento
 */
export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

interface DonutChartProps {
  data: DonutSegment[]; // lista de segmentos a dibujar
  total: number; // total para calcular porcentajes (normalmente suma de values)
  centerLabel: string; // texto debajo del número en el centro
}

/**
 * DonutChart
 * - Dibuja un donut con SVG usando <circle> y la técnica strokeDasharray/strokeDashoffset.
 * - Anima cada segmento con framer-motion para que "se dibuje" al cargar.
 * - En hover aumenta el grosor del segmento.
 * - En el centro muestra el total y una etiqueta.
 */
export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  total,
  centerLabel,
}) => {
  const formatHours = (value: number) =>
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  // Segmento actualmente en hover (para cambiar grosor)
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  /**
   * Precalcula:
   * - percentage: porcentaje del total que representa cada segmento
   * - offset: acumulado de porcentajes anteriores para posicionar el segmento (dónde empieza)
   *
   * useMemo evita recalcular si no cambian data/total.
   */
  const segments = useMemo(() => {
    let offset = 0;

    return data.map((item) => {
      const percentage = total > 0 ? (item.value / total) * 100 : 0;

      // guardamos offset actual como el inicio de este segmento
      const segment = { ...item, percentage, offset };

      // el siguiente segmento empieza después de este
      offset += percentage;

      return segment;
    });
  }, [data, total]);

  // Radio del círculo del donut (en coordenadas del viewBox)
  const radius = 40;

  // Longitud total de la circunferencia (necesaria para strokeDasharray)
  const circumference = 2 * Math.PI * radius;

  return (
    // Contenedor cuadrado del donut
    <div style={{ position: "relative", width: 256, height: 256 }}>
      <svg
        viewBox="0 0 100 100"
        // Rotamos -90º para que el donut empiece arriba (12 en punto)
        style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}
      >
        {/* Círculo de fondo (gris) */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={12}
        />

        {/* Segmentos del donut */}
        {segments.map((segment, idx) => {
          /**
           * strokeDasharray: define cuánto "se pinta" y cuánto se deja vacío.
           * - primer número: longitud pintada (según porcentaje)
           * - segundo: longitud total (para completar la circunferencia)
           */
          const strokeDasharray = `${(segment.percentage / 100) * circumference} ${circumference}`;

          /**
           * strokeDashoffset: desplaza el inicio del trazo para que cada segmento
           * empiece donde corresponde según el offset acumulado.
           */
          const strokeDashoffset = -((segment.offset / 100) * circumference);

          // Si está en hover, aumentamos el grosor
          const isHovered = hoveredSegment === segment.key;

          return (
            <motion.circle
              key={segment.key}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={isHovered ? 16 : 12}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              // Animación: empieza en 0 y se dibuja hasta su strokeDasharray real
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray }}
              transition={{ duration: 1, delay: idx * 0.1, ease: "easeOut" }}
              // Hover
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoveredSegment(segment.key)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          );
        })}
      </svg>

      {/* Texto centrado encima del SVG */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Número grande */}
        <div style={{ fontSize: 32, fontWeight: 800, color: "#0f172a" }}>
          {formatHours(total)}
        </div>

        {/* Etiqueta pequeña */}
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          {centerLabel}
        </div>
      </div>
    </div>
  );
};

export default DonutChart;
