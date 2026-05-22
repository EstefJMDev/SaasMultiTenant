import { useMemo, useState } from "react";
import { addDays, startOfWeek } from "../utils/timeControl.mapper";

export type TimeControlViewMode = "calendar" | "list" | "timesheet";

export const useTimeControlFilters = () => {
  const [viewMode, setViewMode] = useState<TimeControlViewMode>("calendar");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [minutesStep, setMinutesStep] = useState<number>(15);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
    [weekStart],
  );

  const weekRange = useMemo(() => {
    const start = new Date(weekStart);
    const end = addDays(weekStart, 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [weekStart]);

  return {
    viewMode,
    setViewMode,
    weekStart,
    setWeekStart,
    minutesStep,
    setMinutesStep,
    weekDays,
    weekRange,
  };
};
