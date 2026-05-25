import React from "react";
import { Badge } from "@chakra-ui/react";

interface StatusBadgeProps {
  isActive: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ isActive }) => (
  <Badge colorScheme={isActive ? "brand" : "gray"}>
    {isActive ? "Activo" : "Inactivo"}
  </Badge>
);

