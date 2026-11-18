import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

const UNDERLINE_TONES = [
  { label: 'Neutro', color: '#B3B9BC' },
  { label: 'Positivo', color: '#34D399' },
  { label: 'Advertencia', color: '#FBBF24' },
  { label: 'Riesgo', color: '#FB7185' },
] as const;

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
  onOpenWorkbench?: (tab: 'evidence' | 'progress' | 'snippets' | 'publish') => void;
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
  onOpenWorkbench,
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
  const [labelColor, setLabelColor] = useState('neutro');
  const [labelSize, setLabelSize] = useState('normal');
  const [underlineColor, setUnderlineColor] = useState<string>(UNDERLINE_TONES[0].color);
  const [captionKind, setCaptionKind] = useState<'figure' | 'image' | 'table'>('figure');
  const [captionTitle, setCaptionTitle] = useState('');
  const [captionDescription, setCaptionDescription] = useState('');
  const [captionSource, setCaptionSource] = useState('');
  const [kitFeedback, setKitFeedback] = useState('');
  const [splitView, setSplitView] = useState<'split' | 'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const readingPosition = useRef<{ edit?: number; preview?: number }>({});
  const [caretLine, setCaretLine] = useState(1);
  const [previewHeadingIndex, setPreviewHeadingIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [sideBySideAvailable, setSideBySideAvailable] = useState(false);
  const editorSessionRestoredRef = useRef(false);

  const rememberScroll = (pane: 'edit' | 'preview', element: HTMLElement) => {
    const range = element.scrollHeight - element.clientHeight;
    readingPosition.current[pane] = range > 0 ? element.scrollTop / range : undefined;
  };

  const captureEditorSession = (textarea: HTMLTextAreaElement) => {
    rememberScroll('edit', textarea);
    onEditorSessionChange?.({
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      scrollTop: textarea.scrollTop,
    });
  };

  useLayoutEffect(() => {
    const positions = readingPosition.current;
    const panes = { edit: textareaRef.current, preview: previewRef.current };
    for (const pane of ['edit', 'preview'] as const) {
      const element = panes[pane];
      const fraction = positions[pane] ?? positions[pane === 'edit' ? 'preview' : 'edit'];
      if (element && fraction !== undefined) element.scrollTop = fraction * (element.scrollHeight - element.clientHeight);
    }
  }, [splitView, sideBySideAvailable]);

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
  const activeHeadingLine = splitView === 'preview' ? outlineItems[previewHeadingIndex]?.line :
    [...outlineItems].reverse().find(heading => heading.line <= caretLine)?.line;
  const handlePreviewScroll = (element: HTMLDivElement) => {
    rememberScroll('preview', element);
    if (activeTray !== 'outline') return;
    const top = element.getBoundingClientRect().top + 32;
    const headings = Array.from(element.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const next = headings.findIndex(heading => heading.getBoundingClientRect().top > top);
    setPreviewHeadingIndex(next < 0 ? Math.max(0, headings.length - 1) : Math.max(0, next - 1));
  };
  useEffect(() => {
    if (activeTray === 'outline' && splitView === 'preview' && previewRef.current) handlePreviewScroll(previewRef.current);
  }, [activeTray, splitView]);
  const showGroup = (group: Exclude<ToolGroupFilter, 'all'>) => toolFilter === 'all' || toolFilter === group;
  const toggleTray = (tray: InlineTray) => setActiveTray((prev) => (prev === tray ? 'none' : tray));

  const jumpToLine = (lineNum: number) => {
    if (splitView === 'preview') {
      const headingIndex = outlineItems.findIndex(heading => heading.line === lineNum);
      const heading = previewRef.current?.querySelectorAll('h1,h2,h3,h4,h5,h6')[headingIndex];
      heading?.scrollIntoView({ block: 'start' });
      if (heading) setPreviewHeadingIndex(headingIndex);
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const lines = markdown.split('\n');
    const idx = Math.max(0, Math.min(lines.length - 1, lineNum - 1));
    let charPos = 0;
    for (let i = 0; i < idx; i += 1) charPos += lines[i].length + 1;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(charPos, charPos + (lines[idx]?.length || 0));
      setCaretLine(idx + 1);
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
  const positionToolbarPopover = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const details = event.currentTarget;
    const popover = details.querySelector<HTMLElement>('[data-writeup-toolbar-popover]');
    const summary = details.querySelector('summary');
    if (!popover || !summary || !details.open) return;

    const anchor = summary.getBoundingClientRect();
    const bounds = popover.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8));
    const below = anchor.bottom + bounds.height + 8 <= window.innerHeight;
    const top = below ? anchor.bottom + 4 : Math.max(8, anchor.top - bounds.height - 4);
    Object.assign(popover.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
  };

  return (
    <div onKeyDownCapture={handleWorkspaceKeyDown} className="writeup-markdown-editor writeup-editor-container flex min-w-0 max-w-full flex-col h-full min-h-[300px] bg-obsidian-surface border border-obsidian-border rounded-xl overflow-visible">
      {/* Keep view controls reachable while the editing tools use a scrollable row. */}
      <div className="relative z-20 flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-obsidian-border bg-obsidian-panel/95 px-2 py-1"
        onFocusCapture={(event) => {
          if (!(event.target instanceof HTMLElement) || event.target.closest('[data-writeup-toolbar-popover]')) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const focus = event.target.getBoundingClientRect();
          if (focus.left < bounds.left || focus.right > bounds.right) event.currentTarget.scrollBy({ left: focus.left < bounds.left ? focus.left - bounds.left - 8 : focus.right - bounds.right + 8 });
        }}
        onScroll={(event) => event.currentTarget.querySelectorAll('details[open]').forEach((menu) => menu.removeAttribute('open'))}>
        <fieldset disabled={readOnly} className="contents">
        {splitView !== 'preview' && <label className="relative inline-flex shrink-0 items-center">
            <span className="sr-only">Categoría de herramientas</span>
            <select value={toolFilter} onChange={(event) => setToolFilter(event.target.value as ToolGroupFilter)} title={toolFilter === 'all' ? 'Todas las herramientas' : undefined} className="min-h-[44px] w-28 appearance-none rounded-lg border border-obsidian-borderLight bg-obsidian-surface pl-2 pr-6 text-xs text-obsidian-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
              <option value="text">Texto</option><option value="blocks">Bloques</option><option value="media">Multimedia</option><option value="pentest">Seguridad</option><option value="all">Todas</option>
            </select>
          </label>}
        {/* [Estado seleccionable] Herramientas de formato agrupadas por función. */}
        {splitView !== 'preview' && <div role="region" tabIndex={0} className="flex shrink-0 items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent" aria-label={toolFilter === 'all' ? 'Todas las herramientas de edición, organizadas por grupo' : 'Herramientas de edición; desplázate horizontalmente para ver más'}>
        {showGroup('text') && (
          <div className={`flex min-w-0 max-w-full items-center gap-0.5 pr-1.5 border-r border-obsidian-border shrink-0 flex-nowrap`}>
            <details className="relative shrink-0" onToggle={positionToolbarPopover} onClick={(event) => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false; }}>
              <summary data-caret="manual" aria-label="Encabezados" title="Encabezados" className="ui-action-toggle cursor-pointer list-none px-1 [&::-webkit-details-marker]:hidden"><Heading1 className="h-4 w-4" /><ChevronDown className="h-3 w-3" aria-hidden="true" /></summary>
              <div data-writeup-toolbar-popover className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-obsidian-borderLight bg-obsidian-panel p-1 shadow-xl">
            <button type="button" onClick={() => prefixLineAtCursor('# ')} title="Título H1" aria-label="Título H1" className="ui-action-icon">
              <Heading1 className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('## ')} title="Subtítulo H2" aria-label="Subtítulo H2" className="ui-action-icon">
              <Heading2 className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('### ')} title="Sección H3" aria-label="Sección H3" className="ui-action-icon">
              <Heading3 className="w-4 h-4" />
            </button>
            {[4, 5, 6].map((level) => <button key={level} type="button" onClick={() => prefixLineAtCursor(`${'#'.repeat(level)} `)} title={`Encabezado H${level}`} aria-label={`Encabezado H${level}`} className="ui-action-icon">H{level}</button>)}
              </div>
            </details>
            <button type="button" onClick={() => toggleTray('label')} aria-label="Insertar etiqueta semántica" aria-expanded={activeTray === 'label'} aria-pressed={activeTray === 'label'} title="Etiqueta semántica" className="ui-action-toggle"><Tag className="h-4 w-4" /><ChevronDown className="h-3 w-3" aria-hidden="true" /></button>
            <details className="relative shrink-0" onToggle={positionToolbarPopover} onClick={(event) => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false; }}>
              <summary data-caret="manual" aria-label="Formato de texto" title="Formato de texto" className="ui-action-toggle cursor-pointer list-none px-1 [&::-webkit-details-marker]:hidden"><Bold className="h-4 w-4" /><ChevronDown className="h-3 w-3" aria-hidden="true" /></summary>
              <div data-writeup-toolbar-popover className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded-lg border border-obsidian-borderLight bg-obsidian-panel p-1 shadow-xl">
            <button type="button" onClick={() => insertAtCursor('**', true, '**', 'negrita')} title="Negrita" aria-label="Negrita" className="ui-action-icon">
              <Bold className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor('*', true, '*', 'cursiva')} title="Cursiva" aria-label="Cursiva" className="ui-action-icon">
              <Italic className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor('~~', true, '~~', 'tachado')} title="Tachado" aria-label="Tachado" className="ui-action-icon">
              <Strikethrough className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => insertAtCursor(createColoredUnderlineOpeningTag(underlineColor), true, '</u>', 'subrayado')} title="Subrayar con color" aria-label="Subrayar texto con el color elegido" className="ui-action-icon">
              <Underline className="w-4 h-4" />
            </button>
            <label title="Énfasis semántico del subrayado" className="sr-only" htmlFor="writeup-underline-tone">Énfasis del subrayado</label>
            <select id="writeup-underline-tone" aria-label="Énfasis del subrayado" value={underlineColor} onChange={(event) => setUnderlineColor(event.target.value)} className="min-h-11 max-w-32 rounded border border-obsidian-borderLight bg-obsidian-surface px-2 text-xs text-obsidian-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
              {UNDERLINE_TONES.map((tone) => <option key={tone.color} value={tone.color}>{tone.label}</option>)}
            </select>
              </div>
            </details>
            <button type="button" onClick={() => insertAtCursor('[', true, '](https://)', 'texto_enlace')} title="Enlace en el informe" aria-label="Enlace" className="ui-action-icon">
              <Link className="w-4 h-4" />
            </button>
            <details className="relative shrink-0" onToggle={positionToolbarPopover} onClick={(event) => { if ((event.target as HTMLElement).closest('button')) event.currentTarget.open = false; }}>
              <summary data-caret="manual" aria-label="Estilos de lista" title="Estilos de lista" className="ui-action-toggle cursor-pointer list-none px-1 [&::-webkit-details-marker]:hidden"><List className="h-4 w-4" aria-hidden="true" /><ChevronDown className="h-3 w-3" aria-hidden="true" /></summary>
              <div data-writeup-toolbar-popover className="absolute left-0 top-full z-50 mt-1 grid max-h-[min(70dvh,32rem)] w-56 grid-cols-1 overflow-y-auto rounded-lg border border-obsidian-borderLight bg-obsidian-panel p-1 shadow-xl">
                {/* [Menú y selector] Los estilos básicos y las variantes HTML se distinguen sin bordes de selección. */}
                {([
                  { group: 'Markdown', items: [['bullet', 'Viñetas'], ['ordered', 'Numerada'], ['task', 'Tareas pendientes'], ['done', 'Tareas completadas'], ['nested-bullet', 'Viñetas anidadas'], ['nested-ordered', 'Numeración anidada']] },
                  { group: 'Variantes HTML', items: [['square', 'Viñeta cuadrada'], ['circle', 'Viñeta abierta'], ['alpha', 'Alfabética (a, b, c)'], ['alpha-upper', 'Alfabética (A, B, C)'], ['roman', 'Romana (i, ii, iii)'], ['roman-upper', 'Romana (I, II, III)']] },
                ] as const).map(({ group, items }) => <div key={group} role="group" aria-label={group} className="border-b border-obsidian-border last:border-b-0">
                  <div className="px-3 pt-2 text-xs text-obsidian-muted">{group}</div>
                  {items.map(([style, label]) => <button key={style} type="button" aria-label={label} onClick={() => applyListStyle(style)} className="ui-menu-item justify-start text-left"><span aria-hidden="true" className="flex w-4 shrink-0 items-center justify-center font-mono text-obsidian-muted">{style === 'task' ? <Square className="h-3.5 w-3.5" /> : style === 'done' ? <CheckSquare className="h-3.5 w-3.5" /> : style === 'square' ? <Square className="h-3 w-3" /> : style === 'circle' || style === 'nested-bullet' ? <Circle className="h-3 w-3" /> : style === 'ordered' || style === 'nested-ordered' ? '1.' : style === 'alpha' ? 'a.' : style === 'alpha-upper' ? 'A.' : style === 'roman' ? 'i.' : style === 'roman-upper' ? 'I.' : '•'}</span>{label}</button>)}
                </div>)}
              </div>
            </details>
          </div>
        )}

        {showGroup('blocks') && (
          <div className={`flex min-w-0 max-w-full items-center gap-0.5 pr-1.5 border-r border-obsidian-border shrink-0 flex-nowrap`}>
            <button type="button" onClick={() => insertAtCursor('`', true, '`', 'codigo')} title="Código en línea" aria-label="Código en línea" className="ui-action-icon">
              <Code className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('code')}
              title="Insertar bloque de código con lenguaje"
              aria-label="Insertar bloque de código con lenguaje"
              aria-pressed={activeTray === 'code'} className="ui-action-toggle"
            >
              <Code2 className="w-4 h-4 text-obsidian-muted" />
              <span className="hidden sm:inline">Código</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            <button type="button" onClick={() => prefixLineAtCursor('> ')} title="Cita" aria-label="Cita" className="ui-action-icon">
              <Quote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('table')}
              title="Insertar tabla"
              aria-label="Tabla"
              aria-expanded={activeTray === 'table'}
              aria-pressed={activeTray === 'table'}
              className="ui-action-toggle"
            >
              <Table className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('caption')}
              aria-label="Añadir título, descripción y fuente a una figura o tabla"
              aria-expanded={activeTray === 'caption'}
              title="Rótulo para figura, imagen o tabla"
              aria-pressed={activeTray === 'caption'} className="ui-action-toggle"
            >
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Rótulo</span>
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n> [!WARNING]\n> Riesgo relevante detectado.\n')}
              title="Insertar Callout de advertencia"
              aria-label="Insertar llamada de advertencia"
              className="ui-action-secondary"
            >
              [!]
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n<details>\n<summary>Evidencia extendida</summary>\n\nDetalle técnico aquí\n\n</details>\n')}
              title="Sección colapsable"
              aria-label="Insertar sección colapsable"
              className="ui-action-secondary"
            >
              ▸ Detalle
            </button>
            <button type="button" onClick={() => insertAtCursor('\n---\n')} title="Separador horizontal" aria-label="Separador" className="ui-action-icon">
              <Minus className="w-4 h-4" />
            </button>
          </div>
        )}

        {showGroup('media') && (
          <div className={`flex min-w-0 max-w-full items-center gap-1 pr-1.5 border-r border-obsidian-border shrink-0 flex-nowrap`}>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="ui-action-secondary"
              title="Subir Imagen, GIF animado o Video (MP4/WebM)"
              aria-label="Subir imagen o video"
            >
              <ImagePlus className="w-4 h-4 text-obsidian-muted" />
              <span>{uploading ? 'Procesando…' : 'Media'}</span>
            </button>
            <label
              className="flex items-center gap-1 text-[11px] text-obsidian-muted px-1.5 cursor-pointer select-none"
              title="Si subes un video MP4/WebM, conviértelo automáticamente a GIF animado optimizado"
            >
              <input
                type="checkbox"
                checked={convertVideoToGif}
                onChange={(e) => setConvertVideoToGif(e.target.checked)}
                className="peer sr-only"
              />
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-500 bg-obsidian-surface text-transparent peer-checked:border-obsidian-accent peer-checked:bg-obsidian-accent peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-obsidian-accent" aria-hidden="true"><Check className="h-3 w-3" /></span>
              <span>Video→GIF</span>
            </label>
            <button
              type="button"
              onClick={() => toggleTray('mermaid')}
              aria-pressed={activeTray === 'mermaid'} className="ui-action-toggle"
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
              className="ui-action-secondary"
              title="Insertar una animación HTML/CSS independiente"
              aria-label="Insertar animación HTML"
            >
              <Film className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">HTML Anim</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Seleccionar imagen o video para el informe"
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
          <div className={`flex min-w-0 max-w-full items-center gap-1 shrink-0 flex-nowrap`}>
            <button
              type="button"
              onClick={handleCiteSelection}
              className="ui-action-secondary"
              title="Citar selección en la pizarra"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Citar</span>
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('{{redact:', true, '}}', 'dato_sensible')}
              className="ui-action-secondary"
              title="Censurar selección para cliente"
              aria-label="Censurar selección para cliente"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Censurar</span>
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor(` {#anchor-${Date.now().toString(36)}}`)}
              className="ui-action-secondary"
              title="Insertar ancla {#id}"
              aria-label="Ancla"
            >
              <Anchor className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleTray('cvss')}
              aria-pressed={activeTray === 'cvss'} className="ui-action-toggle"
              title="Calculadora CVSS 3.1"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>CVSS</span>
            </button>
            <button
              type="button"
              onClick={() => toggleTray('pentest_kit')}
              aria-pressed={activeTray === 'pentest_kit'} className="ui-action-toggle"
              title="Herramientas de seguridad: neutralizar enlaces e IP, ocultar secretos, transformar texto y crear tablas de puertos"
            >
              <Binary className="w-3.5 h-3.5" />
              <span>Herramientas</span>
            </button>
            <button
              type="button"
              onClick={() => toggleTray('templates')}
              aria-pressed={activeTray === 'templates'} className="ui-action-toggle"
              title="Plantillas de informe y diagramas"
            >
              <span>Plantillas</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        )}
        </div>}
        </fieldset>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => toggleTray('outline')} aria-label="Índice del informe" aria-expanded={activeTray === 'outline'} title="Índice del informe" aria-pressed={activeTray === 'outline'} className="ui-action-toggle"><ListTree className="h-4 w-4" aria-hidden="true" /></button>
          <button
            type="button"
            onClick={() => setRedactPreview((v) => !v)}
            aria-pressed={redactPreview}
            aria-label={redactPreview ? 'Mostrar vista interna' : 'Mostrar vista para cliente'}
            className="ui-action-toggle writeup-toolbar-compact-button min-h-[44px] shrink-0 px-3"
            title={redactPreview
              ? 'Vista para cliente activa. Cambiar a vista interna.'
              : 'La vista para cliente oculta únicamente el texto marcado con {{redact:...}}; revisa el contenido antes de compartir.'}
          >
            {redactPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span className="sr-only">{redactPreview ? 'Vista para cliente' : 'Vista interna'}</span>
          </button>

          <div className="writeup-view-mode-group inline-flex shrink-0 items-center gap-1" role="group" aria-label="Vista del informe">
            {([
              { value: 'edit', label: 'Editar', Icon: PenLine },
              { value: 'split', label: 'Dos vistas', Icon: Columns2 },
              { value: 'preview', label: 'Vista previa', Icon: Eye },
            ] as const).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => { if (value === 'preview') setOutlineKind('headings'); setSplitView(value); }}
                aria-pressed={splitView === value}
                aria-label={`Vista del informe: ${label}`}
                title={label}
                className="ui-action-toggle writeup-view-mode-button min-h-[44px] shrink-0 px-2.5 text-xs"
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="writeup-view-mode-text">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <fieldset disabled={readOnly} className="contents">
      {splitView !== 'preview' && <>

      {/* Inline Collapsible Tool Trays (never clipped on narrow/medium screens!) */}
      {activeTray === 'label' && (
        <div className="flex flex-wrap items-end gap-3 border-t border-obsidian-border p-3 text-xs text-obsidian-text">
          <label className="flex flex-col gap-1">Énfasis
            <select value={labelColor} onChange={(event) => setLabelColor(event.target.value)} className="min-h-[44px] rounded border border-obsidian-borderLight bg-obsidian-surface px-3 text-sm text-white">
              <option value="neutro">Neutro</option><option value="jade">Positivo</option><option value="dorado">Advertencia</option><option value="rojo">Riesgo</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">Tamaño
            <select value={labelSize} onChange={(event) => setLabelSize(event.target.value)} className="min-h-[44px] rounded border border-obsidian-borderLight bg-obsidian-surface px-3 text-sm text-white">
              <option value="pequena">Pequeño</option><option value="normal">Normal</option><option value="grande">Grande</option>
            </select>
          </label>
          <button type="button" className="ui-action-primary" onClick={() => {
            const ta = textareaRef.current;
            const selected = ta?.value.slice(ta.selectionStart, ta.selectionEnd) || '';
            if (/[{}\n]/.test(selected) || selected.length > 120) { showToast('Selecciona texto de una sola línea, hasta 120 caracteres y sin llaves.', 'warning'); return; }
            insertAtCursor(`{etiqueta:${labelColor}:${labelSize}:`, true, '}', 'Texto');
            setActiveTray('none');
          }}>Insertar etiqueta</button>
          <span className="text-obsidian-muted">Selecciona texto antes de abrir la herramienta, o escribe después de insertarla.</span>
        </div>
      )}
      {activeTray === 'table' && (
        <div className="space-y-2 border-t border-obsidian-border p-3 text-xs text-obsidian-text">
          <p className="text-obsidian-muted">Escribe los encabezados y los datos; puedes completar las celdas después.</p>
          <div className="max-h-56 overflow-auto">
            <table className="border-collapse text-left"><tbody>
              {tableCells.map((row, rowIndex) => <tr key={rowIndex}>
                {row.map((cell, colIndex) => <td key={colIndex} className="border border-obsidian-borderLight p-0">
                  <input aria-label={`${rowIndex === 0 ? 'Encabezado' : `Fila ${rowIndex}`} columna ${colIndex + 1}`} value={cell} maxLength={300} onChange={(event) => {
                    const value = event.target.value;
                    setTableCells((current) => current.map ( (cells, i) => i === rowIndex ? cells.map((item, j) => j === colIndex ? value : item) : cells));
                  }} className={`min-h-[44px] w-36 bg-obsidian-surface px-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent ${rowIndex === 0 ? 'font-semibold' : ''}`} />
                </td>)}
              </tr>)}
            </tbody></table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={tableCells.length >= 21} onClick={() => setTableCells((current) => [...current, current[0].map(() => '')])} className="ui-action-secondary">Añadir fila</button>
            <button type="button" disabled={tableCells[0].length >= 10} onClick={() => setTableCells((current) => current.map((row) => [...row, '']))} className="ui-action-secondary">Añadir columna</button>
            <button type="button" disabled={tableCells.length <= 2} onClick={() => setTableCells((current) => current.slice(0, -1))} className="ui-action-secondary">Quitar última fila</button>
            <button type="button" disabled={tableCells[0].length <= 1} onClick={() => setTableCells((current) => current.map((row) => row.slice(0, -1)))} className="ui-action-secondary">Quitar última columna</button>
            <button type="button" className="ui-action-primary" onClick={() => {
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
        <div className="space-y-2 border-t border-obsidian-border bg-obsidian-panel/80 p-3 text-xs text-obsidian-text">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <label className="flex min-w-0 flex-col gap-1">Objeto
              <select value={captionKind} onChange={(event) => setCaptionKind(event.target.value as typeof captionKind)} className="min-h-[44px] rounded border border-obsidian-borderLight bg-obsidian-surface px-2 text-obsidian-text">
                <option value="figure">Figura</option><option value="image">Imagen</option><option value="table">Tabla</option>
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 sm:col-span-3">Título
              <input value={captionTitle} onChange={(event) => setCaptionTitle(event.target.value)} maxLength={240} placeholder="Relación entre…" className="min-h-[44px] rounded border border-obsidian-borderLight bg-obsidian-surface px-2 text-obsidian-text placeholder:text-obsidian-muted/70" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">Descripción (opcional)
              <input value={captionDescription} onChange={(event) => setCaptionDescription(event.target.value)} maxLength={500} placeholder="Qué muestra el objeto" className="min-h-[44px] rounded border border-obsidian-borderLight bg-obsidian-surface px-2 text-obsidian-text placeholder:text-obsidian-muted/70" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">Fuente (opcional)
              <input value={captionSource} onChange={(event) => setCaptionSource(event.target.value)} maxLength={500} placeholder="URL o Elaboración propia (2026)" className="min-h-[44px] rounded border border-obsidian-borderLight bg-obsidian-surface px-2 text-obsidian-text placeholder:text-obsidian-muted/70" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="ui-action-secondary" onClick={() => {
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
            <span className="text-[11px] text-obsidian-muted">Después, coloca la imagen o tabla debajo del rótulo. La vista previa y la exportación lo agrupan.</span>
          </div>
        </div>
      )}
      {activeTray === 'code' && (
        <div className="px-3 py-2 bg-obsidian-panel border-b border-obsidian-border flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-obsidian-muted text-[11px] mr-1">Lenguaje:</span>
          {CODE_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => {
                insertAtCursor(`\n\`\`\`${lang}\n// Tu código o PoC aquí\n\`\`\`\n`);
                setActiveTray('none');
              }}
              className="ui-action-primary font-mono"
            >
              {lang}
            </button>
          ))}
        </div>
      )}

      {activeTray === 'mermaid' && (
        <div className="px-3 py-2 bg-obsidian-panel border-b border-obsidian-border flex flex-wrap items-center gap-2 text-xs">
          {WRITEUP_TEMPLATES.filter((t) => t.id.startsWith('mermaid_')).map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                insertAtCursor(tpl.snippet);
                setActiveTray('none');
              }}
              className="ui-action-secondary text-left"
            >
              {tpl.label}
            </button>
          ))}
        </div>
      )}

      {activeTray === 'templates' && (
        <div className="px-3 py-2 bg-obsidian-panel border-b border-obsidian-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-xs max-h-80 overflow-y-auto">
          <div className="sm:col-span-2 lg:col-span-3 space-y-2 border-b border-obsidian-borderLight pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-obsidian-text">Plantillas del informe</h3><p className="text-obsidian-muted">Fragmentos guardados en la biblioteca aparecen en el Laboratorio.</p></div><button type="button" onClick={() => { setActiveTray('none'); onOpenWorkbench?.('snippets'); }} className="ui-action-secondary">Abrir biblioteca compartida</button></div>
          </div>
          {WRITEUP_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => {
                insertAtCursor(tpl.snippet);
                setActiveTray('none');
              }}
              className="ui-action-secondary text-left"
            >
              <div className="font-medium text-obsidian-text">{tpl.label}</div>
              <div className="text-[11px] text-obsidian-muted truncate">{tpl.description}</div>
            </button>
          ))}
        </div>
      )}

      </>}
      </fieldset>
      {activeTray === 'outline' && (
        <div className="px-3 py-2.5 bg-obsidian-panel border-b border-obsidian-border space-y-2 text-xs max-h-56 overflow-y-auto" aria-label="Índice interno del informe">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-obsidian-muted">
            <span className="font-semibold text-obsidian-text">Índice del informe</span>
            <div className="flex flex-wrap gap-2 text-obsidian-muted tabular-nums">
              <span>{docMetrics.words} pal.</span>
              <span>{docMetrics.readingMinutes} min lectura</span>
              <span>{docMetrics.codeBlocks} bloques código</span>
              <span>{docMetrics.mermaidBlocks} mermaid</span>
              <span>{docMetrics.redactedMarkers} redact</span>
            </div>
          </div>
          <div role="group" aria-label="Tipo de índice" className="flex flex-wrap gap-1">
            {([['headings', `Secciones (${outlineItems.length})`], ['table', `Tablas (${outlineObjects.filter((item) => item.kind === 'table').length})`], ['image', `Imágenes (${outlineObjects.filter((item) => item.kind === 'image').length})`]] as const).filter(([kind]) => splitView !== 'preview' || kind === 'headings').map(([value, label]) => <button key={value} type="button" aria-pressed={outlineKind === value} onClick={() => setOutlineKind(value)} className="ui-action-toggle px-2 text-xs">{label}</button>)}
          </div>
          {outlineKind === 'headings' ? (
            outlineItems.length ? <ul>
              {outlineItems.map((heading, index) => {
                const current = activeHeadingLine === heading.line;
                const label = redactPreview
                  ? heading.text.replace(/\{\{redact:.*?\}\}|\[\[redact:.*?\]\]/gi, '[Censurado]')
                  : heading.text;
                return <li key={`${heading.line}-${index}`} style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}>
                  <button type="button" onClick={() => jumpToLine(heading.line)} aria-current={current ? 'location' : undefined} className={`ui-menu-item w-full text-left ${current ? 'bg-obsidian-surface font-semibold' : ''}`}>
                    <span className="shrink-0 font-mono text-obsidian-muted">H{heading.level}</span>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className="shrink-0 font-mono text-obsidian-muted">L{heading.line}</span>
                  </button>
                </li>;
              })}
            </ul> : <p className="text-obsidian-muted">Agrega encabezados con # para navegar el informe.</p>
          ) : (
            outlineObjects.some(item => item.kind === outlineKind) ? <ul>
              {outlineObjects.filter(item => item.kind === outlineKind).map((item, index) => <li key={`${item.line}-${index}`}>
                <button type="button" onClick={() => jumpToLine(item.line)} className="ui-menu-item w-full text-left">
                  <span className="min-w-0 flex-1 truncate">{item.text}</span>
                  <span className="shrink-0 font-mono text-obsidian-muted">L{item.line}</span>
                </button>
              </li>)}
            </ul> : <p className="text-obsidian-muted">No se encontraron {outlineKind === 'table' ? 'tablas' : 'imágenes'} en el Markdown.</p>
          )}
        </div>
      )}

      <fieldset disabled={readOnly} className="contents">
      {splitView !== 'preview' && <>
      {activeTray === 'pentest_kit' && (
        <div className="px-3 py-2.5 bg-obsidian-panel border-b border-obsidian-border space-y-2.5 text-xs max-h-72 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-obsidian-text">Herramientas de seguridad</span>
            {kitFeedback && <span role="status" aria-live="polite" className="text-[11px] text-obsidian-accent">{kitFeedback}</span>}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleDefangSelection}
              className="ui-action-secondary"
              title="Cambia el formato de enlaces e IP para evitar que se abran por accidente"
            >
              <ShieldCheck className="w-4 h-4 text-obsidian-muted" />
              Neutralizar enlaces e IP
            </button>
            <button
              type="button"
              onClick={handleAutoRedact}
              className="ui-action-secondary"
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
              className="w-full min-w-0 flex-1 bg-obsidian-surface border border-obsidian-borderLight rounded px-2 py-1 text-obsidian-text text-[11px]"
            />
            <button
              type="button"
              onClick={handleInsertPortsTable}
              className="ui-action-secondary shrink-0"
            >
              <Server className="w-4 h-4 text-obsidian-muted" />
              Crear tabla de puertos
            </button>
          </div>

          {/* Text conversion tools */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 pt-1 border-t border-obsidian-border">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-obsidian-muted">
                <span className="flex items-center gap-1">
                  <KeyRound className="w-3 h-3 text-obsidian-accent" />
                  Transformar texto sin conexión
                </span>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCodecError('');
                      setCodecOutput(encodeBase64Utf8(codecInput));
                    }}
                    className="ui-action-secondary"
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
                    className="ui-action-secondary"
                  >
                    Leer Base64
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCodecError('');
                      setCodecOutput(encodeHex(codecInput));
                    }}
                    className="ui-action-secondary"
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
                    className="ui-action-secondary"
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
                    className="ui-action-secondary"
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
                className="w-full bg-obsidian-surface border border-obsidian-borderLight rounded p-1.5 text-obsidian-text font-mono text-[11px]"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-obsidian-muted">
                <span>Resultado ({codecError ? 'Error' : 'Sin conexión'})</span>
                {codecOutput && (
                  <button
                    type="button"
                    onClick={() => insertAtCursor(`\n\`\`\`json\n${codecOutput}\n\`\`\`\n`)}
                    className="ui-action-secondary"
                  >
                    Insertar en el informe
                  </button>
                )}
              </div>
              {codecError ? (
                <div className="border border-obsidian-border bg-rose-500/5 px-3 py-2 text-rose-200 text-[11px]">
                  {codecError}
                </div>
              ) : (
                <textarea
                  rows={2}
                  readOnly
                  aria-label="Resultado decodificado"
                  value={codecOutput}
                  placeholder="Salida decodificada o payload JSON..."
                  className="w-full bg-obsidian-surface/70 border border-obsidian-border rounded p-1.5 text-obsidian-text font-mono text-[11px]"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {activeTray === 'cvss' && (
        <div className="px-3 py-2.5 bg-obsidian-panel border-b border-obsidian-border space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-obsidian-text">Calculadora CVSS v3.1</span>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-obsidian-accent text-white font-bold tabular-nums">
                {cvssResult.score.toFixed(1)} ({cvssResult.severity.toUpperCase()})
              </span>
              <span className="font-mono text-[10px] text-obsidian-muted hidden md:inline">{cvssResult.vector}</span>
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
                <span className="text-[10px] text-obsidian-muted">{label}</span>
                <select
                  value={cvssInputs[key]}
                  onChange={(e) => setCvssInputs((p) => ({ ...p, [key]: e.target.value }))}
                  className="mt-0.5 w-full bg-obsidian-surface border border-obsidian-borderLight rounded px-1.5 py-1 text-obsidian-text"
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
                className="ui-action-primary"
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
              className="ui-action-secondary"
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
          <div className={`flex min-w-0 flex-col min-h-[360px] ${splitView === 'split' && !sideBySideAvailable ? 'border-b border-obsidian-border' : sideBySide ? 'border-r border-obsidian-border' : ''}`}>
            <textarea
              ref={textareaRef}
              value={markdown}
              maxLength={MAX_REPORT_TEXT_LENGTH}
              readOnly={readOnly}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onSelect={(event) => {
                captureEditorSession(event.currentTarget);
                setCaretLine(event.currentTarget.value.slice(0, event.currentTarget.selectionStart).split('\n').length);
              }}
              onScroll={(event) => captureEditorSession(event.currentTarget)}
              onBlur={(event) => captureEditorSession(event.currentTarget)}
              aria-label="Contenido Markdown del informe"
              lang="es"
              spellCheck={false}
              placeholder="Escribe el informe. Pega imágenes con Ctrl+V; Ctrl+S guarda; Ctrl+B/I/K aplica formato."
            className={`mx-auto flex-1 w-full max-w-[52rem] min-h-[280px] bg-obsidian-surface text-obsidian-text font-mono text-base sm:text-sm leading-6 p-3.5 sm:p-4 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-obsidian-accent ${readOnly ? 'cursor-text' : ''}`}
            />
            {assets.some((asset) => asset.mime_type.startsWith('image/') && markdown.includes(`asset://${asset.id}`) && assetObjectUrls[asset.id]) && (
              <div className="flex max-h-32 gap-3 overflow-auto border-t border-obsidian-border bg-obsidian-panel/60 p-2" aria-label="Imágenes incluidas en el informe">
                {assets.filter((asset) => asset.mime_type.startsWith('image/') && markdown.includes(`asset://${asset.id}`) && assetObjectUrls[asset.id]).map((asset) => (
                  <button type="button" key={asset.id} onClick={() => onInspectAsset?.(asset)} className="ui-action-secondary shrink-0 text-left" aria-label={`Abrir imagen ${asset.filename}`}>
                    <img src={assetObjectUrls[asset.id]} alt={asset.filename} className="h-20 max-w-40 rounded object-contain" />
                    <span className="block max-w-40 truncate">{asset.filename}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="px-3 py-1.5 bg-obsidian-panel/60 border-t border-obsidian-border text-[11px] text-obsidian-muted flex flex-wrap items-center justify-between gap-2 tabular-nums">
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
          <div ref={previewRef} onScroll={(event) => handlePreviewScroll(event.currentTarget)} className="min-w-0 max-w-full overflow-y-auto min-h-[360px] bg-obsidian-panel/30">
            <div className="mx-auto max-w-[52rem] p-4 sm:p-5">
            <MarkdownRichPreview
              markdown={markdown}
              redactPreview={redactPreview}
              boards={boards}
              assets={assets}
              assetObjectUrls={assetObjectUrls}
              onInspectAsset={onInspectAsset}
            />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
