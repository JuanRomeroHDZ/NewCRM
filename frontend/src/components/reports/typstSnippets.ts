import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

import { TYPST_HEADING_HIERARCHY } from './typstTemplates';

export interface TypstFunctionSnippet {
  label: string;
  detail: string;
  description: string;
  apply: string;
}

export const TYPST_FUNCTION_SNIPPETS: TypstFunctionSnippet[] = [
  { label: 'figure', detail: 'body, caption, kind', description: 'Coloca una figura con pie y numeración.', apply: 'figure(\n  [Contenido de la figura],\n  caption: [Descripción],\n)' },
  { label: 'table', detail: 'columns, rows', description: 'Crea una tabla con filas de contenido Typst.', apply: 'table(\n  columns: (1fr, 1fr),\n  [Encabezado], [Encabezado],\n  [Dato], [Detalle],\n)' },
  { label: 'image', detail: 'path, width, height, fit', description: 'Inserta una imagen. Para capturas cifradas usa la herramienta Insertar imagen.', apply: 'image("nombre-de-imagen.png", width: 90%)' },
  { label: 'set', detail: 'rule, arguments', description: 'Establece propiedades para los elementos siguientes.', apply: 'set text(size: 10.5pt)' },
  { label: 'show', detail: 'selector: transform', description: 'Personaliza cómo se muestra un tipo de elemento.', apply: 'show heading: set text(weight: "bold")' },
  { label: 'grid', detail: 'columns, gutter, children', description: 'Organiza contenido en una cuadrícula.', apply: 'grid(\n  columns: (1fr, 1fr),\n  gutter: 12pt,\n  [Columna 1], [Columna 2],\n)' },
  { label: 'rect', detail: 'width, height, fill, stroke', description: 'Dibuja un rectángulo vectorial.', apply: 'rect(width: 100%, height: 40pt, fill: luma(240))' },
  { label: 'pagebreak', detail: 'weak', description: 'Inicia una página nueva.', apply: 'pagebreak()' },
  { label: 'heading', detail: 'level, numbering, outlined', description: 'Crea un encabezado con nivel y numeración.', apply: 'heading(level: 2)[Título]' },
  { label: 'list', detail: 'tight, marker, indent, body', description: 'Crea una lista con viñetas.', apply: 'list(\n  [Primer elemento],\n  [Segundo elemento],\n)' },
  { label: 'enum', detail: 'tight, numbering, start, body', description: 'Crea una lista numerada.', apply: 'enum(\n  [Primer paso],\n  [Segundo paso],\n)' },
  { label: 'quote', detail: 'block, quotes, attribution, body', description: 'Presenta una cita breve o en bloque.', apply: 'quote(block: true)[Texto de la cita]' },
  { label: 'cite', detail: 'key, form', description: 'Inserta una cita bibliográfica.', apply: 'cite(<referencia>)' },
  { label: 'link', detail: 'destination, body', description: 'Enlaza texto con una URL.', apply: 'link("https://example.com")[Texto del enlace]' },
  { label: 'text', detail: 'size, font, fill, body', description: 'Ajusta tipografía para un fragmento.', apply: 'text(size: 11pt)[Texto]' },
  { label: 'box', detail: 'width, inset, fill, stroke, body', description: 'Agrupa contenido en una caja.', apply: 'box(inset: 8pt, stroke: luma(210))[Contenido]' },
  { label: 'align', detail: 'alignment, body', description: 'Alinea un fragmento de contenido.', apply: 'align(center)[Contenido]' },
  { label: 'raw', detail: 'lang, block, text', description: 'Muestra código sin procesar.', apply: 'raw(lang: "text", block: true)[\nCódigo\n]' },
  { label: 'strong', detail: 'body', description: 'Resalta texto con peso fuerte.', apply: 'strong[Texto]' },
  { label: 'emph', detail: 'body', description: 'Enfatiza texto con cursiva.', apply: 'emph[Texto]' },
  { label: 'super', detail: 'body', description: 'Eleva un fragmento de texto.', apply: 'super[2]' },
  { label: 'sub', detail: 'body', description: 'Baja un fragmento de texto.', apply: 'sub[2]' },
  { label: 'underline', detail: 'body', description: 'Subraya un fragmento de texto.', apply: 'underline[Texto]' },
  { label: 'strike', detail: 'body', description: 'Tacha un fragmento de texto.', apply: 'strike[Texto]' },
  { label: 'line', detail: 'start, end, stroke', description: 'Dibuja una línea.', apply: 'line(length: 100%, stroke: 0.5pt)' },
  { label: 'v', detail: 'amount', description: 'Añade espacio vertical.', apply: 'v(8pt)' },
  { label: 'h', detail: 'amount', description: 'Añade espacio horizontal.', apply: 'h(8pt)' },
];

const completions: Completion[] = TYPST_FUNCTION_SNIPPETS.map((snippet) => ({
  label: snippet.label,
  type: 'function',
  detail: snippet.detail,
  info: snippet.description,
  apply: snippet.apply,
}));

export function typstCompletionSource(context: CompletionContext): CompletionResult | null {
  const match = context.matchBefore(/#[\w-]*/);
  if (!match || (match.from === match.to && !context.explicit)) return null;
  return {
    from: match.from + 1,
    options: completions,
    validFor: /^[\w-]*$/,
  };
}

export interface TypstQuickSnippet {
  id: string;
  label: string;
  snippet: string;
}

export const TYPST_QUICK_SNIPPETS: TypstQuickSnippet[] = [
  { id: 'heading-hierarchy', label: 'Sangría de títulos', snippet: `\n${TYPST_HEADING_HIERARCHY}\n` },
  { id: 'section', label: 'Sección', snippet: '\n== Título de sección\n\n' },
  { id: 'bullets', label: 'Lista con viñetas', snippet: '\n- Primer elemento\n- Segundo elemento\n' },
  { id: 'numbered', label: 'Lista numerada', snippet: '\n+ Primer paso\n+ Segundo paso\n' },
  { id: 'checklist', label: 'Lista de tareas', snippet: '\n- [ ] Tarea pendiente\n- [x] Tarea completada\n' },
  { id: 'quote', label: 'Cita', snippet: '\n#quote(block: true)[Texto de la cita]\n' },
  { id: 'code', label: 'Bloque de código', snippet: '\n```text\nCódigo o salida\n```\n' },
  { id: 'table', label: 'Tabla', snippet: '\n#set table.cell(breakable: false)\n#table(\n  columns: (1fr, 1fr),\n  table.header([Campo], [Detalle]),\n  [Dato], [Descripción],\n)\n' },
  { id: 'pagebreak', label: 'Salto de página', snippet: '\n#pagebreak()\n' },
  { id: 'note', label: 'Nota en el código', snippet: '\n// Nota: ' },
];
