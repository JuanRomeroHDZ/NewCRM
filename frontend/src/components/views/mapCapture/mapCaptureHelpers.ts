import type { OSMLead } from '../../../lib/api';

export function safeWebsite(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(
      value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
    );
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseAttribution(raw?: string): { text: string; href?: string } {
  if (!raw) {
    return {
      text: '© OpenStreetMap contributors',
      href: 'https://www.openstreetmap.org/copyright',
    };
  }
  const hrefMatch = raw.match(/href=["']([^"']+)["']/i);
  const text = raw.replace(/<[^>]+>/g, '').trim() || '© OpenStreetMap contributors';
  const href = hrefMatch?.[1] && /^https?:\/\//i.test(hrefMatch[1]) ? hrefMatch[1] : undefined;
  return { text, href };
}

export function popupContent(lead: OSMLead): HTMLElement {
  const container = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = lead.name;
  container.appendChild(title);

  if (lead.address) {
    const address = document.createElement('p');
    address.textContent = lead.address;
    container.appendChild(address);
  }

  if (lead.opening_hours) {
    const openingHours = document.createElement('p');
    openingHours.textContent = `Horario publicado: ${lead.opening_hours}`;
    container.appendChild(openingHours);
  }

  const source = document.createElement('a');
  source.href = lead.osm_url;
  source.target = '_blank';
  source.rel = 'noopener noreferrer';
  source.textContent = 'Ver en OpenStreetMap';
  container.appendChild(source);
  return container;
}

export function leadWebsite(lead: OSMLead): string | null {
  return safeWebsite(lead.website);
}
