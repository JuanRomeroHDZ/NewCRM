import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Download, RefreshCw,
  Search, Lock, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { AuditLogItem } from '../../types';
import { InfoTooltip } from '../common/InfoTooltip';
import { EmptyState } from '../common/EmptyState';
import { INPUT_LIMITS } from '../../lib/validation';

const PAGE_SIZE = 100;

export const AuditLogsView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast, systemLocale, dataVersion } = useVault();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const loadGeneration = useRef(0);

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
      const res = await api.getAuditTrail(PAGE_SIZE, offset, act);
      if (generation !== loadGeneration.current) return;
      setLogs(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      if (generation !== loadGeneration.current) return;
      const msg = err?.message || 'Error cargando auditoría';
      setLoadError(msg);
      showToast(msg, 'error');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [isUnlocked, selectedAction, offset, showToast]);

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

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (log.action && log.action.toLowerCase().includes(term)) ||
      (log.entity_name && log.entity_name.toLowerCase().includes(term)) ||
      (log.details && log.details.toLowerCase().includes(term)) ||
      (log.entity_type && log.entity_type.toLowerCase().includes(term))
    );
  });

  const exportLogsAsJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `contact-lessso-historial-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast(`Exportados ${filteredLogs.length} eventos en JSON`, 'success');
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
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">Copia Secreto</span>;
      case 'update_2fa':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">Verificación en dos pasos</span>;
      case 'contact_followup':
      case 'contact_attempt':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20">Seguimiento</span>;
      case 'billing_renewal':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Renovación</span>;
      case 'auto_archive':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-500/10 text-slate-300 border border-slate-500/20">Archivo Frío</span>;
      case 'reactivate':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">Reactivación</span>;
      case 'recycle_demo':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">Demo Reciclada</span>;
      case 'auto_purge':
      case 'permanent_delete':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-300 border border-rose-500/20">Auto-Purga / Purga</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 text-white/60 border border-white/10">{action}</span>;
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

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-6 sm:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-obsidian-border">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0" aria-hidden="true" />
          <h1 className="text-base font-bold text-white break-words">
            Historial de Actividad ({total} registros)
          </h1>
          <InfoTooltip
            title="Registro de Actividad"
            content="Historial cronológico de inicios de sesión, copias de contraseñas, seguimientos y cambios guardados."
          />
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            aria-label="Actualizar registros de actividad"
            className="p-2 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight text-white/70 hover:text-white transition-all disabled:opacity-50"
            title="Actualizar registros"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={exportLogsAsJson}
            className="px-3.5 py-2 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight text-white text-xs font-medium flex items-center gap-2 transition-all hover:bg-white/5"
          >
            <Download className="w-4 h-4 text-white/60" aria-hidden="true" /> Descargar historial
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" aria-hidden="true" />
          <input
            type="text"
            maxLength={INPUT_LIMITS.SEARCH}
            aria-label="Buscar en historial por entidad, acción o detalle"
            placeholder="Buscar por entidad, acción o detalle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        <label className="flex w-full min-w-0 items-center gap-2 text-xs text-white/60 sm:w-auto">
          <span>Acción</span>
          <select
            value={selectedAction}
            onChange={(event) => handleActionChange(event.target.value)}
            className="min-h-10 min-w-0 flex-1 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 text-white sm:w-52"
          >
            {[
              ['all', 'Todas'],
              ['vault_unlock', 'Desbloqueo'],
              ['copy_secret', 'Copia Secreto'],
              ['create', 'Creación'],
              ['update', 'Actualización'],
              ['restore', 'Restauración'],
              ['contact_followup', 'Seguimiento'],
              ['contact_attempt', 'Intento de contacto'],
              ['billing_renewal', 'Renovación'],
              ['auto_archive', 'Archivo Frío'],
              ['reactivate', 'Reactivación'],
              ['recycle_demo', 'Reciclar demo'],
              ['auto_purge', 'Eliminación automática'],
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
        </label>
      </div>

      {loadError && !loading ? (
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
          <div className="divide-y divide-obsidian-border xl:hidden">
            {loading ? (
              <p className="p-4 text-xs text-white/50" role="status">
                Cargando actividad...
              </p>
            ) : filteredLogs.length === 0 ? (
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
              filteredLogs.map((log) => (
                <div key={log.id} className="min-w-0 space-y-2 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {getActionBadge(log.action)}
                    <time className="text-white/50">
                      {new Date(log.timestamp).toLocaleString(locale)}
                    </time>
                  </div>
                  <p className="break-words font-medium text-white">
                    {log.entity_name || log.entity_id || log.entity_type || '—'}
                  </p>
                  {log.details && <p className="break-words text-white/70">{log.details}</p>}
                  <p className="break-words text-white/40">{log.ip_address || 'Registro local'}</p>
                </div>
              ))
            )}
          </div>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-obsidian-border bg-black/20 text-[11px] font-mono uppercase tracking-wider text-white/40">
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Fecha & Hora (Local)</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Acción</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Tipo Entidad</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Elemento Afectado</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">Detalles</th>
                  <th className="py-3 px-2 xl:px-3 2xl:px-4">IP / Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-obsidian-border text-xs font-mono">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-white/40">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" aria-hidden="true" />
                      Cargando eventos de auditoría...
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
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
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-2 text-white/50 whitespace-nowrap xl:px-3 2xl:px-4">
                        {new Date(log.timestamp).toLocaleString(locale)}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap xl:px-3 2xl:px-4">
                        {getActionBadge(log.action)}
                      </td>
                      <td className="py-3 px-2 text-white/70 capitalize whitespace-nowrap xl:px-3 2xl:px-4">
                        {log.entity_type || '—'}
                      </td>
                      <td className="py-3 px-2 text-white font-medium max-w-[200px] truncate xl:px-3 2xl:px-4" title={log.entity_name || log.entity_id || ''}>
                        {log.entity_name || log.entity_id ? (
                          <span className="text-indigo-300">{log.entity_name || log.entity_id}</span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-white/70 max-w-xs truncate xl:px-3 2xl:px-4" title={log.details || ''}>
                        {log.details || '—'}
                      </td>
                      <td className="py-3 px-2 text-white/40 text-[11px] whitespace-nowrap xl:px-3 2xl:px-4">
                        {log.ip_address || 'Registro local'}
                      </td>
                    </tr>
                  ))
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
              disabled={!canPrev || loading}
              onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-white hover:bg-obsidian-border disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} aria-hidden="true" />
              <span>Anterior</span>
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
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
