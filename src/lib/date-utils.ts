export const DAY_NAMES = [
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
  "Söndag",
] as const;

export function getDayNamesFromStartDate(startDate: Date) {
  const base = new Date(startDate);
  const startDay = base.getDay();
  const labels = [...DAY_NAMES];

  // Convert JS day index (Sun=0) to Monday-first index (Mon=0..Sun=6).
  const mondayFirstStart = startDay === 0 ? 6 : startDay - 1;
  return labels
    .slice(mondayFirstStart)
    .concat(labels.slice(0, mondayFirstStart));
}

const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
] as const;

/** Returns the Monday of the week containing `date`, at midnight (local time). */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns a date string in `YYYY-MM-DD` format. */
export function formatDateParam(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns e.g. "18 maj – 24 maj" for the Mon–Sun week starting at `start`. */
export function formatWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startStr = `${start.getDate()} ${MONTH_NAMES[start.getMonth()]}`;
  const endStr = `${end.getDate()} ${MONTH_NAMES[end.getMonth()]}`;

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${endStr}`;
  }
  return `${startStr} – ${endStr}`;
}

/** Returns true if two dates represent the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
