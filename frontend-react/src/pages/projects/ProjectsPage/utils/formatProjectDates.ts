type DateLike = string | null | undefined;

interface ProjectDatesInput {
  start_date?: DateLike;
  end_date?: DateLike;
}

const formatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const formatDate = (value: DateLike, emptyLabel: string): string => {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatter.format(date);
};

export const formatProjectDates = (input: ProjectDatesInput): string => {
  const start = formatDate(input.start_date, "Sin inicio");
  const end = formatDate(input.end_date, "Sin fin");
  return `${start} → ${end}`;
};
