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
import { renderWriteupLabels } from './writeupLabels';

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

const PREVIEW_DEBOUNCE_MS = 220;
const MAX_AUTO_HIGHLIGHT_CHARS = 12000;

const MermaidDiagramCard: React.FC<{ code: string; renderId: string }> = ({ code, renderId }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [animated, setAnimated] = useState(true);
  const [nearViewport, setNearViewport] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    if (!('IntersectionObserver' in window)) {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '300px 0px' });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    let active = true;
    const uniqueId = `mmd_${renderId}_${Math.random().toString(36).slice(2, 8)}`;
    setSvgHtml('');
    setError(null);
    loadMermaid()
      .then(async (mod) => {
        const { svg } = await mod.default.render(uniqueId, code);
        if (!active) return;
        setSvgHtml(sanitizeMermaidSvg(svg));
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError('No se pudo cargar o interpretar el diagrama. Revisa la conexión y la sintaxis.');
      });
    return () => {
      active = false;
    };
  }, [code, renderId, nearViewport, renderAttempt]);

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
    <div ref={cardRef} className="my-3 min-w-0 border-y border-obsidian-border bg-obsidian-bg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-obsidian-panel/90 border-b border-obsidian-border text-[11px] text-obsidian-muted">
        <span className="flex items-center gap-1.5 font-medium text-obsidian-muted">
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Diagrama Mermaid
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setAnimated((v) => !v)}
            aria-pressed={animated}
            aria-label={animated ? 'Pausar animación del diagrama' : 'Reanudar animación del diagrama'}
            className="ui-action-toggle"
            title="Alternar flujo animado en aristas"
          >
            {animated ? <Pause className="w-4 h-4" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
            {animated ? 'Animado' : 'Estático'}
          </button>
          {svgHtml && (
            <button
              type="button"
              onClick={handleDownloadSvg}
              aria-label="Descargar diagrama SVG"
              className="ui-action-secondary"
              title="Descargar SVG"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              SVG
            </button>
          )}
        </div>
      </div>
      {error ? (
        <div role="alert" className="flex min-w-0 flex-wrap items-center gap-2 bg-rose-950/30 p-3 text-xs text-rose-300">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setRenderAttempt((attempt) => attempt + 1)} className="ui-action-secondary">
            Reintentar
          </button>
        </div>
      ) : svgHtml ? (
        <div
          className={`p-3 overflow-x-auto flex justify-center ${animated ? 'mermaid-animated' : ''}`}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      ) : (
        <div role="status" aria-live="polite" className="p-4 text-xs text-obsidian-muted">
          {nearViewport ? 'Cargando diagrama…' : 'El diagrama se cargará al acercarte.'}
        </div>
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
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#080A0A;color:#ffffff;font-family:system-ui,sans-serif;}</style></head><body>${clean}</body></html>`;
  }, [code]);

  return (
    <div className="my-3 border-y border-obsidian-border bg-obsidian-bg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-obsidian-panel/90 border-b border-obsidian-border text-[11px] text-obsidian-muted">
        <span className="font-medium text-obsidian-muted">Animación HTML/CSS protegida</span>
      </div>
      <iframe
        title="Widget HTML animado"
        sandbox=""
        srcDoc={srcDoc}
        className="w-full min-h-[120px] border-0 bg-[#080A0A]"
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

interface WriteupObjectCaption {
  title?: string;
  description?: string;
  source?: string;
}

function parseWriteupObjectCaption(lines: string[]): WriteupObjectCaption {
  const caption: WriteupObjectCaption = {};
  for (const line of lines) {
    const figureNumber = line.match(/^Figura\s+(\d+\.)\s*(.*)$/i);
    if (figureNumber && !caption.title) {
      caption.title = `Figura ${figureNumber[1]} ${figureNumber[2]}`.trim();
      continue;
    }
    const match = line.match(/^(Figura|Imagen|Tabla|Descripción|Fuente)\s*:\s*(.*)$/i);
    if (!match) continue;
    const value = match[2].trim();
    if (/^descripci[oó]n$/i.test(match[1])) caption.description = value;
    else if (/^fuente$/i.test(match[1])) caption.source = value;
    else if (!caption.title) caption.title = `${match[1]}: ${value}`;
  }
  return caption;
}

function renderCaptionLines(caption: WriteupObjectCaption): string {
  return [caption.title, caption.description ? `Descripción: ${caption.description}` : '', caption.source ? `Fuente: ${caption.source}` : '']
    .filter(Boolean)
    .map((line) => `<span class="block">${escapeHtmlAttr(line!)}</span>`)
    .join('');
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
  const [previewMarkdown, setPreviewMarkdown] = useState(markdown);

  useEffect(() => {
    if (markdown === previewMarkdown) return;
    const timeoutId = window.setTimeout(() => setPreviewMarkdown(markdown), PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [markdown, previewMarkdown]);

  const assetMap = useMemo(() => {
    const map: Record<string, WriteupAsset> = {};
    for (const a of assets) map[a.id] = a;
    return map;
  }, [assets]);

  const segments = useMemo<PreviewSegment[]>(() => {
    if (!previewMarkdown.trim()) return [];
    const tokens: Array<{ placeholder: string; seg: PreviewSegment }> = [];
    let counter = 0;

    let text = previewMarkdown;

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

    // Labels use a fixed palette and escape user text before sanitization.
    text = renderWriteupLabels(text);

    // 3. Anchors
    text = text.replace(/\{#([a-zA-Z0-9_-]{2,120})\}/g, (_, anchor: string) => {
      return `<span id="${anchor}" class="ml-1 inline-flex min-h-5 items-center align-middle rounded border border-obsidian-borderLight bg-obsidian-surface px-1.5 py-0.5 font-mono text-[10px] leading-none text-obsidian-muted">#${anchor}</span>`;
    });

    // Pair academic captions with the image immediately below. Captions remain
    // plain text in Markdown so exports and indexing can consume the same contract.
    const captionLine = '(?:Figura(?:\\s+\\d+\\.)?\\s*:\\s*|Figura\\s+\\d+\\.\\s*|Imagen\\s*:\\s*|Descripción\\s*:\\s*|Fuente\\s*:\\s*)';
    const captionedImagePattern = new RegExp(
      `(^|\\n)((?:[ \\t]*${captionLine}[^\\n]*(?:\\n|$)(?:[ \\t]*\\n)*)+)[ \\t]*\\n*!\\[([^\\]]*)\\]\\(asset:\\/\\/([a-zA-Z0-9_-]+)\\)`,
      'gim',
    );
    text = text.replace(captionedImagePattern, (_whole, prefix: string, captionBlock: string, alt: string, assetId: string) => {
      const caption = parseWriteupObjectCaption(captionBlock.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
      const url = assetObjectUrls[assetId];
      const meta = assetMap[assetId];
      const safeAlt = escapeHtmlAttr(alt || meta?.filename || 'Evidencia');
      const captionHtml = renderCaptionLines(caption);
      // [Icono] Abrir una imagen amplía la evidencia en la vista previa.
      let mediaHtml: string;
      if (!url) {
        mediaHtml = `<div class="p-3 my-2 rounded border border-obsidian-borderLight bg-obsidian-panel text-xs text-obsidian-muted">Cargando evidencia ${escapeHtmlAttr(assetId)}...</div>`;
      } else if (meta?.mime_type?.startsWith('video/')) {
        mediaHtml = `<video controls loop muted playsinline src="${escapeHtmlAttr(url)}" class="w-full max-h-[380px] rounded-lg border border-obsidian-borderLight bg-black"></video>`;
      } else {
        mediaHtml = `<button type="button" data-asset-id="${escapeHtmlAttr(assetId)}" aria-label="Abrir evidencia ${safeAlt}" class="ui-action-icon max-w-full"><img src="${escapeHtmlAttr(url)}" alt="${safeAlt}" class="max-w-full rounded-lg border border-obsidian-borderLight cursor-zoom-in" /></button>`;
      }
      const legacyAlt = !captionHtml && alt ? `<span class="block">${safeAlt}</span>` : '';
      const figureHtml = `<figure class="my-3">${mediaHtml}${captionHtml || legacyAlt ? `<figcaption class="mt-1 text-xs text-obsidian-muted">${captionHtml || legacyAlt}</figcaption>` : ''}</figure>`;
      const idx = counter++;
      const placeholder = `@@WRITEUP_EMBED_${idx}@@`;
      tokens.push({ placeholder, seg: { kind: 'html', html: figureHtml } });
      return `${prefix}\n\n${placeholder}\n\n`;
    });

    // 4. Assets (images, animated GIFs/WebPs, and videos)
    text = text.replace(/!\[([^\]]*)\]\(asset:\/\/([a-zA-Z0-9_-]+)\)/g, (_, alt: string, assetId: string) => {
      const url = assetObjectUrls[assetId];
      const meta = assetMap[assetId];
      if (!url) {
        return `<div class="p-3 my-2 rounded border border-obsidian-borderLight bg-obsidian-panel text-xs text-obsidian-muted">Cargando evidencia ${assetId}...</div>`;
      }
      const safeAlt = escapeHtmlAttr(alt || meta?.filename || 'Evidencia');
      if (meta?.mime_type?.startsWith('video/')) {
        return `<figure class="my-3"><video controls loop muted playsinline src="${url}" class="w-full max-h-[380px] rounded-lg border border-obsidian-borderLight bg-black"></video>${safeAlt ? `<figcaption class="text-xs text-obsidian-muted mt-1">${safeAlt}</figcaption>` : ''}</figure>`;
      }
      return `<figure class="my-3"><button type="button" data-asset-id="${escapeHtmlAttr(assetId)}" aria-label="Abrir evidencia ${safeAlt}" class="ui-action-icon max-w-full"><img src="${url}" alt="${safeAlt}" class="max-w-full rounded-lg border border-obsidian-borderLight cursor-zoom-in" /></button>${alt ? `<figcaption class="text-xs text-obsidian-muted mt-1">${safeAlt}</figcaption>` : ''}</figure>`;
    });

    // 5. Extract whiteboard links as safe SVG island cards
    text = text.replace(/!\[([^\]]*)\]\(board:\/\/([a-zA-Z0-9_-]+)\)/g, (_, alt: string, boardId: string) => {
      const board = boards.find((b) => b.id === boardId);
      if (!board?.svg_snapshot) {
        return `<div class="p-3 my-2 rounded border border-obsidian-border bg-obsidian-surface text-xs text-obsidian-muted">Pizarra (${escapeHtmlAttr(alt || boardId)}): guarda la pizarra para generar vista previa vectorial.</div>`;
      }
      const idx = counter++;
      const cleanSvg = sanitizeMermaidSvg(board.svg_snapshot);
      tokens.push({
        placeholder: `@@WRITEUP_EMBED_${idx}@@`,
        seg: { kind: 'board', boardId, alt: alt || board.title, svg: cleanSvg },
      });
      return `\n\n@@WRITEUP_EMBED_${idx}@@\n\n`;
    });

    // [Acción secundaria] Copia el código del bloque visible en Markdown.
    const renderer = new marked.Renderer();
    renderer.code = ({ text: codeBody, lang }: { text: string; lang?: string }) => {
      const language = (lang || '').trim().toLowerCase();
      let highlighted = '';
      if (language && hljs.getLanguage(language)) {
        highlighted = hljs.highlight(codeBody, { language }).value;
      } else if (!language && codeBody.length <= MAX_AUTO_HIGHLIGHT_CHARS) {
        highlighted = hljs.highlightAuto(codeBody).value;
      } else {
        highlighted = codeBody.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      const label = language || 'code';
      return `<div class="code-block-wrap relative my-3 border-y border-obsidian-border bg-obsidian-bg overflow-hidden"><div class="flex items-center justify-between px-3 py-1 bg-obsidian-panel/90 border-b border-obsidian-border text-[10px] font-mono uppercase text-obsidian-muted"><span>${escapeHtmlAttr(label)}</span><button type="button" data-copy-code="1" class="ui-action-secondary normal-case font-sans text-xs">Copiar</button></div><pre class="!my-0 !border-0 !rounded-none"><code class="hljs language-${escapeHtmlAttr(label)}">${highlighted}</code></pre></div>`;
    };

    const captionedTablePattern = /(^|\n)((?:[ \t]*(?:Tabla\s*:\s*|Descripci[oó]n\s*:\s*|Fuente\s*:\s*)[^\n]*(?:\n|$)(?:[ \t]*\n)*)+)[ \t]*\n*((?:\|[^\n]*(?:\n|$)){2,})/gim;
    text = text.replace(captionedTablePattern, (_whole, prefix: string, captionBlock: string, tableMarkdown: string) => {
      const caption = parseWriteupObjectCaption(captionBlock.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
      const parsedTable = marked.parse(tableMarkdown.trim(), { async: false, gfm: true, breaks: true, renderer }) as string;
      const safeTable = DOMPurify.sanitize(parsedTable, {
        ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption'],
        ADD_ATTR: ['class'],
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'style'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
      });
      const captionTitle = (caption.title || '').replace(/^Tabla\s*:\s*/i, '');
      const tableWithCaption = safeTable.replace(/<table([^>]*)>/i, `<table$1>${captionTitle ? `<caption class="mb-1 text-left text-xs font-semibold text-obsidian-text">${escapeHtmlAttr(captionTitle)}</caption>` : ''}`);
      const detailsHtml = renderCaptionLines({ description: caption.description, source: caption.source });
      const tableFigure = `<figure class="my-3 min-w-0 overflow-x-auto">${tableWithCaption}${detailsHtml ? `<figcaption class="mt-1 text-xs text-obsidian-muted">${detailsHtml}</figcaption>` : ''}</figure>`;
      const idx = counter++;
      const placeholder = `@@WRITEUP_EMBED_${idx}@@`;
      tokens.push({ placeholder, seg: { kind: 'html', html: tableFigure } });
      return `${prefix}\n\n${placeholder}\n\n`;
    });

    const parsed = marked.parse(text, { async: false, gfm: true, breaks: true, renderer }) as string;
    const withCallouts = enhanceCallouts(parsed);
    const cleanHtml = DOMPurify.sanitize(withCallouts, {
      ADD_TAGS: ['details', 'summary', 'kbd', 'mark', 'video', 'source', 'figure', 'figcaption', 'caption', 'input', 'button'],
      ADD_ATTR: ['open', 'controls', 'loop', 'muted', 'playsinline', 'src', 'type', 'checked', 'disabled', 'class', 'id', 'aria-label', 'data-copy-code', 'data-asset-id'],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
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
  }, [previewMarkdown, redactPreview, assetObjectUrls, boards, assetMap]);

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
    const assetButton = target.closest<HTMLButtonElement>('button[data-asset-id]');
    if (assetButton && onInspectAsset) {
      const assetId = assetButton.getAttribute('data-asset-id');
      if (assetId && assetMap[assetId]) {
        onInspectAsset(assetMap[assetId]);
      }
    }
  };

  if (!previewMarkdown.trim()) {
    return <p className="text-obsidian-muted/70 italic text-sm">La vista previa Markdown aparecerá aquí al escribir.</p>;
  }

  return (
    <div ref={containerRef} onClick={handleContainerClick} className="writeup-prose">
      {previewMarkdown !== markdown && <p className="mb-2 text-xs text-obsidian-muted" aria-hidden="true">Actualizando vista previa…</p>}
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
          <figure key={`b-${seg.boardId}-${idx}`} className="my-3 border-y border-obsidian-borderLight overflow-hidden bg-obsidian-bg py-2">
            <div dangerouslySetInnerHTML={{ __html: seg.svg }} />
            <figcaption className="text-xs text-obsidian-muted mt-1 px-1 flex items-center justify-between">
              <span>{seg.alt}</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(`![${seg.alt}](board://${seg.boardId})`);
                  setCopiedKey(seg.boardId);
                  setTimeout(() => setCopiedKey(null), 1500);
                }}
                className="ui-action-secondary"
              >
                {copiedKey === seg.boardId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedKey === seg.boardId ? 'Copiado' : 'Enlace'}
              </button>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
};
