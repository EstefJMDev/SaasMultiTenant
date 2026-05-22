import React from "react";
import { HRPanel, Employee } from "./index";

const employees: Employee[] = [
  { id: 1, name: "Dr. Ana Garcia", titulacion: "doctorado", available_hours: 160, is_active: true, avatar: "AG" },
  { id: 2, name: "Dr. Carlos Ruiz", titulacion: "doctorado", available_hours: 120, is_active: true, avatar: "CR" },
  { id: 3, name: "Maria Lopez", titulacion: "universitario", available_hours: 200, is_active: true, avatar: "ML" },
  { id: 4, name: "Juan Martinez", titulacion: "universitario", available_hours: 180, is_active: true, avatar: "JM" },
  { id: 5, name: "Laura Sanchez", titulacion: "universitario", available_hours: 160, is_active: true, avatar: "LS" },
  { id: 6, name: "Pedro Diaz", titulacion: "no_universitario", available_hours: 140, is_active: true, avatar: "PD" },
];

export const AppExample = () => {
  return <HRPanel employees={employees} />;
};
