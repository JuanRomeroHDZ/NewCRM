import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  Binary,
  Bold,
  Calculator,
  CheckSquare,
  ChevronDown,
  Code,
  Code2,
  Eye,
  EyeOff,
  FileText,
  Film,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  KeyRound,
  Link,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Minus,
  Quote,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Strikethrough,
  Table,
} from 'lucide-react';
import { WriteupAsset, WriteupBoard, WriteupSeverity } from '../../types';
import { WRITEUP_TEMPLATES } from './pentestTemplates';
import {
  autoRedactSensitiveData,
  calculateCvss31,
  computeWriteupMetrics,
  Cvss31Metrics,
  decodeBase64Utf8,
  decodeHex,
  decodeJwtOffline,
  DEFAULT_CVSS31_METRICS,
  defangIocs,
  encodeBase64Utf8,
  encodeHex,
  extractMarkdownOutline,
} from './pentestUtils';
import { MarkdownRichPreview } from './MarkdownRichPreview';

interface JumpTarget {
  line: number;
  anchorId: string;
  ts: number;
}

interface WriteupMarkdownSplitEditorProps {
  markdown: string;
  onChange: (next: string) => void;
  boards: WriteupBoard[];
  assets: WriteupAsset[];
  assetObjectUrls: Record<string, string>;
  onUploadMedia: (file: File, convertToGif?: boolean) => Promise<{ id: string; filename: string } | null>;
  onCreateCitation: (payload: {
    anchor_id: string;
    heading_path: string | null;
    line_start: number;
    line_end: number;
    quoted_text: string;
  }) => Promise<void>;
  onApplyCvss?: (score: number, vector: string, severity: WriteupSeverity) => void;
  onSave?: () => void;
  onInspectAsset?: (asset: WriteupAsset) => void;
  jumpTarget?: JumpTarget | null;
  compactMode?: boolean;
}

type ToolGroupFilter = 'all' | 'text' | 'blocks' | 'media' | 'pentest';
type InlineTray = 'none' | 'templates' | 'cvss' | 'code' | 'mermaid' | 'outline' | 'pentest_kit';

const CODE_LANGUAGES = ['http', 'bash', 'python', 'sql', 'javascript', 'json', 'yaml', 'powershell', 'c', 'xml', 'plaintext'];

function findNearestHeading(lines: string[], upToLineZeroBased: number): string | null {
  for (let i = Math.min(upToLineZeroBased, lines.length - 1); i >= 0; i--) {
    const match = lines[i].match(/^(#{1,4})\s+(.*)$/);
    if (match) return match[2].replace(/\{#[a-zA-Z0-9_-]+\}/g, '').trim();
  }
  return null;
}

export const WriteupMarkdownSplitEditor: React.FC<WriteupMarkdownSplitEditorProps> = ({
  markdown,
  onChange,
  boards,
  assets,
  assetObjectUrls,
  onUploadMedia,
  onCreateCitation,
  onApplyCvss,
  onSave,
  onInspectAsset,
  jumpTarget,
  compactMode = false,
}) => {
  const [redactPreview, setRedactPreview] = useState(false);
  const [activeTray, setActiveTray] = useState<InlineTray>('none');
  const [toolFilter, setToolFilter] = useState<ToolGroupFilter>('all');
  const [cvssInputs, setCvssInputs] = useState<Cvss31Metrics>(DEFAULT_CVSS31_METRICS);
  const [uploading, setUploading] = useState(false);
  const [convertVideoToGif, setConvertVideoToGif] = useState(true);
  const [codecInput, setCodecInput] = useState('');
  const [codecOutput, setCodecOutput] = useState('');
  const [codecError, setCodecError] = useState('');
  const [portSpec, setPortSpec] = useState('443/tcp https nginx-1.24 Abierto, 8080/tcp http-proxy Jetty AuthBypass');
  const [kitFeedback, setKitFeedback] = useState('');
  const [splitView, setSplitView] = useState<'split' | 'edit' | 'preview'>(() => {
    if (compactMode || (typeof window !== 'undefined' && window.innerWidth < 1024)) return 'edit';
    return 'split';
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jumpTarget || !textareaRef.current) return;
    if (splitView === 'preview') setSplitView('edit');
    const ta = textareaRef.current;
    const lines = markdown.split('\n');
    const targetIdx = Math.max(0, Math.min(lines.length - 1, jumpTarget.line - 1));
    let charPos = 0;
    for (let i = 0; i < targetIdx; i++) {
      charPos += lines[i].length + 1;
    }
    const lineLen = lines[targetIdx]?.length || 0;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(charPos, charPos + lineLen);
      const ratio = lines.length > 0 ? targetIdx / lines.length : 0;
      ta.scrollTop = Math.max(0, ratio * ta.scrollHeight - 80);
    });
  }, [jumpTarget, markdown, splitView]);

  const insertAtCursor = (snippet: string, wrapMode = false, wrapEnd = '', placeholder = 'texto') => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(markdown + snippet);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = markdown.slice(start, end);
    const insertion = wrapMode ? `${snippet}${selected || placeholder}${wrapEnd}` : snippet;
    const next = markdown.slice(0, start) + insertion + markdown.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + insertion.length;
      ta.setSelectionRange(cursor, cursor);
    });
  };

  const prefixLineAtCursor = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(`${markdown}\n${prefix}`);
      return;
    }
    const start = ta.selectionStart;
    const lineStart = markdown.lastIndexOf('\n', start - 1) + 1;
    const next = markdown.slice(0, lineStart) + prefix + markdown.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + prefix.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleMediaFile = async (file: File) => {
    setUploading(true);
    try {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
      const asset = await onUploadMedia(file, isVideo ? convertVideoToGif : false);
      if (asset) {
        insertAtCursor(`\n![${asset.filename}](asset://${asset.id})\n`);
      }
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file' && (item.type.startsWith('image/') || item.type.startsWith('video/'))) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await handleMediaFile(file);
        return;
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      e.preventDefault();
      await handleMediaFile(file);
    }
  };

  const handleCiteSelection = async () => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = markdown.slice(start, end).trim();
    if (!selected) {
      alert('Selecciona primero un segmento de texto en el editor para citarlo en la pizarra.');
      return;
    }
    const beforeLines = markdown.slice(0, start).split('\n');
    const lineStart = beforeLines.length;
    const lineEnd = lineStart + selected.split('\n').length - 1;
    const headingPath = findNearestHeading(markdown.split('\n'), lineStart - 1);

    const existingAnchorMatch = selected.match(/\{#([a-zA-Z0-9_-]{2,120})\}/);
    const anchorId = existingAnchorMatch ? existingAnchorMatch[1] : `cit-${Date.now().toString(36)}`;
    if (!existingAnchorMatch) {
      const nextMd = `${markdown.slice(0, end)} {#${anchorId}}${markdown.slice(end)}`;
      onChange(nextMd);
    }

    await onCreateCitation({
      anchor_id: anchorId,
      heading_path: headingPath,
      line_start: lineStart,
      line_end: lineEnd,
      quoted_text: selected.replace(/\{#[a-zA-Z0-9_-]+\}/g, '').trim() || selected,
    });
  };

  const cvssResult = useMemo(() => calculateCvss31(cvssInputs), [cvssInputs]);
  const docMetrics = useMemo(() => computeWriteupMetrics(markdown), [markdown]);
  const outlineItems = useMemo(() => extractMarkdownOutline(markdown), [markdown]);
  const showGroup = (group: Exclude<ToolGroupFilter, 'all'>) => toolFilter === 'all' || toolFilter === group;
  const toggleTray = (tray: InlineTray) => setActiveTray((prev) => (prev === tray ? 'none' : tray));

  const jumpToLine = (lineNum: number) => {
    const ta = textareaRef.current;
    if (splitView === 'preview') setSplitView('edit');
    if (!ta) return;
    const lines = markdown.split('\n');
    const idx = Math.max(0, Math.min(lines.length - 1, lineNum - 1));
    let charPos = 0;
    for (let i = 0; i < idx; i += 1) charPos += lines[i].length + 1;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(charPos, charPos + (lines[idx]?.length || 0));
      ta.scrollTop = Math.max(0, (idx / Math.max(1, lines.length)) * ta.scrollHeight - 60);
    });
  };

  const handleAutoRedact = () => {
    const { result, count } = autoRedactSensitiveData(markdown);
    if (count > 0) {
      onChange(result);
      setKitFeedback(`${count} secreto(s) envueltos en {{redact:...}}`);
    } else {
      setKitFeedback('No se detectaron tokens/secretos nuevos sin redactar.');
    }
  };

  const handleDefangSelection = () => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(defangIocs(markdown));
      setKitFeedback('IOCs neutralizados (hxxp/[.]) en todo el documento.');
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start !== end) {
      const selected = markdown.slice(start, end);
      const safe = defangIocs(selected);
      onChange(markdown.slice(0, start) + safe + markdown.slice(end));
      setKitFeedback('IOCs seleccionados neutralizados (hxxp / [.]).');
    } else {
      onChange(defangIocs(markdown));
      setKitFeedback('Todos los IOCs del borrador neutralizados (hxxp / [.]).');
    }
  };

  const handleInsertPortsTable = () => {
    const entries = portSpec
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length === 0) return;
    const rows = entries.map((entry) => {
      const parts = entry.split(/\s+/);
      const port = parts[0] || '-';
      const svc = parts[1] || 'tcp';
      const banner = parts[2] || 'N/D';
      const status = parts.slice(3).join(' ') || 'Expuesto';
      return `| \`${port}\` | ${svc} | ${banner} | ${status} |`;
    });
    const tableMd = `\n| Puerto / Proto | Servicio | Versión / Banner | Estado |\n|---|---|---|---|\n${rows.join('\n')}\n`;
    insertAtCursor(tableMd);
    setKitFeedback(`Tabla generada (${entries.length} puerto(s)).`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      onSave?.();
    } else if (key === 'b') {
      e.preventDefault();
      insertAtCursor('**', true, '**', 'negrita');
    } else if (key === 'i') {
      e.preventDefault();
      insertAtCursor('*', true, '*', 'cursiva');
    } else if (key === 'k') {
      e.preventDefault();
      insertAtCursor('[', true, '](https://)', 'texto');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-[420px] bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
      {/* Row 1: Category Filter Pills + View Mode Switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 bg-slate-900/95 border-b border-slate-800">
        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {(
            [
              ['all', 'Todo'],
              ['text', 'Texto'],
              ['blocks', 'Bloques'],
              ['media', 'Animado'],
              ['pentest', 'Pentest'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setToolFilter(id)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium shrink-0 transition-colors ${
                toolFilter === id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => setRedactPreview((v) => !v)}
            className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1 border shrink-0 ${
              redactPreview
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
            title="Alternar vista interna vs cliente censurada"
          >
            {redactPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{redactPreview ? 'Cliente' : 'Interna'}</span>
          </button>

          <div className="flex bg-slate-800 rounded-lg p-0.5 text-[11px]">
            {(['edit', 'split', 'preview'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSplitView(m)}
                className={`px-2 py-1 rounded transition-colors ${
                  splitView === m ? 'bg-indigo-600 text-white font-medium' : 'text-slate-300 hover:text-white'
                }`}
              >
                {m === 'edit' ? 'Editar' : m === 'split' ? 'Dual' : 'Preview'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Compact Icon Toolbar (filtered cleanly) */}
      <div className="flex flex-wrap items-center gap-1 px-2.5 py-1.5 bg-slate-900/60 border-b border-slate-800">
        {showGroup('text') && (
          <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate-800">
            <button type="button" onClick={() => prefixLineAtCursor('# ')} title="Título H1" aria-label="Título H1" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Heading1 className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('## ')} title="Subtítulo H2" aria-label="Subtítulo H2" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Heading2 className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('### ')} title="Sección H3" aria-label="Sección H3" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Heading3 className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor('**', true, '**', 'negrita')} title="Negrita" aria-label="Negrita" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Bold className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor('*', true, '*', 'cursiva')} title="Cursiva" aria-label="Cursiva" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Italic className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor('~~', true, '~~', 'tachado')} title="Tachado" aria-label="Tachado" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Strikethrough className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor('[', true, '](https://)', 'texto_enlace')} title="Enlace Markdown" aria-label="Enlace" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Link className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('- ')} title="Lista viñetas" aria-label="Lista viñetas" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <List className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('1. ')} title="Lista numerada" aria-label="Lista numerada" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <ListOrdered className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('- [ ] ')} title="Checklist" aria-label="Checklist" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <CheckSquare className="w-4 h-4" />
            </button>
          </div>
        )}

        {showGroup('blocks') && (
          <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate-800">
            <button type="button" onClick={() => insertAtCursor('`', true, '`', 'codigo')} title="Código en línea" aria-label="Código en línea" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Code className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('code')}
              title="Insertar bloque de código con lenguaje"
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                activeTray === 'code' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Código</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('> ')} title="Cita" aria-label="Cita" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Quote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n| Columna 1 | Columna 2 |\n|---|---|\n| Dato | Valor |\n')}
              title="Insertar tabla"
              aria-label="Tabla"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
            >
              <Table className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n> [!WARNING]\n> Riesgo relevante detectado.\n')}
              title="Insertar Callout de advertencia"
              className="px-2 py-1 rounded hover:bg-slate-800 text-amber-300 text-xs"
            >
              [!]
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n<details>\n<summary>Evidencia extendida</summary>\n\nDetalle técnico aquí\n\n</details>\n')}
              title="Sección colapsable"
              className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 text-xs"
            >
              ▸ Detalle
            </button>
            <button type="button" onClick={() => insertAtCursor('\n---\n')} title="Separador horizontal" aria-label="Separador" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Minus className="w-4 h-4" />
            </button>
          </div>
        )}

        {showGroup('media') && (
          <div className="flex items-center gap-1 pr-1.5 border-r border-slate-800">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
              title="Subir Imagen, GIF animado o Video (MP4/WebM)"
            >
              <ImagePlus className="w-3.5 h-3.5 text-emerald-400" />
              <span>{uploading ? 'Procesando…' : 'Media'}</span>
            </button>
            <label
              className="flex items-center gap-1 text-[11px] text-slate-400 px-1.5 cursor-pointer select-none"
              title="Si subes un video MP4/WebM, conviértelo automáticamente a GIF animado optimizado"
            >
              <input
                type="checkbox"
                checked={convertVideoToGif}
                onChange={(e) => setConvertVideoToGif(e.target.checked)}
                className="rounded border-slate-600 accent-indigo-500"
              />
              <span>Video→GIF</span>
            </label>
            <button
              type="button"
              onClick={() => toggleTray('mermaid')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                activeTray === 'mermaid' ? 'bg-indigo-600 text-white' : 'bg-slate-800/80 hover:bg-slate-700 text-indigo-300'
              }`}
              title="Insertar diagrama animado Mermaid"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mermaid</span>
            </button>
            <button
              type="button"
              onClick={() =>
                insertAtCursor(
                  WRITEUP_TEMPLATES.find((t) => t.id === 'html_anim')?.snippet || ''
                )
              }
              className="px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-emerald-300 text-xs flex items-center gap-1"
              title="Insertar widget HTML/CSS animado en sandbox aislado"
            >
              <Film className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">HTML Anim</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mkv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleMediaFile(f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {showGroup('pentest') && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCiteSelection}
              className="px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/30 text-indigo-200 text-xs flex items-center gap-1"
              title="Citar selección en la pizarra"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Citar</span>
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('{{redact:', true, '}}', 'dato_sensible')}
              className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-1"
              title="Censurar selección para cliente"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Censurar</span>
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor(` {#anchor-${Date.now().toString(36)}}`)}
              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              title="Insertar ancla {#id}"
              aria-label="Ancla"
            >
              <Anchor className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('cvss')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                activeTray === 'cvss' ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-cyan-300'
              }`}
              title="Calculadora CVSS 3.1"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>CVSS</span>
            </button>
            <button
              type="button"
              onClick={() => toggleTray('pentest_kit')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                activeTray === 'pentest_kit' ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-emerald-300'
              }`}
              title="Toolkit Pentest: Defang IOCs, Auto-redactar, Codecs Base64/Hex/JWT y Puertos"
            >
              <Binary className="w-3.5 h-3.5" />
              <span>Kit</span>
            </button>
            <button
              type="button"
              onClick={() => toggleTray('outline')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                activeTray === 'outline' ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title="Índice automático (TOC) y métricas del documento"
            >
              <ListTree className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Índice</span>
            </button>
            <button
              type="button"
              onClick={() => toggleTray('templates')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                activeTray === 'templates' ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title="Plantillas Markdown y diagramas"
            >
              <span>Plantillas</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Inline Collapsible Tool Trays (never clipped on narrow/medium screens!) */}
      {activeTray === 'code' && (
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 text-[11px] mr-1">Lenguaje:</span>
          {CODE_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => {
                insertAtCursor(`\n\`\`\`${lang}\n// Tu código o PoC aquí\n\`\`\`\n`);
                setActiveTray('none');
              }}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white font-mono text-[11px]"
            >
              {lang}
            </button>
          ))}
        </div>
      )}

      {activeTray === 'mermaid' && (
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          {WRITEUP_TEMPLATES.filter((t) => t.id.startsWith('mermaid_')).map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                insertAtCursor(tpl.snippet);
                setActiveTray('none');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 text-slate-100 text-left"
            >
              {tpl.label}
            </button>
          ))}
        </div>
      )}

      {activeTray === 'templates' && (
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-xs max-h-56 overflow-y-auto">
          {WRITEUP_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                insertAtCursor(tpl.snippet);
                setActiveTray('none');
              }}
              className="text-left px-2.5 py-1.5 rounded-lg bg-slate-950/70 hover:bg-slate-800 border border-slate-800"
            >
              <div className="font-medium text-slate-100">{tpl.label}</div>
              <div className="text-[11px] text-slate-400 truncate">{tpl.description}</div>
            </button>
          ))}
        </div>
      )}

      {activeTray === 'outline' && (
        <div className="px-3 py-2.5 bg-slate-900 border-b border-slate-800 space-y-2 text-xs max-h-56 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
            <span className="font-semibold text-slate-100">Índice de secciones ({outlineItems.length})</span>
            <div className="flex flex-wrap gap-2 text-slate-400 tabular-nums">
              <span>{docMetrics.words} pal.</span>
              <span>{docMetrics.readingMinutes} min lectura</span>
              <span>{docMetrics.codeBlocks} bloques código</span>
              <span>{docMetrics.mermaidBlocks} mermaid</span>
              <span>{docMetrics.redactedMarkers} redact</span>
            </div>
          </div>
          {outlineItems.length === 0 ? (
            <p className="text-[11px] text-slate-500">Agrega encabezados (`# `, `## `) para navegar el informe.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {outlineItems.map((h, i) => (
                <button
                  key={`${h.line}-${i}`}
                  type="button"
                  onClick={() => jumpToLine(h.line)}
                  className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-[11px] text-slate-200 flex items-center gap-1"
                >
                  <span className="text-indigo-400 font-mono">H{h.level}</span>
                  <span className="truncate max-w-[180px]">{h.text}</span>
                  <span className="text-slate-500 font-mono">L{h.line}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTray === 'pentest_kit' && (
        <div className="px-3 py-2.5 bg-slate-900 border-b border-slate-800 space-y-2.5 text-xs max-h-72 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Kit Pentest & Redacción Segura</span>
            {kitFeedback && <span className="text-[11px] text-emerald-300">{kitFeedback}</span>}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleDefangSelection}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 text-slate-100 flex items-center gap-1.5"
              title="Convierte http:// en hxxp:// e IPs 1.2.3.4 en 1[.]2[.]3[.]4"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Defang IOCs (hxxp/[.])
            </button>
            <button
              type="button"
              onClick={handleAutoRedact}
              className="px-2.5 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 flex items-center gap-1.5"
              title="Envuelve automáticamente Bearer/JWT/API keys en {{redact:...}}"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Auto-censurar secretos
            </button>
          </div>

          {/* Port Scan -> Markdown Table */}
          <div className="flex flex-col sm:flex-row gap-1.5">
            <input
              type="text"
              value={portSpec}
              onChange={(e) => setPortSpec(e.target.value)}
              placeholder="443/tcp https nginx Abierto, 22/tcp ssh OpenSSH Filtrado"
              className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-mono text-[11px]"
            />
            <button
              type="button"
              onClick={handleInsertPortsTable}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 flex items-center gap-1 shrink-0"
            >
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              Tabla Puertos .md
            </button>
          </div>

          {/* Offline Base64 / Hex / JWT Codec */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 pt-1 border-t border-slate-800">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-indigo-400" />
                  Codec Offline (Base64 / Hex / JWT)
                </span>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCodecError('');
                      setCodecOutput(encodeBase64Utf8(codecInput));
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    B64 Enc
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setCodecError('');
                        setCodecOutput(decodeBase64Utf8(codecInput));
                      } catch (err) {
                        setCodecError(err instanceof Error ? err.message : 'Base64 inválido');
                      }
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    B64 Dec
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCodecError('');
                      setCodecOutput(encodeHex(codecInput));
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    Hex Enc
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setCodecError('');
                        setCodecOutput(decodeHex(codecInput));
                      } catch (err) {
                        setCodecError(err instanceof Error ? err.message : 'Hex inválido');
                      }
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    Hex Dec
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setCodecError('');
                        const jwt = decodeJwtOffline(codecInput);
                        setCodecOutput(`// HEADER\n${jwt.header}\n\n// PAYLOAD\n${jwt.payload}\n\n// SIGNATURE\n${jwt.signature}`);
                      } catch (err) {
                        setCodecError(err instanceof Error ? err.message : 'JWT inválido');
                      }
                    }}
                    className="px-1.5 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200"
                  >
                    JWT Dec
                  </button>
                </div>
              </div>
              <textarea
                rows={2}
                value={codecInput}
                onChange={(e) => setCodecInput(e.target.value)}
                placeholder="Pega payload, string Base64, Hex o JWT eyJ..."
                className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-slate-100 font-mono text-[11px]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Resultado ({codecError ? 'Error' : 'Offline'})</span>
                {codecOutput && (
                  <button
                    type="button"
                    onClick={() => insertAtCursor(`\n\`\`\`json\n${codecOutput}\n\`\`\`\n`)}
                    className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300"
                  >
                    Insertar en .md
                  </button>
                )}
              </div>
              {codecError ? (
                <div className="p-2 rounded bg-rose-950/60 border border-rose-500/30 text-rose-200 text-[11px]">
                  {codecError}
                </div>
              ) : (
                <textarea
                  rows={2}
                  readOnly
                  value={codecOutput}
                  placeholder="Salida decodificada o payload JSON..."
                  className="w-full bg-slate-950/70 border border-slate-800 rounded p-1.5 text-emerald-200 font-mono text-[11px]"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {activeTray === 'cvss' && (
        <div className="px-3 py-2.5 bg-slate-900 border-b border-slate-800 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">Calculadora CVSS v3.1</span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-bold tabular-nums">
                {cvssResult.score.toFixed(1)} ({cvssResult.severity.toUpperCase()})
              </span>
              <span className="font-mono text-[10px] text-slate-400 hidden md:inline">{cvssResult.vector}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                ['AV', 'Vector (AV)', [['N', 'Red (N)'], ['A', 'Adyacente'], ['L', 'Local'], ['P', 'Físico']]],
                ['AC', 'Complejidad', [['L', 'Baja (L)'], ['H', 'Alta (H)']]],
                ['PR', 'Privilegios', [['N', 'Ninguno'], ['L', 'Bajo'], ['H', 'Alto']]],
                ['UI', 'Interacción', [['N', 'Ninguna'], ['R', 'Requerida']]],
                ['S', 'Alcance (S)', [['U', 'Sin cambio'], ['C', 'Cambiado']]],
                ['C', 'Confidenc.', [['N', 'Nula'], ['L', 'Baja'], ['H', 'Alta']]],
                ['I', 'Integridad', [['N', 'Nula'], ['L', 'Baja'], ['H', 'Alta']]],
                ['A', 'Disponib.', [['N', 'Nula'], ['L', 'Baja'], ['H', 'Alta']]],
              ] as const
            ).map(([key, label, opts]) => (
              <label key={key} className="block">
                <span className="text-[10px] text-slate-400">{label}</span>
                <select
                  value={cvssInputs[key]}
                  onChange={(e) => setCvssInputs((p) => ({ ...p, [key]: e.target.value }))}
                  className="mt-0.5 w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
                >
                  {opts.map(([val, text]) => (
                    <option key={val} value={val}>{text}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {onApplyCvss && (
              <button
                type="button"
                onClick={() => {
                  onApplyCvss(cvssResult.score, cvssResult.vector, cvssResult.severity);
                  setActiveTray('none');
                }}
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium"
              >
                Aplicar al Writeup
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                insertAtCursor(`\n> **CVSS 3.1:** \`${cvssResult.score.toFixed(1)}\` (\`${cvssResult.vector}\`)\n`);
                setActiveTray('none');
              }}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              Insertar en .md
            </button>
          </div>
        </div>
      )}

      {/* Editor + Live Preview Panes */}
      <div className={`flex-1 grid min-h-0 ${splitView === 'split' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {splitView !== 'preview' && (
          <div className="flex flex-col min-h-[280px] md:min-h-[360px] lg:min-h-0 border-b md:border-b-0 md:border-r border-slate-800">
            <textarea
              ref={textareaRef}
              value={markdown}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDrop={handleDrop}
              spellCheck={false}
              placeholder="Escribe en Markdown (.md). Pega capturas (Ctrl+V), Ctrl+S guardar, Ctrl+B/I/K formato…"
              className="flex-1 w-full min-h-[240px] bg-slate-950 text-slate-100 font-mono text-sm leading-6 p-3.5 sm:p-4 resize-none focus:outline-none"
            />
            <div className="px-3 py-1.5 bg-slate-900/60 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between gap-2 tabular-nums">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                {docMetrics.lines} L · {docMetrics.words} pal. · {docMetrics.readingMinutes}m · {docMetrics.codeBlocks} code
              </span>
              <span className="truncate">Ctrl+S guardar · Ctrl+V media · {'{{redact:...}}'}</span>
            </div>
          </div>
        )}

        {splitView !== 'edit' && (
          <div className="overflow-y-auto min-h-[260px] lg:min-h-0 p-4 sm:p-5 bg-slate-900/30">
            <MarkdownRichPreview
              markdown={markdown}
              redactPreview={redactPreview}
              boards={boards}
              assets={assets}
              assetObjectUrls={assetObjectUrls}
              onInspectAsset={onInspectAsset}
            />
          </div>
        )}
      </div>
    </div>
  );
};
