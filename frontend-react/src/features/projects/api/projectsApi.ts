import { apiClient } from "@shared/api/client";
import type { ProjectRead } from "../types";

export const getProjects = async (): Promise<ProjectRead[]> => {
  const response = await apiClient.get<ProjectRead[]>("/api/v1/projects");
  return response.data;
};
