import { useMemo, useState } from "react";
import { addDays, startOfWeek } from "@shared/utils/erp";

export function useTimeControlWeek() {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date()),
  );

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

  const goToPrevWeek = () =>
    setWeekStart(startOfWeek(addDays(weekStart, -7)));
  const goToNextWeek = () =>
    setWeekStart(startOfWeek(addDays(weekStart, 7)));
  const goToCurrentWeek = () => setWeekStart(startOfWeek(new Date()));

  return {
    weekStart,
    setWeekStart,
    weekDays,
    weekRange,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
  };
}
