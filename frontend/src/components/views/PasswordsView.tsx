import React, { useState, useEffect } from 'react';
import { 
  Key, Shield, Search, Lock, Sparkles, Copy, 
  Check, ArrowRight, Eye, EyeOff, ShieldCheck 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { VaultCredentialItem } from '../../types';
import { CopyButton } from '../common/CopyButton';
import { SecretField } from '../common/SecretField';

export const PasswordsView: React.FC = () => {
  const { 
    isUnlocked, openUnlockModal, openPasswordGen, 
    openInspector, dataVersion 
  } = useVault();

  const [credentials, setCredentials] = useState<VaultCredentialItem[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isUnlocked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getVaultCredentials()
      .then(setCredentials)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isUnlocked, dataVersion]);

  if (!isUnlocked) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-6 pt-24 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
          <Lock size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Bóveda de Contraseñas & API Keys Protegida
          </h2>
          <p className="text-xs text-obsidian-muted mt-1.5 max-w-md mx-auto leading-relaxed">
            Esta sección opera bajo el Nivel 2 de Seguridad. Todos los secretos están cifrados con AES-256-GCM y requieren la derivación de tu llave mediante Argon2id.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={openUnlockModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            <Key size={15} />
            <span>Desbloquear con Contraseña Maestra</span>
          </button>
          <button
            type="button"
            onClick={openPasswordGen}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-obsidian-panel hover:bg-obsidian-surface border border-obsidian-border text-white text-xs font-medium transition-colors"
          >
            <Sparkles size={14} className="text-cyan-400" />
            <span>Generador de Claves</span>
          </button>
        </div>
      </div>
    );
  }

  const filtered = credentials.filter((c) => {
    const matchQ = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.username && c.username.toLowerCase().includes(search.toLowerCase())) ||
      (c.parent_email && c.parent_email.toLowerCase().includes(search.toLowerCase()));
    
    if (categoryFilter === 'all') return matchQ;
    if (categoryFilter === 'email') return matchQ && c.type === 'email_password';
    if (categoryFilter === 'platform') return matchQ && c.type === 'platform_password';
    if (categoryFilter === 'pin') return matchQ && c.type === 'pin';
    if (categoryFilter === 'api_key') return matchQ && c.type === 'api_key';
    return matchQ;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Header and Generator shortcut */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Key className="text-indigo-400" size={18} />
            <span>Bóveda Centralizada de Contraseñas, PINs & API Keys</span>
          </h2>
          <p className="text-xs text-obsidian-muted">
            Copia rápida de credenciales en un solo clic con borrado automático de portapapeles
          </p>
        </div>

        <button
          type="button"
          onClick={openPasswordGen}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold transition-all"
        >
          <Sparkles size={14} className="text-cyan-400" />
          <span>Generar Nueva Clave</span>
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="p-4 rounded-2xl bg-obsidian-panel border border-obsidian-border flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar credencial por nombre, usuario o correo..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'all', label: 'Todos los Secretos' },
            { id: 'email', label: 'Correos Raíz' },
            { id: 'platform', label: 'Plataformas' },
            { id: 'pin', label: 'PINs' },
            { id: 'api_key', label: 'API Keys' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                categoryFilter === cat.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-obsidian-bg border border-obsidian-border text-obsidian-muted hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Credentials Table */}
      <div className="rounded-2xl bg-obsidian-panel border border-obsidian-border overflow-hidden">
        <table className="w-full text-left text-xs text-obsidian-text">
          <thead className="bg-obsidian-surface/60 border-b border-obsidian-border text-obsidian-muted font-semibold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="py-3 px-4">Nombre / Servicio</th>
              <th className="py-3 px-4">Tipo de Secreto</th>
              <th className="py-3 px-4">Usuario / Identificador</th>
              <th className="py-3 px-4">Credencial Cifrada</th>
              <th className="py-3 px-4">Entropía / Salud</th>
              <th className="py-3 px-4 text-right">Copiar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-obsidian-border">
            {filtered.map((item) => (
              <tr
                key={item.id}
                onClick={() => {
                  if (item.type === 'email_password') {
                    openInspector('email', item.entity_id);
                  } else {
                    openInspector('platform', item.entity_id);
                  }
                }}
                className="hover:bg-obsidian-surface/50 transition-colors cursor-pointer group"
              >
                <td className="py-3.5 px-4">
                  <div className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                    {item.name}
                  </div>
                  {item.parent_email && (
                    <div className="text-[10px] text-obsidian-muted font-mono">
                      {item.parent_email}
                    </div>
                  )}
                </td>

                <td className="py-3.5 px-4">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                    item.type === 'api_key'
                      ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                      : item.type === 'pin'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : item.type === 'email_password'
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                      : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  }`}>
                    {item.category}
                  </span>
                </td>

                <td className="py-3.5 px-4 font-mono text-[11px] text-white">
                  {item.username || '—'}
                </td>

                <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                  <SecretField
                    value={item.credential_plain}
                    masked={item.credential_masked}
                    label={item.name}
                  />
                </td>

                <td className="py-3.5 px-4">
                  {item.entropy ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.entropy.color }}
                      />
                      <span className="font-medium text-[11px]" style={{ color: item.entropy.color }}>
                        {item.entropy.label} ({item.entropy.score})
                      </span>
                    </div>
                  ) : (
                    <span className="text-obsidian-muted text-[11px]">N/A</span>
                  )}
                </td>

                <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <CopyButton
                    value={item.credential_plain || ''}
                    label={item.name}
                    size="md"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && !loading && (
        <div className="py-16 text-center text-obsidian-muted text-xs">
          No se encontraron credenciales para la búsqueda "{search}".
        </div>
      )}
    </div>
  );
};
