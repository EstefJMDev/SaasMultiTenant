import React from "react";
import { Box, Input, Text } from "@chakra-ui/react";

interface InputFieldProps {
  label: string;
  value?: string;
  defaultValue?: string;
  disabled?: boolean;
  helper?: string;
  suffix?: string;
  type?: string;
  required?: boolean;
  isInvalid?: boolean;
  fullWidth?: boolean;
  onChange?: (value: string) => void;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  value,
  defaultValue,
  disabled,
  helper,
  suffix,
  type = "text",
  required = false,
  isInvalid = false,
  fullWidth,
  onChange,
}) => {
  return (
    <Box gridColumn={fullWidth ? { base: "span 1", md: "span 2" } : undefined}>
      <Text fontSize="sm" fontWeight="medium" mb={2}>
        {label}
        {required ? " *" : ""}
      </Text>
      <Box position="relative">
        <Input
          type={type}
          {...(value !== undefined ? { value } : { defaultValue })}
          isRequired={required}
          isInvalid={isInvalid}
          isReadOnly={disabled}
          bg={disabled ? "gray.50" : undefined}
          pr={suffix ? 10 : undefined}
          onChange={(event) => onChange?.(event.target.value)}
        />
        {suffix && (
          <Text
            position="absolute"
            right={3}
            top="50%"
            transform="translateY(-50%)"
            fontSize="sm"
            color="gray.500"
          >
            {suffix}
          </Text>
        )}
      </Box>
      {helper && (
        <Text fontSize="xs" color="gray.500" mt={1}>
          {helper}
        </Text>
      )}
    </Box>
  );
};
