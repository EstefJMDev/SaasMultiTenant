import React, { useMemo } from "react";
import {
  Box,
  Skeleton,
  Table,
  Tbody,
  Td,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 8,
  cols = 5,
}) => {
  const headerBg = useColorModeValue("gray.50", "gray.800");
  const columns = useMemo(() => Array.from({ length: cols }, (_, i) => i), [cols]);
  const rowsList = useMemo(() => Array.from({ length: rows }, (_, i) => i), [rows]);

  return (
    <Box overflowX="auto">
      <Table size="sm" minW="640px">
        <Thead bg={headerBg}>
          <Tr>
            {columns.map((col) => (
              <Td key={col} />
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {rowsList.map((row) => (
            <Tr key={row}>
              {columns.map((col) => (
                <Td key={col}>
                  <Skeleton height="12px" borderRadius="full" />
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </Box>
  );
};
