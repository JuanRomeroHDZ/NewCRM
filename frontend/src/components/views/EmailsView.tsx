import React, { useState, useEffect } from 'react';
import { 
  Mail, Plus, ArrowRight, Smartphone, 
  ExternalLink, Lock, Edit3, Trash2, Globe, Rocket,
  Briefcase, User, Users
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { CopyButton } from '../common/CopyButton';
import { SecretField } from '../common/SecretField';
import { InfoTooltip } from '../common/InfoTooltip';
import { INPUT_LIMITS } from '../../lib/validation';

export const EmailsView: React.FC = () => {
  const { 
    openInspector, openEmailModal, openPlatformModal, openProspectModal,
    openUnlockModal, isUnlocked, showToast, triggerDataReload, dataVersion,
    matchesScope 
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const filteredEmails = emails.filter((email) => matchesScope(email.scope));

  useEffect(() => {
    setLoading(true);
    api.getEmails(search || undefined)
      .then(setEmails)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [search, isUnlocked, dataVersion]);

  const handleDeleteEmail = async (e: React.MouseEvent, email: EmailAccount) => {
    e.stopPropagation();
    if (!isUnlocked) {
      openUnlockModal();
      return;
    }
    if (!window.confirm(`¿Enviar la cuenta de correo "${email.address}" a la papelera?`)) return;
    try {
      await api.deleteEmail(email.id);
      showToast(`Correo "${email.address}" enviado a la papelera.`, 'info');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-fadeIn">
      {/* Top Header & Search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="text-indigo-400 flex-shrink-0" size={18} />
          <h2 className="text-base font-bold text-white tracking-tight truncate">
            Correos Principales ({filteredEmails.length})
          </h2>
          <InfoTooltip
            title="Correos Principales"
            content="Cuentas de correo desde las que administras tus servicios, suscripciones, correos de respaldo y prospectos."
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            maxLength={INPUT_LIMITS.SEARCH}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por dirección o proveedor..."
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all whitespace-nowrap flex-shrink-0"
          >
            <Plus size={14} />
            <span>Nuevo Correo Principal</span>
          </button>
        </div>
      </div>

      {/* Level 2 Security Alert banner if locked */}
      {!isUnlocked && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-amber-200 min-w-0">
            <Lock size={16} className="text-amber-400 flex-shrink-0" />
            <span className="truncate">
              Bóveda bloqueada. Desbloquea con tu contraseña maestra para crear, editar o revelar secretos.
            </span>
          </div>
          <button
            onClick={openUnlockModal}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap self-end sm:self-auto flex-shrink-0"
          >
            Desbloquear Bóveda
          </button>
        </div>
      )}

      {/* Emails Cards Grid */}
      {filteredEmails.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEmails.map((email) => (
            <div
              key={email.id}
              onClick={() => openInspector('email', email.id)}
              className="p-5 rounded-2xl bg-obsidian-panel border border-obsidian-border hover:border-obsidian-borderLight transition-all cursor-pointer group flex flex-col justify-between space-y-4 hover:shadow-xl min-w-0 overflow-hidden"
            >
              {/* Upper part */}
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <PlatformIcon name={email.provider} size="md" />
                    <div className="min-w-0 flex-1">
                      <h3
                        className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors truncate select-all"
                        title={email.address}
                      >
                        {email.address}
                      </h3>
                      <div className="text-[11px] text-obsidian-muted flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="truncate">{email.provider}</span>
                        <span>•</span>
                        <span className="text-indigo-400 font-semibold">{email.platform_count} plataforma(s)</span>
                        <span>•</span>
                        <span className="text-cyan-400 font-semibold">{email.prospect_count || 0} prospecto(s)</span>
                        <span>•</span>
                        {email.scope === 'personal' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <User size={9} />
                            <span>Personal</span>
                          </span>
                        ) : email.scope === 'shared' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <Users size={9} />
                            <span>Compartido</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Briefcase size={9} />
                            <span>Empresa</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <CopyButton value={email.address} label="Dirección de correo" />
                    {email.inbox_url && (
                      <a
                        href={email.inbox_url}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir bandeja de entrada (Webmail)"
                        className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!isUnlocked) openUnlockModal();
                        else openEmailModal(email.id);
                      }}
                      title="Editar cuenta de correo"
                      className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteEmail(e, email)}
                      title="Eliminar cuenta de correo"
                      className="p-1.5 text-obsidian-muted hover:text-rose-400 rounded-lg hover:bg-obsidian-surface transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Middle Credential / Password bar */}
                <div className="mt-4 p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border flex items-center justify-between gap-2 text-xs min-w-0">
                  <span className="text-obsidian-muted flex-shrink-0">Contraseña:</span>
                  <SecretField
                    value={email.password_plain}
                    masked={email.password_masked}
                    label="Contraseña"
                  />
                </div>

                {/* Recovery chain & Quick Correlation Actions */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] min-w-0">
                  <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                    {email.recovery_email_address ? (
                      <div
                        className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 flex items-center gap-1.5 max-w-full min-w-0"
                        title={`Recupera a: ${email.recovery_email_address}`}
                      >
                        <span className="text-obsidian-muted flex-shrink-0">Recupera:</span>
                        <strong className="font-mono truncate">{email.recovery_email_address}</strong>
                      </div>
                    ) : (
                      <div className="px-2.5 py-1 rounded-lg bg-obsidian-surface border border-obsidian-border text-obsidian-muted">
                        Sin correo de respaldo
                      </div>
                    )}

                    {email.recovery_phone && (
                      <div className="px-2.5 py-1 rounded-lg bg-obsidian-surface border border-obsidian-border text-obsidian-text flex items-center gap-1 flex-shrink-0">
                        <Smartphone size={12} className="text-obsidian-muted flex-shrink-0" />
                        <span className="font-mono truncate">{email.recovery_phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Quick link buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isUnlocked) openUnlockModal();
                        else openPlatformModal(email.id);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-obsidian-text border border-obsidian-border text-[10px] font-medium"
                      title="Vincular cuenta o servicio a este correo"
                    >
                      <Globe size={11} className="text-indigo-400" />
                      <span>+ Cuenta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openProspectModal(email.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 text-[10px] font-medium"
                      title="Vincular prospecto o página demo a este correo"
                    >
                      <Rocket size={11} />
                      <span>+ Prospecto</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom info footer */}
              <div className="pt-3 border-t border-obsidian-border/60 flex items-center justify-between gap-2 text-[11px] text-obsidian-muted">
                <div className="flex flex-wrap items-center gap-2">
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

                <div className="flex items-center gap-1 text-obsidian-muted group-hover:text-white transition-colors flex-shrink-0">
                  <span>Ver detalles</span>
                  <ArrowRight size={13} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Clean Empty State */}
      {filteredEmails.length === 0 && !loading && (
        <div className="py-16 px-4 rounded-2xl bg-obsidian-panel border border-obsidian-border text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
            <Mail size={22} />
          </div>
          <h3 className="text-sm font-semibold text-white">
            {search ? 'No se encontraron correos con esa búsqueda' : 'No hay correos principales registrados en este ámbito'}
          </h3>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                if (!isUnlocked) openUnlockModal();
                else openEmailModal();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20"
            >
              <Plus size={14} />
              <span>Registrar Primer Correo Principal</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
