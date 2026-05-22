import React from "react";

import { Box } from "@chakra-ui/react";

import { HRPanel, type Employee as HREmployee } from "@widgets/hr-panel";

interface HrPanelSectionProps {
  employees: HREmployee[];
  loading?: boolean;
}

export const HrPanelSection: React.FC<HrPanelSectionProps> = ({
  employees,
  loading,
}) => {
  return (
    <Box mb={8}>
      <HRPanel employees={employees} loading={loading} />
    </Box>
  );
};
