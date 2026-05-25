import React from "react";

import { ProjectHero } from "@widgets/projects";

interface HrPageHeroProps {
  title: string;
  subtitle: string;
  animation?: string;
}

export const HrPageHero: React.FC<HrPageHeroProps> = ({
  title,
  subtitle,
  animation,
}) => {
  return (
    <ProjectHero
      items={[]}
      title={title}
      subtitle={subtitle}
      animation={animation}
    />
  );
};
