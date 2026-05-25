import type { SummaryStorage, SummaryYearlyData } from "./types";

// En esta versión evitamos usar localStorage por requisitos del proyecto.
// Mantener una referencia en memoria es suficiente como fallback básico.
let inMemorySummaryStorage: SummaryStorage = {};

export const readSummaryStorage = (): SummaryStorage => {
  return inMemorySummaryStorage;
};

export const writeSummaryStorage = (value: SummaryStorage) => {
  inMemorySummaryStorage = value;
};

export const cloneYearData = (data: SummaryYearlyData): SummaryYearlyData => ({
  projectJustify: { ...data.projectJustify },
  projectJustified: { ...data.projectJustified },
  summaryMilestones: Object.fromEntries(
    Object.entries(data.summaryMilestones || {}).map(([projId, items]) => [
      Number(projId),
      (items || []).map((item) => ({
        label: item.label,
        hours: item.hours,
      })),
    ]),
  ),
});

export const loadSummaryFallback = (year: number): SummaryYearlyData => {
  const storage = readSummaryStorage();
  const entry = storage[year];
  return entry ? cloneYearData(entry) : { projectJustify: {}, projectJustified: {}, summaryMilestones: {} };
};

export const persistSummaryFallback = (year: number, data: SummaryYearlyData) => {
  const storage = readSummaryStorage();
  storage[year] = cloneYearData(data);
  writeSummaryStorage(storage);
};
