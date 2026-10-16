import React, { useState, useEffect } from 'react';
import { X, Mail, Plus, Trash2, Key, Shield, ArrowRight } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount, BackupCodeItem, SecurityQuestionItem } from '../../types';

export const EmailModal: React.FC = () => {
  const { 
    isEmailModalOpen, closeEmailModal, editingEmailId, 
    showToast, triggerDataReload 
  } = useVault();

  const [existingEmails, setExistingEmails] = useState<EmailAccount[]>([]);
  const [address, setAddress] = useState('');
  const [provider, setProvider] = useState('Google');
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEmailModalOpen) {
      api.getEmails().then(setExistingEmails).catch(() => {});

      if (editingEmailId) {
        api.getEmailDetail(editingEmailId).then((e) => {
          setAddress(e.address);
          setProvider(e.provider);
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
        // Reset defaults
        setAddress('');
        setProvider('Google');
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
  }, [isEmailModalOpen, editingEmailId]);

  if (!isEmailModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      showToast('Ingresa una dirección de correo válida.', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        address,
        provider,
        inbox_url: inboxUrl || null,
        recovery_email_id: recoveryEmailId || null,
        recovery_phone: recoveryPhone || null,
        two_factor_method: twoFactorMethod,
        notes: notes || null,
        aliases,
        backup_codes: backupCodes,
        security_questions: securityQuestions
      };

      if (password) {
        payload.password = password;
      }

      if (editingEmailId) {
        await api.updateEmail(editingEmailId, payload);
        showToast('Cuenta de correo actualizada con éxito.', 'success');
      } else {
        await api.createEmail(payload);
        showToast('Cuenta de correo creada atómicamente.', 'success');
      }
      closeEmailModal();
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const addAlias = () => {
    if (!newAliasInput.trim()) return;
    setAliases([...aliases, newAliasInput.trim()]);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Mail size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {editingEmailId ? 'Editar Cuenta de Correo Raíz' : 'Crear Nuevo Correo Raíz (Nodo Padre)'}
              </h2>
              <p className="text-xs text-obsidian-muted">
                Configuración de credenciales, seguridad y cadena de recuperación
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeEmailModal}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {/* Identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-obsidian-text font-medium block mb-1">Dirección de Correo *</label>
              <input
                type="email"
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="ejemplo@proton.me"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Proveedor</label>
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
                <option value="Outlook">Microsoft Outlook</option>
                <option value="Zoho">Zoho Mail</option>
                <option value="iCloud">Apple iCloud</option>
                <option value="Custom">Servidor Propio / Personalizado</option>
              </select>
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">URL de la Bandeja de Entrada</label>
              <input
                type="url"
                value={inboxUrl}
                onChange={(e) => setInboxUrl(e.target.value)}
                placeholder="https://mail.google.com"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">
                Contraseña de Acceso {editingEmailId && '(Opcional: solo si deseas cambiarla)'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Recovery & 2FA */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <span className="font-semibold text-white uppercase text-[10px] tracking-wider block">
              Cadena de Recuperación & Segundo Factor (2FA)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">Correo de Recuperación Padre</label>
                <select
                  value={recoveryEmailId}
                  onChange={(e) => setRecoveryEmailId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Sin correo de recuperación</option>
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
                  value={recoveryPhone}
                  onChange={(e) => setRecoveryPhone(e.target.value)}
                  placeholder="+52 55 1234 5678"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Método 2FA Activo</label>
                <select
                  value={twoFactorMethod}
                  onChange={(e) => setTwoFactorMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="authenticator">App Autenticadora (TOTP)</option>
                  <option value="passkey">Llave Física / Passkey (YubiKey)</option>
                  <option value="sms">SMS / Mensaje Telefónico</option>
                  <option value="email">Código por Correo Secundario</option>
                  <option value="none">Sin 2FA (No Recomendado)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Aliases */}
          <div className="space-y-2">
            <label className="text-obsidian-text font-medium block">Alias de Correo / Sub-direcciones</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newAliasInput}
                onChange={(e) => setNewAliasInput(e.target.value)}
                placeholder="ejemplo+compras@gmail.com"
                className="flex-1 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={addAlias}
                className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs"
              >
                Añadir Alias
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {aliases.map((al, idx) => (
                <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-obsidian-surface border border-obsidian-border font-mono text-[11px] text-white">
                  <span>{al}</span>
                  <button type="button" onClick={() => setAliases(aliases.filter((_, i) => i !== idx))} className="text-obsidian-muted hover:text-rose-400">
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Backup codes */}
          <div className="space-y-2">
            <label className="text-obsidian-text font-medium block">Códigos de Respaldo de Emergencia (Cifrados)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCodeInput}
                onChange={(e) => setNewCodeInput(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                className="flex-1 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none"
              />
              <button
                type="button"
                onClick={addBackupCode}
                className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs"
              >
                Añadir Código
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {backupCodes.map((bc, idx) => (
                <div key={idx} className="inline-flex items-center gap-2 p-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border font-mono text-xs">
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
                  <span className={bc.is_used ? 'line-through text-obsidian-muted' : 'text-emerald-400'}>
                    {bc.code}
                  </span>
                  <button type="button" onClick={() => setBackupCodes(backupCodes.filter((_, i) => i !== idx))} className="text-obsidian-muted hover:text-rose-400">
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-obsidian-text font-medium block mb-1">Notas Generales</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre facturación, uso o propósito de esta cuenta..."
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
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20"
          >
            {loading ? 'Guardando...' : editingEmailId ? 'Actualizar Cuenta' : 'Crear Cuenta Raíz'}
          </button>
        </div>
      </div>
    </div>
  );
};
