import React, { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import http from 'highlight.js/lib/languages/http';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import nginx from 'highlight.js/lib/languages/nginx';
import php from 'highlight.js/lib/languages/php';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Check, Copy, Download, Play, Pause, Sparkles } from 'lucide-react';
import { WriteupAsset, WriteupBoard } from '../../types';
import { loadMermaid, sanitizeMermaidSvg } from './mermaidExportHelper';

let hljsRegistered = false;
function ensureHljsLanguages() {
  if (hljsRegistered) return;
  hljsRegistered = true;
  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('sh', bash);
  hljs.registerLanguage('shell', bash);
  hljs.registerLanguage('c', c);
  hljs.registerLanguage('cpp', cpp);
  hljs.registerLanguage('csharp', csharp);
  hljs.registerLanguage('cs', csharp);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('diff', diff);
  hljs.registerLanguage('dockerfile', dockerfile);
  hljs.registerLanguage('go', go);
  hljs.registerLanguage('http', http);
  hljs.registerLanguage('ini', ini);
  hljs.registerLanguage('toml', ini);
  hljs.registerLanguage('java', java);
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('js', javascript);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('nginx', nginx);
  hljs.registerLanguage('php', php);
  hljs.registerLanguage('powershell', powershell);
  hljs.registerLanguage('ps1', powershell);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('py', python);
  hljs.registerLanguage('ruby', ruby);
  hljs.registerLanguage('rust', rust);
  hljs.registerLanguage('sql', sql);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('ts', typescript);
  hljs.registerLanguage('xml', xml);
  hljs.registerLanguage('html', xml);
  hljs.registerLanguage('yaml', yaml);
  hljs.registerLanguage('yml', yaml);
}
ensureHljsLanguages();

interface MarkdownRichPreviewProps {
  markdown: string;
  redactPreview: boolean;
  boards: WriteupBoard[];
  assets: WriteupAsset[];
  assetObjectUrls: Record<string, string>;
  onInspectAsset?: (asset: WriteupAsset) => void;
}

type PreviewSegment =
  | { kind: 'html'; html: string }
  | { kind: 'mermaid'; code: string; id: string }
  | { kind: 'html_anim'; code: string; id: string }
  | { kind: 'board'; boardId: string; alt: string; svg: string };

const CALLOUT_LABELS: Record<string, { label: string; cls: string }> = {
  NOTE: { label: 'Nota', cls: 'md-callout md-callout-note' },
  TIP: { label: 'Consejo', cls: 'md-callout md-callout-tip' },
  IMPORTANT: { label: 'Importante', cls: 'md-callout md-callout-important' },
  WARNING: { label: 'Advertencia', cls: 'md-callout md-callout-warning' },
  CAUTION: { label: 'Peligro', cls: 'md-callout md-callout-caution' },
};

const MermaidDiagramCard: React.FC<{ code: string; renderId: string }> = ({ code, renderId }) => {
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [animated, setAnimated] = useState(true);

  useEffect(() => {
    let active = true;
    const uniqueId = `mmd_${renderId}_${Math.random().toString(36).slice(2, 8)}`;
    loadMermaid()
      .then(async (mod) => {
        const { svg } = await mod.default.render(uniqueId, code);
        if (!active) return;
        setSvgHtml(sanitizeMermaidSvg(svg));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Sintaxis Mermaid inválida');
      });
    return () => {
      active = false;
    };
  }, [code, renderId]);

  const handleDownloadSvg = () => {
    if (!svgHtml) return;
    const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${renderId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3 rounded-xl border border-slate-800 bg-[#070b14] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5 font-medium text-indigo-300">
          <Sparkles className="w-3.5 h-3.5" />
          Diagrama Mermaid
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAnimated((v) => !v)}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
            title="Alternar flujo animado en aristas"
          >
            {animated ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {animated ? 'Animado' : 'Estático'}
          </button>
          {svgHtml && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
              title="Descargar SVG"
            >
              <Download className="w-3 h-3" />
              SVG
            </button>
          )}
        </div>
      </div>
      {error ? (
        <div className="p-3 text-xs text-rose-300 bg-rose-950/30 font-mono whitespace-pre-wrap">{error}</div>
      ) : svgHtml ? (
        <div
          className={`p-3 overflow-x-auto flex justify-center ${animated ? 'mermaid-animated' : ''}`}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      ) : (
        <div className="p-4 text-xs text-slate-400">Renderizando diagrama…</div>
      )}
    </div>
  );
};

const AnimatedHtmlSandboxCard: React.FC<{ code: string }> = ({ code }) => {
  const srcDoc = useMemo(() => {
    const clean = DOMPurify.sanitize(code, {
      WHOLE_DOCUMENT: false,
      ADD_TAGS: ['style', 'svg', 'path', 'circle', 'rect', 'line', 'animate', 'animateTransform', 'details', 'summary'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus'],
    });
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#090d16;color:#f8fafc;font-family:system-ui,sans-serif;}</style></head><body>${clean}</body></html>`;
  }, [code]);

  return (
    <div className="my-3 rounded-xl border border-slate-800 bg-[#070b14] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-300">
        <span className="font-medium text-emerald-200">Animación HTML/CSS protegida</span>
      </div>
      <iframe
        title="Widget HTML animado"
        sandbox=""
        srcDoc={srcDoc}
        className="w-full min-h-[120px] border-0 bg-[#090d16]"
      />
    </div>
  );
};

function enhanceCallouts(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:<br\s*\/?>|\s)*/gi,
    (_, kind: string) => {
      const meta = CALLOUT_LABELS[kind.toUpperCase()] || CALLOUT_LABELS.NOTE;
      return `<blockquote class="${meta.cls}"><p><strong>${meta.label}:</strong> `;
    }
  );
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const MarkdownRichPreview: React.FC<MarkdownRichPreviewProps> = ({
  markdown,
  redactPreview,
  boards,
  assets,
  assetObjectUrls,
  onInspectAsset,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const assetMap = useMemo(() => {
    const map: Record<string, WriteupAsset> = {};
    for (const a of assets) map[a.id] = a;
    return map;
  }, [assets]);

  const segments = useMemo<PreviewSegment[]>(() => {
    if (!markdown.trim()) return [];
    const tokens: Array<{ placeholder: string; seg: PreviewSegment }> = [];
    let counter = 0;

    let text = markdown;

    // 1. Extract Mermaid and html-anim fenced blocks before markdown compilation
    text = text.replace(/```(mermaid|html-anim|anim-html|embed-html)\s*\n([\s\S]*?)```/gi, (_, lang: string, body: string) => {
      const idx = counter++;
      const placeholder = `\n\n@@WRITEUP_EMBED_${idx}@@\n\n`;
      const normLang = lang.toLowerCase();
      if (normLang === 'mermaid') {
        tokens.push({ placeholder: `@@WRITEUP_EMBED_${idx}@@`, seg: { kind: 'mermaid', code: body.trim(), id: `mmd-${idx}` } });
      } else {
        tokens.push({ placeholder: `@@WRITEUP_EMBED_${idx}@@`, seg: { kind: 'html_anim', code: body.trim(), id: `html-${idx}` } });
      }
      return placeholder;
    });

    // 2. Apply client redaction preview or highlight badge
    text = text.replace(/\{\{redact:(.*?)\}\}|\[\[redact:(.*?)\]\]/gis, (_, g1, g2) => {
      const inner = g1 !== undefined ? g1 : (g2 ?? '');
      if (redactPreview) {
        return '<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs">[REDACTED]</span>';
      }
      return `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 font-mono text-xs">${DOMPurify.sanitize(inner)}</span>`;
    });

    // 3. Anchors
    text = text.replace(/\{#([a-zA-Z0-9_-]{2,120})\}/g, (_, anchor: string) => {
      return `<span id="${anchor}" class="ml-1 px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono text-[10px]">#${anchor}</span>`;
    });

    // 4. Assets (images, animated GIFs/WebPs, and videos)
    text = text.replace(/!\[([^\]]*)\]\(asset:\/\/([a-zA-Z0-9_-]+)\)/g, (_, alt: string, assetId: string) => {
      const url = assetObjectUrls[assetId];
      const meta = assetMap[assetId];
      if (!url) {
        return `<div class="p-3 my-2 rounded border border-slate-700 bg-slate-900 text-xs text-slate-400">Cargando evidencia ${assetId}...</div>`;
      }
      const safeAlt = escapeHtmlAttr(alt || meta?.filename || 'Evidencia');
      if (meta?.mime_type?.startsWith('video/')) {
        return `<figure class="my-3"><video controls loop muted playsinline src="${url}" class="w-full max-h-[380px] rounded-lg border border-slate-700 bg-black"></video>${safeAlt ? `<figcaption class="text-xs text-slate-400 mt-1">${safeAlt}</figcaption>` : ''}</figure>`;
      }
      return `<figure class="my-3"><img src="${url}" alt="${safeAlt}" data-asset-id="${escapeHtmlAttr(assetId)}" class="max-w-full rounded-lg border border-slate-700 cursor-zoom-in hover:border-indigo-500/70 transition-colors" />${alt ? `<figcaption class="text-xs text-slate-400 mt-1">${safeAlt}</figcaption>` : ''}</figure>`;
    });

    // 5. Extract whiteboard links as safe SVG island cards
    text = text.replace(/!\[([^\]]*)\]\(board:\/\/([a-zA-Z0-9_-]+)\)/g, (_, alt: string, boardId: string) => {
      const board = boards.find((b) => b.id === boardId);
      if (!board?.svg_snapshot) {
        return `<div class="p-3 my-2 rounded border border-indigo-500/30 bg-indigo-950/30 text-xs text-indigo-300">Pizarra (${escapeHtmlAttr(alt || boardId)}): guarda la pizarra para generar vista previa vectorial.</div>`;
      }
      const idx = counter++;
      const cleanSvg = sanitizeMermaidSvg(board.svg_snapshot);
      tokens.push({
        placeholder: `@@WRITEUP_EMBED_${idx}@@`,
        seg: { kind: 'board', boardId, alt: alt || board.title, svg: cleanSvg },
      });
      return `\n\n@@WRITEUP_EMBED_${idx}@@\n\n`;
    });

    const renderer = new marked.Renderer();
    renderer.code = ({ text: codeBody, lang }: { text: string; lang?: string }) => {
      const language = (lang || '').trim().toLowerCase();
      let highlighted = '';
      if (language && hljs.getLanguage(language)) {
        highlighted = hljs.highlight(codeBody, { language }).value;
      } else {
        highlighted = hljs.highlightAuto(codeBody).value;
      }
      const label = language || 'code';
      return `<div class="code-block-wrap relative my-3 rounded-xl border border-slate-800 bg-[#050912] overflow-hidden"><div class="flex items-center justify-between px-3 py-1 bg-slate-900/90 border-b border-slate-800 text-[10px] font-mono uppercase text-slate-400"><span>${escapeHtmlAttr(label)}</span><button type="button" data-copy-code="1" class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 normal-case font-sans text-[10px]">Copiar</button></div><pre class="!my-0 !border-0 !rounded-none"><code class="hljs language-${escapeHtmlAttr(label)}">${highlighted}</code></pre></div>`;
    };

    const parsed = marked.parse(text, { async: false, gfm: true, breaks: false, renderer }) as string;
    const withCallouts = enhanceCallouts(parsed);
    const cleanHtml = DOMPurify.sanitize(withCallouts, {
      ADD_TAGS: ['details', 'summary', 'kbd', 'mark', 'video', 'source', 'figure', 'figcaption', 'input', 'button'],
      ADD_ATTR: ['open', 'controls', 'loop', 'muted', 'playsinline', 'src', 'type', 'checked', 'disabled', 'class', 'id', 'data-copy-code', 'data-asset-id'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    });

    const out: PreviewSegment[] = [];
    let cursor = cleanHtml;
    for (const item of tokens) {
      const tagRegex = new RegExp(`(?:<p>)?\\s*${item.placeholder}\\s*(?:</p>)?`);
      const match = cursor.match(tagRegex);
      if (!match || match.index === undefined) continue;
      const before = cursor.slice(0, match.index);
      if (before.trim()) out.push({ kind: 'html', html: before });
      out.push(item.seg);
      cursor = cursor.slice(match.index + match[0].length);
    }
    if (cursor.trim()) out.push({ kind: 'html', html: cursor });
    return out;
  }, [markdown, redactPreview, assetObjectUrls, boards, assetMap]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const copyBtn = target.closest<HTMLButtonElement>('button[data-copy-code]');
    if (copyBtn) {
      const wrap = copyBtn.closest('.code-block-wrap');
      const codeText = wrap?.querySelector('pre code')?.textContent || '';
      if (codeText && navigator.clipboard) {
        void navigator.clipboard.writeText(codeText);
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'Copiado';
        setTimeout(() => {
          copyBtn.textContent = orig || 'Copiar';
        }, 1400);
      }
      return;
    }
    const imgEl = target.closest<HTMLImageElement>('img[data-asset-id]');
    if (imgEl && onInspectAsset) {
      const assetId = imgEl.getAttribute('data-asset-id');
      if (assetId && assetMap[assetId]) {
        onInspectAsset(assetMap[assetId]);
      }
    }
  };

  if (!markdown.trim()) {
    return <p className="text-slate-500 italic text-sm">Vista previa en tiempo real…</p>;
  }

  return (
    <div ref={containerRef} onClick={handleContainerClick} className="writeup-prose">
      {segments.map((seg, idx) => {
        if (seg.kind === 'html') {
          return <div key={`h-${idx}`} dangerouslySetInnerHTML={{ __html: seg.html }} />;
        }
        if (seg.kind === 'mermaid') {
          return <MermaidDiagramCard key={seg.id} code={seg.code} renderId={seg.id} />;
        }
        if (seg.kind === 'html_anim') {
          return <AnimatedHtmlSandboxCard key={seg.id} code={seg.code} />;
        }
        return (
          <figure key={`b-${seg.boardId}-${idx}`} className="my-3 border border-slate-700 rounded-xl overflow-hidden bg-slate-900 p-2">
            <div dangerouslySetInnerHTML={{ __html: seg.svg }} />
            <figcaption className="text-xs text-slate-400 mt-1 px-1 flex items-center justify-between">
              <span>{seg.alt}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(`![${seg.alt}](board://${seg.boardId})`);
                  setCopiedKey(seg.boardId);
                  setTimeout(() => setCopiedKey(null), 1500);
                }}
                className="text-[11px] text-indigo-300 hover:text-indigo-200 flex items-center gap-1"
              >
                {copiedKey === seg.boardId ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedKey === seg.boardId ? 'Copiado' : 'Enlace'}
              </button>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
};
