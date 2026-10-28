import React, { useState, useEffect } from 'react';
import { 
  Trash2, RotateCcw, AlertOctagon, Lock, Clock 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { AuditLogItem } from '../../types';
import { InfoTooltip } from '../common/InfoTooltip';

export const TrashView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast, triggerDataReload, dataVersion } = useVault();

  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [retentionDays, setRetentionDays] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'trash' | 'audit'>('trash');
  const [, setLoading] = useState(true);

  useEffect(() => {
    if (!isUnlocked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.getTrash(),
      api.getAuditLogs(60),
      api.getVaultStatus().catch(() => null)
    ]).then(([tList, aList, vStatus]) => {
      setTrashItems(tList);
      setAuditLogs(aList);
      if (vStatus && typeof vStatus.trash_retention_days === 'number') {
        setRetentionDays(vStatus.trash_retention_days);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [isUnlocked, dataVersion]);

  const handleRetentionChange = async (newDays: number) => {
    try {
      await api.updateSettings({ trash_retention_days: newDays });
      setRetentionDays(newDays);
      showToast(
        newDays === 0
          ? 'Política de Papelera fijada en Conservación Indefinida (Manual).'
          : `Auto-Purga de Papelera configurada a ${newDays} días.`,
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
      showToast('Elemento restaurado atómicamente con sus relaciones intactas.', 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handlePurge = async (type: string, id: string) => {
    if (!confirm('¿Eliminar permanentemente e irreversiblemente este elemento?')) return;
    try {
      await api.purgeItem(type, id);
      showToast('Elemento eliminado definitivamente.', 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  if (!isUnlocked) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-6 pt-24 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Lock size={32} />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Papelera Protegida
          </h2>
          <InfoTooltip
            title="Autorización Requerida"
            content="Restaurar o eliminar elementos permanentemente requiere tu contraseña maestra."
          />
        </div>
        <button
          type="button"
          onClick={openUnlockModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30"
        >
          <span>Desbloquear con Contraseña Maestra</span>
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Header, Retention Policy & Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Trash2 className="text-indigo-400 flex-shrink-0" size={18} />
          <h2 className="text-base font-bold text-white tracking-tight truncate">
            Papelera de Elementos Eliminados
          </h2>
          <InfoTooltip
            title="Conservación Segura"
            content="Por defecto conserva los elementos eliminados hasta que los borres manualmente, o puedes programar que se vacíen automáticamente a los 30, 60 o 90 días."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Auto-Purge Policy Selector */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-obsidian-panel border border-obsidian-border text-xs">
            <Clock size={13} className="text-indigo-400 shrink-0" />
            <span className="text-obsidian-muted font-medium">Vaciar automáticamente:</span>
            <select
              value={retentionDays}
              onChange={(e) => handleRetentionChange(Number(e.target.value))}
              className="px-2 py-0.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white font-semibold focus:outline-none focus:border-indigo-500"
            >
              <option value={0}>Nunca (Manual)</option>
              <option value={30}>A los 30 días</option>
              <option value={60}>A los 60 días</option>
              <option value={90}>A los 90 días</option>
            </select>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-obsidian-panel border border-obsidian-border text-xs flex-shrink-0">
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

      {activeTab === 'trash' ? (
        <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
          {trashItems.length > 0 ? (
            <div className="divide-y divide-obsidian-border">
              {trashItems.map((item) => {
                const elapsedDays = typeof item.elapsed_days === 'number' ? item.elapsed_days : 0;
                const daysUntilPurge = item.days_until_purge;

                return (
                  <div key={item.id} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-obsidian-surface/40 transition-colors min-w-0">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span className="font-semibold text-white text-xs truncate" title={item.title}>{item.title}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-obsidian-surface text-obsidian-muted border border-obsidian-border flex-shrink-0">
                          {item.type}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-obsidian-bg text-obsidian-muted border border-obsidian-border flex-shrink-0">
                          {elapsedDays === 0 ? 'Eliminado hoy' : `En papelera hace ${elapsedDays} día(s)`}
                        </span>
                        {daysUntilPurge !== null && daysUntilPurge !== undefined ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex-shrink-0">
                            Se borrará en {daysUntilPurge} día(s)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0">
                            Conservación manual
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-obsidian-muted truncate" title={item.subtitle}>
                        {item.subtitle} • Eliminado: {new Date(item.deleted_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestore(item.type, item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
                      >
                        <RotateCcw size={13} />
                        <span>Restaurar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePurge(item.type, item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
                      >
                        <AlertOctagon size={13} />
                        <span>Eliminar definitivamente</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center text-xs text-obsidian-muted">
              La papelera está vacía. Ningún elemento eliminado.
            </div>
          )}
        </div>
      ) : (
        /* Audit log list */
        <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
          <div className="p-4 border-b border-obsidian-border bg-obsidian-surface/40 flex items-center justify-between text-xs">
            <span className="font-semibold text-white">Actividad Reciente del Sistema</span>
            <span className="text-obsidian-muted font-mono">{auditLogs.length} registros</span>
          </div>

          <div className="divide-y divide-obsidian-border max-h-[600px] overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3.5 hover:bg-obsidian-surface/40 transition-colors text-xs flex items-start justify-between gap-4 min-w-0">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase flex-shrink-0 ${
                      log.action === 'create'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : log.action === 'update' || log.action === 'reactivate'
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        : log.action === 'contact_followup' || log.action === 'billing_renewal'
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                        : log.action === 'vault_unlock'
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {log.action}
                    </span>
                    <span className="font-semibold text-white truncate" title={log.entity_name || log.entity_type || ''}>
                      {log.entity_name || log.entity_type}
                    </span>
                  </div>
                  <p className="text-obsidian-muted text-[11px] leading-relaxed truncate" title={log.details || ''}>
                    {log.details || 'Operación registrada en base de datos'}
                  </p>
                </div>

                <div className="text-[10px] text-obsidian-muted font-mono whitespace-nowrap flex-shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
