/** The API stores naive datetimes in UTC; retain explicit offsets from other sources. */
export function parseApiDate(value: string): Date {
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimeZone ? value : `${value}Z`);
}

export function formatApiDateTime(value: string, locale = 'es-MX'): string {
  const parsed = parseApiDate(value);
  return Number.isNaN(parsed.getTime()) ? 'Fecha no disponible' : parsed.toLocaleString(locale);
}

/** Date-only form fields represent the user's local calendar, not UTC. */
export function formatLocalDate(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Dates used for billing are calendar values, so use UTC fields for arithmetic. */
export function parseCalendarDate(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const datePart = value.slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== datePart ? null : parsed;
}
