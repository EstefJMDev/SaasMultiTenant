import React from "react";
import { Input, Text } from "@chakra-ui/react";

import { formatEuroValue } from "@shared/utils/erp/formatters";

export const EuroCell: React.FC<{
  value: number;
  color?: string;
  bold?: boolean;
}> = ({ value, color, bold = true }) => (
  <Text
    color={color ?? "brand.700"}
    fontWeight={bold ? "semibold" : "normal"}
    fontFamily="mono"
    textAlign="center"
    whiteSpace="nowrap"
  >
    {formatEuroValue(value)}
  </Text>
);

export const BudgetNumberCell: React.FC<{
  value: number;
  onSubmit: (value: string) => void;
  isEditing: boolean;
  min?: number;
}> = ({ value, onSubmit, isEditing, min = 0 }) => {
  const [draftValue, setDraftValue] = React.useState(value.toLocaleString("es-ES"));

  React.useEffect(() => {
    setDraftValue(value.toLocaleString("es-ES"));
  }, [value]);

  const commitValue = React.useCallback(
    (rawValue: string) => {
      const raw = rawValue.trim();
      const normalized = raw.replace(/\./g, "").replace(",", ".");
      onSubmit(normalized === "" ? "0" : normalized);
    },
    [onSubmit],
  );

  if (!isEditing) {
    return <EuroCell value={value} />;
  }

  return (
    <Input
      size="sm"
      type="text"
      inputMode="decimal"
      pattern="[0-9.,]*"
      value={draftValue}
      min={min}
      textAlign="center"
      onChange={(e) => {
        setDraftValue(e.target.value);
      }}
      onBlur={(e) => {
        commitValue(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const target = e.target as HTMLInputElement;
          commitValue(target.value);
        }
      }}
    />
  );
};

