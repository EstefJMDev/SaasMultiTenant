import React, { useMemo, useState } from "react";

import DonutChart, { type DonutSegment } from "./DonutChart";
import EmployeeList, { type Employee } from "./EmployeeList";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4"];

const degreeLabels: Record<Employee["titulacion"], string> = {
  doctorado: "Doctorado",
  universitario: "Universitario",
  no_universitario: "No universitario",
};

interface HRPanelProps {
  employees: Employee[];
  loading?: boolean;
}

export const HRPanel: React.FC<HRPanelProps> = ({ employees, loading }) => {
  const [selectedDegree, setSelectedDegree] = useState<
    "all" | Employee["titulacion"]
  >("all");

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.is_active),
    [employees],
  );

  const filteredEmployees = useMemo(() => {
    if (selectedDegree === "all") return activeEmployees;
    return activeEmployees.filter(
      (employee) => employee.titulacion === selectedDegree,
    );
  }, [activeEmployees, selectedDegree]);

  const grouped = useMemo(() => {
    const base = {
      doctorado: { hours: 0, count: 0 },
      universitario: { hours: 0, count: 0 },
      no_universitario: { hours: 0, count: 0 },
    };

    activeEmployees.forEach((employee) => {
      if (!base[employee.titulacion]) return;
      base[employee.titulacion].hours += employee.available_hours;
      base[employee.titulacion].count += 1;
    });

    return base;
  }, [activeEmployees]);

  const totalHours = useMemo(() => {
    if (selectedDegree === "all") {
      return Object.values(grouped).reduce((acc, item) => acc + item.hours, 0);
    }
    return grouped[selectedDegree]?.hours ?? 0;
  }, [grouped, selectedDegree]);

  const donutData = useMemo<DonutSegment[]>(() => {
    const items: DonutSegment[] = [
      {
        key: "doctorado",
        label: degreeLabels.doctorado,
        value: grouped.doctorado.hours,
        color: COLORS[0],
      },
      {
        key: "universitario",
        label: degreeLabels.universitario,
        value: grouped.universitario.hours,
        color: COLORS[1],
      },
      {
        key: "no_universitario",
        label: degreeLabels.no_universitario,
        value: grouped.no_universitario.hours,
        color: COLORS[2],
      },
    ];

    if (selectedDegree === "all") return items;
    return items.filter((item) => item.key === selectedDegree);
  }, [grouped, selectedDegree]);

  const summaryItems = useMemo(
    () => [
      {
        key: "doctorado" as const,
        label: degreeLabels.doctorado,
        hours: grouped.doctorado.hours,
        count: grouped.doctorado.count,
      },
      {
        key: "universitario" as const,
        label: degreeLabels.universitario,
        hours: grouped.universitario.hours,
        count: grouped.universitario.count,
      },
      {
        key: "no_universitario" as const,
        label: degreeLabels.no_universitario,
        hours: grouped.no_universitario.hours,
        count: grouped.no_universitario.count,
      },
    ],
    [grouped],
  );

  const formatHours = (value: number) =>
    new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(300px, 360px) minmax(0, 0.92fr)",
        gap: 20,
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)",
          border: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          minHeight: 100,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 18,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#0f172a" }}>
              Disponibilidad de RRHH
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Horas disponibles por titulacion
            </div>
          </div>

          <select
            value={selectedDegree}
            onChange={(event) =>
              setSelectedDegree(
                event.target.value as "all" | Employee["titulacion"],
              )
            }
            style={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              padding: "8px 12px",
              fontSize: 13,
              color: "#0f172a",
              background: "#f8fafc",
            }}
          >
            <option value="all">Todas</option>
            <option value="doctorado">Doctorado</option>
            <option value="universitario">Universitario</option>
            <option value="no_universitario">No universitario</option>
          </select>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            paddingBlock: 4,
            marginBottom: 18,
          }}
        >
          <DonutChart data={donutData} total={totalHours} centerLabel="horas" />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            borderTop: "1px solid #e2e8f0",
            marginTop: "auto",
          }}
        >
          {summaryItems.map((item, index) => (
            <div
              key={item.key}
              style={{
                paddingTop: 16,
                paddingInline: 8,
                borderLeft: index === 0 ? "none" : "1px solid #e2e8f0",
              }}
            >
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: COLORS[index],
                  lineHeight: 1,
                  marginBottom: 10,
                }}
              >
                {item.count}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 4,
                }}
              >
                {item.label}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {formatHours(item.hours)} horas
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: 20,
          padding: 14,
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)",
          border: "1px solid #e2e8f0",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-end",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#0f172a" }}>
              Equipo
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {filteredEmployees.length} empleados visibles
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ fontSize: 13, color: "#64748b", padding: "12px 4px" }}>
            Cargando equipo...
          </div>
        ) : (
          <EmployeeList employees={filteredEmployees} />
        )}
      </div>
    </div>
  );
};

export default HRPanel;
