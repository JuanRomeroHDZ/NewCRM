import DOMPurify from 'dompurify';

let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null;

export function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        flowchart: { htmlLabels: false },
        fontFamily: 'Poppins, DejaVu Sans, system-ui, sans-serif',
        themeVariables: {
          darkMode: true,
          background: '#081416',
          primaryColor: '#1e1b4b',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#6366f1',
          lineColor: '#94a3b8',
          secondaryColor: '#0f172a',
          tertiaryColor: '#111827',
        },
      });
      return mod;
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

export async function compileMermaidDiagramsForExport(markdown: string): Promise<Record<string, string>> {
  const matches = Array.from((markdown || '').matchAll(/```mermaid\s*\n([\s\S]*?)```/gi));
  if (matches.length === 0) return {};

  const out: Record<string, string> = {};
  const mod = await loadMermaid();
  for (let i = 0; i < Math.min(matches.length, 30); i += 1) {
    const code = (matches[i][1] || '').trim();
    if (!code) continue;
    try {
      const digest = await sha256Hex(code);
      if (out[digest]) continue;
      const { svg } = await mod.default.render(`mmd_exp_${i}_${Date.now().toString(36)}`, code);
      const clean = sanitizeMermaidSvg(svg);
      if (clean && clean.includes('<svg')) {
        out[digest] = clean;
      }
    } catch {
      // Skip invalid syntax blocks cleanly without blocking report export
    }
  }
  return out;
}
