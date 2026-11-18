import React, { useEffect, useState } from 'react';
import {
  Activity, ArrowRight, Briefcase, CreditCard, FileText, Lock, Mail, PenTool, Radar,
  Settings, ShieldCheck, BookOpen, RefreshCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useVault, SectionType } from '../../context/VaultContext';
import { useC2 } from '../../context/C2Context';
import { api } from '../../lib/api';
import type { AuditLogItem, EmailAccount, PlatformAccount, Prospect, ReportOverview, SecurityAuditResponse, VaultCredentialItem, WriteupOverview } from '../../types';

type OverviewRoute = Extract<SectionType, `overview_${string}`>;
type Metric = { label: string; value: string; detail?: string };
type ChildLink = { id: SectionType; label: string; description: string; icon: LucideIcon };
type OverviewDefinition = { title: string; description: string; links: ChildLink[] };

const definitions: Record<Exclude<OverviewRoute, 'overview_finances'>, OverviewDefinition> = {
  overview_prospection: {
    title: 'Prospección',
    description: 'Rastrea oportunidades y organiza el seguimiento desde una sola vista.',
    links: [
      { id: 'prospects', label: 'Prospectos', description: 'Gestiona oportunidades, contacto y seguimiento.', icon: Briefcase },
    ],
  },
  overview_communications: {
    title: 'Correo y servicios',
    description: 'Relaciones entre cuentas principales, servicios y conexiones.',
    links: [
      { id: 'emails', label: 'Correo y servicios', description: 'Administra las cuentas, servicios y conexiones del espacio.', icon: Mail },
    ],
  },
  overview_security: {
    title: 'Seguridad',
    description: 'Estado de la bóveda, credenciales y auditoría de seguridad.',
    links: [
      { id: 'passwords', label: 'Contraseñas y notas', description: 'Consulta claves, notas protegidas y recursos de acceso.', icon: Lock },
    ],
  },
  overview_reports: {
    title: 'Reportes',
    description: 'Documentos técnicos en Typst, lienzos visuales en Excalidraw y su relación.',
    links: [
      { id: 'reports_documents', label: 'Documentos (Typst)', description: 'Redacta informes en Typst, correlaciona hallazgos y exporta a PDF, HTML o .typ.', icon: FileText },
      { id: 'reports_canvases', label: 'Lienzos (Excalidraw)', description: 'Dibuja diagramas, vincúlalos a un documento e insértalos con un clic.', icon: PenTool },
    ],
  },
  overview_c2: {
    title: 'Red y Lab (C2)',
    description: 'Estado de la sesión y herramientas del entorno autorizado activo.',
    links: [
      { id: 'c2_hosts', label: 'Espacio de trabajo C2', description: 'Abre el entorno activo y sus módulos de operación.', icon: Radar },
    ],
  },
  overview_activity: {
    title: 'Actividad y papelera',
    description: 'Consulta los movimientos recientes y administra elementos eliminados.',
    links: [
      { id: 'audit_logs', label: 'Historial de actividad', description: 'Revisa los movimientos registrados en el espacio.', icon: Activity },
    ],
  },
  overview_settings: {
    title: 'Ajustes',
    description: 'Preferencias de apariencia, sesión, acceso, red y respaldo.',
    links: [
      { id: 'settings', label: 'Configuración avanzada', description: 'Abre las preferencias y herramientas del espacio.', icon: Settings },
    ],
  },
};

const count = (value: number) => new Intl.NumberFormat('es-MX').format(value);

function OverviewRows({ links, onOpen }: { links: ChildLink[]; onOpen: (id: SectionType) => void }) {
  return (
    <nav aria-label="Secciones del módulo" className="divide-y divide-obsidian-border">
      {/* [Navegación] Cada fila abre el área de trabajo correspondiente. */}
      {links.map(({ id, label, description, icon: Icon }) => (
        <button key={id} type="button" onClick={() => onOpen(id)} className="ui-nav-action group min-h-[60px] w-full min-w-0 gap-3 rounded-none border-0 px-3 py-3 focus-visible:ring-inset">
          <Icon size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-obsidian-text">{label}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-obsidian-muted">{description}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-obsidian-muted transition-colors group-hover:text-obsidian-text">
            Abrir <ArrowRight size={15} aria-hidden="true" />
          </span>
        </button>
      ))}
    </nav>
  );
}

function MetricsList({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid min-w-0 grid-cols-1 divide-y divide-obsidian-border sm:grid-cols-2 sm:divide-y-0">
      {metrics.map((metric, index) => (
        <div key={`${metric.label}-${index}`} className={`min-w-0 py-3 first:pt-0 sm:py-3 ${index % 2 === 0 ? 'sm:pl-0 sm:pr-4' : 'sm:pl-4 sm:pr-0'} ${index % 2 === 0 && index + 1 < metrics.length ? 'sm:border-r sm:border-obsidian-border' : ''} ${index > 1 ? 'sm:border-t sm:border-obsidian-border' : ''}`}>
          <dt className="text-xs text-obsidian-muted">{metric.label}</dt>
          <dd className="mt-1 break-words text-base font-semibold tabular-nums text-obsidian-text">{metric.value}</dd>
          {metric.detail && <dd className="mt-1 break-words text-xs leading-relaxed text-obsidian-muted">{metric.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}

export const ModuleOverviewView: React.FC = () => {
  const {
    activeSection, activeScope, setActiveSection, isUnlocked, openUnlockModal, dataVersion,
    matchesScope, timeoutMinutes, clipboardClearSeconds,
  } = useVault();
  const c2 = useC2();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (activeSection === 'overview_settings') {
      setMetrics([
        { label: 'Bloqueo automático', value: `${count(timeoutMinutes)} min`, detail: 'Sin actividad' },
        { label: 'Limpieza del portapapeles', value: `${count(clipboardClearSeconds)} s` },
      ]);
      setHasError(false);
      setLoading(false);
      return;
    }
    if (activeSection === 'overview_c2') {
      const activeEngagement = c2.engagements.find((item) => item.id === c2.activeEngagementId);
      setMetrics([
        { label: 'Servicio C2', value: c2.serviceState === 'running' ? 'Disponible' : c2.serviceState === 'checking' ? 'Comprobando' : c2.serviceState === 'forbidden' ? 'Sin autorización' : c2.serviceState === 'unavailable' ? 'No disponible' : 'Inactivo' },
        { label: 'Entorno activo', value: activeEngagement?.title || 'Sin seleccionar' },
        { label: 'Hosts en contexto', value: count(c2.hosts.length) },
        { label: 'Módulos activos', value: count(c2.activeModuleCount) },
      ]);
      setHasError(false);
      setLoading(false);
      return;
    }
    if (!isUnlocked) {
      setMetrics([]);
      setHasError(false);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setHasError(false);
    const load = async () => {
      let nextMetrics: Metric[] = [];
      let failed = false;
      if (activeSection === 'overview_prospection') {
        const result = await Promise.allSettled([api.getProspects()]);
        if (result[0].status === 'fulfilled') {
          const prospects = result[0].value.filter((item) => matchesScope(item.scope));
          const followups = prospects.filter((item) => item.needs_recontact || item.followup_status === 'vencido');
          nextMetrics = [
            { label: 'Prospectos', value: count(prospects.length) },
            { label: 'Con demo', value: count(prospects.filter((item) => Boolean(item.demo_url)).length) },
            { label: 'Seguimientos pendientes', value: count(followups.length) },
            { label: 'Con respuesta', value: count(prospects.filter((item) => Boolean(item.responded_at)).length) },
          ];
        } else failed = true;
      } else if (activeSection === 'overview_communications') {
        const result = await Promise.allSettled([api.getEmails(), api.getPlatforms(), api.getGraph()]);
        const emails = result[0].status === 'fulfilled' ? result[0].value.filter((item) => matchesScope(item.scope)) : null;
        const platforms = result[1].status === 'fulfilled' ? result[1].value.filter((item) => matchesScope(item.scope)) : null;
        const graph = result[2].status === 'fulfilled' ? result[2].value : null;
        failed = !emails || !platforms || !graph;
        nextMetrics = [
          ...(emails ? [{ label: 'Correos principales', value: count(emails.length), detail: `${count(emails.filter((item) => item.two_factor_method !== 'none').length)} con verificación en dos pasos` }] : []),
          ...(platforms ? [
            { label: 'Servicios vinculados', value: count(platforms.length), detail: `${count(platforms.filter((item) => item.subscription_status === 'active').length)} activos · ${count(platforms.filter((item) => item.subscription_status === 'free_trial').length)} en prueba` },
            { label: 'Acceso a servicios', value: `${count(platforms.filter((item) => item.access_type === 'sso').length)} con correo`, detail: `${count(platforms.filter((item) => item.access_type === 'own_password').length)} con contraseña propia` },
          ] : []),
          ...(graph ? [{ label: activeScope === 'all' ? 'Conexiones registradas' : 'Conexiones · todos los ámbitos', value: count(graph.links.length), detail: `${count(graph.nodes.length)} elementos en el mapa` }] : []),
        ];
      } else if (activeSection === 'overview_security') {
        const result = await Promise.allSettled([api.getSecurityHealth(), api.getVaultCredentials(), api.getWriteupsOverview()]);
        const audit = result[0].status === 'fulfilled' ? result[0].value as SecurityAuditResponse : null;
        const credentials = result[1].status === 'fulfilled' ? result[1].value as VaultCredentialItem[] : null;
        const reports = result[2].status === 'fulfilled' ? result[2].value as WriteupOverview : null;
        failed = !audit || !credentials || !reports;
        const languages = reports?.language_distribution.slice(0, 3).map((item) => `${item.label} ${item.percentage}%`).join(' · ') || 'Sin bloques de código registrados';
        const exportFormats = reports?.export_distribution.slice(0, 3).map((item) => `${item.label.toUpperCase()} ${item.percentage}%`).join(' · ') || 'Sin exportaciones registradas';
        nextMetrics = [
          ...(audit ? [{ label: 'Estado de seguridad', value: audit.health_score === null ? 'Sin puntaje' : `${count(audit.health_score)} / 100`, detail: `${count(audit.vulnerable_accounts_count)} cuentas con alertas` }] : []),
          ...(credentials ? [{ label: 'Credenciales guardadas', value: count(credentials.length), detail: 'Solo se muestra el total; no se exponen nombres ni secretos.' }] : []),
          ...(reports ? [{ label: 'Informes', value: count(reports.report_count), detail: `${count(reports.total_words)} palabras · lectura estimada ${count(reports.estimated_reading_minutes)} min` }] : []),
          ...(reports ? [{ label: 'Lenguajes en bloques de código', value: languages }] : []),
          ...(reports ? [{ label: 'Exportaciones', value: count(reports.export_count), detail: exportFormats }] : []),
          ...(reports ? [{ label: 'Informe más extenso', value: reports.largest_document_title || 'Sin informes', detail: `${count(reports.largest_document_words)} palabras` }] : []),
          ...(reports ? [{ label: 'Revisiones', value: count(reports.revision_count), detail: reports.unreadable_documents ? `${count(reports.unreadable_documents)} documentos no disponibles para el resumen` : undefined }] : []),
        ];
      } else if (activeSection === 'overview_reports') {
        const result = await Promise.allSettled([api.getReportOverview()]);
        if (result[0].status === 'fulfilled') {
          const ov = result[0].value as ReportOverview;
          const hours = Math.floor(ov.reading_minutes / 60);
          const mins = ov.reading_minutes % 60;
          const readingLabel = ov.reading_minutes === 0 ? '0 min' : hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;
          const statusSummary = Object.entries(ov.documents_by_status)
            .map(([k, v]) => `${k}: ${count(v)}`)
            .join(' · ') || 'Sin documentos';
          nextMetrics = [
            { label: 'Documentos (Typst)', value: count(ov.total_documents), detail: statusSummary },
            { label: 'Palabras y lectura estimada', value: `${count(ov.total_words)} palabras`, detail: `Lectura estimada: ${readingLabel}` },
            { label: 'Lienzos (Excalidraw)', value: count(ov.total_canvases), detail: `${count(ov.linked_canvases)} vinculados · ${count(ov.total_canvas_elements)} elementos` },
            { label: 'Último documento / lienzo', value: ov.latest_document_title || 'Sin documentos', detail: ov.latest_canvas_title ? `Lienzo: ${ov.latest_canvas_title}` : 'Sin lienzos' },
          ];
        } else failed = true;
      } else if (activeSection === 'overview_activity') {
        const result = await Promise.allSettled([api.getAuditTrail(1, 0), api.getTrash()]);
        const logs = result[0].status === 'fulfilled' ? result[0].value as { total: number; items: AuditLogItem[] } : null;
        const trash = result[1].status === 'fulfilled' ? result[1].value as unknown[] : null;
        failed = !logs || !trash;
        nextMetrics = [
          ...(logs ? [{ label: 'Registros de actividad', value: count(logs.total), detail: logs.items.length ? `Último evento: ${logs.items[0].action} · ${logs.items[0].entity_type}` : 'Sin actividad registrada.' }] : []),
          ...(trash ? [{ label: 'Elementos en papelera', value: count(trash.length) }] : []),
        ];
      }
      if (active) {
        setMetrics(nextMetrics);
        setHasError(failed);
        setLoading(false);
      }
    };
    void load().catch(() => { if (active) { setHasError(true); setLoading(false); } });
    return () => { active = false; };
  }, [activeSection, dataVersion, isUnlocked, matchesScope, timeoutMinutes, clipboardClearSeconds, c2.activeEngagementId, c2.activeModuleCount, c2.engagements, c2.hosts.length, c2.serviceState, reloadKey]);

  if (activeSection === 'overview_finances') return null;
  const definition = definitions[activeSection as Exclude<OverviewRoute, 'overview_finances'>];
  if (!definition) return null;

  if (!isUnlocked && activeSection !== 'overview_settings') {
    return (
      <section className="mx-auto mt-8 max-w-xl px-4 text-center">
        <Lock size={24} className="mx-auto text-obsidian-muted" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold text-obsidian-text">Desbloquea para ver este resumen</h2>
        <p className="mt-1 text-sm text-obsidian-muted">Los datos permanecen protegidos mientras la bóveda está cerrada.</p>
        <button type="button" onClick={openUnlockModal} className="ui-action-primary mt-4">{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}Desbloquear</button>
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-5 p-4 sm:p-6">
      <section className="min-w-0 border-b border-obsidian-border pb-4" aria-labelledby="module-overview-title">
        <h2 id="module-overview-title" className="font-heading text-xl font-semibold text-obsidian-text">{definition.title}</h2>
        <p className="mt-1 text-sm text-obsidian-muted">{definition.description}</p>
      </section>

      {loading ? (
        <p role="status" className="inline-flex items-center gap-2 text-sm text-obsidian-muted"><RefreshCw size={16} className="animate-spin" aria-hidden="true" />Cargando resumen…</p>
      ) : <>
        {hasError && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-obsidian-border pb-3 text-sm text-amber-200">
            <span>Parte de la información no está disponible.</span>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="ui-action-secondary">{/* [Acción secundaria] Permite volver o reintentar sin modificar otros datos. */}Actualizar</button>
          </div>
        )}
        {metrics.length > 0 && <MetricsList metrics={metrics} />}
        <section className="min-w-0 border-t border-obsidian-border pt-4" aria-label="Accesos del módulo">
          <OverviewRows links={definition.links} onOpen={setActiveSection} />
        </section>
      </>}
    </div>
  );
};

type GlobalModuleDirectoryProps = {
  metrics: Partial<Record<OverviewRoute | 'overview_finances', string>>;
};

export const GlobalModuleDirectory: React.FC<GlobalModuleDirectoryProps> = ({ metrics }) => {
  const { setActiveSection } = useVault();
  const c2 = useC2();
  const globalLinks: ChildLink[] = [
    { id: 'overview_prospection', label: 'Prospección', description: metrics.overview_prospection || 'Oportunidades, captación y seguimiento.', icon: Briefcase },
    { id: 'overview_communications', label: 'Correo y servicios', description: metrics.overview_communications || 'Cuentas principales, servicios y relaciones.', icon: Mail },
    { id: 'overview_finances', label: 'Finanzas', description: metrics.overview_finances || 'Ingresos, vencimientos, gastos y métodos de pago.', icon: CreditCard },
    { id: 'overview_security', label: 'Seguridad', description: metrics.overview_security || 'Credenciales y auditoría de seguridad.', icon: ShieldCheck },
    { id: 'overview_reports', label: 'Reportes', description: metrics.overview_reports || 'Documentos Typst, lienzos Excalidraw y correlaciones.', icon: FileText },
    { id: 'overview_c2', label: 'Red y Lab (C2)', description: `${count(c2.activeModuleCount)} módulos activos · ${c2.activeEngagementId ? 'Entorno seleccionado' : 'Sin entorno seleccionado'}`, icon: Radar },
    { id: 'overview_activity', label: 'Actividad y papelera', description: metrics.overview_activity || 'Historial de cambios y elementos eliminados.', icon: Activity },
    { id: 'overview_settings', label: 'Ajustes', description: metrics.overview_settings || 'Preferencias, acceso, sesión y respaldos.', icon: Settings },
  ];
  return (
    <section className="min-w-0" aria-labelledby="global-module-directory-title">
      <div className="border-b border-obsidian-border pb-3">
        <h2 id="global-module-directory-title" className="font-heading text-base font-semibold text-obsidian-text">Módulos</h2>
        <p className="mt-1 text-xs text-obsidian-muted">Elige un apartado para abrir su vista general.</p>
      </div>
      <OverviewRows links={globalLinks} onOpen={setActiveSection} />
    </section>
  );
};
