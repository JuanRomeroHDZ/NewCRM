import React, { useState, useEffect } from 'react';
import { 
  Rocket, Plus, Search, Globe, MessageCircle, Phone, MapPin, 
  Clock, CheckCircle2, AlertTriangle, ExternalLink, ArrowRight, 
  Mail, RotateCcw, Edit3, Share2, Timer 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { Prospect, EmailAccount, ProspectStatus } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { TagBadge } from '../common/TagBadge';
import { CopyButton } from '../common/CopyButton';
import { 
  PROSPECT_STATUS_OPTIONS, 
  getStatusMeta, 
  getWorkflowMeta, 
  getSlaBadgeMeta, 
  formatDuration, 
  formatSlaHoursLabel, 
  computeLiveSla, 
  buildWhatsAppUrl 
} from '../../lib/prospectUtils';

export const ProspectsView: React.FC = () => {
  const { 
    openInspector, openProspectModal, showToast, 
    triggerDataReload, dataVersion 
  } = useVault();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [search, setSearch] = useState('');
  const [selectedEmail, setSelectedEmail] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedSlaStatus, setSelectedSlaStatus] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Live 1-second ticker for real-time SLA counters
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getProspects({
        search: search || undefined,
        email_id: selectedEmail || undefined,
        workflow_type: selectedWorkflow || undefined,
        status: selectedStatus || undefined
      }),
      api.getEmails()
    ]).then(([prList, emList]) => {
      setProspects(prList);
      setEmails(emList);
    }).catch(console.error).finally(() => setLoading(false));
  }, [search, selectedEmail, selectedWorkflow, selectedStatus, dataVersion]);

  // Compute live SLA metrics for all prospects
  const enrichedProspects = prospects
    .map((p) => ({
      prospect: p,
      live: computeLiveSla(p, nowMs)
    }))
    .filter((item) => {
      if (selectedSlaStatus && item.live.slaStatus !== selectedSlaStatus) {
        return false;
      }
      return true;
    });

  // KPI aggregations (across all loaded prospects)
  const allLive = prospects.map((p) => ({ prospect: p, live: computeLiveSla(p, nowMs) }));
  const demoFirstCount = prospects.filter((p) => p.workflow_type === 'demo_first').length;
  const directQuoteCount = prospects.filter((p) => p.workflow_type === 'direct_quote').length;
  const enTiempoCount = allLive.filter((x) => x.live.slaStatus === 'en_tiempo').length;
  const cumplidoItems = allLive.filter((x) => x.live.slaStatus === 'cumplido');
  const vencidoCount = allLive.filter((x) => x.live.slaStatus === 'vencido').length;

  const avgResponseSecs =
    cumplidoItems.length > 0
      ? Math.round(cumplidoItems.reduce((acc, c) => acc + c.live.elapsedSeconds, 0) / cumplidoItems.length)
      : 0;

  const handleMarkResponded = async (e: React.MouseEvent, p: Prospect) => {
    e.stopPropagation();
    setProcessingId(p.id);
    try {
      const updated = await api.markProspectResponded(p.id);
      const formattedTime = formatDuration(updated.response_time_seconds || updated.elapsed_seconds, false);
      if (updated.met_sla) {
        showToast(`✓ ¡${p.company_name} respondió en ${formattedTime}! SLA Cumplido en tiempo.`, 'success');
      } else {
        showToast(`${p.company_name} marcado como respondido (${formattedTime} — fuera del límite SLA).`, 'warning');
      }
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResetTimer = async (e: React.MouseEvent, p: Prospect) => {
    e.stopPropagation();
    setProcessingId(p.id);
    try {
      await api.resetProspectTimer(p.id, true);
      showToast(`Contador SLA reiniciado desde ahora para ${p.company_name}.`, 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleQuickStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>, p: Prospect) => {
    e.stopPropagation();
    const newStatus = e.target.value as ProspectStatus;
    try {
      await api.updateProspect(p.id, { status: newStatus });
      const statusLabel = getStatusMeta(newStatus).label;
      showToast(`Estado de ${p.company_name} actualizado a "${statusLabel}".`, 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Rocket className="text-indigo-400" size={18} />
            <span>CRM de Prospectos & Páginas Demo</span>
          </h2>
          <p className="text-xs text-obsidian-muted">
            Seguimiento de páginas demo creadas, cotizaciones directas, contacto omnicanal y medidor de SLA de respuesta vinculado a tus correos
          </p>
        </div>

        <button
          type="button"
          onClick={() => openProspectModal()}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all whitespace-nowrap active:scale-95"
        >
          <Plus size={14} />
          <span>Nuevo Prospecto / Demo</span>
        </button>
      </div>

      {/* Top 4 SLA & CRM KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Prospects */}
        <div className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all">
          <div className="flex items-center justify-between text-obsidian-muted mb-2">
            <span className="text-xs font-medium">Total Prospectos & Demos</span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Rocket size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-white tracking-tight">
            {prospects.length}{' '}
            <span className="text-xs font-sans text-obsidian-muted">registrados</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1 flex items-center justify-between">
            <span>{demoFirstCount} con Demo Web</span>
            <span>{directQuoteCount} Cotización Directa</span>
          </div>
        </div>

        {/* En Tiempo (Pendiente) */}
        <div 
          onClick={() => setSelectedSlaStatus(selectedSlaStatus === 'en_tiempo' ? '' : 'en_tiempo')}
          className={`p-5 rounded-2xl bg-obsidian-panel border transition-all cursor-pointer ${
            selectedSlaStatus === 'en_tiempo'
              ? 'border-amber-500/60 shadow-lg shadow-amber-500/10'
              : 'border-obsidian-border hover:border-obsidian-borderLight'
          }`}
        >
          <div className="flex items-center justify-between text-obsidian-muted mb-2">
            <span className="text-xs font-medium">En Tiempo (Pendientes)</span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Timer size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300 tracking-tight">
            {enTiempoCount}{' '}
            <span className="text-xs font-sans text-obsidian-muted">en espera</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1">
            Dentro del tiempo límite estipulado
          </div>
        </div>

        {/* Cumplido (Éxito) */}
        <div 
          onClick={() => setSelectedSlaStatus(selectedSlaStatus === 'cumplido' ? '' : 'cumplido')}
          className={`p-5 rounded-2xl bg-obsidian-panel border transition-all cursor-pointer ${
            selectedSlaStatus === 'cumplido'
              ? 'border-emerald-500/60 shadow-lg shadow-emerald-500/10'
              : 'border-obsidian-border hover:border-obsidian-borderLight'
          }`}
        >
          <div className="flex items-center justify-between text-obsidian-muted mb-2">
            <span className="text-xs font-medium">SLA Cumplido (Éxito)</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight">
            {cumplidoItems.length}{' '}
            <span className="text-xs font-sans text-obsidian-muted">respondidos a tiempo</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1 font-mono">
            {avgResponseSecs > 0
              ? `Promedio respuesta: ${formatDuration(avgResponseSecs, false)}`
              : 'Sin respuestas registradas aún'}
          </div>
        </div>

        {/* Vencido (Alerta) */}
        <div 
          onClick={() => setSelectedSlaStatus(selectedSlaStatus === 'vencido' ? '' : 'vencido')}
          className={`p-5 rounded-2xl bg-obsidian-panel border transition-all cursor-pointer ${
            selectedSlaStatus === 'vencido'
              ? 'border-rose-500/60 shadow-lg shadow-rose-500/10'
              : 'border-obsidian-border hover:border-obsidian-borderLight'
          }`}
        >
          <div className="flex items-center justify-between text-obsidian-muted mb-2">
            <span className="text-xs font-medium">Vencidos (Alerta SLA)</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400 tracking-tight">
            {vencidoCount}{' '}
            <span className="text-xs font-sans text-obsidian-muted">tiempo agotado</span>
          </div>
          <div className="text-[11px] text-obsidian-muted mt-1">
            {vencidoCount > 0 ? '⚠ Requieren seguimiento o re-contacto' : '✓ Sin prospectos vencidos'}
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa, cliente, WhatsApp, teléfono o URL demo..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Workflow filter */}
          <select
            value={selectedWorkflow}
            onChange={(e) => setSelectedWorkflow(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-obsidian-text focus:outline-none focus:border-indigo-500"
          >
            <option value="">Todos los Flujos</option>
            <option value="demo_first">Demo Web + Seguimiento</option>
            <option value="direct_quote">Cotización Directa</option>
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-obsidian-text focus:outline-none focus:border-indigo-500"
          >
            <option value="">Todos los Estados</option>
            {PROSPECT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* SLA Semáforo filter */}
          <select
            value={selectedSlaStatus}
            onChange={(e) => setSelectedSlaStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-obsidian-text focus:outline-none focus:border-indigo-500"
          >
            <option value="">Todos los Semáforos SLA</option>
            <option value="en_tiempo">En tiempo (Pendiente)</option>
            <option value="cumplido">Cumplido (Éxito)</option>
            <option value="vencido">Vencido (Alerta)</option>
          </select>

          {/* Correlated Email filter */}
          <select
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-obsidian-text focus:outline-none focus:border-indigo-500"
          >
            <option value="">Todos los Correos Vinculados</option>
            {emails.map((e) => (
              <option key={e.id} value={e.id}>
                {e.address}
              </option>
            ))}
          </select>
        </div>

        {/* View Toggle */}
        <div className="flex items-center p-1 rounded-xl bg-obsidian-bg border border-obsidian-border">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              viewMode === 'grid' ? 'bg-obsidian-surface text-white' : 'text-obsidian-muted hover:text-white'
            }`}
          >
            Tarjetas
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              viewMode === 'table' ? 'bg-obsidian-surface text-white' : 'text-obsidian-muted hover:text-white'
            }`}
          >
            Tabla
          </button>
        </div>
      </div>

      {/* GRID VIEW (Rich Prospect Cards) */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {enrichedProspects.map(({ prospect: p, live }) => {
            const statusMeta = getStatusMeta(p.status);
            const workflowMeta = getWorkflowMeta(p.workflow_type);
            const slaMeta = getSlaBadgeMeta(live.slaStatus);
            const waUrl = buildWhatsAppUrl(p.whatsapp, p.company_name, p.demo_url);

            return (
              <div
                key={p.id}
                onClick={() => openInspector('prospect', p.id)}
                className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all cursor-pointer group flex flex-col justify-between space-y-4 shadow-lg hover:shadow-xl"
              >
                {/* Top Row: Company Info + Workflow & Status Badges */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <PlatformIcon name={p.company_name} size="md" />
                      <div className="min-w-0">
                        <h3 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors truncate">
                          {p.company_name}
                        </h3>
                        <div className="text-[11px] text-obsidian-muted flex flex-wrap items-center gap-1.5 mt-0.5">
                          {p.contact_name && <span className="text-obsidian-text font-medium">{p.contact_name}</span>}
                          {p.contact_name && p.email_address && <span>•</span>}
                          {p.email_address ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (p.email_id) openInspector('email', p.email_id);
                              }}
                              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-mono text-[10px]"
                              title="Inspeccionar correo raíz vinculado"
                            >
                              <Mail size={10} />
                              <span>{p.specific_alias || p.email_address}</span>
                            </button>
                          ) : (
                            <span className="text-obsidian-muted">Sin correo vinculado</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Status Dropdown & Edit */}
                    <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${workflowMeta.badgeClass}`}>
                        {workflowMeta.shortLabel}
                      </span>
                      <select
                        value={p.status}
                        onChange={(e) => handleQuickStatusChange(e, p)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase border cursor-pointer focus:outline-none ${statusMeta.badgeClass}`}
                        title="Cambiar estado del flujo"
                      >
                        {PROSPECT_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-obsidian-panel text-white">
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => openProspectModal(undefined, p.id)}
                        title="Editar prospecto"
                        className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
                      >
                        <Edit3 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* SLA Timer & Semáforo Panel */}
                  <div className="p-3.5 rounded-xl bg-obsidian-surface/70 border border-obsidian-border space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {/* Semáforo Badge */}
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${slaMeta.badgeClass}`}>
                          <span className={`w-2 h-2 rounded-full ${slaMeta.dotClass}`} />
                          <span>{slaMeta.label}</span>
                        </span>
                        <span className="text-[10px] text-obsidian-muted font-mono">
                          Límite: {formatSlaHoursLabel(p.sla_hours)}
                        </span>
                      </div>

                      {/* Quick Action: "Ya respondió" or "Reiniciar timer" */}
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {!live.isResponded ? (
                          <button
                            type="button"
                            disabled={processingId === p.id}
                            onClick={(e) => handleMarkResponded(e, p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 text-[11px] font-semibold transition-all active:scale-95"
                            title="Detener contador y calcular si respondió dentro del tiempo estipulado"
                          >
                            <CheckCircle2 size={13} className="text-emerald-400" />
                            <span>{processingId === p.id ? 'Guardando...' : 'Ya respondió'}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={processingId === p.id}
                            onClick={(e) => handleResetTimer(e, p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-obsidian-bg hover:bg-obsidian-border text-obsidian-muted hover:text-white border border-obsidian-border text-[10px] font-medium transition-colors"
                            title="Reiniciar contador SLA desde ahora"
                          >
                            <RotateCcw size={11} />
                            <span>Reiniciar Timer</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Digital Stopwatch Readout */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Clock size={13} className="text-obsidian-muted" />
                        <span className="text-obsidian-muted text-[11px]">
                          {live.isResponded ? 'Respondió en:' : 'Tiempo transcurrido:'}
                        </span>
                        <span className="font-mono font-bold text-white text-sm tracking-tight">
                          {formatDuration(live.elapsedSeconds, !live.isResponded)}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono">
                        {live.isResponded ? (
                          live.metSla ? (
                            <span className="text-emerald-400">✓ Dentro del límite ({formatSlaHoursLabel(p.sla_hours)})</span>
                          ) : (
                            <span className="text-rose-400">⚠ Excedió límite ({formatSlaHoursLabel(p.sla_hours)})</span>
                          )
                        ) : live.slaStatus === 'en_tiempo' ? (
                          <span className="text-amber-300">Restan {formatDuration(live.remainingSeconds, false)}</span>
                        ) : (
                          <span className="text-rose-400">Excedido por {formatDuration(live.overdueSeconds, false)}</span>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 rounded-full bg-obsidian-bg overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${slaMeta.barClass}`}
                        style={{ width: `${live.progressPercent}%` }}
                      />
                    </div>

                    {p.started_at && (
                      <div className="flex items-center justify-between text-[10px] text-obsidian-muted font-mono">
                        <span>Inicio: {new Date(p.started_at).toLocaleString()}</span>
                        {p.responded_at && (
                          <span className="text-emerald-300">
                            Respuesta: {new Date(p.responded_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Demo URL Banner */}
                  {p.demo_url && (
                    <div 
                      className="p-2.5 rounded-xl bg-obsidian-surface/50 border border-obsidian-border flex items-center justify-between gap-2 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Globe size={14} className="text-indigo-400 flex-shrink-0" />
                        <span className="text-obsidian-muted text-[11px] flex-shrink-0">Demo:</span>
                        <a
                          href={p.demo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-indigo-300 hover:text-indigo-200 truncate text-[11px] underline decoration-indigo-500/40"
                        >
                          {p.demo_url.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <CopyButton value={p.demo_url} label="URL de la Demo" />
                        <a
                          href={p.demo_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir página demo en nueva pestaña"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium transition-colors"
                        >
                          <span>Abrir Demo</span>
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* One-Click Contact & Location Pills */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
                    {/* WhatsApp Direct Button */}
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 text-[11px] font-medium transition-colors"
                        title={`Abrir chat de WhatsApp (${p.whatsapp})`}
                      >
                        <MessageCircle size={13} className="text-emerald-400" />
                        <span>WhatsApp</span>
                        <span className="font-mono text-[10px] text-emerald-200/80">{p.whatsapp}</span>
                      </a>
                    )}

                    {/* Phone Number Pill */}
                    {p.phones && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-obsidian-surface border border-obsidian-border text-[11px] text-obsidian-text">
                        <Phone size={12} className="text-cyan-400" />
                        <a href={`tel:${p.phones.split(',')[0].trim()}`} className="font-mono hover:text-white">
                          {p.phones}
                        </a>
                        <CopyButton value={p.phones} label="Teléfono" />
                      </div>
                    )}

                    {/* Google Maps Direct Link */}
                    {p.maps_url && (
                      <a
                        href={p.maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/25 text-[11px] font-medium transition-colors"
                        title="Abrir ubicación en Google Maps"
                      >
                        <MapPin size={13} className="text-amber-400" />
                        <span>Google Maps</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>

                  {/* Notes & Social preview */}
                  {(p.notes || p.social_links) && (
                    <div className="text-[11px] text-obsidian-muted space-y-1 pt-1">
                      {p.social_links && (
                        <div className="flex items-center gap-1.5 text-obsidian-text/80 truncate">
                          <Share2 size={11} className="text-indigo-400 flex-shrink-0" />
                          <span className="truncate">{p.social_links}</span>
                        </div>
                      )}
                      {p.notes && (
                        <p className="line-clamp-2 leading-relaxed text-obsidian-muted">
                          {p.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer: Tags & Inspect Action */}
                <div className="pt-3 border-t border-obsidian-border/60 flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap gap-1">
                    {p.tags && p.tags.length > 0 ? (
                      p.tags.map((t, idx) => <TagBadge key={idx} name={t.name} color={t.color} />)
                    ) : (
                      <span className="text-obsidian-muted text-[10px]">Sin etiquetas</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-obsidian-muted group-hover:text-white transition-colors whitespace-nowrap">
                    <span>Ver ficha</span>
                    <ArrowRight size={13} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-obsidian-text">
              <thead className="bg-obsidian-surface/60 border-b border-obsidian-border text-obsidian-muted font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Empresa / Prospecto</th>
                  <th className="py-3 px-4">Flujo & Estado</th>
                  <th className="py-3 px-4">Semáforo SLA & Timer</th>
                  <th className="py-3 px-4">Demo & Contacto Rápido</th>
                  <th className="py-3 px-4">Correo Vinculado</th>
                  <th className="py-3 px-4 text-right">Acciones Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-border">
                {enrichedProspects.map(({ prospect: p, live }) => {
                  const statusMeta = getStatusMeta(p.status);
                  const workflowMeta = getWorkflowMeta(p.workflow_type);
                  const slaMeta = getSlaBadgeMeta(live.slaStatus);
                  const waUrl = buildWhatsAppUrl(p.whatsapp, p.company_name, p.demo_url);

                  return (
                    <tr
                      key={p.id}
                      onClick={() => openInspector('prospect', p.id)}
                      className="hover:bg-obsidian-surface/50 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <PlatformIcon name={p.company_name} size="sm" />
                          <div>
                            <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors block">
                              {p.company_name}
                            </span>
                            <span className="text-[11px] text-obsidian-muted block">
                              {p.contact_name || p.contact_email || 'Sin contacto nominal'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-start gap-1">
                          <select
                            value={p.status}
                            onChange={(e) => handleQuickStatusChange(e, p)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border cursor-pointer focus:outline-none ${statusMeta.badgeClass}`}
                          >
                            {PROSPECT_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value} className="bg-obsidian-panel text-white">
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] text-obsidian-muted">{workflowMeta.label}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold border ${slaMeta.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${slaMeta.dotClass}`} />
                            <span>{slaMeta.label}</span>
                          </span>
                          <div className="font-mono text-xs text-white font-semibold">
                            {formatDuration(live.elapsedSeconds, !live.isResponded)}
                            <span className="text-[10px] text-obsidian-muted font-normal ml-1">
                              / {formatSlaHoursLabel(p.sla_hours)}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {p.demo_url && (
                            <a
                              href={p.demo_url}
                              target="_blank"
                              rel="noreferrer"
                              title={`Abrir Demo: ${p.demo_url}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium"
                            >
                              <Globe size={12} />
                              <span>Demo</span>
                            </a>
                          )}
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={`Abrir WhatsApp: ${p.whatsapp}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-medium"
                            >
                              <MessageCircle size={12} />
                              <span>WhatsApp</span>
                            </a>
                          )}
                          {p.maps_url && (
                            <a
                              href={p.maps_url}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir Google Maps"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-medium"
                            >
                              <MapPin size={12} />
                            </a>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-cyan-300">
                        {p.specific_alias || p.email_address || '—'}
                      </td>

                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {!live.isResponded ? (
                            <button
                              type="button"
                              disabled={processingId === p.id}
                              onClick={(e) => handleMarkResponded(e, p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold"
                              title="Marcar que el cliente ya respondió"
                            >
                              <CheckCircle2 size={12} />
                              <span>Ya respondió</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleResetTimer(e, p)}
                              className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
                              title="Reiniciar contador SLA"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openInspector('prospect', p.id)}
                            title="Inspeccionar ficha"
                            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
                          >
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {enrichedProspects.length === 0 && !loading && (
        <div className="py-16 text-center text-obsidian-muted text-xs space-y-3">
          <p>No se encontraron prospectos o demos con los filtros seleccionados.</p>
          <button
            type="button"
            onClick={() => openProspectModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
          >
            <Plus size={14} />
            <span>Crear Primer Prospecto / Demo</span>
          </button>
        </div>
      )}
    </div>
  );
};
