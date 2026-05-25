import React from "react";
import { SimpleGrid, Box, Heading, Text } from "@chakra-ui/react";

import type { Tool } from "@api/tools";

interface ToolGridProps {
  tools: Tool[];
  onLaunch?: (tool: Tool) => void;
}

/**
 * Grid reutilizable para mostrar herramientas externas.
 *
 * Si se recibe `onLaunch`, al hacer clic en la tarjeta se
 * invoca el callback (en lugar de navegar directamente a base_url).
 */
export const ToolGrid: React.FC<ToolGridProps> = ({ tools, onLaunch }) => {
  if (!tools.length) {
    return <Text>No hay herramientas asignadas todavía.</Text>;
  }

  return (
    <SimpleGrid columns={[1, 2, 3]} spacing={4}>
      {tools.map((tool) => (
        <Box
          key={tool.id}
          as="button"
          type="button"
          p={4}
          borderWidth="1px"
          rounded="md"
          _hover={{ shadow: "md", bg: "gray.50" }}
          textAlign="left"
          onClick={onLaunch ? () => onLaunch(tool) : undefined}
        >
          <Heading size="md" mb={2}>
            {tool.name}
          </Heading>
          <Text fontSize="sm" color="gray.600">
            {tool.description ?? "Sin descripción"}
          </Text>
        </Box>
      ))}
    </SimpleGrid>
  );
};

