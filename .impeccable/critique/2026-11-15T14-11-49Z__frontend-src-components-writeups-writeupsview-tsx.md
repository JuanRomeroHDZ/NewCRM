---
target: Informes de seguridad y writeups HTB
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/juanromero/Documents/Proyectos/NewCRM/frontend/src/components/writeups/WriteupsView.tsx"
target_fingerprint: "sha256:daf4847ab9743200be7e008821eb3a35aab63cd2e0ceb23573645b4792f0edfe"
target_path: /home/juanromero/Documents/Proyectos/NewCRM/frontend/src/components/writeups/WriteupsView.tsx
timestamp: 2026-11-15T14-11-49Z
slug: frontend-src-components-writeups-writeupsview-tsx
closed: true
---
Method: dual-agent (A: /root/impeccable_a · B: /root/impeccable_b)

# Impeccable critique — Informes de seguridad / writeups HTB

**Captura inicial:** 27/40 — Aceptable. Esta calificación corresponde a la revisión previa a los ajustes finales de polish.

**Especificidad de producto:** parcialmente propia. CVSS, CWE/CVE, censura, evidencias, citas, hallazgos y pizarras distinguen el flujo de una aplicación genérica. El marco oscuro del editor y la barra de herramientas todavía se sienten como piezas reutilizables sin suficiente jerarquía editorial.

## Heurísticas de Nielsen

| # | Heurística | Puntuación | Hallazgo |
|---|---|---:|---|
| 1 | Visibilidad del estado | 3/4 | Guardado visible, pero el estado de foco era débil. |
| 2 | Correspondencia con el mundo real | 3/4 | Léxico de seguridad reconocible; el uso de espacios de trabajo requería interpretación. |
| 3 | Control y libertad | 3/4 | Lista y paneles se pueden ocultar; el historial permitía restaurar con poca señal del alcance del cambio. |
| 4 | Consistencia y estándares | 2/4 | Controles y opciones competían por atención, con jerarquía desigual. |
| 5 | Prevención de errores | 3/4 | Recuperación y guardado estaban presentes; restaurar no hacía suficientemente explícito qué se reemplazaría. |
| 6 | Reconocimiento antes que recuerdo | 3/4 | Plantillas, etiquetas y categorías ayudan; había demasiadas opciones visibles en la barra. |
| 7 | Flexibilidad y eficiencia | 3/4 | Atajos y vista dividida ayudan; el guardado con teclado dependía del foco en el editor. |
| 8 | Diseño minimalista | 2/4 | Barra plana con más de 20 acciones y paneles estrechos al dividir el espacio. |
| 9 | Recuperación de errores | 3/4 | Autoguardado y recuperación son fortalezas; los conflictos y la restauración necesitaban mejores señales. |
| 10 | Ayuda y documentación | 2/4 | La guía contextual era limitada para quienes no conocen el flujo de informes. |
| **Total** |  | **27/40** | **Aceptable** |

## Problemas priorizados y resultado del polish

- **P1 — Paneles estrechos en vistas divididas.** El editor podía quedar demasiado angosto. Se añadió medición del ancho disponible; bajo 960 px las vistas se apilan en una columna.
- **P1 — Herramientas con poca jerarquía.** Se separaron por categoría; la vista previa oculta los controles de edición y la vista de escritura queda como valor inicial.
- **P1 — Foco y guardado por teclado.** El editor ahora muestra un anillo de foco y Ctrl/Cmd+S funciona desde el espacio de trabajo.
- **P2 — Tarjetas de informes difíciles de escanear.** Ahora exponen severidad, estado, alcance y actualización con texto, además del color.
- **P2 — Restauración demasiado fácil de activar.** El usuario debe elegir una versión; la confirmación explica que texto, datos, hallazgos, evidencias, pizarras y citas se reemplazarán y que el estado actual se guarda primero.
- **Accesibilidad confirmada en polish.** Selección de texto con fondo arena y texto oscuro; exportación con contraste suficiente; nombres de controles alineados con sus etiquetas visibles.

## Carga cognitiva y recorrido

La captura inicial mostraba cinco espacios de trabajo, cinco categorías de herramientas, cinco niveles de severidad y una barra extensa. Agrupar las herramientas y ocultarlas al leer reduce la carga durante la escritura. Las listas de espacios de trabajo y severidad siguen siendo opciones de más de cuatro elementos, pero son selectores nativos y están etiquetados.

El guardado automático y la recuperación tranquilizan mientras se redacta. La restauración era el momento de mayor riesgo; selección explícita y confirmación ahora hacen que la consecuencia sea visible antes de actuar.

## Personas probadas

- **Usuario avanzado:** puede redactar en modo de escritura, usar Ctrl/Cmd+S y abrir el historial; la selección/diff de revisiones permanece disponible.
- **Usuario nuevo:** los nombres de área de trabajo y los estados de informe son más explícitos; la guía del editor sigue siendo breve.
- **Usuario de teclado o lector de pantalla:** foco visible, controles etiquetados y estados anunciados; Lighthouse dio 100/100 de accesibilidad en móvil y escritorio.

## Evidencia y observaciones menores

- Se inspeccionaron el editor en 1440×900 y 390×844, vista previa, dos vistas, selección, foco, lista e historial; en móvil no hubo desbordamiento horizontal.
- El historial permite previsualizar y comparar revisiones. La restauración pide confirmación después de seleccionar una revisión.
- El detector reportó side-tab en el borde de la revisión seleccionada. Es un falso positivo: el borde índigo comunica cuál versión está seleccionada.
- No se recorrieron los estados sucio/conflicto ni exportaciones con contenido completo. La sesión visual utilizó base de datos y cuenta de prueba aisladas.
- Preguntas omitidas: el usuario ya definió el alcance y pidió completar sin más instrucciones.
