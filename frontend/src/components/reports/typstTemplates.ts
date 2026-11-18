export interface TypstDocumentTemplate {
  id: string;
  label: string;
  description: string;
  source: string;
}

const pageSetup = `#set page(
  paper: "a4",
  margin: (x: 2.2cm, y: 2.2cm),
)
#set text(
  font: "DejaVu Sans",
  size: 10.5pt,
  lang: "es",
)
#set heading(numbering: "1.1")

`;

export const TYPST_DOCUMENT_TEMPLATES: TypstDocumentTemplate[] = [
  {
    id: 'technical',
    label: 'Informe técnico / Pentest',
    description: 'Hallazgos, evidencia técnica y remediación.',
    source: `${pageSetup}= Informe técnico

*Proyecto:* [Nombre del proyecto]

*Fecha:* #datetime.today().display("[day]/[month]/[year]")

== Resumen ejecutivo

[Describe el alcance, los hallazgos principales y las recomendaciones prioritarias.]

== Alcance y metodología

- **Activos autorizados:** [Dominio, IP o rango]
- **Ventana de evaluación:** [Fecha inicial — fecha final]
- **Limitaciones:** [Restricciones acordadas]

== Hallazgos

#table(
  columns: (auto, 1fr, auto),
  inset: 8pt,
  align: horizon,
  [*ID*], [*Descripción*], [*Severidad*],
  [H-01], [Descripción del hallazgo], [Media],
)

== Evidencia

[Inserta una captura desde la barra de herramientas cuando esté disponible.]

Identificador sensible: {{redact:valor_sensible}}

== Recomendaciones

+ [Acción recomendada]
+ [Cómo verificar la corrección]
`,
  },
  {
    id: 'commercial',
    label: 'Propuesta comercial',
    description: 'Objetivo, alcance, entregables, inversión y vigencia.',
    source: `${pageSetup}= Propuesta comercial

*Cliente:* [Nombre del cliente]

*Elaborada:* #datetime.today().display("[day]/[month]/[year]")

*Vigencia:* [30 días]

== Objetivo

[Describe el resultado que busca el cliente.]

== Alcance

- [Actividad incluida]
- [Actividad incluida]

== Entregables

#table(
  columns: (1fr, 2fr),
  inset: 8pt,
  [Entregable], [Descripción],
  [Informe], [Resultados y recomendaciones acordadas],
  [Sesión de cierre], [Presentación de resultados],
)

== Inversión y calendario

[Detalle de inversión, impuestos y fechas acordadas.]

== Supuestos y exclusiones

- [Supuesto acordado]
- [Exclusión]
`,
  },
  {
    id: 'executive',
    label: 'Resumen ejecutivo',
    description: 'Estado general, riesgos prioritarios y decisiones.',
    source: `${pageSetup}= Resumen ejecutivo

*Organización:* [Nombre]

*Periodo:* [Periodo evaluado]

*Fecha:* #datetime.today().display("[day]/[month]/[year]")

== Contexto

[Una descripción breve de la evaluación y su propósito.]

== Estado general

[Explica qué funciona, dónde está el riesgo y qué requiere atención.]

== Prioridades

+ [Decisión o acción prioritaria]
+ [Decisión o acción prioritaria]

== Siguiente revisión

[Fecha o condición para volver a evaluar.]
`,
  },
];

export const getTypstDocumentTemplate = (id: string) =>
  TYPST_DOCUMENT_TEMPLATES.find((template) => template.id === id) ?? TYPST_DOCUMENT_TEMPLATES[0];
