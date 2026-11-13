export const INPUT_LIMITS = {
  API_KEY_LABEL: 100,
  API_KEY_VALUE: 500,
  BACKUP_CODE: 50,
  BILLING_NOTES: 2000,
  BUDGET_CAP: 100000000,
  CARD_NUMBER: 19,
  COMPANY_NAME: 150,
  CONTACT_NAME: 128,
  COST_AMOUNT: 100000000,
  EMAIL: 254,
  ENV_KEY: 100,
  ENV_VALUE: 1000,
  ESTIMATED_VALUE: 100000000,
  EXCHANGE_RATE: 10000,
  EXPIRY_MONTH: 2,
  EXPIRY_YEAR: 4,
  HOTKEY: 50,
  IMPORT_PAYLOAD: 10000000,
  LAST_FOUR: 4,
  MASTER_PASSWORD: 256,
  NAME: 150,
  NOTES: 5000,
  PASSWORD: 256,
  PAYMENT_ALIAS: 100,
  PHONE: 30,
  PHONES_LIST: 500,
  RESOURCE_CONTENT: 1000000,
  RESOURCE_TAGS: 5100,
  PIN: 12,
  PLATFORM_NAME: 100,
  SEARCH: 200,
  SLA_HOURS: 87600,
  SOCIAL_LINKS: 500,
  TAG_NAME: 50,
  TOTP_SECRET: 128,
  URL: 512,
  USERNAME: 100,
};

export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim()) && email.length <= INPUT_LIMITS.EMAIL;
}

export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function validateAndNormalizeUrl(url: string, fieldName = 'URL'): { valid: boolean; normalized?: string; error?: string } {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return { valid: false, error: `${fieldName} no puede estar vacía.` };
  }
  let trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || !parsed.hostname.includes('.')) {
      return { valid: false, error: `${fieldName} debe ser un dominio válido.` };
    }
    if (parsed.toString().length > INPUT_LIMITS.URL) {
      return { valid: false, error: `${fieldName} no puede superar ${INPUT_LIMITS.URL} caracteres.` };
    }
    return { valid: true, normalized: parsed.toString() };
  } catch {
    return { valid: false, error: `${fieldName} tiene un formato inválido.` };
  }
}

export function validateSlaHours(hours: string | number): { valid: boolean; error?: string; hours?: number } {
  const num = Number(hours);
  if (String(hours).trim() === '' || !Number.isFinite(num) || num < 0 || num > INPUT_LIMITS.SLA_HOURS) {
    return { valid: false, error: 'El tiempo de respuesta debe ser un número entre 0 y 87,600 horas.' };
  }
  return { valid: true, hours: num };
}

export function isValidLastFour(val: string): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^\d{4}$/.test(val.trim());
}

export function isValidExpiryMonth(val: string | number): boolean {
  const m = Number(val);
  return !isNaN(m) && m >= 1 && m <= 12;
}

export function isValidExpiryYear(val: string | number): boolean {
  const text = String(val).trim();
  if (/^\d{2}$/.test(text)) return true;
  const year = Number(text);
  return /^\d{4}$/.test(text) && year >= 1900 && year <= 2199;
}

export function isValidPhoneList(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const items = value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0 || items.length > 15) return false;
  if (!items.every((item) => isValidPhone(item))) return false;
  return items.join(', ').length <= 512;
}

export function isValidCalendarDate(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [y, m, d] = trimmed.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

export function validateServiceDatesOrder(
  startDate?: string | null,
  nextBillingDate?: string | null,
  trialEndDate?: string | null
): string | null {
  const s = startDate?.trim() || '';
  const n = nextBillingDate?.trim() || '';
  const t = trialEndDate?.trim() || '';

  if (s && !isValidCalendarDate(s)) return 'La fecha de inicio no es válida.';
  if (n && !isValidCalendarDate(n)) return 'La próxima fecha de cobro no es válida.';
  if (t && !isValidCalendarDate(t)) return 'La fecha de fin de prueba no es válida.';

  if (s && n && n < s) {
    return 'La próxima fecha de cobro no puede ser anterior a la fecha de inicio.';
  }
  if (s && t && t < s) {
    return 'La fecha de fin de prueba no puede ser anterior a la fecha de inicio.';
  }
  return null;
}

export function validateCardFields(
  cardNumber: string,
  lastFour: string,
  expiryMonth: string,
  expiryYear: string
): string | null {
  const rawCard = cardNumber.trim();
  if (rawCard) {
    if (/[^\d\s-]/.test(rawCard)) {
      return 'El número completo de tarjeta solo debe contener dígitos.';
    }
    const digits = rawCard.replace(/[\s-]/g, '');
    if (digits.length < 12 || digits.length > 19) {
      return 'El número de tarjeta debe tener entre 12 y 19 dígitos.';
    }
    if (lastFour.trim() && digits.slice(-4) !== lastFour.trim()) {
      return 'Los últimos 4 dígitos no coinciden con el número completo de tarjeta.';
    }
  }
  const hasMonth = Boolean(expiryMonth.trim());
  const hasYear = Boolean(expiryYear.trim());
  if (hasMonth !== hasYear) {
    return 'Indica tanto el mes como el año de vencimiento.';
  }
  return null;
}

