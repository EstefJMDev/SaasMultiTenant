import React from "react";
import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";

import { AppShell } from "@widgets/app-shell/AppShell";

export const LegalDepartmentPage: React.FC = () => {
  const router = useRouter();

  return (
    <AppShell>
      <Stack spacing={6}>
        <Box>
          <Heading size="md">Departamento Jurídico</Heading>
          <Text color="gray.500" mt={2}>
            Panel modular del área Jurídica. Aquí se irán incorporando sus apartados propios.
          </Text>
        </Box>
        <Stack direction={{ base: "column", md: "row" }} spacing={3}>
          <Button
            colorScheme="blue"
            onClick={() => router.history.push("/departments/legal/contracts")}
          >
            Ir a Contratos Jurídico
          </Button>
        </Stack>
      </Stack>
    </AppShell>
  );
};

export default LegalDepartmentPage;
