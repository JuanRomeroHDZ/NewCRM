Voy a fijar los controles del PDF fuera del área de desplazamiento.




Ran commands
cat DESIGN.md >/dev/null; grep -nE 'ReportPdfPreview|overflow-y-auto|previewToolbar' frontend/src/components/reports/ReportsDocumentsView.tsx; sed -n '120,132p;156,173p;212,275p' frontend/src/components/reports/ReportPdfPreview.tsx
Shell
$cat DESIGN.md >/dev/null; grep -nE 'ReportPdfPreview|overflow-y-auto|previewToolbar' frontend/src/components/reports/ReportsDocumentsView.tsx; sed -n '120,132p;156,173p;212,275p' frontend/src/components/reports/ReportPdfPreview.tsx


71:const ReportPdfPreview = lazy(() => import('./ReportPdfPreview'));
158:  const [previewToolbar, setPreviewToolbar] = useState<HTMLDivElement | null>(null);
888:          <div className="flex-1 overflow-y-auto divide-y divide-obsidian-border">
1046:                  <div id="report-actions" className="absolute right-0 top-full z-30 mt-2 max-h-[min(60dvh,24rem)] w-60 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-obsidian-borderLight bg-obsidian-panel p-1 shadow-lg">
1080:              className="max-h-[90dvh] w-full max-w-[26rem] overflow-y-auto rounded-xl border border-obsidian-border bg-obsidian-panel p-4 sm:p-5">
1450:                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
1458:                          {previewToolbar && <ReportPdfPreview blob={formatPreview.value} toolbar={previewToolbar} />}
  );
}

export default function ReportPdfPreview({ blob, toolbar }: { blob: Blob; toolbar: HTMLElement }) {
  const pages = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const position = useRef(0);
  const [jump, setJump] = useState<{ number: number; offset: number } | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [layout, setLayout] = useState<Layout>('single');
  const [page, setPage] = useState(1);
    return () => {
      disposed = true;
      position.current += 1;
      void loading?.destroy().catch(() => undefined);
    };
  }, [blob]);

  useEffect(() => {
    if (!jump || !pages.current) return;
    const pageElement = pages.current.querySelector(`[data-pdf-page="${jump.number}"]`);
    const scroller = pages.current.closest('.overflow-y-auto');
    if (pageElement && scroller) {
      const bounds = pageElement.getBoundingClientRect();
      scroller.scrollTo({ top: scroller.scrollTop + bounds.top - scroller.getBoundingClientRect().top
        + bounds.height * jump.offset - (controls.current?.offsetHeight ?? 0) - 12, behavior: 'instant' });
    }
  }, [jump]);

    : Array.from({ length: shown }, (_, i) => start + i);

  return (
    <div className="space-y-3">
      {createPortal(
        <>
          <select aria-label="Disposición del PDF" className="report-form-control report-preview-select" value={layout}
            onChange={(event) => setLayout(event.target.value as Layout)}>
            <option value="single">Una página</option>
            <option value="spread">Dos páginas</option>
            <option value="grid">Cuatro páginas</option>
            <option value="continuous">Todas las páginas</option>
          </select>
          {outline.length > 0 && <button type="button" className="ui-action-icon ml-auto"
            aria-label="Índice" title="Índice" aria-expanded={showOutline}
            onClick={() => setShowOutline(!showOutline)}><BookOpen className="size-4" aria-hidden="true" /></button>}
        </>,
        toolbar,
      )}
      <div ref={controls} className="sticky left-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-obsidian-border bg-obsidian-bg pb-2">
        <button type="button" className="ui-action-icon" disabled={start <= 1}
          onClick={() => move(Math.max(1, start - step))} aria-label="Página anterior"><ChevronLeft className="size-4" aria-hidden="true" /></button>
        <span className="text-xs tabular-nums text-obsidian-muted" role="status">
          {layout === 'continuous' ? `${count} páginas` : `Página ${start}${shown > 1 ? `–${start + shown - 1}` : ''} de ${count}`}
        </span>
        <button type="button" className="ui-action-icon" disabled={start + step > count}
          onClick={() => move(start + step)} aria-label="Página siguiente"><ChevronRight className="size-4" aria-hidden="true" /></button>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Zoom del PDF">
          <button type="button" className="ui-action-icon" disabled={zoom <= 50}
            onClick={() => setZoom(zoom - 25)} aria-label="Alejar"><Minus className="size-4" aria-hidden="true" /></button>
          <button type="button" className="ui-action-secondary tabular-nums" title="Restablecer zoom"
            aria-label={`Zoom ${zoom} %, restablecer a 100 %`} onClick={() => setZoom(100)}>{zoom} %</button>
          <button type="button" className="ui-action-icon" disabled={zoom >= 200}
            onClick={() => setZoom(zoom + 25)} aria-label="Acercar"><Plus className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
      {showOutline && <nav aria-label="Índice del PDF" className="max-h-64 overflow-auto border-b border-obsidian-border pb-2">
        <PdfOutline items={outline} navigate={navigate} />
      </nav>}
      {navigationError && <p role="status" className="text-xs text-obsidian-muted">Este enlace no apunta a una página disponible.</p>}
      <div className="report-pdf-layout">
        <div ref={pages} className={step > 1 ? 'report-pdf-spread grid grid-cols-1 items-start gap-3' : 'space-y-4'} style={{ width: `${zoom}%`, marginInline: zoom <= 100 ? 'auto' : undefined }}>
          {numbers.map((number) => <PdfPage key={number} pdf={pdf} number={number} eager={layout !== 'continuous'} zoom={zoom} navigate={navigate} />)}
        </div>
      </div>
    </div>
  );
}






Success





sed -n '1428,1476p' frontend/src/components/reports/ReportsDocumentsView.tsx; head -35 DESIGN.md
Shell
$sed -n '1428,1476p' frontend/src/components/reports/ReportsDocumentsView.tsx; head -35 DESIGN.md


                    label="Código fuente Typst"
                    onChange={(value) => {
                      setSourceDraft(value);
                    }}
                    onPasteImages={handleImageFiles}
                  />
              </div>

              {paneMode !== 'edit' && (
                <div className="flex min-w-0 flex-1 flex-col bg-obsidian-bg">
                  <div ref={setPreviewToolbar} className="flex flex-wrap items-center gap-2 border-b border-obsidian-border px-3 py-1.5 text-xs text-obsidian-muted">
                    <span>
                      Vista previa
                    </span>
                    <select aria-label="Formato de vista previa" className="report-form-control report-preview-select" value={previewFormat}
                      onChange={(event) => setPreviewFormat(event.target.value as typeof previewFormat)}>
                      <option value="svg">SVG</option>
                      <option value="pdf">PDF</option>
                      <option value="html" title="Formato experimental de Typst">HTML</option>
                    </select>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                    {previewFormat !== 'svg' ? (
                      !formatPreview || formatPreview.error ? (
                        <p role={formatPreview?.error ? 'alert' : 'status'} className="text-sm text-obsidian-muted">
                          {typeof formatPreview?.value === 'string' ? formatPreview.value : 'Preparando vista previa…'}
                        </p>
                      ) : formatPreview.value instanceof Blob ? (
                        <Suspense fallback={<p role="status" className="text-sm text-obsidian-muted">Cargando visor PDF…</p>}>
                          {previewToolbar && <ReportPdfPreview blob={formatPreview.value} toolbar={previewToolbar} />}
                        </Suspense>
                      ) : (
                        <iframe title="Vista previa HTML" sandbox="" referrerPolicy="no-referrer"
                          srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'">${formatPreview.value}`}
                          className="h-full min-h-96 w-full border-0 bg-white" />
                      )
                    ) : previewPages.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm text-obsidian-muted">
                        {isCompiling ? 'Compilando vista previa…' : 'Sin páginas renderizadas.'}
                      </div>
                    ) : (
                      previewImages.map((src, idx) => (
                        <img
                          key={idx}
                          src={src}
                          alt={`Página ${idx + 1} del documento`}
                          loading={idx === 0 ? 'eager' : 'lazy'}
                          decoding="async"
# LESSSO Design System

This document records the web interface rules for LESSSO. Existing screens may still contain visual drift; when changing them, bring them into line with these rules.

## Visual foundation

The product uses a dark interface with an adjustable teal brand accent. Keep the main shell, navigation, forms, tables, dialogs, and status surfaces within the shared palette.

| Token | Value | Use |
|---|---|---|
| `obsidian.bg` | `#080A0A` | App canvas and page background |
| `obsidian.panel` / `obsidian.card` | `#101313` | One section surface where a boundary improves grouping |
| `obsidian.surface` | `#171B1A` | Form controls and small inset elements, never another card |
| `obsidian.border` | `#252B29` | Subtle dividers and boundaries |
| `obsidian.borderLight` | `#39413F` | Stronger hover or secondary boundaries |
| `obsidian.muted` | `#B3B9BC` | Supporting text and labels |
| `obsidian.text` | `#FFFFFF` | Primary text |
| `obsidian.accent` | `var(--brand-accent, #0F766E)` | User-configured brand emphasis |

Use semantic state colors consistently: emerald for success/ready, amber for warning or unknown, and red for destructive/error states. State must remain understandable without color alone.

## Typography

- **Poppins** is the interface sans serif and body font.
- **Lora** is used for headings and the `.font-heading` role.
- **JetBrains Mono** is used for technical values, identifiers, addresses, and code.

Keep labels, helper text, and values at their existing hierarchy. Prefer readable labels over very small uppercase copy, especially for critical or operational state.

## Shell and layout

- Use the shared `MainLayout`, `Sidebar`, `Topbar`, and `SectionRenderer` shell rather than creating a separate page frame.
- Preserve business/personal CRM scope as distinct from C2's active authorized engagement. Show the scope relevant to the current task and label it clearly.
- Keep content containers shrinkable (`min-w-0` / `min-h-0` where needed), allow long identifiers to wrap, and use responsive grids instead of fixed page widths.
- On narrow layouts, use the existing mobile navigation drawer and keep controls reachable without horizontal scrolling.






Success





python3 - <<'PY'
from pathlib import Path
root = Path('frontend/src/components/reports')
p = root / 'ReportsDocumentsView.tsx'
s = p.read_text().replace('  const [previewToolbar,', '  const [pdfControls, setPdfControls] = useState<HTMLDivElement | null>(null);\n  const [previewToolbar,')
s = s.replace('                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">', '                  <div ref={setPdfControls} className="shrink-0 empty:hidden" />\n                  <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">')
s = s.replace('{previewToolbar && <ReportPdfPreview blob={formatPreview.value} toolbar={previewToolbar} />}', '{previewToolbar && pdfControls && (\n                            <ReportPdfPreview blob={formatPreview.value} toolbar={previewToolbar} controls={pdfControls} />\n                          )}')
p.write_text(s)
p = root / 'ReportPdfPreview.tsx'
s = p.read_text().replace('({ blob, toolbar }: { blob: Blob; toolbar: HTMLElement })', '({ blob, toolbar, controls }: { blob: Blob; toolbar: HTMLElement; controls: HTMLElement })').replace('  const controls = useRef<HTMLDivElement>(null);\n','').replace(' - (controls.current?.offsetHeight ?? 0)', '')
s = s.replace('      <div ref={controls} className="sticky left-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-obsidian-border bg-obsidian-bg pb-2">', '      {createPortal(\n        <div className="flex flex-wrap items-center gap-2 border-b border-obsidian-border px-3 py-1.5">')
a = s.index('        <button type="button" className="ui-action-icon" disabled={start <= 1}')
b = s.index('      {showOutline', a)
body = s[a:b].removesuffix('      </div>\n')
s = s[:a] + ''.join('  ' + line for line in body.splitlines(keepends=True)) + '        </div>,\n        controls,\n      )}\n' + s[b:]
p.write_text(s)
PY
git diff --check && cd frontend && ./node_modules/.bin/tsc --noEmit
Shell
$python3 - <<'PY'
from pathlib import Path
root = Path('frontend/src/components/reports')
p = root / 'ReportsDocumentsView.tsx'
s = p.read_text().replace('  const [previewToolbar,', '  const [pdfControls, setPdfControls] = useState<HTMLDivElement | null>(null);\n  const [previewToolbar,')
s = s.replace('                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">', '                  <div ref={setPdfControls} className="shrink-0 empty:hidden" />\n                  <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">')
s = s.replace('{previewToolbar && <ReportPdfPreview blob={formatPreview.value} toolbar={previewToolbar} />}', '{previewToolbar && pdfControls && (\n                            <ReportPdfPreview blob={formatPreview.value} toolbar={previewToolbar} controls={pdfControls} />\n                          )}')
p.write_text(s)
p = root / 'ReportPdfPreview.tsx'
s = p.read_text().replace('({ blob, toolbar }: { blob: Blob; toolbar: HTMLElement })', '({ blob, toolbar, controls }: { blob: Blob; toolbar: HTMLElement; controls: HTMLElement })').replace('  const controls = useRef<HTMLDivElement>(null);\n','"''"').replace(' - (controls.current?.offsetHeight ?? 0)', '"''"')
s = s.replace('      <div ref={controls} className="sticky left-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-obsidian-border bg-obsidian-bg pb-2">', '      {createPortal(\n        <div className="flex flex-wrap items-center gap-2 border-b border-obsidian-border px-3 py-1.5">')
a = s.index('        <button type="button" className="ui-action-icon" disabled={start <= 1}')
b = s.index('      {showOutline', a)
body = s[a:b].removesuffix('      </div>\n')
s = s[:a] + '"''"'.join('  ' + line for line in body.splitlines(keepends=True)) + '        </div>,\n        controls,\n      )}\n' + s[b:]
p.write_text(s)
PY
git diff --check && cd frontend && ./node_modules/.bin/tsc --noEmit


No output





Success











You've hit your usage limit. Upgrade your plan or add credits to continue, or try again at 5:21 AM.
