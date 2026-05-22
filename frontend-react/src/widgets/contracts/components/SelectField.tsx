import React from "react";
import { Box, Text } from "@chakra-ui/react";

interface SelectFieldProps {
  label: string;
  options: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  options,
  value,
  defaultValue,
  onChange,
}) => {
  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" mb={2}>
        {label}
      </Text>
      <Box
        as="select"
        {...(value !== undefined ? { value } : { defaultValue })}
        onChange={onChange}
        border="1px solid"
        borderColor="gray.200"
        rounded="md"
        px={3}
        py={2}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Box>
    </Box>
  );
};
