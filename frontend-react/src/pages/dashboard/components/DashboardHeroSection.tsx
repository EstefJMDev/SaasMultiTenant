import React from "react";

import { ProjectHero } from "@widgets/projects";

interface DashboardHeroSectionProps {
  title: string;
  subtitle: string;
  breadcrumb: string;
  animation: string;
}

export const DashboardHeroSection: React.FC<DashboardHeroSectionProps> = ({
  title,
  subtitle,
  breadcrumb,
  animation,
}) => {
  return (
    <ProjectHero
      items={[]}
      title={title}
      subtitle={subtitle}
      breadcrumb={breadcrumb}
      animation={animation}
    />
  );
};
