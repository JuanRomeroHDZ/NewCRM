import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

type Destination = string | unknown[];
type OutlineItem = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number];
type PageLink = { destination?: Destination; url?: string; rect: [number, number, number, number] };
type Layout = 'single' | 'spread' | 'grid' | 'continuous';
const PAGES_PER_LAYOUT = { single: 1, spread: 2, grid: 4, continuous: 1 } as const;

const PdfPage = memo(function PdfPage({ pdf, number, eager, zoom, navigate }: {
  pdf: PDFDocumentProxy; number: number; eager: boolean; zoom: number; navigate: (destination: Destination) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [nearby, setNearby] = useState(eager);
  const [size, setSize] = useState([595, 842]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [links, setLinks] = useState<PageLink[]>([]);

  useEffect(() => {
    if (eager) return;
    const element = frame.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), { rootMargin: '350px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!eager && !nearby) {
      setReady(false);
      setLinks([]);
      if (canvas.current) canvas.current.width = 0;
      return;
    }
    let disposed = false;
    let rendering: RenderTask | undefined;
    setReady(false);
    setFailed(false);
    setLinks([]);
    void pdf.getPage(number).then(async (page) => {
      const surface = canvas.current;
      if (disposed || !surface) return;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 1400 * zoom / 100 / Math.max(original.width, original.height)) });
      setSize([viewport.width, viewport.height]);
      surface.width = Math.ceil(viewport.width);
      surface.height = Math.ceil(viewport.height);
      rendering = page.render({ canvas: surface, viewport });
      const annotations = page.getAnnotations({ intent: 'display' }).catch(() => []);
      await rendering.promise;
      const targets: PageLink[] = [];
      for (const annotation of await annotations) {
        if (annotation.subtype !== 'Link' || !annotation.rect) continue;
        const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]);
        const rect: PageLink['rect'] = [
          Math.min(x1, x2) / viewport.width * 100, Math.min(y1, y2) / viewport.height * 100,
          Math.abs(x2 - x1) / viewport.width * 100, Math.abs(y2 - y1) / viewport.height * 100,
        ];
        if (typeof annotation.dest === 'string' || Array.isArray(annotation.dest)) {
          targets.push({ destination: annotation.dest, rect });
        } else if (/^(https?:\/\/|mailto:)/i.test(annotation.url ?? '')) {
          targets.push({ url: annotation.url, rect });
        }
      }
      if (!disposed) {
        setLinks(targets);
        setReady(true);
      }
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      rendering?.cancel();
    };
  }, [eager, nearby, number, pdf, zoom]);

  return (
    <div ref={frame} data-pdf-page={number} className="relative mx-auto w-full bg-white"
      style={{ aspectRatio: `${size[0]} / ${size[1]}`, maxWidth: 820 * zoom / 100 }}>
      {!ready && <p className="absolute inset-x-0 top-4 text-center text-sm text-slate-700">
        {failed ? `No se pudo mostrar la página ${number}.` : `Página ${number}`}
      </p>}
      <canvas ref={canvas} role="img" aria-label={`Página ${number} del PDF`}
        className={ready ? 'block h-auto w-full' : 'invisible block h-auto w-full'} />
      {links.map(({ destination, url, rect: [left, top, width, height] }, index) => {
        const style = { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
        const className = 'absolute block rounded-sm hover:bg-black/10 focus-visible:bg-black/10';
        return destination !== undefined ? (
          <button key={index} type="button" className={className} style={style}
            aria-label={`Enlace interno ${index + 1} de la página ${number}`} onClick={() => navigate(destination)} />
        ) : (
          <a key={index} href={url} target="_blank" rel="noopener noreferrer"
            className={className} style={style} aria-label={url} />
        );
      })}
    </div>
  );
});

function PdfOutline({ items, navigate }: { items: OutlineItem[]; navigate: (destination: Destination) => void }) {
  return (
    <ul className="space-y-1">
      {items.map((item, index) => (
        <li key={index}>
          {item.dest ? (
            <button type="button" className="w-full rounded px-2 py-2 text-start text-sm hover:bg-obsidian-surface"
              onClick={() => navigate(item.dest!)}>{item.title}</button>
          ) : <span className="block px-2 py-2 text-sm">{item.title}</span>}
          {item.items.length > 0 && <div className="ms-3 border-s border-obsidian-border ps-2"><PdfOutline items={item.items} navigate={navigate} /></div>}
        </li>
      ))}
    </ul>
  );
}

export default function ReportPdfPreview({ blob, toolbar, controls, scrollArea }: {
  blob: Blob; toolbar: HTMLElement; controls: HTMLElement; scrollArea: RefObject<HTMLDivElement>;
}) {
  const pages = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(100);
  const position = useRef(0);
  const jumpScrollTop = useRef<number | null>(null);
  const [jump, setJump] = useState<{ number: number; offset: number } | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [layout, setLayout] = useState<Layout>('single');
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [navigationError, setNavigationError] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const count = pdf?.numPages ?? 0;

  useEffect(() => {
    let disposed = false;
    let loading: ReturnType<typeof getDocument> | undefined;
    setPage(1);
    setJump(null);
    setPdf(null);
    setError(false);
    setOutline([]);
    setNavigationError(false);
    setShowOutline(false);
    jumpScrollTop.current = null;
    scrollArea.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    position.current += 1;
    void blob.arrayBuffer().then(async (bytes) => {
      if (disposed) return;
      loading = getDocument({ data: new Uint8Array(bytes), enableXfa: false, useWasm: false });
      const next = await loading.promise;
      if (disposed) return;
      setPdf(next);
      const items = await next.getOutline().catch(() => null);
      if (!disposed) setOutline(items ?? []);
    }).catch(() => { if (!disposed) setError(true); });
    return () => {
      disposed = true;
      position.current += 1;
      void loading?.destroy().catch(() => undefined);
    };
  }, [blob, scrollArea]);

  useLayoutEffect(() => {
    if (!jump || !pdf) return;
    const pageElement = pages.current?.querySelector(`[data-pdf-page="${jump.number}"]`);
    const scroller = scrollArea.current;
    if (pageElement && scroller) {
      const bounds = pageElement.getBoundingClientRect();
      scroller.scrollTo({ top: scroller.scrollTop + bounds.top - scroller.getBoundingClientRect().top
        + bounds.height * jump.offset - 12, behavior: 'instant' });
      jumpScrollTop.current = scroller.scrollTop;
    }
  }, [jump, pdf, scrollArea]);

  useEffect(() => {
    const scroller = scrollArea.current;
    const pageList = pages.current;
    if (!scroller || !pageList || layout !== 'continuous') return;

    let frame = 0;
    const syncPage = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // At the end of the document, a jump can be clamped by the viewport.
        if (scroller.scrollTop === jumpScrollTop.current) return;
        jumpScrollTop.current = null;
        const { children } = pageList;
        if (!children.length || scroller.scrollHeight <= scroller.clientHeight) return;
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) {
          setPage(children.length);
          return;
        }

        // Pages follow document order. Find the first page that reaches the reading area.
        const readingTop = scroller.getBoundingClientRect().top + 12;
        let first = 0;
        let last = children.length - 1;
        while (first < last) {
          const middle = Math.floor((first + last) / 2);
          if (children[middle].getBoundingClientRect().bottom <= readingTop) first = middle + 1;
          else last = middle;
        }
        setPage(first + 1);
      });
    };
    scroller.addEventListener('scroll', syncPage, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', syncPage);
      cancelAnimationFrame(frame);
    };
  }, [layout, pdf, scrollArea]);

  const move = useCallback((number: number, offset = 0) => {
    position.current += 1;
    setNavigationError(false);
    setPage(number);
    setJump({ number, offset });
  }, []);

  const navigate = useCallback((destination: Destination) => {
    if (!pdf) return;
    const request = ++position.current;
    setNavigationError(false);
    void (async () => {
      const target = typeof destination === 'string' ? await pdf.getDestination(destination) : destination;
      const ref = target?.[0];
      let index = typeof ref === 'number' ? ref : -1;
      if (typeof ref === 'object' && ref && 'num' in ref && 'gen' in ref &&
          typeof ref.num === 'number' && typeof ref.gen === 'number') {
        index = await pdf.getPageIndex({ num: ref.num, gen: ref.gen });
      }
      if (position.current !== request) return;
      if (typeof index !== 'number' || index < 0 || index >= pdf.numPages) throw new Error('Destino PDF inválido');
      const destinationKind = (target?.[1] as { name?: string } | undefined)?.name;
      const top = destinationKind === 'XYZ' ? target?.[3] : destinationKind === 'FitH' ? target?.[2] : undefined;
      let offset = 0;
      if (typeof top === 'number' && Number.isFinite(top)) {
        const destinationPage = await pdf.getPage(index + 1);
        const viewport = destinationPage.getViewport({ scale: 1 });
        const [, y] = viewport.convertToViewportPoint(0, top);
        offset = Math.min(0.98, Math.max(0, y / viewport.height));
      }
      if (position.current === request) move(index + 1, offset);
    })().catch(() => { if (position.current === request) setNavigationError(true); });
  }, [move, pdf]);

  if (error) return <p role="alert" className="text-sm text-obsidian-errorText">No se pudo mostrar este PDF.</p>;
  if (!pdf) return <p role="status" className="text-sm text-obsidian-muted">Cargando PDF…</p>;
  const step = PAGES_PER_LAYOUT[layout];
  const start = page - ((page - 1) % step);
  const shown = Math.min(step, count - start + 1);
  const numbers = layout === 'continuous' ? Array.from({ length: count }, (_, i) => i + 1)
    : Array.from({ length: shown }, (_, i) => start + i);

  return (
    <div className="space-y-3">
      {createPortal(
        <>
          <select aria-label="Disposición del PDF" className="report-form-control report-preview-select" value={layout}
            onChange={(event) => {
              setLayout(event.target.value as Layout);
              move(page);
            }}>
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
      {/* [Navegación] Paginación y zoom permanecen visibles mientras se desplaza el PDF. */}
      {createPortal(
        <div className="flex flex-wrap items-center gap-2 border-b border-obsidian-border px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Páginas del PDF">
            <button type="button" className="ui-action-icon" disabled={start <= 1}
              onClick={() => move(Math.max(1, start - step))} aria-label="Página anterior"><ChevronLeft className="size-4" aria-hidden="true" /></button>
            <span className="text-xs tabular-nums text-obsidian-muted" role="status">
              {`Página ${start}${shown > 1 ? `–${start + shown - 1}` : ''} de ${count}`}
            </span>
            <button type="button" className="ui-action-icon" disabled={start + step > count}
              onClick={() => move(start + step)} aria-label="Página siguiente"><ChevronRight className="size-4" aria-hidden="true" /></button>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-1" role="group" aria-label="Zoom del PDF">
            <button type="button" className="ui-action-icon" disabled={zoom <= 50}
              onClick={() => setZoom(zoom - 25)} aria-label="Alejar"><Minus className="size-4" aria-hidden="true" /></button>
            <button type="button" className="ui-action-secondary tabular-nums" title="Restablecer zoom"
              aria-label={`Zoom ${zoom} %, restablecer a 100 %`} onClick={() => setZoom(100)}>{zoom} %</button>
            <button type="button" className="ui-action-icon" disabled={zoom >= 200}
              onClick={() => setZoom(zoom + 25)} aria-label="Acercar"><Plus className="size-4" aria-hidden="true" /></button>
          </div>
        </div>,
        controls,
      )}
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
