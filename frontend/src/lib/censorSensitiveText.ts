/** [Privacidad] Reduce la exposición accidental de correos, IP y teléfonos en registros visibles. */
export function censorSensitiveText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi, (_match, local: string, domain: string) => `${local.slice(0, 1)}•••@${domain}`)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (address) => address.split('.').map((part, index) => index === 3 ? part : '***').join('.'))
    .replace(/\+?\d[\d ()-]{5,}\d/g, (phone) => phone.replace(/\d(?=(?:\D*\d){3})/g, '•'));
}
