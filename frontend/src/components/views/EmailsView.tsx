import React, { useState, useEffect } from 'react';
import { 
  Mail, Shield, Plus, Key, ArrowRight, Smartphone, 
  ExternalLink, AlertCircle, CheckCircle, Lock, Edit3 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { CopyButton } from '../common/CopyButton';
import { SecretField } from '../common/SecretField';

export const EmailsView: React.FC = () => {
  const { 
    openInspector, openEmailModal, openUnlockModal, 
    isUnlocked, dataVersion 
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getEmails(search || undefined)
      .then(setEmails)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, isUnlocked, dataVersion]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Mail className="text-indigo-400" size={18} />
            <span>Cuentas de Correo Electrónico (Nodos Raíz)</span>
          </h2>
          <p className="text-xs text-obsidian-muted">
            Cada correo es el origen del cual dependen tus plataformas, claves y cadenas de recuperación
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por correo o proveedor..."
            className="px-3.5 py-1.5 rounded-xl bg-obsidian-panel border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
          />
          <button
            type="button"
            onClick={() => {
              if (!isUnlocked) {
                openUnlockModal();
              } else {
                openEmailModal();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all whitespace-nowrap"
          >
            <Plus size={14} />
            <span>Nuevo Correo Raíz</span>
          </button>
        </div>
      </div>

      {/* Level 2 Security Alert banner if locked */}
      {!isUnlocked && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-amber-200">
            <Lock size={16} className="text-amber-400 flex-shrink-0" />
            <span>
              La bóveda está bloqueada. Estás visualizando metadatos generales; para ver contraseñas, códigos de respaldo y preguntas de seguridad, introduce tu contraseña maestra.
            </span>
          </div>
          <button
            onClick={openUnlockModal}
            className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap"
          >
            Desbloquear
          </button>
        </div>
      )}

      {/* Emails Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {emails.map((email) => (
          <div
            key={email.id}
            onClick={() => openInspector('email', email.id)}
            className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all cursor-pointer group flex flex-col justify-between space-y-4 hover:shadow-xl"
          >
            {/* Upper part */}
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <PlatformIcon name={email.provider} size="md" />
                  <div>
                    <h3 className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors select-all">
                      {email.address}
                    </h3>
                    <div className="text-[11px] text-obsidian-muted flex flex-wrap items-center gap-2 mt-0.5">
                      <span>{email.provider}</span>
                      <span>•</span>
                      <span className="text-indigo-400 font-semibold">{email.platform_count} servicios hijos</span>
                      {(email.prospect_count ?? 0) > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-400 font-semibold">{email.prospect_count} prospecto(s) / demo(s)</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <CopyButton value={email.address} label="Dirección de correo" />
                  {email.inbox_url && (
                    <a
                      href={email.inbox_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir Webmail"
                      className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>

              {/* Middle Credential / Password bar */}
              <div className="mt-4 p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border flex items-center justify-between text-xs">
                <span className="text-obsidian-muted">Contraseña:</span>
                <SecretField
                  value={email.password_plain}
                  masked={email.password_masked}
                  label="Contraseña"
                />
              </div>

              {/* Recovery chain pill */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                {email.recovery_email_address ? (
                  <div className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 flex items-center gap-1.5">
                    <span className="text-obsidian-muted">Recuperado por:</span>
                    <strong className="font-mono">{email.recovery_email_address}</strong>
                  </div>
                ) : (
                  <div className="px-2.5 py-1 rounded-lg bg-obsidian-surface border border-obsidian-border text-obsidian-muted">
                    Sin correo de recuperación
                  </div>
                )}

                {email.recovery_phone && (
                  <div className="px-2.5 py-1 rounded-lg bg-obsidian-surface border border-obsidian-border text-obsidian-text flex items-center gap-1">
                    <Smartphone size={12} className="text-obsidian-muted" />
                    <span className="font-mono">{email.recovery_phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom info footer */}
            <div className="pt-3 border-t border-obsidian-border/60 flex items-center justify-between text-[11px] text-obsidian-muted">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                  email.two_factor_method !== 'none'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  2FA: {email.two_factor_method}
                </span>

                {email.backup_codes && email.backup_codes.length > 0 && (
                  <span>{email.backup_codes.length} Códigos de Respaldo</span>
                )}
              </div>

              <div className="flex items-center gap-1 text-obsidian-muted group-hover:text-white transition-colors">
                <span>Inspeccionar</span>
                <ArrowRight size={13} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {emails.length === 0 && !loading && (
        <div className="py-16 text-center text-obsidian-muted text-xs">
          No se encontraron cuentas de correo. Haz clic en "Nuevo Correo Raíz" para crear la primera.
        </div>
      )}
    </div>
  );
};
