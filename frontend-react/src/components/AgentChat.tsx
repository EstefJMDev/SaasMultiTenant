import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  Spinner,
  VStack,
  HStack,
  Text,
  useToast,
  Icon,
  Divider,
  Tooltip,
} from '@chakra-ui/react';
import { useAgent } from '../hooks/useAgent';
import {
  clearPersistedAgentSession,
  persistAgentSession,
  readPersistedAgentSession,
} from '../hooks/agentSessionStorage';
import { Send, AlertCircle, RotateCcw } from 'lucide-react';
import './AgentChat.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'sent' | 'error';
}

interface AgentChatProps {
  userId?: string;
  tenantId?: string;
  baseUrl?: string;
}

const mapAgentHistoryToMessages = (
  history: { role: 'user' | 'assistant'; content: string }[]
): Message[] =>
  history.map((msg, index) => ({
    id: `history-${index}-${msg.role}`,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(),
    status: 'sent',
  }));

const normalizeMessagesForStorage = (messages: Message[]) =>
  messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp.toISOString(),
    status: msg.status,
  }));

function AgentChatHeader({
  sessionId,
  loading,
  onReset,
}: {
  sessionId: string;
  loading: boolean;
  onReset: () => void;
}) {
  return (
    <Flex
      align="center"
      justify="space-between"
      px={4}
      py={2}
      borderBottom="1px solid"
      borderColor="gray.200"
      bg="gray.50"
      _dark={{ bg: 'gray.800', borderColor: 'gray.700' }}
    >
      <Box minW={0}>
        <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.04em">
          Sesion activa
        </Text>
        <Text fontSize="xs" color="gray.500" _dark={{ color: 'gray.400' }} noOfLines={1}>
          {sessionId}
        </Text>
      </Box>
      <Tooltip label="Iniciar una nueva conversacion">
        <Button
          size="xs"
          variant="ghost"
          leftIcon={<RotateCcw size={14} />}
          onClick={onReset}
          isDisabled={loading}
        >
          Nueva
        </Button>
      </Tooltip>
    </Flex>
  );
}

function AgentChatMessages({
  messages,
  loading,
  error,
  clearError,
  isHydratingHistory,
  messagesEndRef,
}: {
  messages: Message[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  isHydratingHistory: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <VStack
      flex={1}
      spacing={3}
      p={4}
      overflowY="auto"
      width="100%"
      align="stretch"
      sx={{
        '&::-webkit-scrollbar': {
          width: '4px',
        },
        '&::-webkit-scrollbar-thumb': {
          bg: 'gray.300',
          borderRadius: '2px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          bg: 'gray.400',
        },
      }}
    >
      {isHydratingHistory ? (
        <Flex justify="center" align="center" gap={2} py={6} width="100%">
          <Spinner size="sm" color="purple.500" />
          <Text fontSize="sm" color="gray.500" _dark={{ color: 'gray.400' }}>
            Recuperando contexto de la sesion...
          </Text>
        </Flex>
      ) : messages.length === 0 ? (
        <Flex direction="column" align="center" justify="center" height="100%" opacity={0.6}>
            <Text fontSize="3xl" mb={3}>
              IA
            </Text>
            <Text textAlign="center" fontSize="sm" fontWeight="medium" mb={2}>
              Bienvenido al Asistente IA
            </Text>
          <Text textAlign="center" fontSize="xs" opacity={0.7} mb={4}>
            Puedo ayudarte con:
          </Text>
          <VStack spacing={1} fontSize="xs" opacity={0.6}>
              <Text>Usuarios y actividad</Text>
              <Text>Documentos y contratos</Text>
              <Text>Presupuesto e invoices</Text>
              <Text>Reportes y analisis</Text>
            </VStack>
        </Flex>
      ) : (
        <>
          {messages.map((msg) => (
            <Box key={msg.id} width="100%" display="flex" justifyContent={msg.role === 'user' ? 'flex-end' : 'flex-start'}>
              <Box
                maxWidth="85%"
                bg={msg.role === 'user' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'gray.100'}
                color={msg.role === 'user' ? 'white' : 'black'}
                px={4}
                py={3}
                borderRadius={msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px'}
                wordBreak="break-word"
                boxShadow={msg.role === 'user' ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.1)'}
                sx={msg.role === 'assistant' ? { _dark: { bg: 'gray.700', color: 'white' } } : {}}
              >
                <Text fontSize="sm" lineHeight="1.5">
                  {msg.content}
                </Text>
                <Text fontSize="xs" opacity={0.6} mt={1}>
                  {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Box>
            </Box>
          ))}

          {loading && (
            <Flex justify="center" align="center" gap={2} py={2} width="100%">
              <Spinner size="sm" color="purple.500" />
              <Text fontSize="sm" color="gray.500" _dark={{ color: 'gray.400' }}>
                El asistente esta procesando...
              </Text>
            </Flex>
          )}

          {error && (
            <Box
              bg="red.50"
              border="1px solid"
              borderColor="red.200"
              borderRadius="lg"
              p={3}
              width="100%"
              sx={{
                _dark: {
                  bg: 'red.900',
                  borderColor: 'red.700',
                },
              }}
            >
              <HStack spacing={2}>
                <Icon as={AlertCircle} color="red.500" boxSize={5} flexShrink={0} />
                <Box flex={1}>
                  <Text fontSize="sm" fontWeight="medium" color="red.700" sx={{ _dark: { color: 'red.200' } }}>
                    {error}
                  </Text>
                  <Button size="xs" variant="ghost" mt={1} onClick={clearError} _hover={{ bg: 'red.100', _dark: { bg: 'red.800' } }}>
                    Descartar
                  </Button>
                </Box>
              </HStack>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </>
      )}
    </VStack>
  );
}

function AgentChatComposer({
  loading,
  selectedFile,
  fileInputRef,
  input,
  onInputChange,
  onSubmit,
  onSelectFile,
  onClearFile,
}: {
  loading: boolean;
  selectedFile: File | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSelectFile: (file: File | null) => void;
  onClearFile: () => void;
}) {
  return (
    <Box
      p={3}
      bg="gray.50"
      borderTop="1px solid"
      borderColor="gray.200"
      sx={{
        _dark: {
          bg: 'gray.750',
          borderColor: 'gray.600',
        },
      }}
    >
      {selectedFile && (
        <Box
          mb={2}
          p={2}
          bg="blue.50"
          borderRadius="md"
          border="1px solid"
          borderColor="blue.200"
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            _dark: {
              bg: 'blue.900',
              borderColor: 'blue.700',
            },
          }}
        >
          <Text fontSize="sm" color="blue.800" sx={{ _dark: { color: 'blue.100' } }}>
              Archivo: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
          </Text>
          <Button size="xs" variant="ghost" onClick={onClearFile} colorScheme="blue">
              X
          </Button>
        </Box>
      )}
      <form onSubmit={onSubmit}>
        <HStack spacing={2}>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => onSelectFile(e.currentTarget.files?.[0] ?? null)}
            display="none"
          />
          <Button
            variant="ghost"
            colorScheme="purple"
            size="md"
            borderRadius="lg"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
            title="Adjuntar archivo CSV o Excel"
          >
              Adjuntar
          </Button>
          <Input
            placeholder={selectedFile ? 'Mensaje opcional...' : 'Pregunta algo... (Enter para enviar)'}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e as unknown as React.FormEvent);
              }
            }}
            disabled={loading}
            borderRadius="lg"
            bg="white"
            _dark={{ bg: 'gray.800' }}
            fontSize="sm"
            _placeholder={{ opacity: 0.5 }}
            _focus={{ boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)' }}
          />
          <Button
            type="submit"
            isLoading={loading}
            loadingText=""
            spinnerPlacement="start"
            colorScheme="purple"
            size="md"
            borderRadius="lg"
            disabled={(!input.trim() && !selectedFile) || loading}
            leftIcon={loading ? undefined : <Send size={16} />}
            px={4}
          >
            {loading ? <Spinner size="sm" /> : 'Enviar'}
          </Button>
        </HStack>
      </form>
    </Box>
  );
}

export function AgentChat({ userId, tenantId, baseUrl }: AgentChatProps) {
  const resolvedUserId = userId || localStorage.getItem('userId') || 'user123';
  const resolvedTenantId = tenantId || localStorage.getItem('tenantId') || '1';
  const {
    chat,
    uploadFile,
    loading,
    error,
    clearError,
    sessionId,
    getSessionHistory,
    resetSession,
  } = useAgent({
    userId,
    tenantId,
    baseUrl,
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const persisted = readPersistedAgentSession(resolvedUserId, resolvedTenantId);
    if (!persisted) return [];
    return persisted.messages.map((msg) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    }));
  });
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isHydratingHistory, setIsHydratingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    persistAgentSession(resolvedUserId, resolvedTenantId, {
      sessionId,
      messages: normalizeMessagesForStorage(messages),
      updatedAt: new Date().toISOString(),
    });
  }, [messages, resolvedTenantId, resolvedUserId, sessionId]);

  useEffect(() => {
    let cancelled = false;

    const hydrateFromBackend = async () => {
      setIsHydratingHistory(true);
      try {
        const history = await getSessionHistory();
        if (cancelled || history.length === 0) return;
        setMessages(mapAgentHistoryToMessages(history));
      } finally {
        if (!cancelled) {
          setIsHydratingHistory(false);
        }
      }
    };

    void hydrateFromBackend();

    return () => {
      cancelled = true;
    };
  }, [getSessionHistory, sessionId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedFile) || loading) return;

    clearError();

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: selectedFile ? `📎 ${selectedFile.name}\n${input}` : input,
      timestamp: new Date(),
      status: 'sent',
    };

    setMessages(prev => [...prev, userMessage]);
    const userInput = input;
    const fileToSend = selectedFile;
    setInput('');
    setSelectedFile(null);

    try {
      let response;

      if (fileToSend) {
        response = await uploadFile(fileToSend, userInput);
      } else {
        response = await chat(userInput);
      }

      if (response) {
        if (response.conversationHistory?.length) {
          const mappedHistory = mapAgentHistoryToMessages(response.conversationHistory);
          const hasAssistantInHistory = mappedHistory.some(
            (msg) => msg.role === 'assistant' && msg.content.trim().length > 0
          );
          if (!hasAssistantInHistory && response.message?.trim()) {
            mappedHistory.push({
              id: `msg-${Date.now() + 1}`,
              role: 'assistant',
              content: response.message,
              timestamp: new Date(),
              status: 'sent',
            });
          }
          setMessages(mappedHistory);
        } else {
          const assistantMessage: Message = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            content: response.message,
            timestamp: new Date(),
            status: 'sent',
          };
          setMessages(prev => [...prev, assistantMessage]);
        }

        if (response.data) {
          toast({
            title: 'Datos Recuperados',
            description: 'El asistente encontró información relevante',
            status: 'success',
            duration: 2,
            isClosable: true,
            position: 'bottom',
          });
        }
      } else {
        toast({
          title: 'Error',
          description: error || 'No se pudo procesar la solicitud',
          status: 'error',
          duration: 3,
          isClosable: true,
          position: 'bottom',
        });
      }
    } catch (err) {
      toast({
        title: 'Error de Conexión',
        description: 'No se pudo conectar con el asistente',
        status: 'error',
        duration: 3,
        isClosable: true,
        position: 'bottom',
      });
    }
  };

  const handleResetSession = async () => {
    clearError();
    setSelectedFile(null);
    setInput('');
    setMessages([]);
    clearPersistedAgentSession(resolvedUserId, resolvedTenantId);
    await resetSession();
    toast({
      title: 'Nueva sesion iniciada',
      description: 'Se ha limpiado el contexto del chat actual.',
      status: 'success',
      duration: 2,
      isClosable: true,
      position: 'bottom',
    });
  };

  return (
    <Flex direction="column" height="100%" width="100%" bg="white" _dark={{ bg: 'gray.800' }}>
      <AgentChatHeader
        sessionId={sessionId}
        loading={loading}
        onReset={() => void handleResetSession()}
      />

      {/* Messages Container */}
      <VStack
        flex={1}
        spacing={3}
        p={4}
        overflowY="auto"
        width="100%"
        align="stretch"
        sx={{
          '&::-webkit-scrollbar': {
            width: '4px',
          },
          '&::-webkit-scrollbar-thumb': {
            bg: 'gray.300',
            borderRadius: '2px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            bg: 'gray.400',
          },
        }}
      >
        {isHydratingHistory ? (
          <Flex justify="center" align="center" gap={2} py={6} width="100%">
            <Spinner size="sm" color="purple.500" />
            <Text fontSize="sm" color="gray.500" _dark={{ color: 'gray.400' }}>
              Recuperando contexto de la sesion...
            </Text>
          </Flex>
        ) : messages.length === 0 ? (
          <Flex direction="column" align="center" justify="center" height="100%" opacity={0.6}>
            <Text fontSize="3xl" mb={3}>
              🤖
            </Text>
            <Text textAlign="center" fontSize="sm" fontWeight="medium" mb={2}>
              ¡Bienvenido al Asistente IA!
            </Text>
            <Text textAlign="center" fontSize="xs" opacity={0.7} mb={4}>
              Puedo ayudarte con:
            </Text>
            <VStack spacing={1} fontSize="xs" opacity={0.6}>
              <Text>👥 Usuarios y actividad</Text>
              <Text>📄 Documentos y contratos</Text>
              <Text>💰 Presupuesto e invoices</Text>
              <Text>📊 Reportes y análisis</Text>
            </VStack>
          </Flex>
        ) : (
          <>
            {messages.map(msg => (
              <Box key={msg.id} width="100%" display="flex" justifyContent={msg.role === 'user' ? 'flex-end' : 'flex-start'}>
                <Box
                  maxWidth="85%"
                  bg={msg.role === 'user' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'gray.100'}
                  color={msg.role === 'user' ? 'white' : 'black'}
                  px={4}
                  py={3}
                  borderRadius={msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px'}
                  wordBreak="break-word"
                  boxShadow={msg.role === 'user' ? '0 2px 8px rgba(102, 126, 234, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.1)'}
                  sx={msg.role === 'assistant' ? { _dark: { bg: 'gray.700', color: 'white' } } : {}}
                >
                  <Text fontSize="sm" lineHeight="1.5">
                    {msg.content}
                  </Text>
                  <Text fontSize="xs" opacity={0.6} mt={1}>
                    {msg.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </Box>
              </Box>
            ))}

            {loading && (
              <Flex justify="center" align="center" gap={2} py={2} width="100%">
                <Spinner size="sm" color="purple.500" />
                <Text fontSize="sm" color="gray.500" _dark={{ color: 'gray.400' }}>
                  El asistente está procesando...
                </Text>
              </Flex>
            )}

            {error && (
              <Box
                bg="red.50"
                border="1px solid"
                borderColor="red.200"
                borderRadius="lg"
                p={3}
                width="100%"
                sx={{
                  _dark: {
                    bg: 'red.900',
                    borderColor: 'red.700',
                  },
                }}
              >
                <HStack spacing={2}>
                  <Icon as={AlertCircle} color="red.500" boxSize={5} flexShrink={0} />
                  <Box flex={1}>
                    <Text fontSize="sm" fontWeight="medium" color="red.700" sx={{ _dark: { color: 'red.200' } }}>
                      {error}
                    </Text>
                    <Button size="xs" variant="ghost" mt={1} onClick={clearError} _hover={{ bg: 'red.100', _dark: { bg: 'red.800' } }}>
                      Descartar
                    </Button>
                  </Box>
                </HStack>
              </Box>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </VStack>

      <Divider />

      {/* Input Area */}
      <Box
        p={3}
        bg="gray.50"
        borderTop="1px solid"
        borderColor="gray.200"
        sx={{
          _dark: {
            bg: 'gray.750',
            borderColor: 'gray.600',
          },
        }}
      >
        {selectedFile && (
          <Box
            mb={2}
            p={2}
            bg="blue.50"
            borderRadius="md"
            border="1px solid"
            borderColor="blue.200"
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            sx={{
              _dark: {
                bg: 'blue.900',
                borderColor: 'blue.700',
              },
            }}
          >
            <Text fontSize="sm" color="blue.800" sx={{ _dark: { color: 'blue.100' } }}>
              📎 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
            </Text>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setSelectedFile(null)}
              colorScheme="blue"
            >
              ✕
            </Button>
          </Box>
        )}
        <form onSubmit={handleSendMessage}>
          <HStack spacing={2}>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={e => {
                const file = e.currentTarget.files?.[0];
                if (file) {
                  setSelectedFile(file);
                }
              }}
              display="none"
            />
            <Button
              variant="ghost"
              colorScheme="purple"
              size="md"
              borderRadius="lg"
              disabled={loading}
              onClick={() => fileInputRef.current?.click()}
              title="Adjuntar archivo CSV o Excel"
            >
              📎
            </Button>
            <Input
              placeholder={selectedFile ? "Mensaje opcional..." : "Pregunta algo... (Enter para enviar)"}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e as any);
                }
              }}
              disabled={loading}
              borderRadius="lg"
              bg="white"
              _dark={{ bg: 'gray.800' }}
              fontSize="sm"
              _placeholder={{ opacity: 0.5 }}
              _focus={{ boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)' }}
            />
            <Button
              type="submit"
              isLoading={loading}
              loadingText=""
              spinnerPlacement="start"
              colorScheme="purple"
              size="md"
              borderRadius="lg"
              disabled={(!input.trim() && !selectedFile) || loading}
              leftIcon={loading ? undefined : <Send size={16} />}
              px={4}
            >
              {loading ? <Spinner size="sm" /> : 'Enviar'}
            </Button>
          </HStack>
        </form>
      </Box>
    </Flex>
  );
}
