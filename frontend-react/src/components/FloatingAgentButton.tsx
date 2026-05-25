import React, { memo, useEffect, useState } from 'react';
import {
  Box,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  IconButton,
  Text,
  Tooltip,
  useBreakpointValue,
} from '@chakra-ui/react';
import { MessageCircle, PanelRightClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AgentChat } from './AgentChat';
import { useCurrentUser } from '@hooks/useCurrentUser';

const STORAGE_KEY = 'agent-panel-open';

const AgentPanelHeader = memo(function AgentPanelHeader({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Flex
      align="center"
      justify="space-between"
      px={4}
      py={3}
      borderBottom="1px solid"
      borderColor="blackAlpha.100"
      bg="linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(30,41,59,0.96) 100%)"
      color="white"
    >
      <Box>
        <Text fontSize="sm" fontWeight="700" letterSpacing="0.04em" textTransform="uppercase">
          {t('agent.title')}
        </Text>
        <Text fontSize="xs" color="whiteAlpha.800">
          {t('agent.subtitle')}
        </Text>
      </Box>
      <IconButton
        aria-label={t('agent.closePanel')}
        icon={<PanelRightClose size={18} />}
        size="sm"
        variant="ghost"
        color="white"
        onClick={onClose}
        _hover={{ bg: 'whiteAlpha.200' }}
      />
    </Flex>
  );
});

const AgentPanelTrigger = memo(function AgentPanelTrigger({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <Box position="fixed" right={6} bottom={6} zIndex={60}>
      <Tooltip label={t('agent.openPanel')} placement="left">
        <IconButton
          aria-label={t('agent.openPanel')}
          icon={<MessageCircle size={20} />}
          onClick={onOpen}
          borderRadius="full"
          size="lg"
          bg="#4f46e5"
          color="white"
          boxShadow="0 14px 32px rgba(15, 23, 42, 0.28)"
          _hover={{
            transform: 'translateY(-2px)',
            boxShadow: '0 18px 36px rgba(15, 23, 42, 0.34)',
            bg: '#4338ca',
          }}
          _active={{ transform: 'translateY(0)' }}
          transition="all 0.2s ease"
        />
      </Tooltip>
    </Box>
  );
});

export function FloatingAgentButton() {
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const isDesktop = useBreakpointValue({ base: false, lg: true }) ?? false;
  const [isDesktopOpen, setIsDesktopOpen] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === '0') {
      setIsDesktopOpen(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, isDesktopOpen ? '1' : '0');
  }, [isDesktopOpen]);

  if (!currentUser) return null;

  const chat = (
    <AgentChat
      userId={String(currentUser.id)}
      tenantId={currentUser.tenant_id ? String(currentUser.tenant_id) : undefined}
    />
  );

  if (isDesktop) {
    if (!isDesktopOpen) {
      return <AgentPanelTrigger onOpen={() => setIsDesktopOpen(true)} />;
    }

    return (
      <Box
        display={{ base: 'none', lg: 'flex' }}
        w={{ lg: '380px', xl: '420px' }}
        minW={{ lg: '380px', xl: '420px' }}
        h="100vh"
        position="sticky"
        top="0"
        flexDirection="column"
        flexShrink={0}
        borderLeft="1px solid"
        borderColor="blackAlpha.100"
        bg="white"
        _dark={{ bg: 'gray.900', borderColor: 'whiteAlpha.200' }}
      >
        <AgentPanelHeader onClose={() => setIsDesktopOpen(false)} />
        <Box flex="1" minH="0" overflow="hidden" bg="gray.50" _dark={{ bg: 'gray.950' }}>
          {chat}
        </Box>
      </Box>
    );
  }

  return (
    <>
      <AgentPanelTrigger onOpen={() => setIsMobileOpen(true)} />
      <Drawer
        isOpen={isMobileOpen}
        placement="right"
        onClose={() => setIsMobileOpen(false)}
        size="sm"
      >
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader px={4} py={4} bg="gray.900" color="white">
            <Text fontSize="sm" fontWeight="700" letterSpacing="0.04em" textTransform="uppercase">
              {t('agent.title')}
            </Text>
            <Text fontSize="xs" fontWeight="normal" color="whiteAlpha.800">
              {t('agent.subtitle')}
            </Text>
          </DrawerHeader>
          <DrawerBody p={0} bg="gray.50" _dark={{ bg: 'gray.950' }}>
            {chat}
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
