import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchTimeSessions,
  type TimeSessionBlock,
} from "@api/erpSessions";

const toLocalIsoString = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const offsetMinutes = date.getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const offsetTotal = Math.abs(offsetMinutes);
  const oh = pad(Math.floor(offsetTotal / 60));
  const om = pad(offsetTotal % 60);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${sign}${oh}:${om}`;
};

interface UseTimeControlSessionsOptions {
  weekRange: { start: Date; end: Date };
}

export function useTimeControlSessions({
  weekRange,
}: UseTimeControlSessionsOptions) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<TimeSessionBlock[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingSessions(true);
      try {
        const list = await fetchTimeSessions(
          toLocalIsoString(weekRange.start),
          toLocalIsoString(weekRange.end),
        );
        if (!cancelled) {
          setSessions(list);
          setSessionsError(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setSessionsError(
            error?.response?.data?.detail ??
              t("timeControl.messages.sessionsLoadError"),
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSessions(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekRange.start, weekRange.end]);

  return { sessions, setSessions, sessionsError, isLoadingSessions };
}
