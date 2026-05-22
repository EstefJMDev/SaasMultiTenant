import React from "react";
import { HStack, IconButton, Tooltip, useColorModeValue } from "@chakra-ui/react";

import type { ProjectRow } from "../hooks/useProjectsView";

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const DetailsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6" />
    <path d="M9 17h6" />
    <path d="M9 9h2" />
  </svg>
);

const DocsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </svg>
);

interface ProjectActionsProps {
  project: ProjectRow;
}

export const ProjectActions: React.FC<ProjectActionsProps> = ({ project }) => {
  const border = useColorModeValue("gray.200", "whiteAlpha.300");

  const actions = [
    { label: "Editar", icon: <EditIcon /> },
    { label: "Detalles", icon: <DetailsIcon /> },
    { label: "Documentaci?n", icon: <DocsIcon /> },
  ];

  return (
    <HStack spacing={1} justify="flex-end">
      {actions.map((action) => (
        <Tooltip key={action.label} label="No disponible" hasArrow>
          <IconButton
            aria-label={action.label}
            icon={action.icon}
            size="sm"
            variant="ghost"
            isDisabled
            border="1px solid"
            borderColor={border}
          />
        </Tooltip>
      ))}
    </HStack>
  );
};
