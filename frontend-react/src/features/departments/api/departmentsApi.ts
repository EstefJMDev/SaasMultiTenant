import { apiClient } from "@shared/api/client";
import type { DepartmentRead } from "../types";

export const getDepartments = async (): Promise<DepartmentRead[]> => {
  const response = await apiClient.get<DepartmentRead[]>(
    "/api/v1/org/departments",
  );
  return response.data;
};
