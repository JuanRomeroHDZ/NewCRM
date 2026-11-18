# Inventario de controles — Inicio, Prospección, Correo y servicios, Finanzas

Revisión estática del código; acciones condicionales dependen de los datos, el estado de bóveda y permisos. Los controles listados son familias funcionales, con sus ejemplos y destinos, no una captura de todos los estados en ejecución.

| Área / espacio | Control | Función | Fuente |
|---|---|---|---|
| Inicio / resumen | Fila de módulo «Abrir» | Abre la vista general del módulo. | `frontend/src/components/views/ModuleOverviewView.tsx:68` |
| Inicio / resumen | Desbloquear, Reintentar, cerrar aviso | Abre la bóveda, recarga datos o descarta el aviso del tipo de cambio. | `frontend/src/components/views/DashboardView.tsx:266` |
| Inicio / guía | Ver primeros pasos, cerrar recorrido, Ir a accesos del equipo, Abrir ajustes de sesión, abrir tema | Muestra ayuda o navega a ajustes. | `frontend/src/components/views/HelpView.tsx:98` |
| Prospección / vista general | Abrir Prospectos | Abre la lista de oportunidades. | `frontend/src/components/views/ModuleOverviewView.tsx` |
| Prospección / prospectos | Captar en mapa; Nuevo prospecto | Navega a captación o abre formulario de alta. | `frontend/src/components/views/ProspectsView.tsx:160` |
| Prospección / prospectos | Buscar; Todas las etapas; fila de prospecto; Cargar más | Busca y filtra, abre inspector o pagina resultados. | `frontend/src/components/views/ProspectsView.tsx:190` |
| Prospección / mapa | Mapa / Resultados; giro y palabra clave; Buscar zona / Cancelar; Buscar área visible | Alterna panel móvil y consulta negocios en OpenStreetMap. | `frontend/src/components/views/MapCaptureView.tsx:406` |
| Prospección / mapa | Centrar mapa; Guardar; Volver a la búsqueda; Reintentar | Enfoca negocio, lo guarda como prospecto o recupera búsqueda. Teléfono, correo y web son enlaces externos. | `frontend/src/components/views/MapCaptureView.tsx:609` |
| Prospección / formulario | Opciones de flujo, ámbito, divisa, tipo de pago, correo vinculado; Usar fecha/hora actual; Guardar / Cancelar / Cerrar | Configura y guarda prospecto; ofrece creación rápida de correo. | `frontend/src/components/modals/ProspectModal.tsx:381` |
| Prospección / inspector | Reactivar; Liberar/Reciclar demo; WhatsApp; Enviar correo; Copiar plantilla; canal; Ya respondió; Reiniciar; Fechas de seguimiento | Gestiona ciclo comercial, prepara contacto y registra seguimiento. | `frontend/src/components/layout/inspector/ProspectInspectorSection.tsx:212` |
| Correo y servicios / vista general | Abrir Correo y servicios | Abre correos principales. | `frontend/src/components/views/ModuleOverviewView.tsx` |
| Correo / correos principales | Nuevo correo / Agregar correo; Ver detalles; Editar; Eliminar; Cargar más | Alta, inspector, modificación, papelera y paginación. | `frontend/src/components/views/EmailsView.tsx:180` |
| Correo / correos principales | Vincular; Cuenta o servicio; Prospecto | Vincula el correo con otra entidad. | `frontend/src/components/views/EmailsView.tsx:355` |
| Correo / formulario | Proveedor, correo de respaldo, segundo factor, ámbito; guardar, cancelar, cerrar | Configura una cuenta y sus métodos de recuperación. | `frontend/src/components/modals/EmailModal.tsx:229` |
| Servicios vinculados | Buscar y filtros por correo, estado, etiqueta; Vincular servicio | Busca cuentas y ofrece una única acción de alta; el estado vacío ya no repite el botón. | `frontend/src/components/views/PlatformsView.tsx:196` |
| Servicios vinculados | Ver detalles, editar, eliminar; cargar más | Abre inspector, cambia o envía una cuenta a papelera. | `frontend/src/components/views/PlatformsView.tsx:376` |
| Servicios / formulario | Cliente, correo, proveedor, acceso directo o contraseña, generador, estado de suscripción, divisa, periodo, método de pago; guardar/cancelar/cerrar | Configura cuenta, credenciales y facturación; puede crear correo o cliente. | `frontend/src/components/modals/PlatformModal.tsx:377` |
| Servicios / inspector de credenciales | Ingresar contraseña de acceso; mostrar/verificar credencial, activar código de verificación, cerrar resultado | Desbloquea y administra credenciales y verificación. | `frontend/src/components/layout/inspector/PlatformCredentialsTab.tsx:38` |
| Conexiones / grafo | Filtros y nodos; tipo; Resaltar correos clave; Ocultar correos completos; búsqueda y selección de nodo | Controla contenido y visibilidad del mapa. | `frontend/src/components/views/GraphView.tsx:802` |
| Conexiones / grafo | Acercar, Alejar, Restablecer vista; Agregar correo/prospecto | Ajusta zoom o abre alta desde estado vacío. | `frontend/src/components/views/GraphView.tsx:893` |
| Finanzas / vista general | Abrir Ingresos y pagos / Servicios y vencimientos / Gastos / Tarjetas y métodos | Navega al detalle correspondiente; cifras agregadas no modifican registros. | `frontend/src/components/views/SubscriptionsView.tsx:941` |
| Finanzas / pagos | Registrar pago; Cobrado/Pendiente; +1 mes; Editar; Enviar a papelera | Crea pago, cambia estado, repite un cobro o administra registro. | `frontend/src/components/views/subscriptions/SubscriptionsLists.tsx:115` |
| Finanzas / servicios | Agregar servicio; Costos anuales estimados; Renovar; Editar; Enviar a papelera; Ver detalles | Alta y mantenimiento de renovación; el disclosure muestra estimación. | `frontend/src/components/views/subscriptions/SubscriptionsLists.tsx:245` |
| Finanzas / gastos | Registrar gasto; Editar; Enviar a papelera | Alta y mantenimiento de gastos únicos. | `frontend/src/components/views/subscriptions/SubscriptionsLists.tsx:371` |
| Finanzas / tarjetas | Agregar método, Editar tarjeta, Enviar a papelera | Administra medios de pago. | `frontend/src/components/views/subscriptions/SubscriptionsLists.tsx:475` |
| Finanzas / formulario de pagos | Cliente o alta rápida, ámbito, categoría, divisa, estado, notas; guardar/cancelar/cerrar | Registra o modifica pagos. | `frontend/src/components/views/subscriptions/SubscriptionsModals.tsx:300` |
| Finanzas / formulario de servicios | Cliente o alta rápida, tipo, ámbito, divisa, responsable, datos adicionales; guardar/cancelar/cerrar | Configura servicio y fecha de renovación. | `frontend/src/components/views/subscriptions/SubscriptionsModals.tsx:613` |
| Finanzas / adelantar renovación | Confirmación y selección de cobro | Registra renovación y avanza fecha; opcionalmente registra ingreso. | `frontend/src/components/views/subscriptions/SubscriptionsModals.tsx:976` |
| Finanzas / formulario de gastos | Categoría, ámbito, moneda, tarjeta, notas; guardar/cancelar/cerrar | Registra un gasto único. | `frontend/src/components/views/subscriptions/SubscriptionsModals.tsx:1103` |
| Finanzas / tarjeta | Emisor, mostrar/ocultar número, guardar, cancelar, cerrar | Crea o modifica método de pago. | `frontend/src/components/modals/PaymentModal.tsx:158` |
| Finanzas / inspector | Moneda, estado y categoría de pago; tipo de servicio, responsable, Avanzar 1 ciclo | Modifica los registros desde el inspector. | `frontend/src/components/layout/inspector/InspectorFinanceForms.tsx:254` |
| Finanzas / vista heredada | Editar/actualizar tipo de cambio, confirmación y cancelación; selectors monetarios | Ajusta tipo de cambio o representación financiera en ruta heredada `subscriptions`. | `frontend/src/components/views/SubscriptionsView.tsx:1046` |

## Hallazgos de correlación

- **Alta equivalente:** «Nuevo prospecto», «Nuevo correo», «Nuevo servicio», «Registrar pago», «Agregar servicio», «Registrar gasto» son acciones primarias que abren alta; deben compartir altura, peso, icono, foco y estados, preservando el verbo y el objeto.
- **Navegación:** «Abrir», «Ver detalles», filas presionables y «Captar en mapa» navegan; se presentan como fila, texto o botón con borde. Una familia de enlace/fila y una secundaria para destinos destacados simplificarían la relación.
- **Acciones de fila:** editar y eliminar aparecen en correos, servicios, pagos, gastos y tarjetas; algunas son iconos, otras texto. Unificar tamaño de objetivo, icono de 16 px, tooltip/nombre y hover neutral; rojo solo para eliminación.
- **Estado frente a acción:** `Cobrado/Pendiente` parece una etiqueta de 10 px pero cambia el pago al pulsarla (`SubscriptionsLists.tsx:154`), a diferencia de etiquetas pasivas vecinas. Debe evidenciar claramente que es operable y conservar nombre accesible.
- **Desplegables:** los nativos comparten reglas globales, pero sus opciones abiertas conservan apariencia del navegador. Los filtros y formularios usan select, botones segmentados y detalles según función; unificar marco y foco sin borrar semántica ni interacción.
- **Recuperación/cierre:** «Reintentar», «Actualizar», «Cerrar» y «Cancelar» se repiten en estados y diálogos con clases propias. Unificar estilo secundario y tamaño; el botón de solo icono debe mantener nombre accesible.
- **Escala y zoom:** hay `text-[10px]`, `text-[11px]`, anchos fijos en filtros y controles compactos; revisar reflujo a 200–400% y que acciones no se recorten. No se ha comprobado cada estado ni hover en navegador en esta revisión estática.
# Inventario de controles: Seguridad, Informes, Actividad, Papelera y Ajustes

Alcance: lectura del código fuente, no es una validación visual de cada estado. Se agrupan controles repetidos por función; las opciones dinámicas dependen de los datos. Rutas relativas a `frontend/src/components/`. Base: botones accesibles mediante teclado, controles de al menos 44 px (salvo acciones repetidas compactas), acento para acción principal, superficie neutral para acción secundaria, rojo para destrucción y mismo hover/foco por función. Los `select` nativos conservan comportamiento de opciones propio del navegador.

## Seguridad → Contraseñas y notas

- `views/PasswordsView.tsx:252`: Desbloquear bóveda; Generar contraseña abre generador; Nuevo recurso abre editor. Pestañas Contraseñas y llaves / Recursos y notas cambian colección.
- `views/passwords/CredentialCollection.tsx:48`: filtro de tipo despliega categorías, cada fila abre detalle, Limpiar filtros restablece búsqueda.
- `views/passwords/SecureResourceCollection.tsx:67`: selector y botones de tipo filtran notas y recursos. Revelar/Ocultar contenido, Editar recurso, Enviar a papelera actúan sobre fila; Limpiar filtros restaura vista.
- `views/passwords/SecureResourceEditor.tsx:154`: cerrar, cambiar tipo/ámbito/propiedad, cancelar y guardar configuran el recurso. Revisar coherencia de Guardar/Cancelar con otros editores.
- Los iconos de revelar, editar, eliminar y copiar cumplen funciones equivalentes en toda la plataforma; deben compartir área de interacción, icono y nombre accesible.

## Seguridad → Auditoría

- `views/SecurityAuditView.tsx:112`: desbloquear para consultar; reintentar vuelve a cargar; ir a Ajustes abre configuración. Búsqueda y su botón limpiar reducen resultados.
- Filas de claves API, contraseñas antiguas, cuentas repetidas, débiles y correos sin 2FA abren el inspector correspondiente (`:419`, `:487`, `:562`, `:617`, `:661`). Son filas navegables, no acciones de escritura; necesitan hover y foco iguales entre categorías y señal clara de que abren detalle.

## Seguridad → Informes: lista y cabecera

- `writeups/WriteupsView.tsx:2359`: Desbloquear. Lista: Nuevo crea informe, cerrar/mostrar lista cambia panel, búsqueda, filtro de severidad, abrir fila, cargar más y reintentar.
- Cabecera `:2625`: selector Área de trabajo cambia Informe/Pizarra/vistas; selector de pizarra, crear pizarra, abrir laboratorio, bloquear/desbloquear edición, correlaciones, detalles, guardar, historial y exportar. Más acciones despliega recuperar copias, actualizar, crear hito, duplicar y eliminar informe. Eliminar es destructivo; duplicar y crear hito son secundarios; Guardar y estado de bloqueo deben expresar estado además de color.
- Metadatos `:2873`: severidad y estado; vincular prospecto y proyecto. Deben usar el mismo select y foco de filtros y formularios.
- Hallazgos `:3186`: añadir hallazgo, editar/eliminar, CVSS, vincular evidencia y aplicar taxonomía. Multimedia `:3529`: subir, ampliar, convertir video a GIF, insertar al informe y eliminar. Citas `:3658`: ir al texto y reanclar. Historial `:3700`: comparar, restaurar y seleccionar versiones. Sus operaciones destructivas requieren señales coherentes y confirmación apropiada.
- Visor y recuperación `:3803`: cerrar visor, insertar evidencia, recuperar copia, comparar conflictos, elegir versión, restaurar y paginar diferencias. La mayoría son acciones contextuales; deben tener los mismos estilos que modales generales.
- Hallazgo de consistencia verificable: aún hay acciones con `p-1.5`, `px-2 py-0.5`, `min-h-8` o sin mínimo en filas de hallazgos y multimedia (`:3319`, `:3342`, `:3586`, `:3607`, `:3620`, `:3658`); diálogos de conflicto y comparación también presentan tamaños y colores distintos (`:3946`, `:3984`, `:4104`).

## Informes → Editor Markdown

- `writeups/WriteupMarkdownSplitEditor.tsx:488`: filtrar grupos de herramientas; encabezados H1–H6; etiqueta semántica; negrita, cursiva, tachado y subrayado con color; enlace; lista; código en línea y bloque.
- Insertar cita, tabla, leyenda, callout, sección colapsable, separador, archivo, Mermaid y animación. Seguridad: citar selección en pizarra, censurar, ancla, calculadora CVSS, kit de seguridad y plantillas (`:567–731`).
- Índice, vista interna/cliente y selector Editar/Dos vistas/Vista previa cambian presentación. Bandejas de tablas, etiquetas, plantillas y CVSS insertan contenido; sus controles de aumento/disminución y cancelar deben seguir iguales.
- `writeups/MarkdownRichPreview.tsx:166`: pausar/reanudar diagrama, descargar SVG, reintentar, abrir evidencia y copiar código/referencia. Son acciones contextuales de vista previa; preservar el contenido Markdown fiel.

## Informes → Pizarra

- `writeups/PentestWhiteboard.tsx:1365`: seleccionar grupo Dibujar/Insertar/Vista; seleccionar/lazo o desplazar; texto; formas y dibujo; estilo de flecha; símbolos; color libre o neutral, grosor y ajuste a rejilla. Rejilla es conmutador con estado `aria-pressed`.
- Deshacer, rehacer, duplicar y eliminar selección; insertar captura, nodos, crear ruta; acercar, alejar, restablecer, exportar SVG y agregar vínculo al informe (`:1497–1584`).
- Panel de elementos selecciona y edita cada objeto; galería filtra e inserta símbolos; citas permiten ir al texto o eliminar (`:1613–1815`). Colores libres pertenecen al objeto, no al resto de la interfaz.
- Hay dos conjuntos de zoom en toolbar y lienzo: documentar ambos como la misma función y decidir posteriormente si son redundantes. Los grupos de iconos deben compartir foco y tamaño; algunas superficies aún emplean alias `slate`/`indigo`.

## Informes → Laboratorio, correlaciones y exportación

- `writeups/WriteupWorkbenchModal.tsx:165`: cerrar; pestañas, añadir/eliminar evidencia, abrir evidencia o hallazgo, crear máquina, cambiar estado, añadir/eliminar preguntas y pasos. Snippets: guardar, insertar, editar y eliminar.
- `writeups/WriteupCorrelationsPanel.tsx:31`: filas abren informe correlacionado.
- `writeups/WriteupExportModal.tsx:162`: cerrar, escoger formato, opciones de tamaño/tipografía y profundidad del índice, exportar. Son decisiones y una acción principal; opciones de formato deben conservar estado seleccionado y foco.

## Actividad e historial

- `views/AuditLogsView.tsx:45`: Ver más/menos amplía texto; búsqueda y selector de acción filtran; Mostrar/Ocultar datos sensibles conmuta revelado; Actualizar recarga y Descargar página exporta los registros visibles.
- Expandir registro muestra detalle; paginación anterior/siguiente cambia página (`:472–533`). `min-h-8` en expansión de fila es una excepción compacta a revisar para teclado/touch; los nombres deben reflejar estado expandido.

## Papelera

- `views/TrashView.tsx:228`: desbloquear, acceso a ajustes, cambiar retención, pestañas Papelera/Actividad reciente, búsqueda y tipo. Restaurar recupera elemento, Eliminar permanentemente destruye, Reintentar recarga.
- Restaurar comparte patrón de acción secundaria; eliminación permanente comparte tono destructivo y confirmación con informe, recurso, cuenta y evidencia. La selección de retención es una configuración, distinta de ejecutar borrado.

## Ajustes

- `views/SettingsView.tsx:151`: desbloquear, reintentar carga; selectores de tiempo de bloqueo y limpieza de portapapeles, rotación, seguimiento y divisa de presupuesto. Exportar configuración, Hoja de recuperación y Generar contraseña abren tareas explícitas.
- `settings/OperatorAuthSection.tsx`: crear o activar operador, mostrar/ocultar contraseña, abrir formulario, activar 2FA, buscar y limpiar cuentas, cambiar rol, activar/desactivar o desbloquear intentos fallidos, y actualizar lista. Son acciones sensibles: mantener etiqueta textual, estados deshabilitados y confirmaciones existentes.
- `settings/RuntimeConfigSection.tsx`: actualizar configuración de red y catálogo, seleccionar zona/sector/límites, añadir y eliminar zonas, guardar configuraciones. Distinguir guardar configuración de eliminación de datos.
- Ajustes contiene numerosos formularios; agrupar visualmente por tarea sin rodear una tarjeta con otras tarjetas. Los botones de mostrar contraseña deben compartir implementación y área táctil con los del resto de la app.

## Correlación propuesta de tipos

1. **Primario:** crear, añadir, registrar, guardar, exportar: acento y texto, 44 px mínimo.
2. **Secundario:** editar, duplicar, generar, restaurar, reintentar: superficie neutra y borde coherentes.
3. **Destructivo:** eliminar o enviar a papelera: rojo semántico y confirmación según consecuencia.
4. **Navegación:** abrir informe, prospecto, cuenta o ajustes: fila/enlace neutral, flecha y foco coherentes.
5. **Conmutador/pestaña:** vista, bloqueo, revelar, rejilla y filtro: estado activo explícito, `aria-pressed` o `aria-current` apropiado.
6. **Icono contextual:** copiar, cerrar, mostrar, editar, ampliar: icono Lucide 16 px dentro de objetivo 44 px; nombre accesible.
7. **Menú y selector:** selección de acción o valor; superficie, borde, hover y foco unificados, conservar navegación por teclado.
8. **Formato editorial:** controles de editor, insertan sintaxis o abren una bandeja; misma geometría, agrupación por propósito y estado activo cuando aplique.
## Red y Lab (C2): inventario de controles

Inventario estático del código, no medición de la interfaz renderizada. Las etiquetas cambian ES/EN y los controles pueden estar deshabilitados según interfaz, servicio, autorización y estado del módulo. Rutas relativas a `frontend/src/components/c2/`.

| Espacio | Control y tipo | Función | Fuente |
|---|---|---|---|
| Espacio C2: acceso | Ir a Cuentas del equipo; Reintentar (botones) | Abrir administración de acceso o volver a consultar servicio. | `C2WorkspaceShell.tsx:286` |
| Espacio C2: cabecera | Selector de interfaz; indicador OPSEC; módulos activos; estado y opciones | Seleccionar interfaz, abrir estado de identidad, ver módulos activos y opciones compactas. | `C2WorkspaceShell.tsx:313` |
| Espacio C2: opciones | ES / EN; botón de emergencia | Cambiar idioma o solicitar parada de emergencia. | `C2WorkspaceShell.tsx:457`, `:483` |
| Espacio C2: autorización | Selector de entorno; crear/cancelar; actualizar; formulario cliente, nombre, objetivos IPv4/IPv6, inicio y fin; guardar | Seleccionar o registrar autorización y ventana de operación. | `C2WorkspaceShell.tsx:558`, `:572`, `:583`, `:609`, `:644` |
| Espacio C2: comprobación | Desplegar comprobación previa; volver a comprobar | Mostrar diagnóstico de requisitos y actualizarlo. | `C2WorkspaceShell.tsx:667`, `:688` |
| Espacio C2: consola | Mostrar/ocultar consola; filtro de eventos; limpiar | Inspeccionar, filtrar o limpiar eventos visibles. | `C2WorkspaceShell.tsx:708`, `:725`, `:742` |
| Hosts | Escanear; seleccionar host; acciones por host de puertos, identificación de SO y búsqueda de exploits | Descubrir hosts y abrir o ejecutar análisis específico del host. Se presentan variantes de fila y de ficha según viewport. | `panels/HostsPanel.tsx:171`, `:224`, `:237`, `:245`, `:254`, `:318` |
| Resultados de exploits | Expandir/contraer resultado | Revelar información de una coincidencia. | `ExploitsResultsList.tsx:39` |
| Topología | Escaneo silencioso / agresivo; alejar, acercar, restablecer vista | Descubrir y navegar por el mapa de red. | `panels/TopologyPanel.tsx:883`, `:897`, `:950` |
| Topología: detalle | Cerrar; abrir puertos / seleccionar objetivo; búsqueda y selección de host | Revisar host activo y usarlo como contexto de otras operaciones. | `panels/TopologyPanel.tsx:999`, `:1067`, `:1078`, `:1106`, `:1130` |
| Puertos | IP y rango; selector connect/syn; opción de captura de banner; escanear; buscar exploits | Configurar el escaneo, ejecutarlo y consultar coincidencias. | `panels/PortsPanel.tsx:156`, `:187`, `:203`, `:215`, `:228` |
| MITM | Objetivo y gateway; iniciar / detener; accesos a Sniffer, DNS y Credenciales | Configurar operación y abrir módulos relacionados. | `panels/MitmPanel.tsx:122`, `:150`, `:163`, `:184` |
| Sniffer | Filtro BPF; iniciar / detener; limpiar | Configurar captura, controlarla y limpiar salida. | `panels/SniffPanel.tsx:103`, `:114`, `:127`, `:141` |
| DNS | Mapa de resolución; iniciar / detener | Configurar reglas y controlar módulo. | `panels/DnsPanel.tsx:140`, `:151`, `:164` |
| Credenciales | Iniciar / detener; exportar; limpiar | Controlar captura y gestionar sus resultados. | `panels/CredsPanel.tsx:123`, `:137`, `:151`, `:165` |
| HTTP Inject | Destino, host, ruta, puerto, payload y opción SSL; iniciar / detener; limpiar | Configurar el módulo HTTP, controlar su ejecución y limpiar salida. | `panels/HttpInjectPanel.tsx:90`, `:147`, `:155`, `:176` |
| Poisoners | Parámetros de dirección, nombre y puerto; opciones LLMNR, NBT-NS, mDNS y WPAD; iniciar / detener; limpiar | Configurar servicios, controlarlos y limpiar salida. | `panels/PoisonersPanel.tsx:139`, `:224`, `:232`, `:253` |
| mitm6 | Dominio y opciones de mapeo/redirección; iniciar / detener; limpiar | Configurar módulo IPv6, controlarlo y limpiar salida. | `panels/Mitm6Panel.tsx:122`, `:164`, `:172`, `:193` |
| Wi-Fi: interfaz | Preparar, refrescar, detener procesos, restaurar; iniciar/detener escaneo | Gestionar modo/interfaz y descubrimiento inalámbrico. | `panels/WifiPanel.tsx:318`, `:329`, `:338`, `:347`, `:355`, `:366`, `:375` |
| Wi-Fi: redes y clientes | Deauth, PMKID, seleccionar cliente | Llevar un objetivo detectado al flujo correspondiente o seleccionar cliente. | `panels/WifiPanel.tsx:426`, `:433`, `:492` |
| Wi-Fi: operaciones | BSSID, canal, cliente y opciones; iniciar/detener handshake, PMKID o deauth | Configurar y controlar cada proceso, con avisos y confirmaciones correspondientes. | `panels/WifiPanel.tsx:536`, `:566`, `:622`, `:630`, `:664`, `:705`, `:713`, `:745`, `:787`, `:795` |
| Wi-Fi: capturas guardadas | Actualizar, descargar y acciones por archivo | Revisar y recuperar archivos de captura. | `panels/WifiPanel.tsx:862`, `:902`, `:912` |
| Cámaras | Descubrir, limpiar, objetivo, seleccionar módulo, auditar | Buscar cámaras y ejecutar auditoría puntual desde un resultado. | `panels/CameraPanel.tsx:153`, `:162`, `:187`, `:206`, `:220`, `:326` |
| OPSEC: perfiles | Aplicar perfil; restaurar | Aplicar identidad de un perfil o restaurar identidad original, con confirmación. | `panels/OpsecPanel.tsx:259`, `:358` |
| OPSEC: identidad | Campos hostname, nombre visible, MAC; fabricante; generar host/MAC; aplicar | Preparar y aplicar identidad personalizada. | `panels/OpsecPanel.tsx:385`, `:399`, `:415`, `:433`, `:454`, `:463`, `:480` |
| OPSEC: avanzado | Desplegar cambios avanzados; aplicar solo hostname o solo MAC | Exponer operaciones parciales de identidad. | `panels/OpsecPanel.tsx:491`, `:497`, `:505` |

### Correlación y criterios propuestos

- **Acción primaria**: ejecutar/iniciar/escanear/guardar/aplicar; altura 44 px, acento de marca, texto e icono coherentes, estado ocupado y deshabilitado. Acción de operación real mantiene su confirmación y comprobaciones.
- **Detener / restaurar / emergencia**: detener y emergencia son operaciones con consecuencias; mantener semántica de peligro donde corresponda, con etiqueta explícita. Restaurar requiere confirmación según alcance.
- **Secundaria**: actualizar, limpiar, exportar, descargar, abrir detalle, generar; superficie neutra y borde coherentes. Borrar o limpiar información persistente necesita semántica destructiva según el efecto real.
- **Navegación y selección**: fila de host y accesos a módulos deben distinguir selección activa de hover; foco visible y estado `aria-pressed` cuando sea selección conmutada.
- **Icono y desplegable**: zoom, cierre, actualización y expansión deben tener nombre accesible y objetivo de 44 px; select nativo mantiene el color de sus opciones según navegador/SO.

### Desviaciones observadas en código

- `C2WorkspaceShell.tsx:291` usa hover `bg-obsidian-surface/15`, mientras muchos secundarios usan superficie sólida. Hay al menos dos fórmulas para una misma función secundaria.
- OPSEC y otros paneles usan tanto `outline` como `ring` para foco; existen variaciones de espaciado, radios y tamaño de texto (`text-xs`, `text-[11px]`, `text-sm`).
- El resumen de comprobación previa en `C2WorkspaceShell.tsx:667` no declara altura mínima; conviene revisar objetivo táctil y foco al ampliar zoom.
- Los filtros nativos en `C2WorkspaceShell.tsx:558,725` usan `focus:outline-none`; revisar que el foco visible sea consistente también en el selector de autorización.
- Los controles de Hosts aparecen en variantes para escritorio y móvil; cualquier estandarización debe aplicarse a ambas.
- No se comprobó el comportamiento visual con zoom ni se ejecutaron operaciones, por tratarse de una auditoría estática; no se puede garantizar aquí ausencia de recortes o de inconsistencias adicionales.

## Continuidad de la auditoría

| Área | Comprobado en navegador | Pendiente |
|---|---|---|
| Inicio y Prospección | Guía, Captación en mapa, listado y formulario de prospectos. Captación volvió a cargar tras recargar la pestaña. El servidor había registrado un 404 para un archivo JS de la versión anterior. | Verificar distribución a un cuarto de pantalla y resultados con datos. |
| Correo y servicios | Estados vacíos, formulario de correo, formulario de servicio y apertura del filtro de Conexiones. | Confirmar foco, recortes y acciones por fila con datos. |
| Finanzas | Vistas de ingresos, vencimientos, gastos y tarjetas. Formularios abiertos y cerrados sin guardar. | Comprobar con registros de prueba la conversión, calendario y vínculo gasto–tarjeta de extremo a extremo. |
| Informes y pizarra | Edición, dos vistas, previa e interna/cliente. El menú de listas abierto por teclado mostró doce opciones con nombre en la inspección del navegador, aunque la otra herramienta dejó esos nombres vacíos. A 1280 px CSS, con la navegación abierta, el documento y el contenido principal no desbordaron. La barra de pizarra tenía 56 px de desplazamiento interno. También se observó «Pizarra guardada» deshabilitado tras publicar. | Comprobar todas las categorías y variantes del editor, acciones con un informe de prueba y acceso a los extremos de la barra a anchos menores. |
| Auditoría de seguridad | Captura del estado sin datos antes del cambio. Después de publicar se comprobó que los cinco mensajes vacíos usan el color neutro y no muestran icono de éxito. | Confirmar los estados con datos. |
| Actividad, Papelera y Ajustes | Apertura de detalle de actividad, Papelera vacía y controles de Preferencias. En modo desarrollador se comprobó que «Actividad Reciente» cambia el contenido y muestra los registros con la sesión de equipo activa. | Papelera con elementos, formularios y subapartados de Ajustes. |
| Red y Lab | Se visitaron los trece paneles en una sesión anterior. La revisión de acciones se limitó a estados y controles de interfaz disponibles. | Verificar el aspecto de los controles pasivos con la sesión de equipo activa y a ancho reducido. |

La auditoría visual sigue abierta. Una vista inspeccionada por árbol accesible acredita roles, nombres y estados observados, pero no acredita color, contraste, hover ni ausencia de recortes.

En modo desarrollador se comprobó que Texto, Seleccionar, Formas, Flechas, Símbolos y Estilo de trazo tienen fondo y borde transparentes en reposo y 44 px de alto. Se abrió Símbolos con el ratón y Formas con Enter. Formas mostró seis acciones, fondo neutro y foco visible. Se recorrieron también las categorías Insertar y Vista y exportación sin modificar el informe.

En la configuración «Informe y pizarra» se midieron 555, 1033 y 1527 px CSS. El documento y el contenido principal no desbordaron en ninguno de los tres tamaños. A 555 px, la barra resolvió los 191 px de contenido adicional con desplazamiento horizontal propio.

### Flujos con datos ficticios

- **Informes.** Una recarga en la misma pestaña conservó «QA · Continuidad de informe», la vista «Informe y pizarra» y la segunda pizarra. La hora del último guardado aparece en la descripción del icono. Las pruebas automatizadas confirman que los borradores cifrados se pueden leer con su clave. La recuperación completa en navegador requiere volver a introducir la contraseña si la clave dejó de estar en memoria. El informe muestra «Revisar copia local» cuando encuentra una copia y el editor no tiene cambios pendientes.
- **Finanzas.** El gasto mensual ficticio de 12.50 USD conservó la tarjeta al recargar. El calendario mostró tres mensualidades y presentó 12.50 USD o 231.86 MXN con la tasa de la instalación.
- **Papelera.** Se restauró el gasto y reapareció en Gastos con la tarjeta, el importe y la periodicidad. Al terminar, ambos registros financieros ficticios quedaron en Papelera. La regresión de API repite el ciclo en una base desechable.
