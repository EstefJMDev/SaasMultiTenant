import React from "react";
import {
  Box,
  Button,
  Code,
  Heading,
  Text,
  VStack,
} from "@chakra-ui/react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <Box
        minH="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="gray.50"
        p={8}
      >
        <VStack spacing={6} maxW="600px" textAlign="center">
          <Heading size="lg" color="red.500">
            Algo ha ido mal
          </Heading>
          <Text color="gray.600">
            Se ha producido un error inesperado. Puedes intentar recargar la
            página o volver al inicio.
          </Text>
          <Code
            p={4}
            borderRadius="md"
            fontSize="sm"
            colorScheme="red"
            whiteSpace="pre-wrap"
            textAlign="left"
            w="full"
          >
            {error.message}
          </Code>
          <Box display="flex" gap={3}>
            <Button colorScheme="blue" onClick={this.handleReset}>
              Reintentar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/";
              }}
            >
              Ir al inicio
            </Button>
          </Box>
        </VStack>
      </Box>
    );
  }
}
