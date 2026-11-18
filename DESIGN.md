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
- Interactive controls should generally have at least a 44px target. Keep repeated data-row controls compact only where needed for scan density; do not shrink modal actions, primary form actions, or standalone icon buttons below 44px. Form fields should retain clear labels, helper text, and visible errors.

## Surface, color, icon, and spacing rules

- **AI Slop está prohibido.** No agregues neones, degradados o brillos decorativos, rejillas de tarjetas genéricas ni superficies de tarjeta repetidas. Nunca anides tarjetas o paneles. Cada sección puede tener una sola superficie; agrupa el contenido con espacio y separadores (`divide-y`, `border-t` o `border-b`).
- **Keep application chrome neutral.** Use a solid `obsidian.bg` shell and `obsidian-*` surfaces and text by default, the configured brand accent for primary actions and selection, and green, amber, or rose only for meaningful success, warning, and error states. Do not add neon colors or color ordinary data categories just to differentiate them. Dot texture belongs only on actual map, network, or diagram canvases.
- **Keep custom color inside diagrams.** Nodes, arrows, lines, and shapes may each use a user-selected color. Their colors belong to the drawing and must not change the surrounding interface palette.
- **Use one icon voice.** Use the existing Lucide outline icons at 16px for inline controls and 18px for section headers. Default icons to a neutral token; use the accent or a semantic state color only when the icon communicates that state.
- **Use a 4px spacing rhythm.** Use 8–16px within groups, 16–24px between sections, and 12–16px page gutters. Avoid one-off spacing values when an existing Tailwind spacing step works.

These rules come from the user's requested Notion/Obsidian-like direction: “no me gusta que metas tarjetas en tarjetas y esas tarjetas en otra tarjeta”, “no utiliza 1000 colores”, and color freedom for nodes and diagram elements. They apply across Inicio, Prospección, Correo y servicios, Finanzas, Seguridad, Red y Lab, Actividad, Papelera y Ajustes.

## Overview pages and navigation

- **Each main navigation group opens its own read-only overview.** Give standard module overviews one clear route into the primary work area; keep the detailed sections in the nested navigation tree.
- **The global Inicio overview summarizes the whole workspace and has one route into each module overview.** Do not repeat create/add actions or enumerate every child section on overview pages; keep those actions and destinations in the detailed work area.
- **Finance keeps separate detail areas for payments, services and due dates, expenses, and cards/payment methods.** Its overview carries cross-area totals and links into those four areas.
- **Overview content summarizes existing records without exposing secrets or triggering write operations.**

These rules follow the user's request to “ver el resumen de tooooodos los apartados sin tantos botones,” keep a “botón sutil” to each area, and avoid “no redundancia de información inútil, procesos inútiles”.

## Form controls

- Text, search, email, number, date, password, and URL fields share the neutral surface, border, radius, interface type, visible focus, and a 44px minimum height. Text areas keep at least 88px for readable multiline input.
- Checkboxes and radios use the configured brand accent. Diagram color inputs remain user-controlled and are excluded from application chrome styling.
- Every field has a visible label or a programmatic name; placeholder text alone is not a label. Errors and help text remain attached to the field they describe.

## Selects and dropdowns

- **Native selects share the same control surface, border, radius, typography, focus treatment, option colors, and CSS chevron through the global select rules in `index.css`.** Do not add a second per-control arrow. Native option-popup hover can still depend on the operating system.
- **Action menus use the same neutral surface, border, row height, icon size, hover color, and focus color.** Keep disclosure panels distinct when they reveal forms or longer content.

This follows the user's request to standardize “todos los desplegables” and the repeated reports of different borders and hover colors.

## Markdown and diagram editing

- Las barras del editor y la pizarra son una sola fila compacta; si el ancho no alcanza, sus herramientas deben seguir disponibles mediante desplazamiento horizontal o un menú accesible, sin recortar controles. Agrupa funciones con separadores discretos.
- En barras de herramientas, los botones de icono usan el mismo tamaño, iconos Lucide de 16 px y fondo transparente en reposo. El hover es neutral; un estado seleccionado usa una superficie neutral visible y `aria-pressed`. Crear o guardar desde una barra no lleva color permanente.
- En la fila de la pizarra, los disparadores con chevrón comparten el tratamiento de Texto: sin borde visible en reposo. El selector de categoría conserva el borde de campo. Hover, panel abierto y selección usan una superficie neutra; el contorno queda para el foco de teclado o una acción destructiva.
- Los menús muestran opciones como filas neutrales uniformes: el borde no debe hacer que una opción parezca seleccionada. Etiqueta las acciones y distingue el estado real mediante texto y atributos accesibles.
- Los controles compactos del editor pueden reducir su altura visual frente a formularios generales, conservando objetivos utilizables y foco visible. No reduzcas tipografía hasta hacerla ilegible.

- **Preview styling preserves the source Markdown, heading order, anchors, and authored content.** Add clarity with restrained display styling while keeping the rendered document faithful to `.md`.
- **Diagram nodes, labels, and icons stay centered as one group.** Truncate long visible labels with an ellipsis and retain the full label in an accessible title; include a no-custom-color choice for diagram elements.
- **Keep the whiteboard frame inside the available workspace width and draw a balanced outer border on every edge.** Use shrinkable flex children and prevent horizontal overflow.

These rules follow the user's request to keep the preview “tal cual en .md”, make long labels fit, allow “si no quiero color”, and fix the “asimetría de márgenes y desbordamiento horizontal (overflow)” that hid the right edge of the work area.

## Interaction and states

- Add a clear `focus-visible` indicator to every keyboard-operable control.
- Use shared components such as `ConfirmDialog`, `EmptyState`, and `InlineErrorNotice` when they fit the interaction.
- Usa texto y color neutros para la ausencia de datos. Las marcas verdes de éxito requieren una comprobación con datos, un guardado confirmado o un estado operativo verificado.
- Si falta el tipo de cambio, indica que el total combinado no está disponible. Conserva el importe original de cada registro y su divisa.
- Make loading, empty, error, success, disabled, and permission-limited states explicit. State changes and validation errors should be announced accessibly. Startup may show a spinner only while React mounts; after 12 seconds or a script failure, replace it with a retry state instead of leaving an endless loading screen.
- Confirm actions that change host identity, credentials, financial records, or other consequential state. Explain the target and likely impact in the confirmation.
- Keep the action that changes state visually distinct from generating, previewing, or editing values.

## Motion and visualizations

- Use motion only to clarify a state transition. Respect `prefers-reduced-motion`; the Mermaid edge animation already disables itself for reduced motion.
- Graphs, maps, whiteboards, and topology diagrams can use specialized categorical palettes when colors encode data. Keep those palettes local to the visualization and distinguish their meanings with labels or legends.

## Existing compatibility aliases

The Tailwind configuration retains older `indigo-*`, `slate-*`, `blue-*`, `cyan-*`, `sky-*`, `teal-*`, `purple-*`, and `violet-*` utility names, but maps them to the shared neutral scale. Semantic status colors remain green, amber, and rose. `index.css` applies the configured brand accent to legacy primary controls and to new `obsidian-accent` controls.

For new components, use semantic `obsidian-*` tokens and `obsidian-accent` for primary actions, selection, and focus. Keep the neutral aliases while older callers are migrated; do not reintroduce category colors through those legacy utility names.

## Theme scope

The implemented product theme is dark with a configurable brand accent. Application chrome uses a solid background; maps and diagram canvases can carry a local dot texture. A complete light theme is not currently defined. Do not add partial light-mode variants to isolated components; extend the shared theme first if light mode becomes a product requirement.

## Button and interactive control roles

- Primary actions create, save or confirm: use the brand accent, one per action group, with a 44px minimum height.
- Secondary actions open, edit, filter or cancel: use a neutral surface or outline, with the same height, typography and radius as the primary action. A neutral action keeps a neutral hover.
- Destructive actions identify the affected item and use the danger color; use confirmation when the change is consequential.
- Icon-only actions have an accessible name, a 44×44px target and a 16px icon. Compact repeated row actions may be denser when necessary, but must remain identifiable and keyboard accessible.
- Toolbar formatting and diagram tools use neutral icon buttons with an explicit pressed state. Menus use neutral rows and the same hover and focus treatment. Native select option rendering can depend on the operating system.
- Navigation rows and text actions must look interactive on hover and focus; do not make a changing state look like a static badge.
- At browser zoom and narrow widths, wrap or scroll the relevant controls and preserve access to all actions; never clip the primary navigation or dialog actions.

### Action placement and states

| Role | Placement | Default | Hover / press | Focus / disabled |
|---|---|---|---|---|
| Primary | End of the header or dialog action group; one per task | Brand accent and contrasting text | Darken the accent; press darkens briefly | Accent outline; reduced opacity and no activation |
| Secondary | Beside the primary or within its related section | Neutral surface and border | Neutral raised surface; press darkens briefly | Accent outline; reduced opacity and no activation |
| Navigation | Sidebar, module rows, tabs or inline links | Neutral text; inline links keep a subtle underline | Neutral raised surface for rows, clearer underline for inline links | Accent outline; current destination has a neutral selected surface |
| Icon | Beside the item it affects or in a toolbar | Neutral 16px icon in a 44px target | Neutral raised surface | Accent outline and accessible name |
| Selectable | In a labelled group next to its content | Neutral text | Neutral hover; pressed/selected state has a visible surface and ARIA state | Accent outline; unavailable controls are disabled |
| Menu and selector | Adjacent to their trigger, with options in a neutral panel | Neutral surface, border and 44px rows | Neutral row hover; selection is identified | Accent outline; native options remain platform controlled |
| Destructive | At the end of the relevant group or in an action menu | Rose text and border | Dark rose surface; press darkens briefly | Accent outline; confirm consequential changes |
| Specialized | At the edge of the editor, diagram or map it controls | Neutral toolbar; diagram colors are user controlled | Neutral hover and visible selected tool | Accent outline, labelled controls and disabled state |

Use `ui-action-primary`, `ui-action-secondary`, `ui-action-danger`, `ui-action-icon`, `ui-action-toggle`, `ui-menu-item`, `ui-nav-action` and `ui-nav-link` for new shared patterns. Use `ui-nav-action` for full-width rows and `ui-nav-link` for inline links. Comment a meaningful action group as `/* [Acción principal] … */` or `{/* [Navegación] … */}`; explain the role or relationship once, rather than repeating a comment on every element. Place the primary action last in dialog footers and keep destructive actions separate from routine navigation.
