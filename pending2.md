Side Question: Intenta ir terminando, queda 5% de uso del plan, deja lo que queda pendiente, que tipo de agente y toda la información necesaria para un pending2.md

> **Nota:** En este turno las herramientas están deshabilitadas, por lo que no pude escribir el archivo en disco ni esperar el cierre de los 3 subagentes que seguían activos. Aquí tienes el contenido completo listo para guardar como **`pending2.md`** en la raíz del proyecto (`/home/juanromero/Documents/Proyectos/NewCRM/pending2.md`), junto con el detalle del tipo de agente recomendado para retomarlo.

---

### Contenido listo para `pending2.md`

```markdown
# PENDING 2 — Continuación de Refactor Integral, Anti-Hardcoding, UI/UX y Verificación

> **Fecha de corte:** 2026-11-13
> **Workspace:** `/home/juanromero/Documents/Proyectos/NewCRM`
> **Restricciones estrictas:**
> - **CERO valores hardcodeados** (monedas fijas, zonas geográficas fijas, nombres de organización/marcas de agua, fallbacks literales fuera de catálogo/.env).
> - **CERO emojis** en código o interfaz (solo `lucide-react` o `<svg>` propios).
> - **Seguir `.github/skills/impeccable/SKILL.md` y `reference/craft-floor.md`** (preservando la identidad visual oscura `Contact | LESSSO`).
> - **Limpiar herramientas temporales instaladas** al finalizar si no se van a conservar.

---

## 1. Estado Actual: Qué ya se completó y verificó

### Sprint 1 — Primitivas Accesibles + Configuración Dinámica Backend (COMPLETADO)
- **Componentes comunes creados en Frontend:**
  - `frontend/src/components/common/ConfirmDialog.tsx`
  - `frontend/src/components/common/PromptDialog.tsx`
  - `frontend/src/components/common/EmptyState.tsx`
- **Contexto, Tipos y Cliente API Frontend actualizados:**
  - `frontend/src/types/index.ts`: Relajadas uniones fijas `'MXN' | 'USD'` a `string`; añadidos `RuntimeCurrencyOption`, `RuntimeMapZone`, `RuntimeMapSector`, `RuntimeConfig`.
  - `frontend/src/lib/api.ts`: Añadidos `api.getRuntimeConfig()` y `api.updateRuntimeConfig(payload)`.
  - `frontend/src/context/VaultContext.tsx`: Expone `runtimeConfig`, `refreshRuntimeConfig`, `supportedCurrencies`, `baseCurrency`, `systemLocale`, `confirm()` y `prompt()` montando `<ConfirmDialog>` y `<PromptDialog>`.
- **Backend Dinámico (`ConfigParameter`) sin romper compatibilidad:**
  - `backend/app/services/config_service.py`: Añadidos `get_runtime_config()` y `update_runtime_config()` para `currencies`, `currency_config`, `map_defaults`, `map_zones`, `map_sectors` y `writeup_defaults`.
  - `backend/app/api/v1/settings.py`: Añadidos `GET /api/v1/settings/runtime-config` y `PUT /api/v1/settings/runtime-config` (protegidos con `require_vault_unlocked`); validación de moneda relajada a código ISO `3–8` letras.
  - `backend/app/services/crm_capture.py` y `backend/app/api/v1/crm_capture.py`: `/zones`, `/map-config` y `search_osm_leads()` resuelven zonas, sectores y ciudad desde `get_runtime_config(db)` con fallback seguro.
  - `backend/app/services/writeup_service.py` y `backend/app/services/writeup_exporter.py`: `organization_name` y `watermark_default` en HTML y SARIF resuelven desde `runtime_config`.
  - `backend/app/api/v1/personal_finances.py`, `backend/app/api/v1/crm_sales.py`, `backend/app/api/v1/prospects.py`, `backend/app/schemas/__init__.py`: Patrones `^(MXN|USD)$` relajados a `^[A-Z]{3,8}$`.
- **Pruebas Backend verificadas después del Sprint 1:**
  - `121 passed` en `backend/tests` (`docker run --rm --env-file .env -e PYTHONPATH=/app -e DATABASE_URL=sqlite+aiosqlite:///:memory: -v .../backend:/app -w /app newcrm-backend pytest -q`).
  - `2 passed` en `backend/tests/test_runtime_config.py`.

---

## 2. Trabajo en Curso que Debe Revisarse Primero (Sprints 2, 3 y 4)

Se lanzaron **3 subagentes `self` en paralelo** sobre conjuntos de archivos disjuntos. **Al corte seguían en estado `running`**, por lo que al iniciar el siguiente agente se debe revisar `git status` / `git diff` y completar cualquier archivo que haya quedado a medias:

1. **Bloque A (Subagente `46c1517e` — Shell, Modales, Writeups/Pizarra):**
   - `frontend/src/components/layout/Topbar.tsx` (título `'writeups'`, selector de scope en `<1024px`, ticker dinámico de divisas, `aria-expanded`/`aria-pressed`, Escape/click-outside en popover de tipo de cambio).
   - `frontend/src/components/layout/Sidebar.tsx` (corregir overflow horizontal de tarjeta de bóveda en `lg:w-16` 64px y quitar `role="dialog"` sobre `<aside>`).
   - `frontend/src/components/common/CommandPalette.tsx` (indexar writeups, estado loading/error, backdrop click-to-close, `role="listbox"` + `<button type="button">` en lugar de `<div onClick>`, botón táctil cerrar).
   - `frontend/src/components/modals/{EmailModal,PlatformModal,ProspectModal,PaymentModal,ImportModal}.tsx` (`role="dialog" aria-modal="true"` en panel interno, `type="submit"`, monedas dinámicas desde `useVault()`, habilitar guardar plataforma sin requerir correo, parser CSV RFC-4180 en `ImportModal`, `htmlFor`/`id`).
   - `frontend/src/components/writeups/{WriteupsView,PentestWhiteboard}.tsx` (reemplazar los 5 `window.prompt`/`window.confirm` por `prompt()`/`confirm()`, añadir confirmación + `try/catch` en borrar asset y restaurar revisión, `Escape` + `role="dialog"` en Lightbox y Diff, debounce en búsqueda, onboarding en pizarra vacía y manejo de error al cargar imagen).

2. **Bloque B (Subagente `e13f57a7` — CRM, Cuentas e Inspector):**
   - `frontend/src/components/views/MapCaptureView.tsx` (split en `lg` `1024px`, tabs/drawer `Mapa` / `Resultados` en móvil/tablet, sugerencias de sectores dinámicas desde `mapConfig.sectors`, `savingOsmId` por fila en vez de bloquear todas, `panTo()` al seleccionar resultado).
   - `frontend/src/components/views/GraphView.tsx` (cablear toolbar para `filterType`, HiDPI `devicePixelRatio`, zoom centrado al viewport, umbral drag `>5px` antes de abrir inspector, pinch-to-zoom táctil, estado de error con `EmptyState`, incluir nodo `payment` en leyenda sin solapamientos).
   - `frontend/src/components/views/{EmailsView,PlatformsView,ProspectsView}.tsx` (reemplazar `window.confirm` por `confirm()`, estados de carga y error con `EmptyState`, quitar `truncate` en banner bloqueado de `EmailsView`, corregir `allTags` y `$` hardcodeado en `PlatformsView`, ampliar touch targets a `>=36px`, enriquecer tarjetas/búsqueda de `ProspectsView`).
   - `frontend/src/components/layout/InspectorDrawer.tsx` + subcomponentes nuevos bajo `frontend/src/components/layout/inspector/` (`ProspectInspectorSection.tsx`, `PlatformCredentialsTab.tsx`, `InspectorFinanceForms.tsx`): dividir el monolito de 1,824 líneas, reemplazar todos los `confirm()`/`window.confirm()`, añadir `role="dialog" aria-modal="true"` + Escape, resetear `activeTab` al cambiar entidad, adaptar `grid-cols-1 sm:grid-cols-3` en móvil `375px`.

3. **Bloque C (Subagente `f0ac16a9` — Finanzas, Seguridad y Ajustes):**
   - `frontend/src/components/views/DashboardView.tsx` (mostrar loading y error con `EmptyState` en lugar de KPIs en `0`, corregir borde `sm:border-l` en subgrid de 2 columnas, botones/teclado en tarjetas, etiquetas dinámicas de moneda).
   - `frontend/src/components/views/SubscriptionsView.tsx` + subcomponentes nuevos bajo `frontend/src/components/views/subscriptions/` (`FinancialExecutiveSummary.tsx`, `SubscriptionsModals.tsx`, `SubscriptionsLists.tsx`): dividir el monolito de 3,016 líneas, reemplazar los 4 `window.confirm`, arreglar accesibilidad y `Escape`/backdrop en los 4 modales, ajustar grids `md:grid-cols-2 xl:grid-cols-3` en `1024px`, monedas dinámicas, estados de carga/error.
   - `frontend/src/components/views/{PasswordsView,SecurityAuditView,AuditLogsView,TrashView}.tsx`:
     - `PasswordsView`: vistas tarjeta en `<md` sin scroll horizontal `min-w-[850px]`, modal accesible, botón limpiar filtros, `confirm()`.
     - `SecurityAuditView`: corregir bug crítico donde error/carga mostraba falso `'100/100 Muy Seguro'`, ajustar grid a `375px/768px`.
     - `AuditLogsView`: paginación real usando `total`, sincronizar filtro `<select>` con badges, quitar `'Localhost / Docker'` por `'Registro local'`, corregir etiqueta local/UTC, exportar `filteredLogs`.
     - `TrashView`: `confirm()`, estados carga/error, filtro y estado vacío en pestaña de logs.
   - `frontend/src/components/views/SettingsView.tsx` + `frontend/src/components/settings/OperatorAuthSection.tsx`: añadir sección **"Configuración Dinámica del Sistema"** conectada a `api.getRuntimeConfig()` / `api.updateRuntimeConfig()` + `refreshRuntimeConfig()` para editar monedas activas/base, ciudad/zonas/sectores del mapa y organización/marca de agua de writeups; arreglar swatches `>=36px`, `<label htmlFor>`, estados de error/vacío y filtros en `OperatorAuthSection`.

---

## 3. Qué Falta por Hacer (Sprint 5 + Cierre)

1. **Auditar estado de disco del Frontend tras los 3 subagentes:**
   - Revisar `git status` y `git diff --stat`.
   - Ejecutar desde `frontend/`:
     - `npx tsc --noEmit`
     - `npm run build`
     - `npm test` (ampliar `frontend/tests/` si hace falta cubrir diálogos o utilidades nuevas).
   - Verificar que no quede ningún `window.confirm`, `window.prompt`, `window.alert` ni emoji Unicode en `frontend/src/` ni `backend/app/`.
2. **Revisar brechas adicionales detectadas en el audit inicial (si algún subagente no las cubrió):**
   - `backend/app/services/crm_capture.py` y `backend/app/services/currency.py`: si se configura un par distinto a `USD/MXN`, confirmar soporte end-to-end en `exchange.py` / `currency.py` y revisar cualquier texto/categoría inconsistente (`'renovacion_dominio_hosting'` vs `'dominio_hosting'`).
   - Revisar cualquier `MXN`/`USD` restante fuera de fallbacks por defecto en `frontend/src/lib/financeUtils.ts` (aún convierte/nombra propiedades `*MXN`/`*USD`; generalizar o documentar conversión respecto a `baseCurrency` y `exchangeRate` si es necesario).
3. **Reconstruir y levantar el stack Docker actualizado:**
   - `env -u DOCKER_HOST ./scripts/up.sh` (requiere ejecución fuera del sandbox por build/red Docker).
   - Confirmar contenedores `proxy`, `frontend`, `backend`, `db`, `redis` en estado `healthy`.
4. **Auditoría automatizada en navegador real (13 secciones × 4 viewports: `375x812`, `768x1024`, `1024x768`, `1440x900`):**
   - Ya quedó preparado de forma aislada en el directorio scratch:
     - Paquetes temporales: `/home/juanromero/.gemini/antigravity/brain/7bb1371c-8ce2-4431-8f80-58024b155bb5/scratch/audit-tools` (`playwright-core` + `axe-core`, no tocó `frontend/package.json`).
     - Script listo para correr/ajustar: `/home/juanromero/.gemini/antigravity/brain/7bb1371c-8ce2-4431-8f80-58024b155bb5/scratch/audit_all_sections.mjs`.
   - Ejecutar también `.github/skills/impeccable/scripts/impeccable detect --cdp 9222` o la auditoría Playwright + `axe-core` validando:
     - `overflowX === 0` en las 13 vistas y 4 viewports.
     - `0` violaciones `critical`/`serious` WCAG 2.0 A/AA.
     - `0` errores de consola, `0` errores CSP, `0` respuestas HTTP `>=400` inesperadas, `0` emojis renderizados.
   - Corregir cualquier fallo encontrado en vivo y volver a compilar/probar.
5. **Re-ejecutar suite completa tras la última edición y limpiar:**
   - `npx tsc --noEmit && npm run build && npm test`
   - `pytest -q` en backend (`123+ passed`).
   - Eliminar `/home/juanromero/.gemini/antigravity/brain/7bb1371c-8ce2-4431-8f80-58024b155bb5/scratch/audit-tools` (y revisar si `pending2.md` se archiva o elimina al cerrar).

---

## 4. Qué Tipo de Agente y Configuración Usar al Retomar

- **Agente principal (Coordinador):** Usa el agente estándar de desarrollo (**modelo `Pro` / `inherit`**) leyendo este `pending2.md` primero junto con `.github/skills/impeccable/SKILL.md` y `reference/craft-floor.md`.
- **Subagentes recomendados según fase:**
  1. **Verificación inicial de cambios pendientes (`research` con modelo `flash` o `pro`):** Un subagente `research` de solo lectura para inspeccionar si los archivos de Bloques A/B/C quedaron completos o si alguno quedó truncado/con imports faltantes, además de buscar restos de `window.confirm|prompt|alert`, `'MXN'|'USD'` rígidos o emojis.
  2. **Completar/corregir bloques incompletos (`self` con modelo `pro`):** Solo si el inventario detecta bloques incompletos, lanzar 1–3 subagentes `self` en paralelo sobre archivos estrictamente disjuntos (máximo 1 por bloque faltante).
  3. **Auditoría UI/UX y A11y en vivo + correcciones finales (`self` o agente principal con modelo `pro` + `/impeccable`):** Para ejecutar `audit_all_sections.mjs`, interpretar hallazgos de `axe-core` / `impeccable detect` y aplicar ajustes responsivos/CSS precisos.
- **Comandos útiles del IDE al retomar:**
  - Si prefieres revisión guiada paso a paso tras inspeccionar el estado en disco: `/plan` con el contenido de `pending2.md`.
  - Para verificación rigurosa multiperspectiva en Sprint 5: `/boost`.
```

---

### Resumen rápido de qué hacer en tu siguiente sesión
1. Guarda ese bloque como **`pending2.md`** en `/home/juanromero/Documents/Proyectos/NewCRM/pending2.md`.
2. Abre una nueva conversación (cuando se recupere el cupo) con el agente principal en **`Pro`** y dile: *"Lee `pending2.md`, verifica con `git status` qué alcanzaron a terminar los 3 subagentes del frontend, completa lo que falte y ejecuta todo el Sprint 5 (compilación, pytest, Docker, Playwright + axe-core en las 13 vistas y limpieza)."*





--------

# Esto es lo que avanzaron las IAs y lo que según se iba a hacer:

1. Mejoras transversales recomendadas (Anti-hardcodeo y UI/UX global)

Eliminar todos los window.confirm y window.prompt nativos (12+ puntos detectados)

Hoy existen en SubscriptionsView.tsx, EmailsView.tsx, PasswordsView.tsx, PlatformsView.tsx, WriteupsView.tsx, PentestWhiteboard.tsx e InspectorDrawer.tsx.
Mejora: Crear un componente único ConfirmDialog / PromptDialog accesible (foco atrapado, tecla Esc, tema oscuro unificado y texto configurable sin cadenas fijas).

Configuración dinámica desde Backend en lugar de constantes locales en UI

Moneda y tipo de cambio: config.py define DEFAULT_CURRENCY y el backend ya tiene /exchange, pero ProspectModal.tsx, PlatformModal.tsx y SubscriptionsView.tsx inicializan 'MXN' fijo y Topbar.tsx asume el par USD -> MXN. Conviene exponer moneda base, monedas habilitadas y localidad desde /settings / /system_config.
Zonas y ciudad del mapa de captación: crm_capture.py mantiene TIJUANA_ZONES hardcodeado en Python aunque config.py ya parametriza MAP_DEFAULT_CITY y MAP_FULL_BOUNDS_ZONE_SLUG. Conviene mover las zonas a un catálogo configurable en BD / JSON cargado por env (MAP_ZONES_CONFIG_PATH) y permitir guardar nuevas áreas (bounding boxes) desde la interfaz.

Refactorizar archivos monolíticos antes de seguir añadiendo UI

SubscriptionsView.tsx supera las 3,015 líneas e InspectorDrawer.tsx las 1,823 líneas. Dividirlos por pestaña/dominio mejorará latencia de render, pruebas unitarias y coherencia visual.

Consistencia UI/UX de tokens, estados vacíos, densidad y accesibilidad

Unificar alturas de controles, paddings de tarjetas, badges de estado, tablas responsivas en <768px (conversión a tarjetas o scroll horizontal explícito sin desbordar), estados empty/error/loading uniformes y navegación por teclado (Esc, Tab, aria-label completos).
2. Revisión detallada por cada apartado (qué revisar y mejorar)
Fase A — Shell global, Modales transversales y Búsqueda
Apartados: Sidebar.tsx, Topbar.tsx, CommandPalette.tsx, InspectorDrawer.tsx y modales (EmergencyKitModal, EncryptedBackupModal, EnvExportModal, ImportModal, VaultUnlockModal).
Qué revisar/mejorar:
Incluir resultados de Writeups y Hallazgos en CommandPalette (Ctrl+K) para salto instantáneo desde cualquier módulo.
Hacer que Topbar adapte el selector de divisa y notificaciones en 375px–768px sin apilar controles ni depender de USD/MXN fijo.
Partir InspectorDrawer en subcomponentes por tipo de entidad (prospecto, cuenta, servicio, email) y sustituir su window.confirm.
Fase B — Inicio (Resumen general)
Apartado: DashboardView.tsx (877 líneas).
Qué revisar/mejorar:
Revisar jerarquía KPI, evitar sobrecarga de tarjetas en pantallas medianas (768px–1024px) y alinear sus gráficos/colores con los del resto del sistema.
Conectar métricas configurables (metas comerciales/presupuesto desde Ajustes, no umbrales fijos en componente) e incluir acceso directo a writeups abiertos/criticos si el usuario está en modo pentesting.
Fase C — CRM (Captación en mapa y Prospectos)
Apartados: MapCaptureView.tsx, ProspectsView.tsx, ProspectModal.tsx y crm_capture.py.
Qué revisar/mejorar:
Sustituir TIJUANA_ZONES fijo por zonas configurables vía BD/JSON + buscador por coordenadas/ciudad configurable y categorías/sectores editables en Ajustes.
Mejorar UX móvil de MapCaptureView (split mapa + panel de resultados colapsable para que en 375px–768px no quede comprimido el mapa).
Limpiar placeholders con URLs específicas en ProspectModal y leer moneda/canal por defecto desde configuración del servidor.
Fase D — Cuentas (Correos principales, Cuentas y servicios, Mapa de conexiones)
Apartados: EmailsView.tsx, PlatformsView.tsx, GraphView.tsx, EmailModal.tsx, PlatformModal.tsx.
Qué revisar/mejorar:
Controles táctiles/zoom más claros y leyenda filtrable en GraphView para grafos densos en pantallas medianas.
Quitar window.confirm al enviar a papelera, homogeneizar filtros/búsqueda y evitar valores monetarios por defecto fijos en PlatformModal.
Fase E — Finanzas (Ingresos y gastos)
Apartados: SubscriptionsView.tsx (3,015 líneas) y PaymentModal.tsx.
Qué revisar/mejorar:
Dividir SubscriptionsView en subcomponentes (CardsTab, IncomeTab, RenewalsTab, ExpensesTab, BudgetHeader).
Parametrizar monedas y etiquetas de conversión desde backend, convertir las tablas anchas a layout responsive legible en móvil/tablet y reemplazar los 4 window.confirm.
Fase F — Sistema y Seguridad (Contraseñas, Writeups, Auditoría, Historial, Papelera, Ajustes)
Apartados: PasswordsView.tsx, WriteupsView.tsx, SecurityAuditView.tsx, AuditLogsView.tsx, TrashView.tsx, SettingsView.tsx, OperatorAuthSection.tsx.
Qué revisar/mejorar:
En WriteupsView: sustituir los 3 window.prompt/window.confirm por modales propios y verificar usabilidad táctil de la barra de pizarra en <640px.
En SettingsView: centralizar allí las nuevas opciones dinámicas (moneda base, zonas/ciudades del mapa, categorías de captación, plantillas/organización por defecto para reportes PDF/DOCX).
En AuditLogsView / SecurityAuditView / TrashView: añadir paginación real, filtros persistentes y texto de fallback limpio (AuditLogsView.tsx:242 usa 'Localhost / Docker' fijo).
3. Plan de ejecución propuesto (orden de trabajo)
Sprint 1 — Inventario de Hardcodeo + Fundación UI Compartida
Auditoría automática con subagentes sobre los 13 apartados para listar cada constante hardcodeada, fallo de diseño y diálogo nativo.
Creación de componentes base compartidos (ConfirmDialog, PromptDialog, EmptyState, ResponsiveTable) y endpoint de configuración pública/bóveda para moneda/mapa/organización.
Sprint 2 — Revisión de Shell, Inicio y Finanzas (Dashboard, Topbar, InspectorDrawer, SubscriptionsView)
Modularización de SubscriptionsView y InspectorDrawer, diseño responsive de tablas y gráficas, pruebas en 375/768/1024/1440px.
Sprint 3 — Revisión de CRM y Cuentas (MapCapture, Prospects, Emails, Platforms, Graph)
Desacoplar TIJUANA_ZONES, mejorar el split mapa/resultados en móvil/tablet y el canvas de GraphView.
Sprint 4 — Revisión de Seguridad y Writeups (Passwords, Writeups, SecurityAudit, AuditLogs, Trash, Settings)
Exponer configuración editable en SettingsView, pulir flujo táctil de Writeups/Pizarra y unificar paginación/tablas.
Sprint 5 — Regresión integral, Accesibilidad y Cierre
Auditoría DevTools multi-viewport + pytest + npm test + verificación visual en cada vista.
4. Qué herramientas, subagentes, skills y MCP usaré
Lo que ya está disponible y listo hoy en este entorno
Skills ya instalados en el repo y en el entorno:
impeccable (.github/skills/impeccable) y sus agentes especializados en .github/agents/ (impeccable-finish-reviewer, impeccable-asset-producer, impeccable-manual-edit-applier) para auditoría visual, contraste, espaciado, jerarquía y estados interactivos.
agy-customizations: útil si quieres fijar reglas permanentes del proyecto (por ejemplo: prohibición de emojis, diálogos nativos o valores hardcodeados en UI).
generative_ui: útil para presentarte comparativas o diagramas de arquitectura interactivos durante la revisión.
Slash commands recomendados para dirigir cada fase:
/teamwork-preview o subagentes research en paralelo: para auditar múltiples apartados simultáneamente sin saturar el contexto.
/grill-me: si antes de empezar quieres cerrar decisiones de producto/diseño (p. ej., qué zonas/monedas quieres permitir).
/plan y /boost: para ejecutar el refactor de vistas grandes como SubscriptionsView.tsx con verificación rigurosa.
Herramientas de ejecución y DevTools actuales:
Chromium Headless vía CDP (devtools_audit.mjs): ya probado contra https://localhost:8443 para medir overflowX, rects, CSS calculado, consola, CSP y respuestas HTTP.
pytest (backend) + node --test + tsc + vite build (frontend).
MCPs que NO están conectados hoy pero te recomiendo agregar (opcionales, gran impacto)

En esta sesión no hay servidores MCP externos configurados (por eso usé Chrome CDP por script). Si deseas llevar la revisión UI/UX al siguiente nivel, conviene conectar:

@playwright/mcp o chrome-devtools-mcp: me permitiría navegar vista por vista, hacer capturas reales (screenshot) de cada apartado en 375px, 768px, 1024px y 1440px, inspeccionar visualmente solapamientos y verificar el árbol de accesibilidad ARIA en vivo.
Herramienta/Auditoría axe-core (vía Playwright o CLI local): para detectar automáticamente fallos de contraste WCAG AA, botones sin aria-label, modales sin role="dialog" o jerarquía de encabezados.
postgres MCP (modo solo lectura) (opcional): útil para validar migraciones, índices y datos almacenados al desacoplar catálogos (como zonas del mapa) hacia BD.
Linters estáticos en CI (.github/workflows/ci.yml): eslint-plugin-jsx-a11y en frontend y ruff en backend para impedir regresiones.

Si estás de acuerdo con este plan, dime:

Si quieres conectar primero algún MCP (como Playwright/DevTools MCP para inspección con capturas) o prefieres que avancemos con Chromium CDP + subagentes + impeccable tal como estamos ahora.
Por qué sprint/apartado quieres comenzar (o si arrancamos en orden desde Sprint 1: Inventario anti-hardcodeo + diálogos/componentes base).
11:01 AM
Realiza las implementaciones, puedes hacer uso de multiples sub agentes si gustas, puedes instalar lo que necesites, etc Al final deberás de eliminar todo lo que instalaste o si es muy buena herramienta, dejarla

Los tres subagentes de refactorización paralela siguen implementando las mejoras de los Sprints 2, 3 y 4 en las vistas, modales, inspectores y paneles de configuración dinámica, mientras se preparan las herramientas temporales de auditoría (playwright-core y axe-core) en el entorno aislado para las pruebas del Sprint 5.

En espera de que concluyan para compilar, reconstruir el stack y auditar las 13 secciones.

La suite de pruebas para la configuración dinámica del backend (test_runtime_config.py) pasó correctamente y las herramientas de auditoría (playwright-core + axe-core + script multi-sección para los 4 tamaños de pantalla) están preparadas en el entorno aislado.

Esperando únicamente que los tres subagentes paralelos finalicen sus refactorizaciones en el frontend para compilar, reconstruir el stack Docker y correr la auditoría completa del Sprint 5.

El subagente de CRM, Cuentas e Inspector ya concluyó todas sus refactorizaciones (MapCaptureView, GraphView, EmailsView, PlatformsView, ProspectsView e InspectorDrawer dividido en subcomponentes modulares, con 0 errores TypeScript y 0 diálogos nativos/emojis).

Los otros dos subagentes (Shell/Modales/Writeups y Finanzas/Seguridad/Ajustes) están terminando sus últimas ediciones para pasar inmediatamente a compilación, reconstrucción y auditoría multi-sección.

El segundo subagente (Shell, Modales y Writeups) ya terminó satisfactoriamente los 10 archivos asignados (0 errores de TypeScript en sus archivos, 0 emojis y 0 diálogos nativos). El tercer subagente (Finanzas, Seguridad y Ajustes) se encuentra ejecutando su verificación final de integridad.

En el siguiente paso arrancará el Sprint 5: compilación completa (tsc, vite build, npm test, pytest), reconstrucción del stack Docker y auditoría automatizada en navegador real (375px, 768px, 1024px, 1440px).

Todos los módulos del frontend quedaron refactorizados (cero emojis y cero diálogos nativos window.confirm/window.prompt en el escaneo estático; 15/15 pruebas unitarias de frontend aprobadas).

En ejecución ahora: compilación final de producción (tsc && vite build) y suite completa de pruebas backend (pytest). En cuanto concluyan, reconstruiremos los contenedores Docker y ejecutaremos la auditoría Playwright + axe-core sobre las 13 vistas y 4 resoluciones.

Model unavailable, retrying in 15s (attempt 4/9)
