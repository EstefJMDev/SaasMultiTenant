import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Input,
  List,
  ListItem,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { fetchWorkSites, type WorkSite } from "@api/workCatalog";

interface ObraNumeroAutocompleteProps {
  obraNumero: string;
  setObraNumero: (value: string) => void;
  /** Se llama al seleccionar una obra del listado (autorrellena nombre). */
  onSelectObra?: (project: WorkSite) => void;
  placeholder?: string;
  inputProps?: React.ComponentProps<typeof Input>;
}

export const ObraNumeroAutocomplete: React.FC<ObraNumeroAutocompleteProps> = ({
  obraNumero,
  setObraNumero,
  onSelectObra,
  placeholder = "0000",
  inputProps,
}) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["erp-projects-autocomplete", obraNumero.trim()],
    queryFn: () => fetchWorkSites(obraNumero.trim(), 8),
    enabled: obraNumero.trim().length > 0,
    staleTime: 60_000,
  });

  const suggestions = useMemo(() => {
    if (!obraNumero.trim()) return [];
    const data = Array.isArray(projectsQuery.data) ? projectsQuery.data : [];
    return data
      .filter((project) => String(project.code).startsWith(obraNumero.trim()))
      .slice(0, 8);
  }, [obraNumero, projectsQuery.data]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const dropdownBg = useColorModeValue("white", "gray.800");
  const borderColor = useColorModeValue("gray.200", "gray.700");
  const hoverBg = useColorModeValue("gray.100", "gray.700");

  const showDropdown = open && suggestions.length > 0;

  return (
    <Box ref={wrapperRef} position="relative">
      <Input
        value={obraNumero}
        inputMode="numeric"
        maxLength={4}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          setObraNumero(event.target.value.replace(/\D/g, "").slice(0, 4));
          setOpen(true);
        }}
        {...inputProps}
      />
      {showDropdown && (
        <Box
          position="absolute"
          top="calc(100% + 4px)"
          left={0}
          right={0}
          zIndex={20}
          bg={dropdownBg}
          border="1px solid"
          borderColor={borderColor}
          rounded="md"
          boxShadow="lg"
          overflow="hidden"
        >
          <List spacing={0}>
            {suggestions.map((project) => (
              <ListItem
                key={project.id}
                px={3}
                py={2}
                cursor="pointer"
                _hover={{ bg: hoverBg }}
                onMouseDown={(event) => {
                  // mousedown para que dispare antes del blur del input
                  event.preventDefault();
                  setObraNumero(String(project.code));
                  onSelectObra?.(project);
                  setOpen(false);
                }}
              >
                <Text fontWeight="semibold" fontSize="sm">
                  {project.code}
                </Text>
                <Text fontSize="xs" color="gray.500" noOfLines={1}>
                  {project.name}
                </Text>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Box>
  );
};
