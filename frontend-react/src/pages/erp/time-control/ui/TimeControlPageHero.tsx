import React from "react";

import { ProjectHero } from "@widgets/projects";

interface TimeControlPageHeroProps {
  breadcrumb: string;
  title: string;
  subtitle: string;
  animation?: string;
}

export const TimeControlPageHero: React.FC<TimeControlPageHeroProps> = ({
  breadcrumb,
  title,
  subtitle,
  animation,
}) => {
  return (
    <ProjectHero
      items={[]}
      breadcrumb={breadcrumb}
      title={title}
      subtitle={subtitle}
      animation={animation}
    />
  );
};
