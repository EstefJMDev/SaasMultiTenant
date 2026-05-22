import React from "react";

import {
  Box,
  Heading,
  SimpleGrid,
  Skeleton,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
} from "@chakra-ui/react";

import type { RecentActiveUser } from "@api/dashboard";
import { KpiCard } from "@shared/ui";

interface DashboardAdminActivitySectionProps {
  isLoading: boolean;
  activeUsersNow?: number;
  activeUsersToday?: number;
  recentUsers?: RecentActiveUser[];
  recentUsersLoading?: boolean;
}

export const DashboardAdminActivitySection: React.FC<
  DashboardAdminActivitySectionProps
> = ({
  isLoading,
  activeUsersNow,
  activeUsersToday,
  recentUsers,
  recentUsersLoading,
}) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const subtleText = useColorModeValue("gray.500", "gray.300");
  const headBg = useColorModeValue("gray.50", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const rowHoverBg = useColorModeValue("gray.50", "whiteAlpha.50");

  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });

  const items = [
    {
      label: "Usuarios activos ahora",
      value: activeUsersNow ?? "—",
    },
    {
      label: "Usuarios activos hoy",
      value: activeUsersToday ?? "—",
    },
  ];

  return (
    <Box borderWidth="1px" borderRadius="xl" bg={cardBg} p={{ base: 4, md: 6 }} mb={8}>
      <Heading as="h2" size="md" mb={1}>
        Actividad de usuarios
      </Heading>
      <Text fontSize="sm" color={subtleText} mb={4}>
        Resumen agregado de actividad para SuperAdmin.
      </Text>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {items.map((item) => (
          <Skeleton key={item.label} isLoaded={!isLoading} borderRadius="xl">
            <KpiCard label={item.label} value={item.value} />
          </Skeleton>
        ))}
      </SimpleGrid>
      <Box mt={6}>
        <Heading as="h3" size="sm" mb={1}>
          Ultimos accesos
        </Heading>
        <Text fontSize="sm" color={subtleText} mb={3}>
          Usuarios con actividad reciente en orden descendente.
        </Text>
        <Skeleton isLoaded={!recentUsersLoading} borderRadius="xl">
          {!recentUsers || recentUsers.length === 0 ? (
            <Text fontSize="sm" color={subtleText}>
              No hay accesos recientes disponibles.
            </Text>
          ) : (
            <Box borderWidth="1px" borderColor={borderColor} borderRadius="lg" overflowX="auto">
              <Table size="sm" variant="simple">
                <Thead bg={headBg}>
                  <Tr>
                    <Th>Usuario</Th>
                    <Th>Email</Th>
                    <Th>Tenant</Th>
                    <Th>Ultimo acceso</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {recentUsers.map((user) => (
                    <Tr key={user.id} _hover={{ bg: rowHoverBg }}>
                      <Td>{user.full_name}</Td>
                      <Td>{user.email}</Td>
                      <Td>{user.tenant_name ?? "Global"}</Td>
                      <Td>{formatter.format(new Date(user.last_seen_at))}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          )}
        </Skeleton>
      </Box>
    </Box>
  );
};
