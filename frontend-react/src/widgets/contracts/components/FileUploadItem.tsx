import React from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { AlertCircle, Check, Clock, FileText, Trash2 } from "lucide-react";

interface FileUploadItemProps {
  file: {
    id: number;
    name: string;
    size?: number;
    status: "pending" | "processing" | "completed" | "warning";
    progress: number;
  };
  onRemove?: () => void;
}

export const FileUploadItem: React.FC<FileUploadItemProps> = ({ file, onRemove }) => {
  const statusConfig = {
    pending: {
      color: "gray",
      label: "Listo para procesar",
      icon: <Clock size={14} />,
    },
    processing: {
      color: "blue",
      label: "Procesando OCR...",
      icon: <Clock size={14} />,
    },
    completed: { color: "brand", label: "Extraído", icon: <Check size={14} /> },
    warning: {
      color: "yellow",
      label: "Revisar",
      icon: <AlertCircle size={14} />,
    },
  };
  const config = statusConfig[file.status];
  const cardBg = useColorModeValue("gray.50", "gray.900");
  const borderColor = useColorModeValue("gray.200", "gray.700");

  return (
    <Flex
      align="center"
      gap={4}
      p={4}
      bg={cardBg}
      border="1px solid"
      borderColor={borderColor}
      rounded="lg"
    >
      <FileText size={20} color="#94a3b8" />
      <Box flex="1">
        <Text fontWeight="medium">{file.name}</Text>
        {file.status === "processing" && (
          <Box mt={2} h="6px" bg="gray.200" rounded="full" overflow="hidden">
            <Box h="6px" bg="blue.500" width={`${file.progress}%`} />
          </Box>
        )}
        {file.size && (
          <Text fontSize="xs" color="gray.500" mt={1}>
            {(file.size / (1024 * 1024)).toFixed(2)} MB
          </Text>
        )}
      </Box>
      <Badge
        colorScheme={config.color}
        display="inline-flex"
        alignItems="center"
        gap={2}
        px={3}
        py={1}
        rounded="full"
      >
        {config.icon}
        {config.label}
      </Badge>
      {file.status !== "processing" && (
        <Button variant="link" colorScheme="blue" size="sm">
          {file.status === "completed" ? "Ver datos" : "Editar"}
        </Button>
      )}
      {onRemove && (
        <IconButton
          aria-label="Eliminar archivo"
          icon={<Trash2 size={16} />}
          size="sm"
          variant="ghost"
          onClick={onRemove}
        />
      )}
    </Flex>
  );
};
