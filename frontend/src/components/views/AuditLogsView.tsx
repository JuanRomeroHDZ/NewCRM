import React, { useState, useEffect } from 'react';
import { 
  FileText, Shield, Download, RefreshCw, Filter, 
  Search, Lock, Key, Trash2, ArrowUpRight, CheckCircle2 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { AuditLogItem } from '../../types';

export const AuditLogsView: React.FC = () => {
  const { isUnlocked, openUnlockModal, showToast } = useVault();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = async () => {
    if (!isUnlocked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const act = selectedAction === 'all' ? undefined : selectedAction;
      const res = await api.getAuditTrail(100, 0, act);
      setLogs(res.items || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      showToast(err.message || 'Error cargando auditoría', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [isUnlocked, selectedAction]);

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
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `emailsaver-audit-logs-${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Registro de auditoría exportado en JSON', 'success');
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
      case 'delete':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">Eliminación</span>;
      case 'copy_secret':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">Copia Secreto</span>;
      case 'update_2fa':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">2FA / TOTP</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 text-white/60 border border-white/10">{action}</span>;
    }
  };

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Bóveda Cifrada Bloqueada</h2>
        <p className="text-sm text-white/50 max-w-md mb-6">
          Los registros inmutables de auditoría y accesos están protegidos bajo la clave maestra para garantizar la privacidad y trazabilidad.
        </p>
        <button
          onClick={openUnlockModal}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2"
        >
          <Lock className="w-4 h-4" /> Desbloquear Bóveda
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-obsidian-border">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-indigo-400">
            <Shield className="w-4 h-4" /> Registro Inmutable de Seguridad
          </div>
          <h1 className="text-2xl font-bold text-white mt-1">Historial de Auditoría & Trazabilidad</h1>
          <p className="text-xs text-white/50 mt-1">
            Registro secuencial de eventos criptográficos, accesos y modificaciones en la bóveda ({total} eventos totales).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="p-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight text-white/70 hover:text-white transition-all"
            title="Refrescar eventos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={exportLogsAsJson}
            className="px-4 py-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-obsidian-borderLight text-white text-xs font-medium flex items-center gap-2 transition-all hover:bg-white/5"
          >
            <Download className="w-4 h-4 text-white/60" /> Exportar Auditoría
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            placeholder="Buscar por entidad, acción o detalle..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-white/40 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filtrar:
          </span>
          {['all', 'vault_unlock', 'copy_secret', 'create', 'update_2fa', 'export', 'delete'].map((action) => (
            <button
              key={action}
              onClick={() => setSelectedAction(action)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                selectedAction === action
                  ? 'bg-indigo-600 text-white'
                  : 'bg-obsidian-surface border border-obsidian-border text-white/60 hover:text-white'
              }`}
            >
              {action === 'all' ? 'Todos' : action.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-2xl border border-obsidian-border bg-obsidian-surface/60 overflow-hidden backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-obsidian-border bg-black/20 text-[11px] font-mono uppercase tracking-wider text-white/40">
                <th className="py-3 px-4">Fecha & Hora (UTC)</th>
                <th className="py-3 px-4">Acción</th>
                <th className="py-3 px-4">Tipo Entidad</th>
                <th className="py-3 px-4">Elemento Afectado</th>
                <th className="py-3 px-4">Detalles</th>
                <th className="py-3 px-4">IP / Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-obsidian-border text-xs font-mono">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-white/40">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                    Cargando eventos de auditoría...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-white/40">
                    No se encontraron eventos coincidentes.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-white/50 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="py-3 px-4 text-white/70 capitalize">
                      {log.entity_type || '—'}
                    </td>
                    <td className="py-3 px-4 text-white font-medium">
                      {log.entity_name || log.entity_id ? (
                        <span className="text-indigo-300">{log.entity_name || log.entity_id}</span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-white/70 max-w-xs truncate" title={log.details || ''}>
                      {log.details || '—'}
                    </td>
                    <td className="py-3 px-4 text-white/40 text-[11px]">
                      {log.ip_address || 'Localhost / Docker'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
