import DOMPurify from 'dompurify';

let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null;

export function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid')
      .then((mod) => {
        mod.default.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict',
          flowchart: { htmlLabels: false },
          fontFamily: 'Poppins, DejaVu Sans, system-ui, sans-serif',
          themeVariables: {
            darkMode: true,
            background: '#081416',
            primaryColor: '#123248',
            primaryTextColor: '#f8fafc',
            primaryBorderColor: '#60a5fa',
            lineColor: '#94a3b8',
            secondaryColor: '#0f172a',
            tertiaryColor: '#111827',
          },
        });
        return mod;
      })
      .catch((error: unknown) => {
        mermaidModulePromise = null;
        throw error;
      });
  }
  return mermaidModulePromise;
}

export function sanitizeMermaidSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus'],
  });
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.trim());
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const printSvgProperties = [
  'color', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline',
];

function inlineMermaidPresentation(svg: Document) {
  // The server removes stylesheet tags. Materialize the presentation on the SVG shapes first.
  for (const source of Array.from(svg.querySelectorAll('style'))) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(source.textContent || '');
    for (const rule of Array.from(sheet.cssRules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      let elements: NodeListOf<Element>;
      try { elements = svg.querySelectorAll(rule.selectorText); } catch { continue; }
      for (const element of elements) {
        if (!(element instanceof SVGElement)) continue;
        for (const property of printSvgProperties) {
          const value = rule.style.getPropertyValue(property).trim();
          if (value && !/url\s*\(|var\s*\(/i.test(value) && !element.style.getPropertyValue(property)) {
            element.setAttribute(property, value);
          }
        }
      }
    }
    source.remove();
  }
}

// Some Mermaid diagrams still produce HTML labels with htmlLabels disabled.
function printableMermaidSvg(svg: string): string {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg') return '';
  inlineMermaidPresentation(document);
  const bounds = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (bounds?.length === 4 && bounds[2] > 0 && bounds[3] > 0) {
    root.setAttribute('width', String(bounds[2]));
    root.setAttribute('height', String(bounds[3]));
  }
  for (const label of Array.from(root.getElementsByTagName('foreignObject'))) {
    const width = Number.parseFloat(label.getAttribute('width') || '0');
    const height = Number.parseFloat(label.getAttribute('height') || '0');
    const x = Number.parseFloat(label.getAttribute('x') || '0') + width / 2;
    const y = Number.parseFloat(label.getAttribute('y') || '0') + height / 2;
    for (const br of Array.from(label.getElementsByTagName('br'))) br.replaceWith(document.createTextNode('\n'));
    const lines = (label.textContent || '').split('\n').map(line => line.trim()).filter(Boolean);
    const text = document.createElementNS(root.namespaceURI, 'text');
    text.setAttribute('fill', '#171717');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-family', 'DejaVu Sans, sans-serif');
    text.setAttribute('font-size', '14');
    lines.forEach((line, index) => {
      const span = document.createElementNS(root.namespaceURI, 'tspan');
      span.setAttribute('x', String(x));
      span.setAttribute('y', String(y + 4 + (index - (lines.length - 1) / 2) * 16));
      span.textContent = line;
      text.appendChild(span);
    });
    label.replaceWith(text);
  }
  return sanitizeMermaidSvg(new XMLSerializer().serializeToString(root));
}

export async function compileMermaidDiagramsForExport(markdown: string, redactForClient: boolean): Promise<Record<string, string>> {
  const published = markdown.replace(/\{\{redact:(.*?)\}\}|\[\[redact:(.*?)\]\]/gis,
    (_, braces: string | undefined, brackets: string | undefined) => redactForClient ? '[REDACTED]' : braces ?? brackets ?? '');
  const matches = Array.from(published.matchAll(/^ {0,3}(`{3,}|~{3,})mermaid[ \t]*\r?\n([\s\S]*?)^ {0,3}\1[ \t]*(?=\r?$)/gim));
  if (matches.length === 0) return {};

  const out: Record<string, string> = {};
  const mod = await loadMermaid();
  for (let i = 0; i < Math.min(matches.length, 30); i += 1) {
    const code = (matches[i][2] || '').trim();
    if (!code) continue;
    try {
      const digest = await sha256Hex(code);
      if (out[digest]) continue;
      const printConfig = '%%{init: {"theme":"neutral","htmlLabels":false,"flowchart":{"htmlLabels":false},"themeVariables":{"darkMode":false,"primaryTextColor":"#171717"}}}%%';
      const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(code);
      const offset = frontmatter?.[0].length ?? 0;
      const printable = `${code.slice(0, offset)}${printConfig}\n${code.slice(offset)}`;
      const { svg } = await mod.default.render(`mmd_exp_${i}_${Date.now().toString(36)}`, printable);
      const clean = printableMermaidSvg(svg);
      if (clean && clean.includes('<svg')) {
        out[digest] = clean;
      }
    } catch {
      // Skip invalid syntax blocks cleanly without blocking report export
    }
  }
  return out;
}
