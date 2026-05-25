import React from "react";

import { useColorModeValue, useDisclosure } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

import { useTranslation } from "react-i18next";



import { AppShell } from "@widgets/app-shell/AppShell";

import { useCurrentUser } from "@hooks/useCurrentUser";

import { useTimeControlFilters } from "./hooks/useTimeControlFilters";

import { useTimeEntries } from "./hooks/useTimeEntries";

import { TimeControlHeader } from "./ui/TimeControlHeader";

import { TimeControlFilters } from "./ui/TimeControlFilters";

import { TimeControlTable } from "./ui/TimeControlTable";

import { TimeControlModals } from "./ui/TimeControlModals";
import { TimeControlPageHero } from "./ui/TimeControlPageHero";



export const TimeControlPage: React.FC = () => {

  const { t, i18n } = useTranslation();

  const { isOpen, onOpen, onClose } = useDisclosure();



  const cardBg = useColorModeValue("white", "gray.700");

  const panelBg = useColorModeValue("gray.50", "gray.800");

  const subtleText = useColorModeValue("gray.500", "gray.300");

  const mutedText = useColorModeValue("gray.400", "gray.500");

  const accent = useColorModeValue("brand.500", "brand.300");

  const calendarHeaderActiveBg = useColorModeValue("brand.600", "brand.500");

  const calendarHeaderActiveText = useColorModeValue("white", "white");

  const calendarHeaderIdleBg = useColorModeValue("white", "gray.800");

  const calendarHeaderIdleText = useColorModeValue("brand.600", "brand.300");

  const activeSessionBg = useColorModeValue("blue.200", "blue.300");

  const activeSessionBorder = useColorModeValue("blue.400", "blue.500");

  const activeSessionText = useColorModeValue("blue.700", "blue.100");



  const fadeUp = keyframes`

    from { opacity: 0; transform: translateY(12px); }

    to { opacity: 1; transform: translateY(0); }

  `;



  const { data: currentUser } = useCurrentUser();

  const effectiveTenantId = currentUser?.is_super_admin === true

    ? undefined

    : (currentUser?.tenant_id ?? undefined);

  const canCreateTimeReports =

    currentUser?.is_super_admin === true ||

    (currentUser?.permissions?.includes("can_create_time_reports") ?? false);

  const currentUserId = currentUser?.id ?? null;



  const filters = useTimeControlFilters();



  const entries = useTimeEntries({

    effectiveTenantId,

    currentUserId,

    weekStart: filters.weekStart,

    setWeekStart: filters.setWeekStart,

    weekDays: filters.weekDays,

    weekRange: filters.weekRange,

    minutesStep: filters.minutesStep,

    t,

    onOpen,

    onClose,

  });



  return (

    <AppShell>

      <TimeControlPageHero
        breadcrumb={t("timeControl.header.eyebrow")}
        title={t("timeControl.header.title")}
        subtitle={t("timeControl.header.subtitle")}
        animation={`${fadeUp} 0.6s ease-out`}
      />


      <TimeControlHeader

        panelBg={panelBg}

        subtleText={subtleText}

        totalWeekSeconds={entries.totalWeekSeconds}

        taskIdInput={entries.taskIdInput}

        tasks={entries.tasks}

        tasksError={entries.tasksError}

        isLoading={entries.isLoading}

        isRunning={entries.isRunning}

        formattedElapsed={entries.formattedElapsed}

        onTaskChange={entries.handleTaskSelectionChange}

        onStart={entries.handleStart}

        onStop={entries.handleStop}

        t={t}

      />



      <TimeControlFilters

        viewMode={filters.viewMode}

        setViewMode={filters.setViewMode}

        canCreateTimeReports={canCreateTimeReports}

        minutesStep={filters.minutesStep}

        setMinutesStep={filters.setMinutesStep}

        weekStart={filters.weekStart}

        setWeekStart={filters.setWeekStart}

        subtleText={subtleText}

        t={t}

      />



      <TimeControlTable

        viewMode={filters.viewMode}

        sessionsError={entries.sessionsError}

        sessions={entries.sessions}

        isLoadingSessions={entries.isLoadingSessions}

        weekDays={filters.weekDays}

        now={entries.now}

        i18nLanguage={i18n.language}

        panelBg={panelBg}

        cardBg={cardBg}

        subtleText={subtleText}

        mutedText={mutedText}

        accent={accent}

        calendarHeaderActiveBg={calendarHeaderActiveBg}

        calendarHeaderActiveText={calendarHeaderActiveText}

        calendarHeaderIdleBg={calendarHeaderIdleBg}

        calendarHeaderIdleText={calendarHeaderIdleText}

        activeSessionBg={activeSessionBg}

        activeSessionBorder={activeSessionBorder}

        activeSessionText={activeSessionText}

        recentTasks={entries.recentTasks}

        currentUserId={currentUserId}

        dragTaskId={entries.dragTaskId}
        isDraggingSession={entries.isDraggingSession}
        isRunning={entries.isRunning}
        isLoading={entries.isLoading}

        formattedElapsed={entries.formattedElapsed}

        elapsedSeconds={entries.elapsedSeconds}

        activeSession={entries.activeSession}

        taskById={entries.taskById}

        calendarRef={entries.calendarRef}

        selection={entries.selection}

        dragState={entries.dragState}

        pendingDragOriginalRef={entries.pendingDragOriginalRef}

        setDragTaskId={entries.setDragTaskId}

        setDragState={entries.setDragState}

        setIsDraggingSession={entries.setIsDraggingSession}

        startSelection={entries.startSelection}

        onTaskDragStart={entries.handleTaskDragStart}

        onCalendarDrop={entries.handleCalendarDrop}

        getMinutesFromClientY={entries.getMinutesFromClientY}

        openEditSession={entries.openEditSession}

        handleQuickStart={entries.handleQuickStart}

        handleQuickDelete={entries.handleQuickDelete}

        handleStop={entries.handleStop}

        t={t}

      />



      <TimeControlModals

        isOpen={isOpen}

        editingSessionId={entries.editingSessionId}

        draftTaskId={entries.draftTaskId}

        draftDescription={entries.draftDescription}

        draftStart={entries.draftStart}

        draftEnd={entries.draftEnd}

        tasks={entries.tasks}

        onDraftTaskChange={entries.setDraftTaskId}

        onDraftDescriptionChange={entries.setDraftDescription}

        onDraftStartChange={entries.setDraftStart}

        onDraftEndChange={entries.setDraftEnd}

        onDeleteSession={entries.handleDeleteSession}

        onSaveSession={entries.handleSaveSession}

        onCloseModal={entries.handleCloseModal}

        t={t}

      />

    </AppShell>

  );

};


