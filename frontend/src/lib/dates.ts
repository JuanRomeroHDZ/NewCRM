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
