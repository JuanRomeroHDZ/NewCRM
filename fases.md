Revisé lo que ya existe en **Informes de seguridad**. Hay ocho formatos de exportación, vista para cliente, borradores cifrados, historial y un panel de correlaciones. **La oportunidad más grande es mejorar la calidad de la entrega y la confianza en lo que se guarda, se comparte y se recupera.** No modifiqué nada. [Formatos de exportación](/home/juanromero/Documents/Proyectos/NewCRM/frontend/src/components/writeups/WriteupExportModal.tsx) · [Panel de correlaciones](/home/juanromero/Documents/Proyectos/NewCRM/frontend/src/components/writeups/WriteupCorrelationsPanel.tsx)

## Mejorar

Funciones existentes que pueden resultar más útiles en el trabajo diario.

| # | Propuesta | Para qué sirve |
|---|---|---|
| 1 | **Tipografía de PDF y Word** | Definir estilos para títulos, texto, tablas, código y notas al pie. La letra que funciona en pantalla no siempre funciona en un documento. |
| 2 | **Paginación de PDF** | Mantener cada encabezado junto a su primer párrafo y cada imagen junto a su pie. Repetir encabezados de tablas largas. |
| 3 | **Portada editorial** | Dar una jerarquía clara a título, cliente, fecha, versión y confidencialidad. Dejar en blanco los campos opcionales que no se usen. |
| 4 | **Vista previa de entrega** | Mostrar si el documento incluirá portada, índice, evidencias y anexos antes de generarlo. |
| 5 | **Selección de formato** | Presentar primero las opciones habituales de entrega y edición. Agrupar los formatos de intercambio técnico sin quitarlos. |
| 6 | **Correlaciones explicables** | Mostrar el identificador o activo que causó cada coincidencia y abrir el informe relacionado en su contexto. |
| 7 | **Jerarquía de coincidencias** | Distinguir un identificador técnico exacto de compartir cliente o proyecto. Ambas relaciones ayudan, pero tienen distinto valor. |
| 8 | **Resumen ejecutivo** | Dar prioridad a impacto, alcance, acciones recomendadas y asuntos pendientes de validación. |
| 9 | **Lectura de hallazgos** | Ordenar los detalles como impacto, evidencia, recomendación y estado para que el lector encuentre rápido lo que necesita hacer. |
| 10 | **Gestión de evidencias** | Encontrarlas por nombre o hallazgo relacionado y distinguir imágenes, diagramas y otros archivos. |
| 11 | **Legibilidad de capturas** | Facilitar ampliar imágenes en pantalla y exportarlas a un tamaño que permita leerlas. |
| 12 | **Exportación de pizarras** | Ajustar el encuadre al contenido y conservar etiquetas legibles, sobre todo en diagramas anchos. |
| 13 | **Navegación por el índice** | Hacer más fácil saber en qué sección estás y saltar de una sección a otra en informes largos. |
| 14 | **Comparación de revisiones** | Dar prioridad a los bloques con cambios y permitir ir al cambio siguiente sin recorrer todo el informe. |
| 15 | **Historial de versiones** | Distinguir autoguardados, hitos y versiones entregadas. Así es más fácil encontrar la copia que importa. |
| 16 | **Búsqueda de informes** | Mostrar por qué coincidió un resultado y permitir combinar búsqueda con estado o proyecto. |
| 17 | **Recuperación de borradores** | Mostrar la fecha de la copia, la del servidor y qué partes se recuperarían antes de aplicarla. |
| 18 | **Estado del guardado** | Hacer fácil distinguir guardado en servidor, copia local, cambios pendientes y conflicto. El texto debe estar disponible sin depender del ratón. |
| 19 | **Herramientas a ancho reducido** | Mantener al alcance las acciones más usadas y el acceso al resto. Comprobar también que el foco de teclado lleve el control a la parte visible de la barra. |
| 20 | **Edición de documentos largos** | Conservar posición y ancho de lectura al alternar entre edición y vista previa, especialmente cuando se consulta una evidencia. |

## Corregir

Aquí distingo **límites observados en el código o en pruebas previas** de **casos por reproducir**. Los segundos solo ameritan cambios si fallan.

| # | Corrección o comprobación | Estado |
|---|---|---|
| 1 | Mostrar explícitamente cuándo las correlaciones cubren solo la página cargada. «Sin coincidencias» debe indicar qué parte se revisó. | Límite observado |
| 2 | Comprobar coincidencias cuando el CVE o CWE solo aparece en un hallazgo del **otro** informe. La comparación actual usa campos del resumen de los otros informes. | Límite observado |
| 3 | Completar en navegador el flujo **Revisar copia local → contraseña → comparar → recuperar**. Se probó el descifrado por separado. | Pendiente de comprobación |
| 4 | Verificar que una recarga con una reserva de edición vigente permita seguir editando sin una espera innecesaria. | Por reproducir |
| 5 | Verificar la apertura después de borrar la pizarra recordada. Debe elegirse una disponible o mostrarse un estado vacío claro. | Por reproducir |
| 6 | Verificar la apertura después de archivar el informe recordado o perder acceso a él. La vista debe ofrecer una salida clara. | Por reproducir |
| 7 | Comprobar que la copia para cliente aplique las exclusiones también en metadatos, pies, anexos y contenido estructurado. | Por reproducir |
| 8 | Comprobar que los paquetes para cliente excluyan imágenes originales cuando se haya preparado una versión censurada. | Por reproducir |
| 9 | Verificar que los enlaces Markdown a adjuntos funcionen al extraer el ZIP y que indiquen cuándo falta un archivo. | Por reproducir |
| 10 | Verificar enlaces internos con tildes, encabezados repetidos y anclas manuales en HTML y Markdown. | Por reproducir |
| 11 | Comprobar que el índice apunte a las páginas correctas tras añadir o quitar una portada. | Por reproducir |
| 12 | Detectar cortes en tablas anchas, bloques de código y cadenas largas al exportar a PDF o Word. | Por reproducir |
| 13 | Verificar que el PDF conserve acentos, caracteres especiales y fuentes cuando se abre en otro equipo. | Por reproducir |
| 14 | Comprobar que Word abra y permita editar tablas y figuras sin advertencias de reparación. | Por reproducir |
| 15 | Verificar que HTML y los paquetes portables se puedan leer sin Internet cuando se ofrezcan como copias autónomas. | Por reproducir |
| 16 | Probar CSV con comas, saltos de línea, comillas y valores que empiezan como fórmulas. Ya existe protección y conviene verificarla con archivos representativos. | Por reproducir |
| 17 | Comprobar que un fallo de la exportación indique si se puede reintentar y conserve las opciones elegidas. | Por reproducir |
| 18 | Verificar que un guardado pendiente conserve la versión correcta si el usuario cambia de informe rápidamente. | Por reproducir |
| 19 | Confirmar que los menús del editor devuelvan el foco al disparador al cerrarse y que todas las opciones sean alcanzables por teclado. | Por reproducir |
| 20 | Verificar que un cambio de estado o la restauración de una revisión refresque el listado sin dejar título, fecha o estado anteriores. | Por reproducir |

## Actualizar

Ajustes a lo que ya existe para que refleje cómo se usa y qué entrega realmente hoy.

| # | Propuesta | Resultado |
|---|---|---|
| 1 | **Descripciones de los ocho formatos** | Indicar qué incluye cada archivo y qué se pierde al elegirlo. |
| 2 | **Nombre de «CSV / Excel»** | Mostrar «CSV compatible con Excel» si el archivo generado es `.csv`. |
| 3 | **Nombre de «PDF Ejecutivo»** | Mostrar «PDF» si exporta el informe entero y reservar «Ejecutivo» para una selección real de contenido. |
| 4 | **Plantilla de informe profesional** | Revisar campos de contexto, alcance, limitaciones, hallazgos y recomendaciones con texto inicial fácil de reemplazar. |
| 5 | **Plantilla de write-up de estudio** | Priorizar objetivo, observaciones, decisiones, evidencias y aprendizajes. |
| 6 | **Plantilla de seguimiento** | Incluir verificación, resultado, fecha y acción restante. |
| 7 | **Ayuda de copia para cliente** | Explicar qué marcas se aplican al texto y qué archivos o campos requieren revisión aparte. |
| 8 | **Glosario de estados** | Usar las mismas etiquetas en lista, filtros, detalle, historial y exportación. |
| 9 | **Etiquetas técnicas** | Mostrar juntos el identificador y su nombre cuando exista, por ejemplo «CWE-79 · …». |
| 10 | **Fechas de informes y exportaciones** | Usar formato regional coherente y mostrar la zona horaria cuando importe para comparar eventos. |
| 11 | **Nombres de archivo** | Usar nombres previsibles y distinguir fecha o versión y destino interno o cliente. |
| 12 | **Valores de exportación por defecto** | Revisar márgenes, espaciado, tamaño de letra y densidad de tablas con un documento corto y uno largo. |
| 13 | **Tokens de documentos** | Centralizar colores y tipografía de exportación para PDF, Word y HTML, con los ajustes específicos que cada formato necesite. |
| 14 | **Estilos de código exportado** | Usar monoespaciada legible y contraste suficiente incluso en impresión a escala de grises. |
| 15 | **Convención de referencias** | Mantener nombres y etiquetas de figuras genéricas que resistan cambios de formato. |
| 16 | **Guía de continuidad del editor** | Explicar qué recuerda una pestaña, qué guarda el servidor y cuándo se necesita la contraseña para recuperar una copia. |
| 17 | **Ayuda de correlaciones** | Explicar qué señales se comparan, qué parte de la biblioteca se revisó y qué significa una coincidencia. |
| 18 | **Casos de prueba de exportación** | Usar informes ficticios con tildes, tablas, capturas, anexos, texto censurado y nombres largos. |
| 19 | **Pruebas de regresión visual** | Conservar unas pocas muestras de PDF y HTML representativas para detectar cambios de composición al actualizar el exportador. |
| 20 | **Documentación de compatibilidad** | Registrar qué se comprobó en PDF, Word, HTML y ZIP y dónde quedan diferencias esperables. |

## Agregar

Funciones nuevas con un uso concreto. Las primeras tienen más valor para empezar.

| # | Propuesta | Para qué sirve |
|---|---|---|
| 1 | **Configuraciones de exportación reutilizables** | Guardar dos o tres combinaciones que uses a menudo, por ejemplo entrega a cliente y archivo interno. |
| 2 | **Comprobación previa a la entrega** | Avisar de campos de plantilla sin rellenar, imágenes faltantes, enlaces rotos y documentos marcados como borrador. |
| 3 | **Lista de exclusiones de la copia para cliente** | Mostrar qué texto, evidencia o anexo quedará fuera antes de descargar. |
| 4 | **Exportación por secciones** | Elegir resumen, hallazgos, evidencias o anexos sin duplicar el informe. |
| 5 | **Marca «Versión entregada»** | Asociar la entrega a una revisión concreta y poder identificar después qué se envió. |
| 6 | **Comparar con la última entrega** | Revisar qué cambió desde el documento que recibió el destinatario. |
| 7 | **Enlace interno entre hallazgos** | Vincular manualmente dos hallazgos desde sus informes, con el motivo de la relación. |
| 8 | **Confirmar o descartar una coincidencia** | Conservar tu criterio sobre las correlaciones y evitar revisar repetidamente la misma sugerencia. |
| 9 | **Vista de informes relacionados** | Consultar desde un proyecto sus informes y hallazgos vinculados sin abrir una pizarra adicional. |
| 10 | **Referencias cruzadas en el documento** | Insertar una referencia a una figura, hallazgo o anexo que siga funcionando si cambia su orden. |
| 11 | **Tabla de acciones recomendadas** | Mostrar qué corregir, prioridad y estado en una hoja fácil de consultar o exportar. |
| 12 | **Estado de verificación por hallazgo** | Registrar fecha y resultado del seguimiento con una nota breve. |
| 13 | **Visibilidad por evidencia** | Marcar cada adjunto como interno o compartible sin depender solo de anotaciones en el texto. |
| 14 | **Comprobación de enlaces y adjuntos** | Encontrar referencias huérfanas antes de entregar el informe. |
| 15 | **Duplicar solo la estructura** | Crear un informe con las secciones, sin copiar evidencias, datos del cliente ni hallazgos anteriores. |
| 16 | **Extraer un fragmento como plantilla** | Reutilizar una sección que escribiste bien sin mantener un catálogo aparte. |
| 17 | **Importar el paquete portable** | Reabrir un ZIP propio recuperando Markdown y adjuntos. Empezaría por el formato que ya exporta LESSSO. |
| 18 | **Marcadores personales de lectura** | Señalar un punto al que quieres volver sin insertar marcas en el Markdown. |
| 19 | **Filtro de «requiere atención»** | Encontrar informes con borradores locales, conflictos de guardado o revisiones por completar. |
| 20 | **Archivado reversible de informes** | Sacar informes terminados de la lista de trabajo y encontrarlos cuando vuelvan a ser relevantes. |

## Eliminar

Candidatos a quitar **cuando se confirme que duplican otra función o añaden ruido**. Los formatos útiles, las confirmaciones, las revisiones y las copias de recuperación merecen conservarse.

| # | Qué eliminaría | Qué queda disponible |
|---|---|---|
| 1 | **Formatos etiquetados con promesas que no cumplen** | Nombres que correspondan al contenido real, como CSV cuando el archivo es CSV. |
| 2 | **Opciones de exportación inaplicables al formato** | Solo opciones que cambien el archivo elegido. |
| 3 | **Ajustes de impresión en formatos sin página** | Controles de página en PDF y Word cuando tengan efecto. |
| 4 | **Avisos repetidos de guardado rutinario** | Un estado persistente para autoguardado y avisos cuando haya errores o se solicite una acción explícita. |
| 5 | **Confirmaciones para abrir o cambiar vistas** | Acción directa. La protección sigue apareciendo si hay cambios que podrían perderse. |
| 6 | **Dos accesos con el mismo efecto en la misma barra** | Un control visible en la ubicación más predecible. |
| 7 | **Indicadores que repiten lo que ya dice su etiqueta** | Texto claro y un icono solo cuando ayude a reconocer la acción o el estado. |
| 8 | **Botones deshabilitados que nunca pueden usarse en esa vista** | Ocultarlos si son irrelevantes. Mantenerlos cuando el usuario pueda resolver la condición y se explique cómo. |
| 9 | **Títulos repetidos en paneles y bloques interiores** | Una jerarquía de encabezados que ayude a orientarse. |
| 10 | **Marcos alrededor de cada icono de herramienta** | Iconos simples en reposo, con foco y selección visibles. |
| 11 | **Colores decorativos en estados neutros** | Color reservado para riesgo, error, éxito y selección. |
| 12 | **Píldoras de conteo sin valor de decisión** | Conteos junto al título donde realmente ayuden a revisar una lista. |
| 13 | **Estados vacíos con varias llamadas que conducen al mismo lugar** | Una instrucción breve y una acción útil cuando corresponda. |
| 14 | **Texto de muestra residual en entregas** | Avisarlo antes de exportar para que el autor decida si lo reemplaza. |
| 15 | **Secciones vacías generadas en PDF o Word** | Conservar las que el autor escribió intencionalmente y omitir bloques automáticos sin contenido. |
| 16 | **Páginas en blanco por saltos redundantes** | La paginación y las separaciones necesarias para leer el documento. |
| 17 | **Adjuntos duplicados dentro de un mismo ZIP** | Una sola copia por archivo con referencias válidas. |
| 18 | **Variantes decorativas de plantilla sin un uso distinto** | Un estilo profesional y variantes justificadas por el destino del informe. |
| 19 | **Puntuaciones de correlación sin significado visible** | Razones concretas y categorías comprensibles, como coincidencia técnica o relación de proyecto. |
| 20 | **Funciones antiguas sin referencias ni usuarios** | Retirar solo las que estén sustituidas y comprobar que los informes guardados sigan abriendo correctamente. |

**Mi orden sería:** primero comprobar qué sale realmente en la copia para cliente. Después pulir PDF y Word con dos informes de prueba, uno corto y otro con tablas, capturas y pizarra. Luego mejoraría las correlaciones que ya existen: cobertura clara, motivo visible y enlace al hallazgo. Con esas tres tandas mejoras la entrega y la revisión sin añadir otro sistema de plantillas, otro editor ni un motor nuevo de correlaciones.
