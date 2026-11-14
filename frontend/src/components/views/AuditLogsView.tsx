import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Download, RefreshCw, Eye, EyeOff,
  Search, Lock, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { AuditLogItem } from '../../types';
import { InfoTooltip } from '../common/InfoTooltip';
import { EmptyState } from '../common/EmptyState';
import { InlineErrorNotice } from '../common/InlineErrorNotice';
import { INPUT_LIMITS } from '../../lib/validation';

const PAGE_SIZE = 25;
const DETAIL_PREVIEW_LENGTH = 160;

function censorSensitiveText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi, (_match, local: string, domain: string) => `${local.slice(0, 1)}•••@${domain}`)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (address) => address.split('.').map((part, index) => index === 3 ? part : '***').join('.'))
    .replace(/\+?\d[\d ()-]{5,}\d/g, (phone) => phone.replace(/\d(?=(?:\D*\d){3})/g, '•'));
}

interface AuditDetailsProps {
  text?: string | null;
  entityType?: string | null;
  entity?: string | null;
  ipAddress?: string | null;
  timestamp?: string;
}

const AuditDetails: React.FC<AuditDetailsProps> = ({ text, entityType, entity, ipAddress, timestamp }) => {
  const value = text?.trim();
  const preview = value
    ? value.length <= DETAIL_PREVIEW_LENGTH
      ? value
      : `${value.slice(0, DETAIL_PREVIEW_LENGTH).trimEnd()}…`
    : '—';

  return (
    <div className="min-w-0">
      <p className={`whitespace-pre-wrap break-words ${value ? '' : 'text-white/40'}`}>{preview}</p>
      <details className="group mt-1.5">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center text-[11px] font-medium text-indigo-300 underline decoration-indigo-300/40 underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Ver más</span>
          <span className="hidden group-open:inline">Ver menos</span>
        </summary>
        <div className="mt-2 space-y-2 rounded-lg border border-obsidian-border bg-obsidian-bg/70 p-2.5 text-[11px]">
          <p className="whitespace-pre-wrap break-words">{value || 'Este registro no incluye una descripción adicional.'}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-obsidian-border pt-2 text-obsidian-muted">
            {entityType && <><dt>Tipo</dt><dd className="break-words text-obsidian-text">{getEntityTypeLabel(entityType)}</dd></>}
            {entity && <><dt>Elemento</dt><dd className="break-all text-obsidian-text">{entity}</dd></>}
            {timestamp && <><dt>Fecha</dt><dd className="break-words text-obsidian-text">{timestamp}</dd></>}
            {ipAddress && <><dt>Origen</dt><dd className="break-all text-obsidian-text">{ipAddress}</dd></>}
          </dl>
        </div>
      </details>
    </div>
  );
};
const ENTITY_LABELS: Record<string, string> = {
  email: 'Correo principal',
  email_account: 'Correo principal',
  platform: 'Servicio',
  platform_account: 'Servicio',
  prospect: 'Prospecto',
  payment: 'Método de pago',
  payment_method: 'Método de pago',
  client_income: 'Ingreso',
  domain_renewal: 'Vencimiento',
  one_time_expense: 'Gasto',
  secure_resource: 'Recurso',
  expense: 'Gasto único',
  'Exchange Rate': 'Tipo de cambio',
  exchange_rate: 'Tipo de cambio',
  vault: 'Acceso',
  settings: 'Ajustes',
  runtime_config: 'Configuración',
  writeup: 'Informe',
};

const getEntityTypeLabel = (entityType?: string | null) => {
  if (!entityType) return '—';
  return ENTITY_LABELS[entityType] || entityType.replace(/[_-]+/g, ' ');
};

export const AuditLogsView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast, systemLocale, dataVersion } = useVault();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showSensitiveData, setShowSensitiveData] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const loadGeneration = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (!isUnlocked) {
      setShowSensitiveData(false);
      setExpandedLogIds(new Set());
    }
  }, [isUnlocked]);

  const fetchLogs = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!isUnlocked) {
      setLogs([]);
      setTotal(0);
      setSearchTerm('');
      setSelectedAction('all');
      setOffset(0);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const act = selectedAction === 'all' ? undefined : selectedAction;
      const res = await api.getAuditTrail(PAGE_SIZE, offset, act, undefined, debouncedSearch);
      if (generation !== loadGeneration.current) return;
      setLogs(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      if (generation !== loadGeneration.current) return;
      const msg = err?.message || 'Error cargando auditoría';
      setLoadError(msg);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [isUnlocked, selectedAction, offset, debouncedSearch, showToast]);

  useEffect(() => {
    void fetchLogs();
    return () => {
      loadGeneration.current += 1;
    };
  }, [fetchLogs, dataVersion]);

  const handleActionChange = (nextAction: string) => {
    setOffset(0);
    setSelectedAction(nextAction);
  };

  const exportLogsAsJson = () => {
    const exportedLogs = showSensitiveData ? logs : logs.map((log) => ({
      ...log,
      entity_name: censorSensitiveText(log.entity_name),
      entity_id: censorSensitiveText(log.entity_id),
      details: censorSensitiveText(log.details),
      ip_address: censorSensitiveText(log.ip_address),
    }));
    const blob = new Blob([JSON.stringify(exportedLogs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', url);
    downloadAnchor.setAttribute('download', `contact-lessso-historial-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(
      showSensitiveData
        ? `Descargados ${logs.length} eventos de esta página.`
        : `Descargados ${logs.length} eventos con datos sensibles ocultos.`,
      'success',
    );
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'vault_unlock':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Desbloqueo</span>;
      case 'export':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Exportación</span>;
      case 'restore':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">Restauración</span>;
      case 'create':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Creación</span>;
      case 'update':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">Actualización</span>;
      case 'delete':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">Eliminación</span>;
      case 'copy_secret':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">Copia de acceso</span>;
      case 'update_2fa':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">Verificación en dos pasos</span>;
      case 'contact_followup':
      case 'contact_attempt':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">Seguimiento</span>;
      case 'billing_renewal':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Renovación</span>;
      case 'auto_archive':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-500/10 text-slate-300 border border-slate-500/20">Archivado</span>;
      case 'reactivate':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">Reactivación</span>;
      case 'recycle_demo':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">Demo reutilizada</span>;
      case 'auto_purge':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20">Limpieza automática</span>;
      case 'permanent_delete':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20">Eliminación permanente</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 text-white/60 border border-white/10">Otro cambio</span>;
    }
  };

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
          <Shield className="w-8 h-8" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-center gap-2 mb-6">
          <h2 className="text-xl font-bold text-white">Historial Protegido</h2>
          <InfoTooltip
            title="Protección con contraseña de acceso"
            content="El historial de acciones y accesos está protegido con tu contraseña de acceso."
          />
        </div>
        <button
          type="button"
          onClick={openUnlockModal}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2"
        >
          <Lock className="w-4 h-4" aria-hidden="true" /> Desbloquear con contraseña de acceso
        </button>
      </div>
    );
  }

  const locale = systemLocale || 'es-MX';
  const startItem = total === 0 ? 0 : offset + 1;
  const endItem = Math.min(offset + logs.length, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;
  const searchPending = searchTerm.trim() !== debouncedSearch;

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-6 sm:p-8">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-obsidian-border pb-3">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0" aria-hidden="true" />
          <h1 className="truncate text-base font-bold text-white">
            Historial de actividad <span className="font-normal text-obsidian-muted">({total})</span>
          </h1>
          <InfoTooltip
            title="Registro de Actividad"
            content="Historial cronológico de inicios de sesión, copias de contraseñas, seguimientos y cambios guardados."
          />
        </div>
        <label className="relative w-full min-w-0 sm:w-auto sm:max-w-[18rem] sm:flex-1">
          <span className="sr-only">Buscar en historial por entidad, acción o detalle</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-obsidian-muted" aria-hidden="true" />
          <input
            type="search"
            maxLength={INPUT_LIMITS.SEARCH}
            placeholder="Buscar en el historial"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setOffset(0);
            }}
            className="min-h-10 w-full rounded-lg border border-obsidian-border bg-obsidian-surface pl-9 pr-3 text-xs text-white placeholder-obsidian-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
          />
        </label>
        <select
          value={selectedAction}
          onChange={(event) => handleActionChange(event.target.value)}
          aria-label="Filtrar por acción"
          className="min-h-10 w-32 min-w-0 rounded-lg border border-obsidian-border bg-obsidian-surface px-2 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 sm:w-40"
        >
            {[
              ['all', 'Todas'],
              ['vault_unlock', 'Desbloqueo'],
              ['copy_secret', 'Copia de acceso'],
              ['create', 'Creación'],
              ['update', 'Actualización'],
              ['restore', 'Restauración'],
              ['contact_followup', 'Seguimiento'],
              ['contact_attempt', 'Intento de contacto'],
              ['billing_renewal', 'Renovación'],
              ['auto_archive', 'Archivado'],
              ['reactivate', 'Reactivación'],
              ['recycle_demo', 'Demo reutilizada'],
              ['auto_purge', 'Limpieza automática'],
              ['permanent_delete', 'Eliminación permanente'],
              ['update_2fa', 'Verificación en dos pasos'],
              ['export', 'Exportación'],
              ['delete', 'Eliminación'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={() => setShowSensitiveData((visible) => !visible)}
          aria-pressed={showSensitiveData}
          aria-label={showSensitiveData ? 'Ocultar datos sensibles' : 'Mostrar datos sensibles'}
          title={showSensitiveData ? 'Ocultar datos sensibles' : 'Mostrar datos sensibles'}
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-obsidian-border bg-obsidian-surface text-obsidian-muted hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
        >
          {showSensitiveData ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          aria-label="Actualizar registros de actividad"
          title="Actualizar"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-obsidian-border bg-obsidian-surface text-obsidian-muted hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={exportLogsAsJson}
          disabled={loading || searchPending || Boolean(loadError) || logs.length === 0}
          aria-label="Descargar página"
          title="Descargar página"
          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-obsidian-border bg-obsidian-surface text-obsidian-muted hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {(loading || searchPending) && logs.length > 0 && (
        <p role="status" className="rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-2 text-xs text-obsidian-muted">
          Actualizando el historial. Se conservan los últimos registros cargados; pueden no corresponder a los filtros actuales.
        </p>
      )}
      {loadError && !loading && logs.length > 0 && (
        <InlineErrorNotice
          title="No se pudo actualizar el historial"
          description={`${loadError} Los registros visibles pueden corresponder a filtros anteriores.`}
          actionLabel="Reintentar"
          onAction={() => void fetchLogs()}
        />
      )}
      {loadError && !loading && logs.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="No se pudo cargar el historial de actividad"
          description={loadError}
          actionLabel="Reintentar"
          onAction={fetchLogs}
        />
      ) : (
        <div className="rounded-2xl border border-obsidian-border bg-obsidian-surface/60 overflow-hidden backdrop-blur-md">
          <div className="divide-y divide-obsidian-border md:hidden">
            {(loading || searchPending) && logs.length === 0 ? (
              <p className="p-4 text-xs text-white/50" role="status">
                Cargando actividad...
              </p>
            ) : logs.length === 0 ? (
              <div className="p-4 space-y-2 text-xs text-white/50">
                <p>No se encontraron eventos.</p>
                {(searchTerm || selectedAction !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      handleActionChange('all');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white hover:bg-obsidian-surface"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="min-w-0 space-y-2 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {getActionBadge(log.action)}
                    <time className="text-white/50">
                      {new Date(log.timestamp).toLocaleString(locale)}
                    </time>
                  </div>
                  <p className="break-words font-medium text-white">
                    {showSensitiveData
                      ? (log.entity_name || log.entity_id || getEntityTypeLabel(log.entity_type))
                      : censorSensitiveText(log.entity_name || log.entity_id || getEntityTypeLabel(log.entity_type))}
                  </p>
                  <p className="break-words text-white/50">
                    {getEntityTypeLabel(log.entity_type)} · {showSensitiveData ? (log.ip_address || 'Registro local') : censorSensitiveText(log.ip_address || 'Registro local')}
                  </p>
                  <div className="text-white/70">
                    <AuditDetails
                      text={showSensitiveData ? log.details : censorSensitiveText(log.details)}
                      entityType={log.entity_type}
                      entity={showSensitiveData ? (log.entity_name || log.entity_id) : censorSensitiveText(log.entity_name || log.entity_id)}
                      ipAddress={showSensitiveData ? (log.ip_address || 'Registro local') : censorSensitiveText(log.ip_address || 'Registro local')}
                      timestamp={new Date(log.timestamp).toLocaleString(locale)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto md:block" role="region" aria-label="Tabla de actividad; desplázate horizontalmente para ver todas las columnas" tabIndex={0}>
            <table className="w-full min-w-[850px] text-left border-collapse">
              <thead>
                <tr className="border-b border-obsidian-border bg-black/20 text-[11px] font-mono uppercase tracking-wider text-white/40">
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Fecha & Hora (Local)</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Acción</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Tipo</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Elemento Afectado</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Detalles</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">IP / Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-border text-xs font-mono">
                {(loading || searchPending) && logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-white/40">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" aria-hidden="true" />
                      Cargando eventos de auditoría...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-white/40 space-y-2">
                      <div>No se encontraron eventos coincidentes.</div>
                      {(searchTerm || selectedAction !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm('');
                            handleActionChange('all');
                          }}
                          className="mt-2 inline-flex px-3 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs font-sans hover:bg-obsidian-surface"
                        >
                          Limpiar filtros
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const isExpanded = expandedLogIds.has(log.id);
                    const entity = showSensitiveData
                      ? (log.entity_name || log.entity_id || '')
                      : censorSensitiveText(log.entity_name || log.entity_id);
                    const details = showSensitiveData ? (log.details || '') : censorSensitiveText(log.details);
                    const origin = showSensitiveData
                      ? (log.ip_address || 'Registro local')
                      : censorSensitiveText(log.ip_address || 'Registro local');
                    const timestamp = new Date(log.timestamp).toLocaleString(locale);
                    const preview = details
                      ? details.length <= DETAIL_PREVIEW_LENGTH
                        ? details
                        : `${details.slice(0, DETAIL_PREVIEW_LENGTH).trimEnd()}…`
                      : '—';

                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3 px-2 text-white/50 whitespace-nowrap xl:px-3 2xl:px-4">{timestamp}</td>
                          <td className="py-3 px-2 whitespace-nowrap xl:px-3 2xl:px-4">{getActionBadge(log.action)}</td>
                          <td className="py-3 px-2 text-white/70 capitalize whitespace-nowrap xl:px-3 2xl:px-4">{getEntityTypeLabel(log.entity_type)}</td>
                          <td className="py-3 px-2 text-white font-medium max-w-[200px] break-words xl:px-3 2xl:px-4">
                            {entity ? <span className="text-indigo-300">{entity}</span> : <span className="text-white/30">—</span>}
                          </td>
                          <td className="min-w-[180px] py-3 px-2 text-white/70 xl:px-3 2xl:px-4">
                            <p className="whitespace-pre-wrap break-words">{preview}</p>
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              aria-controls={`audit-detail-${log.id}`}
                              onClick={() => setExpandedLogIds((current) => {
                                const next = new Set(current);
                                if (next.has(log.id)) next.delete(log.id);
                                else next.add(log.id);
                                return next;
                              })}
                              className="mt-1 inline-flex min-h-8 items-center text-[11px] font-medium text-indigo-300 underline decoration-indigo-300/40 underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300"
                            >
                              {isExpanded ? 'Ver menos' : 'Ver más'}
                            </button>
                          </td>
                          <td className="py-3 px-2 text-white/40 text-[11px] whitespace-nowrap xl:px-3 2xl:px-4">{origin}</td>
                        </tr>
                        {isExpanded && (
                          <tr id={`audit-detail-${log.id}`} className="bg-obsidian-bg/70">
                            <td colSpan={6} className="border-t border-obsidian-border px-3 py-3 xl:px-4">
                              <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(14rem,1fr)]">
                                <div className="min-w-0">
                                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-obsidian-muted">Detalle de la actividad</h3>
                                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-white/80">{details || 'Este registro no incluye una descripción adicional.'}</p>
                                </div>
                                <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-obsidian-border pt-2 text-[11px] text-obsidian-muted md:border-l md:border-t-0 md:pl-3 md:pt-0">
                                  <dt>Tipo</dt><dd className="break-words text-obsidian-text">{getEntityTypeLabel(log.entity_type)}</dd>
                                  {entity && <><dt>Elemento</dt><dd className="break-all text-obsidian-text">{entity}</dd></>}
                                  <dt>Fecha</dt><dd className="break-words text-obsidian-text">{timestamp}</dd>
                                  <dt>Origen</dt><dd className="break-all text-obsidian-text">{origin}</dd>
                                </dl>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Bar */}
      {total > PAGE_SIZE && !loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel px-4 py-2.5 text-xs text-obsidian-muted">
          <span>
            Mostrando {startItem}–{endItem} de {total} registros
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev || loading || searchPending}
              onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-white hover:bg-obsidian-border disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              <span>Anterior</span>
            </button>
            <button
              type="button"
              disabled={!canNext || loading || searchPending}
              onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-white hover:bg-obsidian-border disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>Siguiente</span>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
