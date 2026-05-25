import React from "react";

export type Employee = {
  id: number;
  name: string;
  titulacion: "doctorado" | "universitario" | "no_universitario";
  available_hours: number;
  is_active: boolean;
  avatar?: string;
};

const labelForDegree = (degree: Employee["titulacion"]) => {
  switch (degree) {
    case "doctorado":
      return "Doctorado";
    case "universitario":
      return "Universitario";
    default:
      return "No universitario";
  }
};

const formatHours = (value: number) =>
  new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

export const EmployeeList: React.FC<{ employees: Employee[] }> = ({
  employees,
}) => {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 2fr) minmax(140px, 1.3fr) minmax(110px, 1fr) minmax(120px, 1fr)",
          gap: 0,
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontSize: 12,
          fontWeight: 700,
          color: "#334155",
        }}
      >
        <div style={{ padding: "12px 14px" }}>Nombre</div>
        <div style={{ padding: "12px 14px" }}>Titulacion</div>
        <div style={{ padding: "12px 14px" }}>Estado</div>
        <div style={{ padding: "12px 14px", textAlign: "right" }}>Horas</div>
      </div>

      <div
        style={{
          maxHeight: 408,
          overflowY: "auto",
        }}
      >
        {employees.length === 0 ? (
          <div style={{ padding: 16, color: "#64748b", fontSize: 13 }}>
            No hay empleados para este filtro.
          </div>
        ) : (
          employees.map((employee) => (
            <div
              key={employee.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 2fr) minmax(140px, 1.3fr) minmax(110px, 1fr) minmax(120px, 1fr)",
                alignItems: "center",
                borderBottom: "1px solid #e2e8f0",
                background: "#ffffff",
                fontSize: 13,
                color: "#0f172a",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {employee.name}
              </div>
              <div
                style={{
                  padding: "12px 14px",
                  color: "#475569",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {labelForDegree(employee.titulacion)}
              </div>
              <div style={{ padding: "12px 14px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 999,
                    padding: "3px 9px",
                    fontSize: 11,
                    fontWeight: 700,
                    background: "#eef2ff",
                    color: "#6366f1",
                  }}
                >
                  Activo
                </span>
              </div>
              <div
                style={{
                  padding: "12px 14px",
                  textAlign: "right",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {formatHours(employee.available_hours)} horas
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EmployeeList;
