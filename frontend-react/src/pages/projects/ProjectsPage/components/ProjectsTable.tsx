import React, { useMemo } from "react";
import { Text, Tooltip, VStack } from "@chakra-ui/react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@widgets/data-table";
import type { ProjectRow } from "../hooks/useProjectsView";
import { ProjectCodeChip } from "./ProjectCodeChip";
import { ProjectsStatusBadge } from "./ProjectsStatusBadge";
import { ProjectActions } from "./ProjectActions";
import { formatProjectDates } from "../utils/formatProjectDates";

interface ProjectsTableProps {
  rows: ProjectRow[];
}

export const ProjectsTable: React.FC<ProjectsTableProps> = ({ rows }) => {
  const columns = useMemo<ColumnDef<ProjectRow>[]>(
    () => [
      {
        header: "Proyecto",
        accessorKey: "name",
        cell: ({ row }) => {
          const description = row.original.description ?? "";
          return (
            <VStack align="start" spacing={0.5}>
              <Text fontWeight={600} noOfLines={1}>
                {row.original.name}
              </Text>
              <Tooltip label={description} isDisabled={!description} hasArrow>
                <Text
                  fontSize="sm"
                  color="gray.500"
                  noOfLines={1}
                  title={description}
                >
                  {description || "?"}
                </Text>
              </Tooltip>
            </VStack>
          );
        },
      },
      {
        header: "C?digo",
        id: "code",
        cell: ({ row }) => <ProjectCodeChip value={`PR-${row.original.id}`} />,
      },
      {
        header: "Estado",
        id: "status",
        cell: ({ row }) => (
          <ProjectsStatusBadge
            status={row.original.is_active ? "Activo" : "Inactivo"}
          />
        ),
      },
      {
        header: "Departamento",
        accessorKey: "departmentName",
        cell: ({ row }) => (
          <Text fontSize="sm" color={row.original.departmentName ? "gray.700" : "gray.400"}>
            {row.original.departmentName || "?"}
          </Text>
        ),
      },
      {
        header: "Fechas",
        id: "dates",
        cell: ({ row }) => (
          <Text fontSize="sm" color="gray.600">
            {formatProjectDates({
              start_date: row.original.start_date,
              end_date: row.original.end_date,
            })}
          </Text>
        ),
      },
      {
        header: "",
        id: "actions",
        enableSorting: false,
        cell: ({ row }) => <ProjectActions project={row.original} />,
      },
    ],
    [],
  );

  return <DataTable data={rows} columns={columns} minWidth="960px" />;
};
