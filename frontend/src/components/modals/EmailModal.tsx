import React, { useState, useEffect } from 'react';
import { X, Mail, AlertCircle } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount, BackupCodeItem, SecurityQuestionItem, EntityScope } from '../../types';
import { isValidEmail, validateAndNormalizeUrl, isValidPhone, INPUT_LIMITS } from '../../lib/validation';

const STANDARD_PROVIDERS = ['Google', 'Proton', 'Outlook', 'Zoho', 'iCloud', 'Custom'];

export const EmailModal: React.FC = () => {
  const { 
    isEmailModalOpen, closeEmailModal, editingEmailId, 
    showToast, triggerDataReload, defaultEntityScope
  } = useVault();

  const [existingEmails, setExistingEmails] = useState<EmailAccount[]>([]);
  const [address, setAddress] = useState('');
  const [provider, setProvider] = useState('Google');
  const [customProvider, setCustomProvider] = useState('');
  const [scope, setScope] = useState<EntityScope>(defaultEntityScope);
  const [inboxUrl, setInboxUrl] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryEmailId, setRecoveryEmailId] = useState('');
  const [recoveryPhone, setRecoveryPhone] = useState('');
  const [twoFactorMethod, setTwoFactorMethod] = useState<'authenticator' | 'passkey' | 'sms' | 'email' | 'none'>('authenticator');
  const [notes, setNotes] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [newAliasInput, setNewAliasInput] = useState('');
  const [backupCodes, setBackupCodes] = useState<BackupCodeItem[]>([]);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [securityQuestions, setSecurityQuestions] = useState<SecurityQuestionItem[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEmailModalOpen) {
      setFormError(null);
      api.getEmails().then(setExistingEmails).catch(() => {});

      if (editingEmailId) {
        api.getEmailDetail(editingEmailId).then((e) => {
          setAddress(e.address);
          if (STANDARD_PROVIDERS.includes(e.provider)) {
            setProvider(e.provider);
            setCustomProvider('');
          } else {
            setProvider('__custom__');
            setCustomProvider(e.provider || '');
          }
          setScope(e.scope || 'business');
          setInboxUrl(e.inbox_url || '');
          setPassword('');
          setRecoveryEmailId(e.recovery_email_id || '');
          setRecoveryPhone(e.recovery_phone || '');
          setTwoFactorMethod(e.two_factor_method);
          setNotes(e.notes || '');
          setAliases(e.aliases || []);
          setBackupCodes(e.backup_codes || []);
          setSecurityQuestions(e.security_questions || []);
        });
      } else {
        setAddress('');
        setProvider('Google');
        setCustomProvider('');
        setScope(defaultEntityScope);
        setInboxUrl('https://mail.google.com');
        setPassword('');
        setRecoveryEmailId('');
        setRecoveryPhone('');
        setTwoFactorMethod('authenticator');
        setNotes('');
        setAliases([]);
        setBackupCodes([]);
        setSecurityQuestions([]);
      }
    }
  }, [isEmailModalOpen, editingEmailId, defaultEntityScope]);

  if (!isEmailModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedAddress = address.trim();
    if (!trimmedAddress || !isValidEmail(trimmedAddress)) {
      const msg = 'Ingresa una dirección de correo electrónico con formato válido (ej. nombre@dominio.com).';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    const finalProvider = provider === '__custom__' ? (customProvider.trim() || 'Custom') : provider;

    let normalizedInboxUrl = '';
    if (inboxUrl.trim()) {
      const urlCheck = validateAndNormalizeUrl(inboxUrl, 'URL de Bandeja de Entrada');
      if (!urlCheck.valid) {
        setFormError(urlCheck.error || 'URL de Bandeja de Entrada inválida.');
        showToast(urlCheck.error || 'URL de Bandeja de Entrada inválida.', 'error');
        return;
      }
      normalizedInboxUrl = urlCheck.normalized || '';
    }

    if (recoveryPhone.trim() && !isValidPhone(recoveryPhone)) {
      const msg = 'El teléfono de recuperación debe contener entre 7 y 20 dígitos válidos.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        address: trimmedAddress,
        provider: finalProvider,
        scope,
        inbox_url: normalizedInboxUrl || null,
        recovery_email_id: recoveryEmailId || null,
        recovery_phone: recoveryPhone.trim() || null,
        two_factor_method: twoFactorMethod,
        notes: notes.trim() || null,
        aliases,
        backup_codes: backupCodes,
        security_questions: securityQuestions
      };

      if (password) {
        payload.password = password;
      }

      if (editingEmailId) {
        await api.updateEmail(editingEmailId, payload);
        showToast('Correo principal actualizado con éxito.', 'success');
      } else {
        await api.createEmail(payload);
        showToast('Correo principal registrado con éxito.', 'success');
      }
      closeEmailModal();
      triggerDataReload();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar la cuenta de correo.');
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const addAlias = () => {
    const trimmed = newAliasInput.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      showToast('El alias debe tener formato de correo válido (ej. usuario+alias@dominio.com).', 'error');
      return;
    }
    if (aliases.includes(trimmed)) {
      showToast('Este alias ya fue añadido a la lista.', 'warning');
      return;
    }
    setAliases([...aliases, trimmed]);
    setNewAliasInput('');
  };

  const addBackupCode = () => {
    if (!newCodeInput.trim()) return;
    setBackupCodes([...backupCodes, { code: newCodeInput.trim(), is_used: false }]);
    setNewCodeInput('');
  };

  const addSecurityQuestion = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    setSecurityQuestions([...securityQuestions, { question: newQuestion.trim(), answer: newAnswer.trim() }]);
    setNewQuestion('');
    setNewAnswer('');
  };

  return (
    <div 
      className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-modal-title"
    >
      <div 
        className="relative w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 flex-shrink-0">
              <Mail size={20} />
            </div>
            <div className="min-w-0">
              <h2 id="email-modal-title" className="text-base font-bold text-white tracking-tight truncate">
                {editingEmailId ? 'Editar Correo Principal' : 'Agregar Correo Principal'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={closeEmailModal}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-rose-300 text-xs">
              <AlertCircle size={15} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="break-words">{formError}</span>
            </div>
          )}

          {/* Ámbito (Empresa vs Personal) */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border">
            <span className="text-[11px] font-semibold text-white">Ámbito del Correo:</span>
            <div className="flex items-center gap-1">
              {([
                { val: 'business', label: 'Empresa / Negocio' },
                { val: 'personal', label: 'Personal' },
                { val: 'shared', label: 'Compartido (Ambos)' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setScope(opt.val)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    scope === opt.val
                      ? 'bg-indigo-600 text-white'
                      : 'bg-obsidian-bg text-obsidian-muted hover:text-white border border-obsidian-border'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-obsidian-text font-medium block mb-1">Dirección de Correo Electrónico *</label>
              <input
                type="email"
                required
                autoFocus
                maxLength={INPUT_LIMITS.EMAIL}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="nombre@tudominio.com"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Proveedor de Correo</label>
              <select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  if (e.target.value === 'Google') setInboxUrl('https://mail.google.com');
                  else if (e.target.value === 'Proton') setInboxUrl('https://mail.proton.me');
                  else if (e.target.value === 'Outlook') setInboxUrl('https://outlook.live.com');
                  else if (e.target.value === 'Zoho') setInboxUrl('https://mail.zoho.com');
                }}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="Google">Google (Gmail / Workspace)</option>
                <option value="Proton">Proton Mail</option>
                <option value="Outlook">Microsoft Outlook / 365</option>
                <option value="Zoho">Zoho Mail</option>
                <option value="iCloud">Apple iCloud</option>
                <option value="Custom">Servidor Propio / Dominio Corporativo</option>
                <option value="__custom__">+ Escribir otro proveedor...</option>
              </select>
              {provider === '__custom__' && (
                <input
                  type="text"
                  value={customProvider}
                  onChange={(e) => setCustomProvider(e.target.value)}
                  placeholder="Nombre del proveedor (ej. Fastmail, Hostinger...)"
                  className="mt-1.5 w-full px-3 py-1.5 rounded-xl bg-obsidian-bg border border-indigo-500/50 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Enlace a la Bandeja de Entrada</label>
              <input
                type="text"
                maxLength={INPUT_LIMITS.URL}
                value={inboxUrl}
                onChange={(e) => setInboxUrl(e.target.value)}
                placeholder="https://mail.google.com"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">
                Contraseña del Correo {editingEmailId && '(Dejar vacía para conservar actual)'}
              </label>
              <input
                type="password"
                maxLength={INPUT_LIMITS.PASSWORD}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Recovery & 2FA */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <div>
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider block">
                Respaldo de Cuenta y Verificación en 2 Pasos (2FA)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">Correo de Respaldo</label>
                <select
                  value={recoveryEmailId}
                  onChange={(e) => setRecoveryEmailId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Sin correo de respaldo</option>
                  {existingEmails
                    .filter((e) => e.id !== editingEmailId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.address}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Teléfono de Recuperación</label>
                <input
                  type="text"
                  maxLength={INPUT_LIMITS.PHONE}
                  value={recoveryPhone}
                  onChange={(e) => setRecoveryPhone(e.target.value)}
                  placeholder="Ej. +52 55 1234 5678"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Verificación en 2 Pasos (2FA)</label>
                <select
                  value={twoFactorMethod}
                  onChange={(e) => setTwoFactorMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="authenticator">App Autenticadora (Google/Authy)</option>
                  <option value="passkey">Llave Física / Passkey</option>
                  <option value="sms">Mensaje SMS</option>
                  <option value="email">Código a Correo Secundario</option>
                  <option value="none">Sin Verificación en 2 Pasos</option>
                </select>
              </div>
            </div>
          </div>

          {/* Aliases */}
          <div className="space-y-2">
            <div>
              <label className="text-obsidian-text font-medium block">Alias o Sub-direcciones del Correo</label>
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                maxLength={INPUT_LIMITS.EMAIL}
                value={newAliasInput}
                onChange={(e) => setNewAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAlias();
                  }
                }}
                placeholder="ventas@tudominio.com o usuario+prospectos@gmail.com"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addAlias}
                className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs flex-shrink-0"
              >
                Añadir Alias
              </button>
            </div>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {aliases.map((al, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-obsidian-surface border border-obsidian-border font-mono text-[11px] text-white max-w-full">
                    <span className="truncate">{al}</span>
                    <button type="button" onClick={() => setAliases(aliases.filter((_, i) => i !== idx))} className="text-obsidian-muted hover:text-rose-400 flex-shrink-0">
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Backup codes */}
          <div className="space-y-2">
            <label className="text-obsidian-text font-medium block">Códigos de Recuperación de Emergencia</label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={INPUT_LIMITS.BACKUP_CODE}
                value={newCodeInput}
                onChange={(e) => setNewCodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addBackupCode();
                  }
                }}
                placeholder="Ingresa un código de recuperación (ej. XXXX-XXXX)"
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addBackupCode}
                className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs flex-shrink-0"
              >
                Añadir Código
              </button>
            </div>
            {backupCodes.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {backupCodes.map((bc, idx) => (
                  <div key={idx} className="inline-flex items-center gap-2 p-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border font-mono text-xs max-w-full">
                    <input
                      type="checkbox"
                      checked={bc.is_used}
                      onChange={(e) => {
                        const updated = [...backupCodes];
                        updated[idx].is_used = e.target.checked;
                        setBackupCodes(updated);
                      }}
                      title="Marcar como usado"
                    />
                    <span className={`truncate ${bc.is_used ? 'line-through text-obsidian-muted' : 'text-emerald-400'}`}>
                      {bc.code}
                    </span>
                    <button type="button" onClick={() => setBackupCodes(backupCodes.filter((_, i) => i !== idx))} className="text-obsidian-muted hover:text-rose-400 flex-shrink-0">
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-obsidian-text font-medium block mb-1">
              Notas Privadas <span className="text-[10px] text-obsidian-muted font-mono">({notes.length}/{INPUT_LIMITS.NOTES})</span>
            </label>
            <textarea
              rows={2}
              maxLength={INPUT_LIMITS.NOTES}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. Correo principal para contacto con clientes o administración de servidores..."
              className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </form>

        <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={closeEmailModal}
            className="px-4 py-2 text-xs font-medium text-obsidian-muted hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : editingEmailId ? 'Guardar Cambios' : 'Guardar Correo Principal'}
          </button>
        </div>
      </div>
    </div>
  );
};
