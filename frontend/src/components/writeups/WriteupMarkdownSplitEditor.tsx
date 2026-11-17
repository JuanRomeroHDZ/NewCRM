import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Anchor,
  Binary,
  Bold,
  Calculator,
  Check,
  CheckSquare,
  Circle,
  ChevronDown,
  Columns2,
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
  ListTree,
  Minus,
  PenLine,
  Quote,
  Server,
  ShieldAlert,
  ShieldCheck,
  Square,
  Sparkles,
  Strikethrough,
  Table,
  Tag,
  Underline,
} from 'lucide-react';
import { WriteupAsset, WriteupBoard, WriteupSeverity } from '../../types';
import { useVault } from '../../context/VaultContext';
import { WRITEUP_TEMPLATES } from './pentestTemplates';
import { createPortTableMarkdown, MAX_PORT_TABLE_INPUT_LENGTH } from './portTable';
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
  extractMarkdownObjects,
} from './pentestUtils';
import { MarkdownRichPreview } from './MarkdownRichPreview';
import { MAX_REPORT_TEXT_LENGTH } from './writeupLimits';
import { createColoredUnderlineOpeningTag, indentMarkdownLines, transformMarkdownList, type MarkdownListStyle } from './markdownEditing';

interface JumpTarget {
  line: number;
  anchorId: string;
  ts: number;
}

export interface WriteupEditorSessionState {
  selectionStart: number;
  selectionEnd: number;
  scrollTop: number;
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
    markdown_content: string;
  }) => Promise<boolean | void>;
  onApplyCvss?: (score: number, vector: string, severity: WriteupSeverity) => void;
  onSave?: () => void;
  onInspectAsset?: (asset: WriteupAsset) => void;
  jumpTarget?: JumpTarget | null;
  readOnly?: boolean;
  editorSession?: WriteupEditorSessionState;
  onEditorSessionChange?: (session: WriteupEditorSessionState) => void;
}

type ToolGroupFilter = 'all' | 'text' | 'blocks' | 'media' | 'pentest';
type InlineTray = 'none' | 'templates' | 'cvss' | 'code' | 'mermaid' | 'outline' | 'pentest_kit' | 'table' | 'label' | 'caption';

const CODE_LANGUAGES = ['http', 'bash', 'python', 'sql', 'javascript', 'json', 'yaml', 'powershell', 'c', 'xml', 'plaintext'];
const MAX_CITATION_LENGTH = 5000;

function findNearestHeading(lines: string[], upToLineZeroBased: number): string | null {
  for (let i = Math.min(upToLineZeroBased, lines.length - 1); i >= 0; i--) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
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
  readOnly = false,
  editorSession,
  onEditorSessionChange,
}) => {
  const { showToast } = useVault();
  const [redactPreview, setRedactPreview] = useState(false);
  const [activeTray, setActiveTray] = useState<InlineTray>('none');
  const [outlineKind, setOutlineKind] = useState<'headings' | 'table' | 'image'>('headings');
  const [toolFilter, setToolFilter] = useState<ToolGroupFilter>('text');
  const [cvssInputs, setCvssInputs] = useState<Cvss31Metrics>(DEFAULT_CVSS31_METRICS);
  const [uploading, setUploading] = useState(false);
  const [convertVideoToGif, setConvertVideoToGif] = useState(true);
  const [codecInput, setCodecInput] = useState('');
  const [codecOutput, setCodecOutput] = useState('');
  const [codecError, setCodecError] = useState('');
  const [portSpec, setPortSpec] = useState('');
  const [tableCells, setTableCells] = useState<string[][]>([['Nombre', 'Descripción'], ['', ''], ['', '']]);
  const [labelColor, setLabelColor] = useState('jade');
  const [labelSize, setLabelSize] = useState('normal');
  const [underlineColor, setUnderlineColor] = useState('#A98242');
  const [captionKind, setCaptionKind] = useState<'figure' | 'image' | 'table'>('figure');
  const [captionTitle, setCaptionTitle] = useState('');
  const [captionDescription, setCaptionDescription] = useState('');
  const [captionSource, setCaptionSource] = useState('');
  const [kitFeedback, setKitFeedback] = useState('');
  const [splitView, setSplitView] = useState<'split' | 'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [sideBySideAvailable, setSideBySideAvailable] = useState(false);
  const editorSessionRestoredRef = useRef(false);

  const captureEditorSession = (textarea: HTMLTextAreaElement) => {
    onEditorSessionChange?.({
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
    });
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !editorSession || editorSessionRestoredRef.current) return;
    editorSessionRestoredRef.current = true;
    requestAnimationFrame(() => {
      const current = textareaRef.current;
      if (!current) return;
      const start = Math.min(editorSession.selectionStart, current.value.length);
      const end = Math.min(Math.max(start, editorSession.selectionEnd), current.value.length);
      current.setSelectionRange(start, end);
      current.scrollTop = editorSession.scrollTop;
    });
  }, [editorSession, markdown]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setSideBySideAvailable((entry?.contentRect.width ?? 0) >= 960);
    });
    observer.observe(workspace);
    setSideBySideAvailable(workspace.clientWidth >= 960);
    return () => observer.disconnect();
  }, []);

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

  const insertAtCursor = (snippet: string, wrapMode = false, wrapEnd = '', placeholder = 'texto', position?: number) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(markdown + snippet);
      return;
    }
    const start = position ?? ta.selectionStart;
    const end = position ?? ta.selectionEnd;
    const current = ta.value;
    const selected = current.slice(start, end);
    const insertion = wrapMode ? `${snippet}${selected || placeholder}${wrapEnd}` : snippet;
    const next = current.slice(0, start) + insertion + current.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      if (wrapMode) {
        const innerStart = start + snippet.length;
        ta.setSelectionRange(innerStart, innerStart + (selected || placeholder).length);
      } else {
        const cursor = start + insertion.length;
        ta.setSelectionRange(cursor, cursor);
      }
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

  const applyListStyle = (style: MarkdownListStyle) => {
    const ta = textareaRef.current;
    const source = ta?.value ?? markdown;
    const start = ta?.selectionStart ?? source.length;
    const end = ta?.selectionEnd ?? start;
    const result = transformMarkdownList(source, start, end, style);
    onChange(result.markdown);
    setActiveTray('none');
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const handleMediaFile = async (file: File) => {
    const original = textareaRef.current?.value ?? markdown;
    const originalPosition = textareaRef.current?.selectionStart ?? original.length;
    setUploading(true);
    try {
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(file.name);
      const asset = await onUploadMedia(file, isVideo ? convertVideoToGif : false);
      if (asset) {
        const current = textareaRef.current?.value ?? original;
        let prefix = 0;
        while (prefix < original.length && prefix < current.length && original[prefix] === current[prefix]) prefix++;
        let suffix = 0;
        while (suffix < original.length - prefix && suffix < current.length - prefix && original[original.length - 1 - suffix] === current[current.length - 1 - suffix]) suffix++;
        const position = originalPosition <= prefix ? originalPosition : originalPosition >= original.length - suffix
          ? originalPosition + current.length - original.length
          : (textareaRef.current?.selectionStart ?? prefix);
        insertAtCursor(`\n![${asset.filename.replace(/[\[\]]/g, '')}](asset://${asset.id})\n`, false, '', '', position);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo subir el archivo. Inténtalo de nuevo.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) {
      e.preventDefault();
      return;
    }
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
    if (readOnly) {
      e.preventDefault();
      return;
    }
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
      showToast('Selecciona un fragmento del informe antes de añadir la cita a la pizarra.', 'info');
      return;
    }
    if (selected.length > MAX_CITATION_LENGTH) {
      showToast(`Selecciona un fragmento de hasta ${MAX_CITATION_LENGTH} caracteres.`, 'warning');
      return;
    }
    const beforeLines = markdown.slice(0, start).split('\n');
    const lineStart = beforeLines.length;
    const lineEnd = lineStart + selected.split('\n').length - 1;
    const headingPath = findNearestHeading(markdown.split('\n'), lineStart - 1);

    const existingAnchorMatch = selected.match(/\{#([a-zA-Z0-9_-]{2,120})\}/);
    const anchorId = existingAnchorMatch ? existingAnchorMatch[1] : `cit-${Date.now().toString(36)}`;
    const nextMarkdown = existingAnchorMatch
      ? markdown
      : `${markdown.slice(0, end)} {#${anchorId}}${markdown.slice(end)}`;
    try {
      await onCreateCitation({
        anchor_id: anchorId,
        heading_path: headingPath,
        line_start: lineStart,
        line_end: lineEnd,
        quoted_text: selected.replace(/\{#[a-zA-Z0-9_-]+\}/g, '').trim() || selected,
        markdown_content: nextMarkdown,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo añadir la cita. Inténtalo de nuevo.', 'error');
    }
  };

  const cvssResult = useMemo(() => calculateCvss31(cvssInputs), [cvssInputs]);
  const docMetrics = useMemo(() => computeWriteupMetrics(markdown), [markdown]);
  const outlineItems = useMemo(() => extractMarkdownOutline(markdown), [markdown]);
  const outlineObjects = useMemo(() => extractMarkdownObjects(markdown), [markdown]);
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
      setKitFeedback(`${count} dato(s) sensible(s) oculto(s) en la copia para cliente.`);
    } else {
      setKitFeedback('No se encontraron datos sensibles nuevos para ocultar.');
    }
  };

  const handleDefangSelection = () => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(defangIocs(markdown));
      setKitFeedback('Enlaces e IP del informe cambiados para evitar aperturas accidentales.');
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start !== end) {
      const selected = markdown.slice(start, end);
      const safe = defangIocs(selected);
      onChange(markdown.slice(0, start) + safe + markdown.slice(end));
      setKitFeedback('Enlaces e IP seleccionados cambiados para evitar aperturas accidentales.');
    } else {
      onChange(defangIocs(markdown));
      setKitFeedback('Enlaces e IP del informe cambiados para evitar aperturas accidentales.');
    }
  };

  const handleInsertPortsTable = () => {
    try {
      const tableMd = createPortTableMarkdown(portSpec);
      const rowCount = tableMd.split('\n').filter((line) => line.startsWith('| `')).length;
      insertAtCursor(tableMd);
      setKitFeedback(`Tabla creada con ${rowCount} ${rowCount === 1 ? 'puerto' : 'puertos'}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Revisa los datos de los puertos.';
      setKitFeedback(message);
      showToast(message, 'warning');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const result = indentMarkdownLines(ta.value, ta.selectionStart, ta.selectionEnd, e.shiftKey ? 'outdent' : 'indent');
      onChange(result.markdown);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(result.selectionStart, result.selectionEnd);
      });
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') {
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

  const handleWorkspaceKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (readOnly || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 's' || !onSave) return;
    e.preventDefault();
    onSave();
  };
  const sideBySide = splitView === 'split' && sideBySideAvailable;

  return (
    <div onKeyDownCapture={handleWorkspaceKeyDown} className="writeup-markdown-editor writeup-editor-container flex min-w-0 max-w-full flex-col h-full min-h-[300px] bg-slate-950 border border-slate-800 rounded-xl overflow-visible">
      {/* Compact toolbar: category, actions and view controls share one row. */}
      <div className={`relative z-20 flex min-w-0 items-center gap-1 border-b border-slate-800 bg-slate-900/95 px-2 py-1.5 ${toolFilter === 'all' ? 'flex-wrap' : ''}`}>
        <fieldset disabled={readOnly} className="contents">
        {splitView !== 'preview' && <label className="relative inline-flex shrink-0 items-center">
            <span className="sr-only">Categoría de herramientas</span>
            <select value={toolFilter} onChange={(event) => setToolFilter(event.target.value as ToolGroupFilter)} title={toolFilter === 'all' ? 'Todas las herramientas' : undefined} className="min-h-9 w-28 appearance-none rounded-lg border border-slate-700 bg-slate-950 pl-2 pr-6 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              <option value="text">Texto</option><option value="blocks">Bloques</option><option value="media">Multimedia</option><option value="pentest">Seguridad</option><option value="all">Todas</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" aria-hidden="true" />
          </label>}
        {splitView !== 'preview' && <div role="region" tabIndex={0} className={`flex min-w-0 items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 ${toolFilter === 'all' ? 'order-3 basis-full flex-wrap border-t border-slate-800 py-1.5' : 'flex-1 overflow-visible'}`} aria-label={toolFilter === 'all' ? 'Todas las herramientas de edición, organizadas por grupo' : 'Herramientas de edición; desplázate horizontalmente para ver más'}>
        {showGroup('text') && (
          <div className={`flex min-w-0 max-w-full items-center gap-0.5 pr-1.5 border-r border-slate-800 ${toolFilter === 'all' ? 'flex-wrap' : 'shrink-0 flex-nowrap'}`}>
            <details className="relative shrink-0" onClick={(event) => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false; }}>
              <summary data-caret="manual" aria-label="Encabezados" title="Encabezados" className="flex h-9 cursor-pointer list-none items-center justify-center gap-0.5 rounded px-1 text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><Heading1 className="h-4 w-4" /><ChevronDown className="h-3 w-3" aria-hidden="true" /></summary>
              <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">
            <button type="button" onClick={() => prefixLineAtCursor('# ')} title="Título H1" aria-label="Título H1" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Heading1 className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('## ')} title="Subtítulo H2" aria-label="Subtítulo H2" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Heading2 className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('### ')} title="Sección H3" aria-label="Sección H3" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Heading3 className="w-4 h-4" />
            </button>
            {[4, 5, 6].map((level) => <button key={level} type="button" onClick={() => prefixLineAtCursor(`${'#'.repeat(level)} `)} title={`Encabezado H${level}`} aria-label={`Encabezado H${level}`} className="min-h-9 rounded px-2 text-xs text-slate-300 hover:bg-slate-800">H{level}</button>)}
              </div>
            </details>
            <button type="button" onClick={() => toggleTray('label')} aria-label="Insertar etiqueta de color" aria-expanded={activeTray === 'label'} title="Etiqueta de color" className="flex h-9 items-center justify-center gap-0.5 rounded px-1 text-emerald-300 hover:bg-slate-800"><Tag className="h-4 w-4" /><ChevronDown className="h-3 w-3" aria-hidden="true" /></button>
            <details className="relative shrink-0" onClick={(event) => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false; }}>
              <summary data-caret="manual" aria-label="Formato de texto" title="Formato de texto" className="flex h-9 cursor-pointer list-none items-center justify-center gap-0.5 rounded px-1 text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><Bold className="h-4 w-4" /><ChevronDown className="h-3 w-3" aria-hidden="true" /></summary>
              <div className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">
            <button type="button" onClick={() => insertAtCursor('**', true, '**', 'negrita')} title="Negrita" aria-label="Negrita" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Bold className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor('*', true, '*', 'cursiva')} title="Cursiva" aria-label="Cursiva" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Italic className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor('~~', true, '~~', 'tachado')} title="Tachado" aria-label="Tachado" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Strikethrough className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor(createColoredUnderlineOpeningTag(underlineColor), true, '</u>', 'subrayado')} title="Subrayar con color" aria-label="Subrayar texto con el color elegido" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Underline className="w-4 h-4" />
            </button>
            <label title="Elegir color del subrayado" className="flex h-8 w-9 cursor-pointer items-center justify-center rounded hover:bg-slate-800 focus-within:outline focus-within:outline-2 focus-within:outline-emerald-300">
              <span className="sr-only">Color del subrayado</span>
              <input type="color" aria-label="Color del subrayado" value={underlineColor} onChange={(event) => setUnderlineColor(event.target.value)} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0" />
            </label>
              </div>
            </details>
            <button type="button" onClick={() => insertAtCursor('[', true, '](https://)', 'texto_enlace')} title="Enlace en el informe" aria-label="Enlace" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Link className="w-4 h-4" />
            </button>
            <details className="relative shrink-0" onClick={(event) => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false; }}>
              <summary data-caret="manual" aria-label="Estilos de lista" title="Estilos de lista" className="flex h-9 cursor-pointer list-none items-center justify-center gap-0.5 rounded px-1 text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><List className="h-4 w-4" aria-hidden="true" /><ChevronDown className="h-3 w-3" aria-hidden="true" /></summary>
              <div className="absolute left-0 top-full z-50 mt-1 grid w-52 grid-cols-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">
                {([
                  ['bullet', 'Viñetas'], ['ordered', 'Numerada'], ['task', 'Lista de tareas'], ['done', 'Tareas completadas'],
                  ['nested-bullet', 'Viñetas anidadas'], ['nested-ordered', 'Numeración anidada'], ['square', 'Viñeta cuadrada'],
                  ['circle', 'Viñeta abierta'], ['alpha', 'Alfabética (a, b, c)'], ['alpha-upper', 'Alfabética (A, B, C)'], ['roman', 'Romana (i, ii, iii)'], ['roman-upper', 'Romana (I, II, III)'],
                ] as const).map(([style, label]) => <button key={style} type="button" onClick={() => applyListStyle(style)} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-left text-xs text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><span className="flex w-4 shrink-0 items-center justify-center font-mono text-slate-400">{style === 'task' ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : style === 'done' ? <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" /> : style === 'square' ? <Square className="h-3 w-3" aria-hidden="true" /> : style === 'circle' || style === 'nested-bullet' ? <Circle className="h-3 w-3" aria-hidden="true" /> : style === 'ordered' || style === 'nested-ordered' ? '1.' : style === 'alpha' ? 'a.' : style === 'alpha-upper' ? 'A.' : style === 'roman' ? 'i.' : style === 'roman-upper' ? 'I.' : '•'}</span>{label}</button>)}
              </div>
            </details>
          </div>
        )}

        {showGroup('blocks') && (
          <div className={`flex min-w-0 max-w-full items-center gap-0.5 pr-1.5 border-r border-slate-800 ${toolFilter === 'all' ? 'flex-wrap' : 'shrink-0 flex-nowrap'}`}>
            <button type="button" onClick={() => insertAtCursor('`', true, '`', 'codigo')} title="Código en línea" aria-label="Código en línea" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Code className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('code')}
              title="Insertar bloque de código con lenguaje"
              aria-label="Insertar bloque de código con lenguaje"
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                activeTray === 'code' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Código</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('> ')} title="Cita" aria-label="Cita" className="p-1.5 rounded hover:bg-slate-800 text-slate-300">
              <Quote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('table')}
              title="Insertar tabla"
              aria-label="Tabla"
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
            >
              <Table className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('caption')}
              aria-label="Añadir título, descripción y fuente a una figura o tabla"
              aria-expanded={activeTray === 'caption'}
              title="Rótulo para figura, imagen o tabla"
              className={`inline-flex min-h-9 items-center gap-1 rounded px-2 text-xs ${activeTray === 'caption' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Rótulo</span>
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n> [!WARNING]\n> Riesgo relevante detectado.\n')}
              title="Insertar Callout de advertencia"
              aria-label="Insertar llamada de advertencia"
              className="px-2 py-1 rounded hover:bg-slate-800 text-amber-300 text-xs"
            >
              [!]
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n<details>\n<summary>Evidencia extendida</summary>\n\nDetalle técnico aquí\n\n</details>\n')}
              title="Sección colapsable"
              aria-label="Insertar sección colapsable"
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
          <div className={`flex min-w-0 max-w-full items-center gap-1 pr-1.5 border-r border-slate-800 ${toolFilter === 'all' ? 'flex-wrap' : 'shrink-0 flex-nowrap'}`}>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
              title="Subir Imagen, GIF animado o Video (MP4/WebM)"
              aria-label="Subir imagen o video"
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
                className="peer sr-only"
              />
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-500 bg-slate-950 text-transparent peer-checked:border-indigo-400 peer-checked:bg-indigo-600 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-300" aria-hidden="true"><Check className="h-3 w-3" /></span>
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
              title="Insertar una animación HTML/CSS independiente"
              aria-label="Insertar animación HTML"
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
          <div className={`flex min-w-0 max-w-full items-center gap-1 ${toolFilter === 'all' ? 'flex-wrap' : 'shrink-0 flex-nowrap'}`}>
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
              aria-label="Censurar selección para cliente"
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
              title="Herramientas de seguridad: neutralizar enlaces e IP, ocultar secretos, transformar texto y crear tablas de puertos"
            >
              <Binary className="w-3.5 h-3.5" />
              <span>Herramientas</span>
            </button>
            <button
              type="button"
              onClick={() => toggleTray('templates')}
              className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${
                activeTray === 'templates' ? 'bg-indigo-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title="Plantillas de informe y diagramas"
            >
              <span>Plantillas</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        )}
        </div>}
        </fieldset>
        <div className={`flex shrink-0 items-center gap-1 ${toolFilter === 'all' ? 'order-2 ml-auto' : ''}`}>
          <button type="button" onClick={() => { if (splitView === 'preview') setSplitView('edit'); toggleTray('outline'); }} aria-label="Índice del informe" aria-expanded={activeTray === 'outline' && splitView !== 'preview'} title="Índice del informe" className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${activeTray === 'outline' && splitView !== 'preview' ? 'border-emerald-600 bg-emerald-900 text-white' : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'}`}><ListTree className="h-4 w-4" aria-hidden="true" /></button>
          <button
            type="button"
            onClick={() => setRedactPreview((v) => !v)}
            aria-pressed={redactPreview}
            aria-label={redactPreview ? 'Mostrar vista interna' : 'Mostrar vista para cliente'}
            className={`writeup-toolbar-compact-button min-h-9 px-3 py-1 rounded-lg text-xs flex items-center gap-1.5 border shrink-0 ${
              redactPreview
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
            title="Alternar vista interna vs cliente censurada"
          >
            {redactPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="writeup-editor-toolbar-label">{redactPreview ? 'Cliente' : 'Interna'}</span>
          </button>

          <label className="writeup-view-mode-label relative inline-flex items-center">
            <span className="sr-only">Vista del texto del informe</span>
            <select value={splitView} onChange={(event) => setSplitView(event.target.value as 'edit' | 'split' | 'preview')} aria-label={`Vista del informe: ${splitView === 'edit' ? 'Editar' : splitView === 'split' ? 'Dos vistas' : 'Vista previa'}`} title={`Vista: ${splitView === 'edit' ? 'Editar' : splitView === 'split' ? 'Dos vistas' : 'Vista previa'}`} className="writeup-view-mode-select min-h-9 w-28 appearance-none rounded-lg border border-slate-700 bg-slate-950 pl-2 pr-6 text-xs text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              <option value="edit">Editar</option><option value="split">Dos vistas</option><option value="preview">Vista previa</option>
            </select>
            {splitView === 'edit' ? <PenLine className="writeup-view-mode-icon pointer-events-none absolute left-2 hidden h-4 w-4 text-slate-300" aria-hidden="true" /> : splitView === 'preview' ? <Eye className="writeup-view-mode-icon pointer-events-none absolute left-2 hidden h-4 w-4 text-slate-300" aria-hidden="true" /> : <Columns2 className="writeup-view-mode-icon pointer-events-none absolute left-2 hidden h-4 w-4 text-slate-300" aria-hidden="true" />}
            <ChevronDown className="writeup-view-mode-chevron pointer-events-none absolute right-2 h-4 w-4 text-slate-400" aria-hidden="true" />
          </label>
        </div>
      </div>
      <fieldset disabled={readOnly} className="contents">
      {splitView !== 'preview' && <>

      {/* Inline Collapsible Tool Trays (never clipped on narrow/medium screens!) */}
      {activeTray === 'label' && (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-800 p-3 text-xs text-slate-200">
          <label className="flex flex-col gap-1">Color
            <select value={labelColor} onChange={(event) => setLabelColor(event.target.value)} className="min-h-10 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white">
              <option value="jade">Jade · desarrollo</option><option value="rojo">Rojo · seguridad</option><option value="azul">Azul · infraestructura</option><option value="dorado">Dorado</option><option value="neutro">Neutro</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">Tamaño
            <select value={labelSize} onChange={(event) => setLabelSize(event.target.value)} className="min-h-10 rounded border border-slate-700 bg-slate-950 px-3 text-sm text-white">
              <option value="pequena">Pequeño</option><option value="normal">Normal</option><option value="grande">Grande</option>
            </select>
          </label>
          <button type="button" className="min-h-10 rounded bg-emerald-700 px-4 font-medium text-white hover:bg-emerald-600" onClick={() => {
            const ta = textareaRef.current;
            const selected = ta?.value.slice(ta.selectionStart, ta.selectionEnd) || '';
            if (/[{}\n]/.test(selected) || selected.length > 120) { showToast('Selecciona texto de una sola línea, hasta 120 caracteres y sin llaves.', 'warning'); return; }
            insertAtCursor(`{etiqueta:${labelColor}:${labelSize}:`, true, '}', 'Texto');
            setActiveTray('none');
          }}>Insertar etiqueta</button>
          <span className="text-slate-400">Selecciona texto antes de abrir la herramienta, o escribe después de insertarla.</span>
        </div>
      )}
      {activeTray === 'table' && (
        <div className="space-y-2 border-t border-slate-800 p-3 text-xs text-slate-200">
          <p className="text-slate-300">Escribe los encabezados y los datos; puedes completar las celdas después.</p>
          <div className="max-h-56 overflow-auto">
            <table className="border-collapse text-left"><tbody>
              {tableCells.map((row, rowIndex) => <tr key={rowIndex}>
                {row.map((cell, colIndex) => <td key={colIndex} className="border border-slate-700 p-0">
                  <input aria-label={`${rowIndex === 0 ? 'Encabezado' : `Fila ${rowIndex}`} columna ${colIndex + 1}`} value={cell} maxLength={300} onChange={(event) => {
                    const value = event.target.value;
                    setTableCells((current) => current.map ( (cells, i) => i === rowIndex ? cells.map((item, j) => j === colIndex ? value : item) : cells));
                  }} className={`min-h-9 w-36 bg-slate-950 px-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${rowIndex === 0 ? 'font-semibold' : ''}`} />
                </td>)}
              </tr>)}
            </tbody></table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={tableCells.length >= 21} onClick={() => setTableCells((current) => [...current, current[0].map(() => '')])} className="min-h-9 rounded border border-slate-700 px-3 disabled:opacity-40">Añadir fila</button>
            <button type="button" disabled={tableCells[0].length >= 10} onClick={() => setTableCells((current) => current.map((row) => [...row, '']))} className="min-h-9 rounded border border-slate-700 px-3 disabled:opacity-40">Añadir columna</button>
            <button type="button" disabled={tableCells.length <= 2} onClick={() => setTableCells((current) => current.slice(0, -1))} className="min-h-9 rounded border border-slate-700 px-3 disabled:opacity-40">Quitar última fila</button>
            <button type="button" disabled={tableCells[0].length <= 1} onClick={() => setTableCells((current) => current.map((row) => row.slice(0, -1)))} className="min-h-9 rounded border border-slate-700 px-3 disabled:opacity-40">Quitar última columna</button>
            <button type="button" className="min-h-9 rounded bg-emerald-700 px-4 font-medium text-white hover:bg-emerald-600" onClick={() => {
              const clean = (value: string) => value.trim().replace(/\|/g, '\\|');
              const row = (cells: string[]) => `| ${cells.map(clean).join(' | ')} |`;
              const header = tableCells[0].map((value, index) => value.trim() || `Columna ${index + 1}`);
              insertAtCursor(`\n${row(header)}\n| ${header.map(() => '---').join(' | ')} |\n${tableCells.slice(1).map(row).join('\n')}\n`);
              setActiveTray('none');
            }}>Insertar tabla</button>
          </div>
        </div>
      )}
      {activeTray === 'caption' && (
        <div className="space-y-2 border-t border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-200">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="flex min-w-0 flex-col gap-1">Objeto
              <select value={captionKind} onChange={(event) => setCaptionKind(event.target.value as typeof captionKind)} className="min-h-9 rounded border border-slate-700 bg-slate-950 px-2 text-slate-100">
                <option value="figure">Figura</option><option value="image">Imagen</option><option value="table">Tabla</option>
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 sm:col-span-3">Título
              <input value={captionTitle} onChange={(event) => setCaptionTitle(event.target.value)} maxLength={240} placeholder="Relación entre…" className="min-h-9 rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 placeholder:text-slate-500" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">Descripción (opcional)
              <input value={captionDescription} onChange={(event) => setCaptionDescription(event.target.value)} maxLength={500} placeholder="Qué muestra el objeto" className="min-h-9 rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 placeholder:text-slate-500" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">Fuente (opcional)
              <input value={captionSource} onChange={(event) => setCaptionSource(event.target.value)} maxLength={500} placeholder="URL o Elaboración propia (2026)" className="min-h-9 rounded border border-slate-700 bg-slate-950 px-2 text-slate-100 placeholder:text-slate-500" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="min-h-9 rounded bg-slate-700 px-3 font-medium text-white hover:bg-slate-600" onClick={() => {
              const title = captionTitle.replace(/[\r\n]+/g, ' ').trim();
              if (!title) { showToast('Escribe un título para el objeto.', 'warning'); return; }
              const lines = [
                `${captionKind === 'table' ? 'Tabla' : captionKind === 'image' ? 'Imagen' : 'Figura'}: ${title}`,
                ...(captionDescription.trim() ? [`Descripción: ${captionDescription.replace(/[\r\n]+/g, ' ').trim()}`] : []),
                ...(captionSource.trim() ? [`Fuente: ${captionSource.replace(/[\r\n]+/g, ' ').trim()}`] : []),
              ];
              insertAtCursor(`\n${lines.join('\n')}\n\n`);
              setActiveTray('none');
            }}>Insertar rótulo</button>
            <span className="text-[11px] text-slate-400">Después, coloca la imagen o tabla debajo del rótulo. La vista previa y la exportación lo agrupan.</span>
          </div>
        </div>
      )}
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
              className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600 text-white font-mono text-[11px]"
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

      </>}
      </fieldset>
      {splitView !== 'preview' && activeTray === 'outline' && (
        <div className="px-3 py-2.5 bg-slate-900 border-b border-slate-800 space-y-2 text-xs max-h-56 overflow-y-auto" aria-label="Índice interno del informe">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
            <span className="font-semibold text-slate-100">Índice del informe</span>
            <div className="flex flex-wrap gap-2 text-slate-400 tabular-nums">
              <span>{docMetrics.words} pal.</span>
              <span>{docMetrics.readingMinutes} min lectura</span>
              <span>{docMetrics.codeBlocks} bloques código</span>
              <span>{docMetrics.mermaidBlocks} mermaid</span>
              <span>{docMetrics.redactedMarkers} redact</span>
            </div>
          </div>
          <div role="group" aria-label="Tipo de índice" className="flex flex-wrap gap-1">
            {([['headings', `Secciones (${outlineItems.length})`], ['table', `Tablas (${outlineObjects.filter((item) => item.kind === 'table').length})`], ['image', `Imágenes (${outlineObjects.filter((item) => item.kind === 'image').length})`]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={outlineKind === value} onClick={() => setOutlineKind(value)} className={`min-h-9 rounded-md px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${outlineKind === value ? 'bg-emerald-800 text-white' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}>{label}</button>)}
          </div>
          {outlineKind === 'headings' ? (outlineItems.length ? <ul>{outlineItems.map((h, i) => <li key={`${h.line}-${i}`} style={{ paddingLeft: `${(h.level - 1) * 12}px` }}><button type="button" onClick={() => jumpToLine(h.line)} className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><span className="shrink-0 font-mono text-slate-400">H{h.level}</span><span className="min-w-0 flex-1 truncate">{h.text}</span><span className="shrink-0 font-mono text-slate-400">L{h.line}</span></button></li>)}</ul> : <p className="text-slate-400">Agrega encabezados con # para navegar el informe.</p>) : (outlineObjects.some((item) => item.kind === outlineKind) ? <ul>{outlineObjects.filter((item) => item.kind === outlineKind).map((item, i) => <li key={`${item.line}-${i}`}><button type="button" onClick={() => jumpToLine(item.line)} className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"><span className="min-w-0 flex-1 truncate">{item.text}</span><span className="shrink-0 font-mono text-slate-400">L{item.line}</span></button></li>)}</ul> : <p className="text-slate-400">No se encontraron {outlineKind === 'table' ? 'tablas' : 'imágenes'} en el Markdown.</p>)}
        </div>
      )}

      <fieldset disabled={readOnly} className="contents">
      {splitView !== 'preview' && <>
      {activeTray === 'pentest_kit' && (
        <div className="px-3 py-2.5 bg-slate-900 border-b border-slate-800 space-y-2.5 text-xs max-h-72 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-100">Herramientas de seguridad</span>
            {kitFeedback && <span role="status" aria-live="polite" className="text-[11px] text-emerald-300">{kitFeedback}</span>}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleDefangSelection}
              className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 text-slate-100 flex items-center gap-1.5"
              title="Cambia el formato de enlaces e IP para evitar que se abran por accidente"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              Neutralizar enlaces e IP
            </button>
            <button
              type="button"
              onClick={handleAutoRedact}
              className="px-2.5 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-200 flex items-center gap-1.5"
              title="Oculta credenciales y claves detectadas en el informe"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Ocultar datos sensibles
            </button>
          </div>

          {/* Port list -> report table */}
          <div className="flex min-w-0 flex-col sm:flex-row gap-1.5">
            <input
              type="text"
              value={portSpec}
              onChange={(e) => setPortSpec(e.target.value)}
              maxLength={MAX_PORT_TABLE_INPUT_LENGTH}
              aria-label="Puertos y servicios"
              placeholder="Puerto/protocolo servicio [versión] [estado], separados por coma"
              className="w-full min-w-0 flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 text-[11px]"
            />
            <button
              type="button"
              onClick={handleInsertPortsTable}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 flex items-center gap-1 shrink-0"
            >
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              Crear tabla de puertos
            </button>
          </div>

          {/* Text conversion tools */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 pt-1 border-t border-slate-800">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-indigo-400" />
                  Transformar texto sin conexión
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
                    Codificar Base64
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
                    Leer Base64
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCodecError('');
                      setCodecOutput(encodeHex(codecInput));
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                  >
                    Codificar hexadecimal
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
                    Leer hexadecimal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        setCodecError('');
                        const jwt = decodeJwtOffline(codecInput);
                        setCodecOutput(`// HEADER\n${jwt.header}\n\n// PAYLOAD\n${jwt.payload}\n\n// SIGNATURE\n${jwt.signature}`);
                      } catch (err) {
                        setCodecError(err instanceof Error ? err.message : 'El formato del token no es válido.');
                      }
                    }}
                    className="px-1.5 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200"
                  >
                    Leer token
                  </button>
                </div>
              </div>
              <textarea
                rows={2}
                value={codecInput}
                maxLength={10000}
                onChange={(e) => setCodecInput(e.target.value)}
                aria-label="Texto que quieres transformar"
                placeholder="Pega aquí el texto o la cadena codificada"
                className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-slate-100 font-mono text-[11px]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Resultado ({codecError ? 'Error' : 'Sin conexión'})</span>
                {codecOutput && (
                  <button
                    type="button"
                    onClick={() => insertAtCursor(`\n\`\`\`json\n${codecOutput}\n\`\`\`\n`)}
                    className="px-2 py-0.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300"
                  >
                    Insertar en el informe
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
                Aplicar al informe
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
              Insertar en el informe
            </button>
          </div>
        </div>
      )}
      </>}
      </fieldset>

      {/* Editor + Live Preview Panes */}
      <div ref={workspaceRef} className={`flex-1 grid min-h-0 min-w-0 max-w-full ${sideBySide ? 'grid-cols-2' : 'grid-cols-1'} ${splitView === 'split' && !sideBySideAvailable ? 'overflow-y-auto' : ''}`}>
        {splitView !== 'preview' && (
          <div className={`flex min-w-0 flex-col min-h-[360px] ${splitView === 'split' && !sideBySideAvailable ? 'border-b border-slate-800' : sideBySide ? 'border-r border-slate-800' : ''}`}>
            <textarea
              ref={textareaRef}
              value={markdown}
              maxLength={MAX_REPORT_TEXT_LENGTH}
              readOnly={readOnly}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onSelect={(event) => captureEditorSession(event.currentTarget)}
              onScroll={(event) => captureEditorSession(event.currentTarget)}
              onBlur={(event) => captureEditorSession(event.currentTarget)}
              aria-label="Contenido Markdown del informe"
              lang="es"
              spellCheck={false}
              placeholder="Escribe el informe. Pega imágenes con Ctrl+V; Ctrl+S guarda; Ctrl+B/I/K aplica formato."
            className={`flex-1 w-full min-h-[280px] bg-slate-950 text-slate-100 font-mono text-base sm:text-sm leading-6 p-3.5 sm:p-4 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-300 ${readOnly ? 'cursor-text' : ''}`}
            />
            {assets.some((asset) => asset.mime_type.startsWith('image/') && markdown.includes(`asset://${asset.id}`) && assetObjectUrls[asset.id]) && (
              <div className="flex max-h-32 gap-3 overflow-auto border-t border-slate-800 bg-slate-900/60 p-2" aria-label="Imágenes incluidas en el informe">
                {assets.filter((asset) => asset.mime_type.startsWith('image/') && markdown.includes(`asset://${asset.id}`) && assetObjectUrls[asset.id]).map((asset) => (
                  <button type="button" key={asset.id} onClick={() => onInspectAsset?.(asset)} className="shrink-0 text-left text-xs text-slate-300" aria-label={`Abrir imagen ${asset.filename}`}>
                    <img src={assetObjectUrls[asset.id]} alt={asset.filename} className="h-20 max-w-40 rounded object-contain" />
                    <span className="block max-w-40 truncate">{asset.filename}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="px-3 py-1.5 bg-slate-900/60 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 tabular-nums">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                {docMetrics.lines} líneas · {docMetrics.words} palabras · {docMetrics.readingMinutes} min · {docMetrics.codeBlocks} bloques de código
              </span>
              <span className="hidden truncate sm:inline" title="Ctrl+S guardar · Ctrl+V pegar imágenes · {{redact:...}} ocultar texto">
                Ctrl+S guardar · Ctrl+V pegar imagen · {'{{redact:...}}'}
              </span>
            </div>
          </div>
        )}

        {splitView !== 'edit' && (
          <div className="min-w-0 max-w-full overflow-y-auto min-h-[360px] p-4 sm:p-5 bg-slate-900/30">
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
