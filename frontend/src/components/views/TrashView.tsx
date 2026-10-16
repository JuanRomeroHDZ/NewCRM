import React, { useState, useEffect } from 'react';
import { 
  Trash2, RotateCcw, AlertOctagon, History, 
  ShieldCheck, Lock, CheckCircle2, FileText 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { AuditLogItem } from '../../types';

export const TrashView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast, triggerDataReload, dataVersion } = useVault();

  const [trashItems, setTrashItems] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [activeTab, setActiveTab] = useState<'trash' | 'audit'>('trash');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isUnlocked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.getTrash(),
      api.getAuditLogs(60)
    ]).then(([tList, aList]) => {
      setTrashItems(tList);
      setAuditLogs(aList);
    }).catch(console.error).finally(() => setLoading(false));
  }, [isUnlocked, dataVersion]);

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
      showToast('Elemento purgado definitivamente.', 'info');
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
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Papelera de Reciclaje & Bitácora de Auditoría
          </h2>
          <p className="text-xs text-obsidian-muted mt-1 max-w-md mx-auto">
            La restauración y purga de registros sensibles requiere autorización de Nivel 2.
          </p>
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
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Header and tab switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Trash2 className="text-indigo-400" size={18} />
            <span>Papelera de Reciclaje & Bitácora de Auditoría</span>
          </h2>
          <p className="text-xs text-obsidian-muted">
            Integridad referencial y trazabilidad cronológica inmutable
          </p>
        </div>

        <div className="flex items-center p-1 rounded-xl bg-obsidian-panel border border-obsidian-border text-xs">
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
            Bitácora de Auditoría
          </button>
        </div>
      </div>

      {activeTab === 'trash' ? (
        <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
          {trashItems.length > 0 ? (
            <div className="divide-y divide-obsidian-border">
              {trashItems.map((item) => (
                <div key={item.id} className="p-4 flex items-center justify-between hover:bg-obsidian-surface/40 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-xs">{item.title}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-obsidian-surface text-obsidian-muted border border-obsidian-border">
                        {item.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-obsidian-muted mt-0.5">
                      {item.subtitle} • Eliminado: {new Date(item.deleted_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
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
                      <span>Purgar</span>
                    </button>
                  </div>
                </div>
              ))}
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
            <span className="font-semibold text-white">Eventos Criptográficos & Operativos Recientes</span>
            <span className="text-obsidian-muted font-mono">{auditLogs.length} eventos</span>
          </div>

          <div className="divide-y divide-obsidian-border max-h-[600px] overflow-y-auto">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3.5 hover:bg-obsidian-surface/40 transition-colors text-xs flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      log.action === 'create'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : log.action === 'update'
                        ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        : log.action === 'vault_unlock'
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {log.action}
                    </span>
                    <span className="font-semibold text-white">
                      {log.entity_name || log.entity_type}
                    </span>
                  </div>
                  <p className="text-obsidian-muted text-[11px] leading-relaxed">
                    {log.details || 'Operación registrada en base de datos'}
                  </p>
                </div>

                <div className="text-[10px] text-obsidian-muted font-mono whitespace-nowrap">
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
