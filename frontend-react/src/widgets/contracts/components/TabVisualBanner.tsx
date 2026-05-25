import React from "react";
import { ProjectHero } from "@widgets/projects";

interface TabVisualBannerProps {
  icon: React.ReactElement;
  title: string;
  description: string;
  eyebrow?: string;
}

export const TabVisualBanner: React.FC<TabVisualBannerProps> = ({
  icon,
  title,
  description,
  eyebrow,
}) => {
  return (
    <ProjectHero
      items={[]}
      title={title}
      subtitle={description}
      eyebrow={eyebrow ?? "Módulo de contratos"}
      leadIcon={icon}
    />
  );
};
