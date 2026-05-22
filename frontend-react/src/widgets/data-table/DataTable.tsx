import React, { useState } from "react";
import {
  Box,
  Flex,
  HStack,
  Input,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { Card, EmptyState, SkeletonTable } from "@shared/ui";

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  isLoading?: boolean;
  emptyText?: string;
  emptyState?: React.ReactNode;
  errorState?: React.ReactNode;
  loadingState?: React.ReactNode;
  showSearch?: boolean;
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  toolbar?: React.ReactNode;
  columnVisibility?: VisibilityState;
  minWidth?: string | number;
}

export function DataTable<T>({
  data,
  columns,
  isLoading,
  emptyText = "No hay datos disponibles.",
  emptyState,
  errorState,
  loadingState,
  showSearch,
  globalFilter,
  onGlobalFilterChange,
  toolbar,
  columnVisibility,
  minWidth = "720px",
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filters, setFilters] = useState<ColumnFiltersState>([]);

  const resolvedGlobalFilter = globalFilter ?? "";
  const safeData = Array.isArray(data) ? data : [];
  const safeColumns = Array.isArray(columns) ? columns : [];

  const table = useReactTable({
    data: safeData,
    columns: safeColumns,
    state: {
      sorting,
      columnFilters: filters,
      globalFilter: resolvedGlobalFilter,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setFilters,
    onGlobalFilterChange: (value) => {
      if (typeof value === "string" && onGlobalFilterChange) {
        onGlobalFilterChange(value);
      }
    },
    globalFilterFn: (row, columnId, filterValue) => {
      const raw = row.getValue<string>(columnId);
      if (!filterValue) return true;
      if (raw == null) return false;
      return String(raw).toLowerCase().includes(String(filterValue).toLowerCase());
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const headerBg = useColorModeValue("gray.50", "gray.800");
  const borderColor = useColorModeValue("border.subtle", "whiteAlpha.200");
  const rowHoverBg = useColorModeValue("gray.50", "whiteAlpha.50");

  const showToolbar = Boolean(toolbar) || Boolean(showSearch);

  return (
    <Card>
      {showToolbar && (
        <Flex
          align="center"
          justify="space-between"
          px={4}
          py={3}
          borderBottomWidth="1px"
          borderColor={borderColor}
          gap={3}
        >
          <HStack spacing={3} flex={1} maxW="420px">
            {showSearch && (
              <Input
                size="sm"
                placeholder="Buscar..."
                value={resolvedGlobalFilter}
                onChange={(event) => onGlobalFilterChange?.(event.target.value)}
              />
            )}
          </HStack>
          {toolbar && <Box>{toolbar}</Box>}
        </Flex>
      )}

      {errorState}

      {isLoading && (
        loadingState ?? (
          <Box px={4} py={3}>
            <SkeletonTable rows={6} cols={table.getAllLeafColumns().length} />
          </Box>
        )
      )}

      {!isLoading && table.getRowModel().rows.length === 0 && (
        <Box px={4} py={3}>
          {emptyState ?? (
            <EmptyState
              title={emptyText}
              description="Prueba ajustando los filtros o crea un nuevo registro."
            />
          )}
        </Box>
      )}

      {!isLoading && table.getRowModel().rows.length > 0 && (
        <Box overflowX="auto">
          <Table size="md" minW={minWidth} width="100%">
            <Thead bg={headerBg}>
              {table.getHeaderGroups().map((headerGroup) => (
                <Tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isActions = header.column.id === "actions";
                    return (
                      <Th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        cursor={header.column.getCanSort() ? "pointer" : "default"}
                        px={4}
                        py={3}
                        width={isActions ? "1px" : undefined}
                        whiteSpace={isActions ? "nowrap" : undefined}
                        textAlign={isActions ? "right" : undefined}
                      >
                        <HStack spacing={2} justify={isActions ? "flex-end" : "flex-start"}>
                          <Text fontSize="xs" textTransform="uppercase">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </Text>
                          {header.column.getIsSorted() === "asc" && (
                            <Text fontSize="xs">▲</Text>
                          )}
                          {header.column.getIsSorted() === "desc" && (
                            <Text fontSize="xs">▼</Text>
                          )}
                        </HStack>
                      </Th>
                    );
                  })}
                </Tr>
              ))}
            </Thead>
            <Tbody>
              {table.getRowModel().rows.map((row) => (
                <Tr key={row.id} _hover={{ bg: rowHoverBg }}>
                  {row.getVisibleCells().map((cell) => {
                    const isActions = cell.column.id === "actions";
                    return (
                      <Td
                        key={cell.id}
                        px={4}
                        py={3}
                        width={isActions ? "1px" : undefined}
                        whiteSpace={isActions ? "nowrap" : undefined}
                        textAlign={isActions ? "right" : undefined}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}
    </Card>
  );
}
