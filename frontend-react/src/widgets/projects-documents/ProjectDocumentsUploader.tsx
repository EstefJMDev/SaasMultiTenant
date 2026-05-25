import React from "react";
import { HStack, Input } from "@chakra-ui/react";

interface ProjectDocumentsUploaderProps {
  isDisabled?: boolean;
  onUpload: (file: File) => void;
}

export const ProjectDocumentsUploader: React.FC<ProjectDocumentsUploaderProps> = ({
  isDisabled,
  onUpload,
}) => (
  <HStack spacing={3} align="center">
    <Input
      type="file"
      isDisabled={isDisabled}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) {
          onUpload(file);
          event.target.value = "";
        }
      }}
    />
  </HStack>
);
