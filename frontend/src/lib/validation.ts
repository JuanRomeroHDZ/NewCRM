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
