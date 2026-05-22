import React from "react";

import {
  Box,
  HStack,
  Radio,
  RadioGroup,
  Stack,
  Table,
  Tbody,
  Td,
  Text,
  Textarea,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { AlertCircle } from "lucide-react";

interface ComparativeReviewProvider {
  key: string;
  id: number | null;
  name: string;
  colorScheme: string;
}

interface ComparativeReviewPriceCell {
  precio: number | null;
  importe: number | null;
}

interface ComparativeReviewRow {
  key: string;
  medicion: string;
  unidad: string;
  descripcion: string;
  pricesByProvider: Map<string, ComparativeReviewPriceCell>;
  precioMinimo: number | null;
  proveedorMinimo: string | null;
  costeUnitario: number | null;
  costeImporte: number | null;
  precioNetoUnitario: number | null;
  precioNetoImporte: number | null;
  bestByImporte:
    | {
        providerKey: string;
        providerName: string;
        importe: number | null;
      }
    | null;
}

interface ComparativeReviewTableSectionProps {
  pendingFieldsCount: number;
  providers: ComparativeReviewProvider[];
  rowsToRender: ComparativeReviewRow[];
  bestPriceProvider: ComparativeReviewProvider | null;
  selectedProvider: string;
  onSelectedProviderChange: (value: string) => void;
  formatCurrency: (value: number) => string;
  resolvePriceCellByProvider: (
    pricesByProvider: Map<string, ComparativeReviewPriceCell>,
    providerKey: string,
  ) => ComparativeReviewPriceCell | undefined;
}

export const ComparativeReviewTableSection: React.FC<
  ComparativeReviewTableSectionProps
> = ({
  pendingFieldsCount,
  providers,
  rowsToRender,
  bestPriceProvider,
  selectedProvider,
  onSelectedProviderChange,
  formatCurrency,
  resolvePriceCellByProvider,
}) => {
  const hasCorruptedChars = (value: string): boolean =>
    /[\uFFFD]|\u00C3\u0192|\u00C3\u201A|\u00C3\u00A2|\u00C3|\u00C2|\u00E2/.test(value);

  const tryRepairMojibake = (value: string): string => {
    if (!/[\u00C3\u00C2\u00E2]/.test(value)) {
      return value;
    }
    try {
      const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
      const repaired = new TextDecoder("utf-8").decode(bytes).trim();
      return repaired || value;
    } catch {
      return value;
    }
  };

  const sanitizeTextValue = (value: string | null | undefined): string => {
    if (!value) {
      return "-";
    }

    const normalized = value.trim();
    if (!normalized) {
      return "-";
    }

    const repaired = tryRepairMojibake(normalized);
    if (!repaired || hasCorruptedChars(repaired)) {
      return "-";
    }

    return repaired;
  };
  return (
    <Stack spacing={6} p={6}>
      <HStack
        align="center"
        gap={3}
        p={4}
        bg="yellow.50"
        border="1px solid"
        borderColor="yellow.200"
        rounded="lg"
      >
        <AlertCircle size={18} color="#d97706" />
        <Text fontSize="sm" color="yellow.800">
          Campos pendientes de revision: {pendingFieldsCount}
        </Text>
      </HStack>

      <Box overflowX="auto">
        <Table size="sm">
          <Thead>
            <Tr>
              <Th bg="gray.700" color="white" textTransform="uppercase" fontSize="xs">
                Medicion
              </Th>
              <Th bg="gray.700" color="white" textTransform="uppercase" fontSize="xs">
                U.D.
              </Th>
              <Th
                bg="gray.700"
                color="white"
                textTransform="uppercase"
                fontSize="xs"
                minW="360px"
              >
                Descripcion
              </Th>
              {providers.map((provider) => (
                <Th
                  key={provider.key}
                  bg={`${provider.colorScheme}.600`}
                  color="white"
                  textAlign="center"
                  textTransform="uppercase"
                  fontSize="xs"
                  colSpan={2}
                >
                  {sanitizeTextValue(provider.name)}
                </Th>
              ))}
              <Th
                bg="yellow.600"
                color="white"
                textAlign="center"
                textTransform="uppercase"
                fontSize="xs"
                rowSpan={2}
                minW="180px"
              >
                Mejor oferta
              </Th>
            </Tr>
            <Tr>
              <Th bg="gray.600" />
              <Th bg="gray.600" />
              <Th bg="gray.600" />
              {providers.map((provider) => (
                <React.Fragment key={`${provider.key}-subhead`}>
                  <Th bg={`${provider.colorScheme}.500`} color="white" textAlign="center" textTransform="uppercase" fontSize="xs">
                    Precio
                  </Th>
                  <Th bg={`${provider.colorScheme}.500`} color="white" textAlign="center" textTransform="uppercase" fontSize="xs">
                    Importe
                  </Th>
                </React.Fragment>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {rowsToRender.map((row, rowIndex) => (
              <Tr key={row.key} bg={rowIndex % 2 === 1 ? "gray.50" : "transparent"}>
                <Td fontWeight="semibold">{sanitizeTextValue(row.medicion)}</Td>
                <Td>{sanitizeTextValue(row.unidad)}</Td>
                <Td>{sanitizeTextValue(row.descripcion)}</Td>
                {providers.map((provider) => {
                  const cell = resolvePriceCellByProvider(row.pricesByProvider, provider.key);
                  const isBest = row.bestByImporte?.providerKey === provider.key;
                  const baseBg = isBest ? `${provider.colorScheme}.100` : `${provider.colorScheme}.50`;
                  const textColor = isBest ? `${provider.colorScheme}.800` : `${provider.colorScheme}.700`;

                  return (
                    <React.Fragment key={`${row.key}-${provider.key}`}>
                      <Td bg={baseBg} textAlign="center" color={textColor} fontWeight={isBest ? "bold" : "semibold"}>
                        {cell?.precio !== null && cell?.precio !== undefined ? formatCurrency(cell.precio) : "-"}
                      </Td>
                      <Td bg={baseBg} textAlign="center" color={textColor} fontWeight={isBest ? "bold" : "semibold"}>
                        {cell?.importe !== null && cell?.importe !== undefined ? formatCurrency(cell.importe) : "-"}
                      </Td>
                    </React.Fragment>
                  );
                })}
                <Td bg={row.bestByImporte ? "brand.50" : "gray.50"} textAlign="center">
                  {row.bestByImporte ? (
                    <Stack spacing={0} align="center">
                      <Text fontWeight="bold" color="brand.700">
                        {sanitizeTextValue(row.bestByImporte.providerName)}
                      </Text>
                      <Text fontSize="sm" color="brand.600">{formatCurrency(row.bestByImporte.importe ?? 0)}</Text>
                    </Stack>
                  ) : (
                    <Text color="gray.500" fontSize="sm">Pendiente</Text>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      {providers.length === 0 && (
        <Text fontSize="sm" color="gray.500">
          No hay lineas de comparativo disponibles todavia.
        </Text>
      )}

      <Box p={4} bg="brand.50" border="1px solid" borderColor="brand.200" rounded="lg">
        <Text fontSize="sm" fontWeight="semibold" color="brand.800">
          Recomendacion del Sistema: {bestPriceProvider?.name ?? "Pendiente"}
        </Text>
      </Box>

      <Box>
        <Text fontSize="sm" fontWeight="semibold" mb={2}>
          Oferta Seleccionada
        </Text>
        <RadioGroup value={selectedProvider} onChange={onSelectedProviderChange}>
          <HStack spacing={6}>
            {providers.map((provider) => {
              const hasValidOfferId = provider.id !== null;
              return (
                <Radio
                  key={provider.key}
                  value={hasValidOfferId ? String(provider.id) : `invalid-${provider.key}`}
                  isDisabled={!hasValidOfferId}
                >
                  {sanitizeTextValue(provider.name)}
                </Radio>
              );
            })}
          </HStack>
        </RadioGroup>
      </Box>

      <Box>
        <Text fontSize="sm" fontWeight="semibold" mb={2}>
          Observaciones adicionales
        </Text>
        <Textarea placeholder="Comentarios del Jefe de Obra..." rows={4} />
      </Box>
    </Stack>
  );
};
