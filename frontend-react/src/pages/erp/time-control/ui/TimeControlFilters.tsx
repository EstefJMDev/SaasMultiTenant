import React from "react";
import { Button, HStack, Select, Text } from "@chakra-ui/react";
import { Link } from "@tanstack/react-router";
import { addDays, startOfWeek } from "../utils/timeControl.mapper";
import { MINUTES_STEP_OPTIONS } from "../utils/timeControl.format";
import type { TimeControlViewMode } from "../hooks/useTimeControlFilters";

interface TimeControlFiltersProps {
  viewMode: TimeControlViewMode;
  setViewMode: (value: TimeControlViewMode) => void;
  canCreateTimeReports: boolean;
  minutesStep: number;
  setMinutesStep: (value: number) => void;
  weekStart: Date;
  setWeekStart: (value: Date) => void;
  subtleText: string;
  t: (key: string, options?: any) => string;
}

export const TimeControlFilters: React.FC<TimeControlFiltersProps> = ({
  viewMode,
  setViewMode,
  canCreateTimeReports,
  minutesStep,
  setMinutesStep,
  weekStart,
  setWeekStart,
  subtleText,
  t,
}) => (
  <HStack spacing={3} mb={4} align="center">
    <HStack
      bg="white"
      borderRadius="12px"
      p="6px"
      boxShadow="0 1px 10px rgba(0,0,0,0.08)"
      border="1px solid"
      borderColor="gray.100"
      gap={1}
      flexWrap="wrap"
    >
      <Button
        px={4}
        py={2}
        borderRadius="10px"
        fontSize="sm"
        fontWeight={600}
        bg={viewMode === "calendar" ? "brand.600" : "transparent"}
        color={viewMode === "calendar" ? "white" : "inherit"}
        _hover={{
          bg: viewMode === "calendar" ? "brand.600" : "gray.50",
          color: viewMode === "calendar" ? "white" : "inherit",
        }}
        onClick={() => setViewMode("calendar")}
      >
        {t("timeControl.views.calendar")}
      </Button>
      <Button
        px={4}
        py={2}
        borderRadius="10px"
        fontSize="sm"
        fontWeight={500}
        bg={viewMode === "list" ? "brand.600" : "transparent"}
        color={viewMode === "list" ? "white" : "inherit"}
        _hover={{
          bg: viewMode === "list" ? "brand.600" : "gray.50",
          color: viewMode === "list" ? "white" : "inherit",
        }}
        onClick={() => setViewMode("list")}
      >
        {t("timeControl.views.list")}
      </Button>
      <Button
        px={4}
        py={2}
        borderRadius="10px"
        fontSize="sm"
        fontWeight={500}
        bg={viewMode === "timesheet" ? "brand.600" : "transparent"}
        color={viewMode === "timesheet" ? "white" : "inherit"}
        _hover={{
          bg: viewMode === "timesheet" ? "brand.600" : "gray.50",
          color: viewMode === "timesheet" ? "white" : "inherit",
        }}
        onClick={() => setViewMode("timesheet")}
      >
        {t("timeControl.views.timesheet")}
      </Button>
      {canCreateTimeReports && (
        <Button
          as={Link}
          to="/time-report"
          px={4}
          py={2}
          borderRadius="10px"
          fontSize="sm"
          fontWeight={500}
          bg="transparent"
          color="inherit"
          _hover={{ bg: "gray.50" }}
        >
          {t("timeControl.actions.timeReport")}
        </Button>
      )}
    </HStack>
    <HStack marginLeft="auto" spacing={4} align="center">
      <HStack spacing={2}>
        <Text fontSize="sm" color={subtleText}>
          {t("timeControl.controls.adjustment")}
        </Text>
        <Select
          size="sm"
          value={minutesStep}
          onChange={(e) => setMinutesStep(Number(e.target.value))}
        >
          {MINUTES_STEP_OPTIONS.map((step) => (
            <option key={step} value={step}>
              {step} min
            </option>
          ))}
        </Select>
      </HStack>
      <HStack spacing={2}>
        <Button
          variant="ghost"
          onClick={() => setWeekStart(startOfWeek(addDays(weekStart, -7)))}
        >
          {t("timeControl.controls.prevWeek")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setWeekStart(startOfWeek(new Date()))}
        >
          {t("timeControl.controls.today")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setWeekStart(startOfWeek(addDays(weekStart, 7)))}
        >
          {t("timeControl.controls.nextWeek")}
        </Button>
      </HStack>
    </HStack>
  </HStack>
);

