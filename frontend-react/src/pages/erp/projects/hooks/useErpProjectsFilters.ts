import { useState } from "react";

export const useErpProjectsFilters = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  return {
    activeTab,
    setActiveTab,
    selectedProjectId,
    setSelectedProjectId,
    projectSearch,
    setProjectSearch,
    projectStatusFilter,
    setProjectStatusFilter,
  };
};
