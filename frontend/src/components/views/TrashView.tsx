import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Trash2, RotateCcw, AlertOctagon, Lock, Clock, AlertTriangle, Search, X
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api, getApiUserToken } from '../../lib/api';
import type { AuditLogItem, CoreUser } from '../../types';
import { InfoTooltip } from '../common/InfoTooltip';
import { EmptyState } from '../common/EmptyState';
import { INPUT_LIMITS } from '../../lib/validation';

const TRASH_TYPE_LABELS: Record<string, string> = {
  email: 'Correo principal',
  platform: 'Cuenta / Servicio',
  resource: 'Recurso seguro',
  prospect: 'Prospecto',
  income: 'Ingreso',
  expense: 'Gasto',
  subscription: 'Renovación',
  payment_card: 'Tarjeta / Método de pago',
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  vault_unlock: 'Desbloqueo',
  export: 'Exportación',
  restore: 'Restauración',
  create: 'Creación',
  update: 'Actualización',
  delete: 'Eliminación',
  copy_secret: 'Copia secreto',
  update_2fa: 'Verificación en 2 pasos',
  contact_followup: 'Seguimiento',
  contact_attempt: 'Intento de contacto',
  billing_renewal: 'Renovación',
  auto_archive: 'Archivo frío',
  reactivate: 'Reactivación',
  recycle_demo: 'Demo reciclada',
  auto_purge: 'Auto-purga',
  permanent_delete: 'Eliminación permanente',
};

export const TrashView: React.FC = () => {
  const {
    isUnlocked, openUnlockModal, showToast, triggerDataReload, dataVersion, confirm,
    systemLocale, setActiveSection,
  } = useVault();

  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [currentUser, setCurrentUser] = useState<CoreUser | null>(null);
  const [requiresUserLogin, setRequiresUserLogin] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'trash' | 'audit'>('trash');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const loadGeneration = useRef(0);

  const loadData = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!isUnlocked) {
      setTrashItems([]);
      setAuditLogs([]);
      setCurrentUser(null);
      setRequiresUserLogin(false);
      setRetentionDays(0);
      setSearchQuery('');
      setTypeFilter('all');
      setLoadError(null);
      setLoading(false);
      return;
    }
    if (!getApiUserToken()) {
      setTrashItems([]);
      setAuditLogs([]);
      setCurrentUser(null);
      setRequiresUserLogin(true);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setRequiresUserLogin(false);
    setLoading(true);
    setLoadError(null);
    try {
      const user = await api.getCurrentUser();
      if (generation !== loadGeneration.current) return;
      setCurrentUser(user);
      if (user.must_change_password) {
        setTrashItems([]);
        setAuditLogs([]);
        setLoadError(null);
        setLoading(false);
        return;
      }
      const [tList, aList, vStatus] = await Promise.all([
        api.getTrash(),
        api.getAuditLogs(60),
        api.getVaultStatus().catch(() => null),
      ]);
      if (generation !== loadGeneration.current) return;
      setTrashItems(tList);
      setAuditLogs(aList);
      if (vStatus && typeof vStatus.trash_retention_days === 'number') {
        setRetentionDays(vStatus.trash_retention_days);
      }
    } catch (err: any) {
      if (generation !== loadGeneration.current) return;
      const hasUserSession = Boolean(getApiUserToken());
      setCurrentUser(null);
      setTrashItems([]);
      setAuditLogs([]);
      setRequiresUserLogin(!hasUserSession);
      if (!hasUserSession) {
        setLoadError(null);
        return;
      }
      setLoadError(err?.message || 'No se pudo cargar la papelera.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    void loadData();
    return () => {
      loadGeneration.current += 1;
    };
  }, [loadData, dataVersion]);

  useEffect(() => {
    const handleSessionExpired = () => {
      loadGeneration.current += 1;
      setTrashItems([]);
      setAuditLogs([]);
      setCurrentUser(null);
      setRequiresUserLogin(true);
      setLoadError(null);
      setLoading(false);
    };
    window.addEventListener('core_user_session_expired', handleSessionExpired);
    return () => window.removeEventListener('core_user_session_expired', handleSessionExpired);
  }, []);

  const handleRetentionChange = async (newDays: number) => {
    try {
      await api.updateTrashRetention(newDays);
      setRetentionDays(newDays);
      showToast(
        newDays === 0
          ? 'Los elementos permanecerán visibles hasta que los borres.'
          : `Los elementos dejarán de aparecer después de ${newDays} días. No se borrarán automáticamente.`,
        'info'
      );
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRestore = async (type: string, id: string) => {
    try {
      await api.restoreItem(type, id);
      showToast('Elemento restaurado junto con sus relaciones.', 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handlePurge = async (type: string, id: string, title?: string) => {
    const ok = await confirm({
      title: 'Eliminar permanentemente',
      message: title
        ? `¿Eliminar permanentemente "${title}"? Esta acción no se puede deshacer.`
        : '¿Eliminar permanentemente e irreversiblemente este elemento?',
      confirmLabel: 'Eliminar definitivamente',
      cancelLabel: 'Cancelar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.purgeItem(type, id);
      showToast('Elemento eliminado definitivamente.', 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    trashItems.forEach((item) => {
      if (item.type) set.add(item.type);
    });
    return Array.from(set);
  }, [trashItems]);

  const filteredTrashItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return trashItems.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (!q) return true;
      return (
        (item.title && String(item.title).toLowerCase().includes(q)) ||
        (item.subtitle && String(item.subtitle).toLowerCase().includes(q)) ||
        (item.type && (TRASH_TYPE_LABELS[item.type] || item.type).toLowerCase().includes(q))
      );
    });
  }, [trashItems, searchQuery, typeFilter]);

  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-3 pt-6 text-center animate-fadeIn sm:p-8 sm:pt-24">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Lock size={32} aria-hidden="true" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Papelera Protegida
          </h2>
          <InfoTooltip
            title="Autorización Requerida"
            content="Restaurar o eliminar elementos permanentemente requiere tu contraseña de acceso."
          />
        </div>
        <button
          type="button"
          onClick={openUnlockModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30"
        >
          <span>Desbloquear con contraseña de acceso</span>
        </button>
      </div>
    );
  }

  if (requiresUserLogin) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-3 pt-6 text-center animate-fadeIn sm:p-8 sm:pt-24">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
          <Lock size={28} aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white">Inicia sesión para abrir la papelera</h2>
          <p className="text-sm leading-relaxed text-obsidian-muted">
            La bóveda está desbloqueada. Inicia sesión desde Ajustes y vuelve aquí para consultar los elementos eliminados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveSection('settings')}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
        >
          Abrir Ajustes
        </button>
      </div>
    );
  }

  if (currentUser?.must_change_password) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-3 pt-6 text-center animate-fadeIn sm:p-8 sm:pt-24">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-500/20 bg-amber-500/10 text-amber-300">
          <Lock size={28} aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-white">Actualiza tu contraseña temporal</h2>
          <p className="text-sm leading-relaxed text-obsidian-muted">
            Para consultar o modificar la papelera, primero cambia la contraseña temporal desde Ajustes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveSection('settings')}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          Abrir Ajustes
        </button>
      </div>
    );
  }

  const locale = systemLocale || 'es-MX';
  const canRestore = Boolean(
    currentUser && !currentUser.must_change_password &&
    ['owner', 'business_admin', 'seller'].includes(currentUser.role)
  );
  const canPurge = Boolean(
    currentUser && !currentUser.must_change_password &&
    ['owner', 'business_admin'].includes(currentUser.role)
  );

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-6 sm:p-8 animate-fadeIn">
      {/* Header, Retention Policy & Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Trash2 className="text-indigo-400 flex-shrink-0" size={18} aria-hidden="true" />
          <h2 className="text-base font-bold text-white tracking-tight">
            Papelera
          </h2>
          <InfoTooltip
            title="Conservación de elementos"
            content="Al vencer, dejan de aparecer aquí, pero no se borran. Elige Sin límite para volver a verlos."
          />
        </div>

        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-3">
          {canPurge && (
            <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2 rounded-lg border border-obsidian-border bg-obsidian-panel px-3 py-1.5 text-xs">
              <Clock size={13} className="shrink-0 text-indigo-400" aria-hidden="true" />
              <label htmlFor="trash-retention-select" className="font-medium text-obsidian-muted">
                Mostrar durante:
              </label>
              <select
                id="trash-retention-select"
                value={retentionDays}
                onChange={(event) => handleRetentionChange(Number(event.target.value))}
                className="min-h-9 max-w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value={0}>Sin límite</option>
                <option value={30}>30 días</option>
                <option value={60}>60 días</option>
                <option value={90}>90 días</option>
              </select>
            </div>
          )}

          <div className="flex max-w-full flex-wrap items-center rounded-lg border border-obsidian-border bg-obsidian-panel p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('trash')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'trash' ? 'bg-indigo-600 text-white' : 'text-obsidian-muted hover:text-white'
              }`}
            >
              Papelera ({trashItems.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'audit' ? 'bg-indigo-600 text-white' : 'text-obsidian-muted hover:text-white'
              }`}
            >
              Actividad Reciente
            </button>
          </div>
        </div>
      </div>

      {currentUser && !canRestore && !currentUser.must_change_password && (
        <div className="rounded-xl border border-obsidian-border bg-obsidian-panel px-4 py-3 text-sm text-obsidian-muted" role="status">
          Tu acceso permite consultar la papelera, pero no modificar sus elementos.
        </div>
      )}

      {loading && trashItems.length === 0 && auditLogs.length === 0 ? (
        <div className="space-y-3" role="status" aria-label="Cargando papelera y actividad reciente">
          <div className="h-16 rounded-2xl bg-obsidian-panel border border-obsidian-border animate-pulse" />
          <div className="h-24 rounded-2xl bg-obsidian-panel border border-obsidian-border animate-pulse" />
          <div className="h-24 rounded-2xl bg-obsidian-panel border border-obsidian-border animate-pulse" />
        </div>
      ) : loadError && trashItems.length === 0 && auditLogs.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="No se pudo cargar la papelera"
          description={loadError}
          actionLabel="Reintentar"
          onAction={loadData}
        />
      ) : activeTab === 'trash' ? (
        <div className="space-y-4">
          {trashItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-obsidian-border bg-obsidian-panel p-3 text-xs">
              <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
                <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" aria-hidden="true" />
                <input
                  type="text"
                  maxLength={INPUT_LIMITS.SEARCH}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Buscar elementos en la papelera"
                  placeholder="Buscar elemento eliminado..."
                  className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-2 text-obsidian-muted hover:text-white"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="trash-type-filter" className="text-obsidian-muted font-medium">
                  Tipo:
                </label>
                <select
                  id="trash-type-filter"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">Todos ({trashItems.length})</option>
                  {availableTypes.map((typeKey) => (
                    <option key={typeKey} value={typeKey}>
                      {TRASH_TYPE_LABELS[typeKey] || typeKey}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
            {filteredTrashItems.length > 0 ? (
              <div className="divide-y divide-obsidian-border">
                {filteredTrashItems.map((item) => {
                  const elapsedDays = typeof item.elapsed_days === 'number' ? item.elapsed_days : 0;
                  const daysUntilHidden = item.days_until_hidden;
                  const typeLabel = TRASH_TYPE_LABELS[item.type] || item.type;

                  return (
                    <div key={`${item.type}-${item.id}`} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-obsidian-surface/40 transition-colors min-w-0">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <span className="font-semibold text-white text-xs break-words" title={item.title}>{item.title}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-obsidian-surface text-obsidian-muted border border-obsidian-border flex-shrink-0">
                            {typeLabel}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-obsidian-bg text-obsidian-muted border border-obsidian-border flex-shrink-0">
                            {elapsedDays === 0 ? 'Eliminado hoy' : `En papelera hace ${elapsedDays} día(s)`}
                          </span>
                          {daysUntilHidden !== null && daysUntilHidden !== undefined ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex-shrink-0">
                              Dejará de aparecer en {daysUntilHidden} día(s)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0">
                              Conservación manual
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-obsidian-muted break-words" title={item.subtitle}>
                          {item.subtitle ? `${item.subtitle} · ` : ''}Eliminado: {new Date(item.deleted_at).toLocaleString(locale)}
                        </div>
                      </div>

                      {(canRestore || canPurge) && (
                        <div className="flex max-w-full flex-wrap items-center gap-2">
                          {canRestore && (
                            <button
                              type="button"
                              onClick={() => handleRestore(item.type, item.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            >
                              <RotateCcw size={13} aria-hidden="true" />
                              <span>Restaurar</span>
                            </button>
                          )}
                          {canPurge && (
                            <button
                              type="button"
                              onClick={() => handlePurge(item.type, item.id, item.title)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                            >
                              <AlertOctagon size={13} aria-hidden="true" />
                              <span>Eliminar definitivamente</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : trashItems.length > 0 ? (
              <div className="px-3 py-8 text-center text-xs text-obsidian-muted space-y-2">
                <p>No hay elementos eliminados que coincidan con el filtro.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setTypeFilter('all');
                  }}
                  className="inline-flex px-3 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-white hover:bg-obsidian-border"
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-xs text-obsidian-muted">
                La papelera está vacía. Ningún elemento eliminado.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Audit log list */
        <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
          <div className="p-4 border-b border-obsidian-border bg-obsidian-surface/40 flex items-center justify-between text-xs">
            <span className="font-semibold text-white">Actividad Reciente del Sistema</span>
            <span className="text-obsidian-muted font-mono">{auditLogs.length} registros</span>
          </div>

          {auditLogs.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-obsidian-muted">
              No hay registros de actividad reciente disponibles.
            </div>
          ) : (
            <div className="divide-y divide-obsidian-border max-h-[600px] overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-3.5 hover:bg-obsidian-surface/40 transition-colors text-xs flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0 ${
                        log.action === 'create'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : log.action === 'update' || log.action === 'reactivate'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : log.action === 'contact_followup' || log.action === 'billing_renewal' || log.action === 'restore'
                          ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                          : log.action === 'vault_unlock'
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {AUDIT_ACTION_LABELS[log.action] || log.action}
                      </span>
                      <span className="font-semibold text-white break-words" title={log.entity_name || log.entity_type || ''}>
                        {log.entity_name || log.entity_type}
                      </span>
                    </div>
                    <p className="text-obsidian-muted text-[11px] leading-relaxed break-words">
                      {log.details || 'Operación registrada en base de datos'}
                    </p>
                  </div>

                  <div className="text-[10px] text-obsidian-muted font-mono whitespace-nowrap flex-shrink-0">
                    {new Date(log.timestamp).toLocaleString(locale)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
