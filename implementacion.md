# Plan de Implementación: Editor Typst Avanzado y Reportes (LESSSO)

Este documento define qué piezas se tomarán de cada repositorio de referencia para mejorar el módulo **Reportes (`Documentos` + `Lienzos`)** sin obligar al usuario a instalar dependencias externas ni romper la paleta `obsidian-*` de `DESIGN.md`.

---

## 1. Uso de cada repositorio de referencia

### 1.1 `Myriad-Dreamin/tinymist`
**Objetivo:** Dotar al editor de **autocompletado inteligente y snippets de Typst** al escribir `#`.
- **Qué extraer:**
  - Catálogo de funciones nativas de Typst (`#figure`, `#table`, `#image`, `#set`, `#show`, `#grid`, `#rect`, `#pagebreak`, `#heading`, `#list`, `#enum`, `#quote`, `#cite`, `#link`, etc.) con sus parámetros y descripciones breves.
  - Reglas de sintaxis / tokens de Typst para resaltado de código.
- **Cómo integrarlo en LESSSO:**
  - Crear un diccionario estático ligero en `frontend/src/components/reports/typstSnippets.ts` con las funciones y plantillas más usadas.
  - Conectarlo al autocompletado del editor para que al escribir `#` aparezca un menú contextual navegable con `↑` / `↓` y `Tab` / `Enter`.

### 1.2 `Syslifters/sysreptor`
**Objetivo:** Completar el flujo de **informes técnicos, evidencias y exportación limpia**.
- **Qué extraer / adaptar:**
  - **Pegado y subida de imágenes (`Ctrl+V` / archivo):** Capturar imágenes del portapapeles (`onPaste`) o selector de archivos, guardarlas cifradas asociadas al documento (`asset://<id>`) e insertar `#figure(image("asset://<id>", width: 90%), caption: [...])`.
  - **Resolución de assets en `typst_compiler.py`:** Al compilar vista previa o exportar PDF/HTML, materializar temporalmente los `asset://<id>` igual que ya se hace con `canvas://<id>`.
  - **Plantillas de documentos:** Selector al crear un documento nuevo (*Informe técnico / Pentest*, *Propuesta comercial*, *Resumen ejecutivo*).
  - **Autoguardado local cifrado + historial:** Copia local de recuperación ante cierres accidentales y restauración de revisiones.
  - **Modo censura para cliente:** Opción al exportar PDF/HTML para redactar IPs, credenciales o secretos marcados.

### 1.3 `codemirror/dev` (CodeMirror 6)
**Objetivo:** Reemplazar el `<textarea>` plano de `ReportsDocumentsView.tsx` por un **editor de código real** manteniendo el estilo `obsidian-*`.
- **Qué extraer / usar:**
  - `@codemirror/view`, `@codemirror/state`, `@codemirror/commands` (deshacer/rehacer, indentación, atajos), `@codemirror/search` (`Ctrl+F` dentro del documento) y `@codemirror/autocomplete` (menú de sugerencias `#...`).
- **Cómo integrarlo en LESSSO:**
  - Encapsularlo en un componente `TypstCodeEditor.tsx` con tema `obsidian-bg` / `obsidian-surface` / `obsidian-accent`, fuente `JetBrains Mono` y soporte `onPaste` para imágenes.

---

## 2. Diseño de la barra de edición (según captura de referencia)

La barra superior del editor en `ReportsDocumentsView.tsx` se organizará en una sola fila compacta (`bg-obsidian-panel`, `border-obsidian-border`, iconos `lucide-react` de `16px`, controles `>= 44px` o agrupados con foco visible) dividida por separadores verticales (`|`):

1. **Etiqueta superior / contexto (`Overview` o nombre de sección activa).**
2. **Grupo 1 — Formato de texto:**
   - Negrita (`Bold` -> `*texto*`)
   - Cursiva (`Italic` -> `_texto_`)
   - Tachado / Subrayado (`Strikethrough` / `Underline`)
   - Superíndice / Subíndice (`Superscript` -> `#super[...]`)
   - Código en línea (`Code` -> `` `código` ``)
3. **Grupo 2 — Bloques y estructura:**
   - Lista con viñetas (`List` -> `- `)
   - Lista numerada (`ListOrdered` -> `+ `)
   - Lista de tareas / Checklist (`ListChecks` -> `- [ ] `)
   - Cita (`Quote` -> `#quote[...]`)
   - Bloque de código (`SquareCode` -> ```` ``` ````)
   - Tabla (`Table` -> `#table(...)`)
4. **Grupo 3 — Enlaces, imágenes y lienzos:**
   - Insertar lienzo Excalidraw (`PenTool` / `Frame` -> `image("canvas://<id>")`)
   - Enlace (`Link` -> `#link("url")[texto]`)
   - Imagen / Captura (`Image` -> subir o pegar `image("asset://<id>")`)
5. **Grupo 4 — Historial de edición:**
   - Deshacer (`Undo2` conectado a CodeMirror)
   - Rehacer (`Redo2` conectado a CodeMirror)
6. **Grupo 5 — Utilidades del documento:**
   - Revisión / Ortografía o Censura (`SpellCheck` / `EyeOff`)
   - Comentario / Nota (`MessageSquarePlus`)
   - Plantillas / Snippets rápidos (`Sparkles`)
7. **Extremo derecho — Selector de vista (`ui-action-toggle`):**
   - `Write` (Solo código) | `Split` (Código + Vista previa A4) | `Preview` (Solo vista previa)

---

## 3. Orden sugerido de implementación
1. **Fase 1 (Imágenes y barra):** Pegado `Ctrl+V` + subida de imágenes (`asset://<id>`) en backend (`typst_compiler.py`) y nueva barra de herramientas en `ReportsDocumentsView.tsx`.
2. **Fase 2 (Editor CodeMirror + `tinymist`):** Integrar `TypstCodeEditor.tsx` con CodeMirror 6, `Undo/Redo`, `Ctrl+F` y autocompletado `#...` basado en `tinymist`.
3. **Fase 3 (Flujo `sysreptor`):** Plantillas iniciales, autoguardado local cifrado y opción de censura al exportar.
