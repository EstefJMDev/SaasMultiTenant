import React from "react";
import {
  Badge,
  Box,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Select,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { FaPlay, FaStop } from "react-icons/fa";
import type { ErpTask } from "@api/erpTimeTracking";
import { formatSeconds } from "../utils/timeControl.format";

interface TimeControlHeaderProps {
  panelBg: string;
  subtleText: string;
  totalWeekSeconds: number;
  taskIdInput: string;
  tasks: ErpTask[];
  tasksError: string | null;
  isLoading: boolean;
  isRunning: boolean;
  formattedElapsed: string;
  onTaskChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  t: (key: string, options?: any) => string;
}

export const TimeControlHeader: React.FC<TimeControlHeaderProps> = ({
  panelBg,
  subtleText,
  totalWeekSeconds,
  taskIdInput,
  tasks,
  tasksError,
  isLoading,
  isRunning,
  formattedElapsed,
  onTaskChange,
  onStart,
  onStop,
  t,
}) => (
  <Box borderWidth="1px" borderRadius="xl" p={4} bg={panelBg} mb={6}>
    <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={4} alignItems="center">
      <Box>
        <Text fontSize="xs" color={subtleText}>
          {t("timeControl.stats.totalWeeklyHours")}
        </Text>
        <Text fontSize="xl" fontWeight="semibold">
          {formatSeconds(totalWeekSeconds)}
        </Text>
      </Box>
      <FormControl>
        <FormLabel>{t("timeControl.controls.currentTask")}</FormLabel>
        <Select
          value={taskIdInput}
          onChange={(e) => onTaskChange(e.target.value)}
          placeholder={t("timeControl.controls.selectTask")}
          isDisabled={isLoading}
        >
          <option value="">{t("timeControl.labels.noTask")}</option>
          {tasks.map((task) => (
            <option key={task.id} value={String(task.id)}>
              #{task.id} - {task.title}
            </option>
          ))}
        </Select>
        {tasksError && (
          <Text fontSize="xs" color="red.400" mt={2}>
            {tasksError}
          </Text>
        )}
      </FormControl>
      <HStack
        spacing={4}
        align="center"
        justify="flex-end"
        justifySelf="end"
        w="100%"
        flexWrap="wrap"
      >
        <Box textAlign={{ base: "left", lg: "right" }}>
          <Badge colorScheme={isRunning ? "brand" : "gray"}>
            {isRunning
              ? t("timeControl.status.inProgress")
              : t("timeControl.status.idle")}
          </Badge>
          {isRunning && (
            <Text fontSize="2xl" fontFamily="mono" mt={1}>
              {formattedElapsed}
            </Text>
          )}
        </Box>
        <HStack spacing={3}>
          <IconButton
            aria-label={t("timeControl.actions.start")}
            icon={<FaPlay />}
            colorScheme="brand"
            isRound
            size="lg"
            w="48px"
            h="48px"
            onClick={onStart}
            isLoading={isLoading && !isRunning}
            isDisabled={isRunning}
          />
          <IconButton
            aria-label={t("timeControl.actions.stop")}
            icon={<FaStop />}
            colorScheme="red"
            variant="outline"
            isRound
            size="lg"
            w="48px"
            h="48px"
            onClick={onStop}
            isLoading={isLoading && isRunning}
            isDisabled={!isRunning}
          />
        </HStack>
      </HStack>
    </SimpleGrid>
  </Box>
);

