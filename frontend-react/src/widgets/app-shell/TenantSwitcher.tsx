import React, { useMemo, useState } from "react";
import {
  Button,
  HStack,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAllTenants, type TenantOption } from "@api/users";
import { parseTenantId, readTenantId, writeTenantId } from "@shared/api/tenant";
import { isTenantScopedQueryKey } from "@shared/routing/tenantScope";

interface TenantSwitcherProps {
  isVisible: boolean;
  onTenantSelected?: (tenantId: number) => void;
  triggerLabel?: string;
  isOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export const TenantSwitcher: React.FC<TenantSwitcherProps> = ({
  isVisible,
  onTenantSelected,
  triggerLabel = "Tenant",
  isOpen,
  onOpen,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const storedTenantId = parseTenantId(readTenantId());

  const tenantsQuery = useQuery<TenantOption[]>({
    queryKey: ["tenants-switcher"],
    queryFn: fetchAllTenants,
    enabled: isVisible,
  });

  const filteredTenants = useMemo(() => {
    const list = tenantsQuery.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((t) =>
      [t.name, t.subdomain, String(t.id)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [search, tenantsQuery.data]);

  if (!isVisible) return null;

  const selectedLabel =
    tenantsQuery.data?.find((t) => String(t.id) === storedTenantId)?.name ??
    (storedTenantId ? `#${storedTenantId}` : "Seleccionar");

  return (
    <Menu isOpen={isOpen} onOpen={onOpen} onClose={onClose}>
      <MenuButton as={Button} size="sm" variant="outline" rightIcon={<ChevronDownIcon />}>
        <HStack spacing={2}>
          <Text fontSize="sm">{triggerLabel}</Text>
          <Text fontSize="sm" fontWeight="semibold">
            {selectedLabel}
          </Text>
        </HStack>
      </MenuButton>
      <MenuList minW="320px" p={3}>
        <VStack align="stretch" spacing={2}>
          <Input
            size="sm"
            placeholder="Buscar tenant..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {tenantsQuery.isLoading && (
            <HStack justify="center" py={6}>
              <Spinner size="sm" />
            </HStack>
          )}
          {tenantsQuery.isError && !tenantsQuery.isLoading && (
            <Text fontSize="sm" color="red.500">
              No se pudieron cargar los tenants.
            </Text>
          )}
          {!tenantsQuery.isLoading && !tenantsQuery.isError && filteredTenants.length === 0 && (
            <Text fontSize="sm" color="text.muted">
              Sin resultados.
            </Text>
          )}
          {!tenantsQuery.isLoading &&
            !tenantsQuery.isError &&
            filteredTenants.map((tenant) => (
              <MenuItem
                key={tenant.id}
                onClick={() => {
                  queryClient.cancelQueries();
                  queryClient.removeQueries({
                    predicate: (query) => isTenantScopedQueryKey(query.queryKey),
                  });
                  writeTenantId(String(tenant.id));
                  queryClient.invalidateQueries({
                    predicate: (query) => isTenantScopedQueryKey(query.queryKey),
                  });
                  onTenantSelected?.(tenant.id);
                }}
              >
                <VStack align="stretch" spacing={0}>
                  <Text fontWeight="semibold">{tenant.name}</Text>
                  <Text fontSize="xs" color="text.muted">
                    {tenant.subdomain} · #{tenant.id}
                  </Text>
                </VStack>
              </MenuItem>
            ))}
        </VStack>
      </MenuList>
    </Menu>
  );
};
