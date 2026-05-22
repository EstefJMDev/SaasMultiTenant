import React from "react";
import { Button } from "@chakra-ui/react";

import { PageHeader } from "@shared/ui";

interface ProjectDocumentsToolbarProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
}

export const ProjectDocumentsToolbar: React.FC<ProjectDocumentsToolbarProps> = ({
  title,
  subtitle,
  onBack,
}) => (
  <PageHeader
    title={title}
    subtitle={subtitle}
    actions={
      <Button variant="outline" onClick={onBack}>
        Volver
      </Button>
    }
  />
);
