import { useEffect } from "react";
import { useDisclosure, useToast } from "@chakra-ui/react";

import { useProjectDetails } from "@entities/projects";
import type {
  ErpActivity,
  ErpMilestone,
  ErpProject as ErpProjectApi,
  ErpSubActivity,
  ErpTask as ErpTaskApi,
} from "@entities/projects";

interface UseErpProjectsModalsParams {
  activities: ErpActivity[];
  subactivities: ErpSubActivity[];
  milestones: ErpMilestone[];
  rawTasks: ErpTaskApi[];
  projects: ErpProjectApi[];
}

export const useErpProjectsModals = ({
  activities,
  subactivities,
  milestones,
  rawTasks,
  projects,
}: UseErpProjectsModalsParams) => {
  const toast = useToast();
  const { isOpen: isAddModalOpen, onClose: onCloseAddModal } = useDisclosure();

  const projectDetails = useProjectDetails({
    activities,
    subactivities,
    milestones,
    rawTasks,
  });

  const { selectedProject, setSelectedProject, closeProjectDetails } =
    projectDetails;

  useEffect(() => {
    if (!selectedProject) return;
    const exists = projects.some((project) => project.id === selectedProject.id);
    if (exists) return;
    setSelectedProject(null);
    closeProjectDetails();
    toast({
      title: "Proyecto no disponible",
      description: "El proyecto ya no existe o pertenece a otro tenant.",
      status: "warning",
    });
  }, [projects, selectedProject, closeProjectDetails, setSelectedProject, toast]);

  return {
    ...projectDetails,
    isAddModalOpen,
    onCloseAddModal,
  };
};
