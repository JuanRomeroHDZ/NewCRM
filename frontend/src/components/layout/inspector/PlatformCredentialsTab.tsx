import React, { useState } from 'react';
import { Key, Lock, Shield, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { api } from '../../../lib/api';
import { INPUT_LIMITS } from '../../../lib/validation';
import { SecretField } from '../../common/SecretField';
import { CopyButton } from '../../common/CopyButton';
import { TotpWidget } from '../../common/TotpWidget';
import type { EmailAccount, PlatformAccount, PwnedCheckResponse } from '../../../types';

interface PlatformCredentialsTabProps {
  isEmail: boolean;
  emailData: EmailAccount | null;
  platformData: PlatformAccount | null;
  pwnedResult: PwnedCheckResponse | null;
  setPwnedResult: React.Dispatch<React.SetStateAction<PwnedCheckResponse | null>>;
}

export const PlatformCredentialsTab: React.FC<PlatformCredentialsTabProps> = ({
  isEmail,
  emailData,
  platformData,
  pwnedResult,
  setPwnedResult,
}) => {
  const { isUnlocked, openUnlockModal, showToast, triggerDataReload, confirm } = useVault();

  const [checkingPwned, setCheckingPwned] = useState(false);
  const [isAddingTotp, setIsAddingTotp] = useState(false);
  const [totpInput, setTotpInput] = useState('');

  if (!isUnlocked) {
    return (
      <div className="space-y-4 text-xs">
        <div className="space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-center">
          <Lock size={28} className="mx-auto text-amber-400" aria-hidden="true" />
          <h3 className="font-semibold text-white">Contraseñas Protegidas</h3>
          <button
            type="button"
            onClick={openUnlockModal}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white shadow-md hover:bg-indigo-500"
          >
            <Key size={14} aria-hidden="true" />
            <span>Ingresar contraseña de acceso</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-xs">
      {/* Password display */}
      <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-obsidian-muted">
          <span>Contraseña de Acceso</span>
          {isEmail && emailData?.entropy_details && (
            <span className="text-[10px] font-semibold" style={{ color: emailData.entropy_details.color }}>
              Seguridad: {emailData.entropy_details.label} ({emailData.entropy_details.score}/100)
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <SecretField
            value={isEmail ? emailData?.password_plain : platformData?.password_plain}
            masked={isEmail ? emailData?.password_masked : platformData?.password_masked}
            label="Contraseña"
          />
        </div>

        {/* HaveIBeenPwned k-Anonymity Checker */}
        <div className="flex flex-col gap-2 border-t border-obsidian-border/50 pt-2">
          {pwnedResult ? (
            <div
              role="status"
              className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 font-mono text-[11px] ${
                pwnedResult.is_pwned
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {pwnedResult.is_pwned ? (
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                )}
                <span className="break-words">{pwnedResult.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setPwnedResult(null)}
                aria-label="Cerrar resultado de verificación"
                className="inline-flex min-h-[28px] min-w-[28px] shrink-0 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={checkingPwned}
              onClick={async () => {
                setCheckingPwned(true);
                try {
                  const pw = isEmail ? emailData?.password_plain : platformData?.password_plain;
                  const res = await api.checkPasswordPwned(
                    pw || undefined,
                    !isEmail ? platformData?.id : undefined
                  );
                  setPwnedResult(res);
                } catch (err: any) {
                  showToast(err.message || 'No se pudo verificar la contraseña.', 'error');
                } finally {
                  setCheckingPwned(false);
                }
              }}
              className="inline-flex min-h-[32px] items-center gap-1.5 text-[11px] font-medium text-white/60 transition-colors hover:text-indigo-300 disabled:opacity-50"
            >
              <Shield
                className={`h-3.5 w-3.5 text-indigo-400 ${checkingPwned ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>
                {checkingPwned ? 'Revisando filtraciones...' : 'Revisar si esta contraseña ha sido filtrada'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* TOTP 2FA Authenticator Section for Platforms */}
      {!isEmail && platformData && (
        <div className="space-y-2">
          {platformData.has_totp ? (
            <div className="space-y-1.5">
              <TotpWidget
                initialCode={platformData.totp_code}
                initialRemaining={platformData.totp_remaining}
                onRefresh={() => api.getPlatformTotp(platformData.id)}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    const accepted = await confirm({
                      title: 'Desactivar código TOTP',
                      message: '¿Eliminar el código de verificación en 2 pasos de esta cuenta?',
                      confirmLabel: 'Eliminar TOTP',
                      tone: 'danger',
                    });
                    if (!accepted) return;
                    try {
                      await api.deletePlatformTotp(platformData.id);
                      showToast('Código de verificación eliminado', 'info');
                      triggerDataReload();
                    } catch (e: any) {
                      showToast(e.message || 'No se pudo eliminar el código TOTP.', 'error');
                    }
                  }}
                  className="min-h-[30px] px-2 text-[10px] text-rose-400/80 hover:text-rose-300"
                >
                  Desactivar TOTP
                </button>
              </div>
            </div>
          ) : isAddingTotp ? (
            <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-obsidian-surface p-3">
              <label htmlFor="inspector-totp-secret" className="block text-xs font-semibold text-white">
                Vincular Secreto TOTP (Base32)
              </label>
              <input
                id="inspector-totp-secret"
                type="text"
                maxLength={INPUT_LIMITS.TOTP_SECRET}
                placeholder="ej: JBSWY3DPEHPK3PXP..."
                value={totpInput}
                onChange={(e) => setTotpInput(e.target.value)}
                className="w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 py-1.5 font-mono text-xs uppercase text-white focus:border-indigo-500 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingTotp(false)}
                  className="min-h-[32px] px-2.5 py-1 text-xs text-white/60 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!totpInput.trim()) return;
                    try {
                      await api.setupPlatformTotp(platformData.id, totpInput.trim());
                      showToast('Código de verificación activado', 'success');
                      setIsAddingTotp(false);
                      setTotpInput('');
                      triggerDataReload();
                    } catch (e: any) {
                      showToast(e.message || 'No se pudo activar TOTP.', 'error');
                    }
                  }}
                  className="min-h-[32px] rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Guardar TOTP
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingTotp(true)}
              className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface/60 px-3 py-2.5 text-xs font-medium text-white/70 transition-all hover:border-indigo-500/30 hover:bg-obsidian-surface hover:text-indigo-300"
            >
              <ShieldCheck className="h-4 w-4 text-indigo-400" aria-hidden="true" />
              <span>Activar código de verificación</span>
            </button>
          )}
        </div>
      )}

      {/* PIN if platform */}
      {!isEmail && platformData?.pin_plain && (
        <div className="space-y-1.5 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
          <span className="block text-obsidian-muted">PIN de Perfil / Acceso</span>
          <SecretField value={platformData.pin_plain} masked="••••" label="PIN" />
        </div>
      )}

      {/* 2FA Method for emails */}
      {isEmail && emailData && (
        <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-obsidian-muted">Verificación en 2 Pasos</span>
            <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-400">
              {emailData.two_factor_method}
            </span>
          </div>
          {emailData.recovery_phone && (
            <div className="text-[11px] text-obsidian-muted">
              Teléfono de recuperación: <span className="font-mono text-white">{emailData.recovery_phone}</span>
            </div>
          )}
          {emailData.recovery_email_address && (
            <div className="text-[11px] text-obsidian-muted">
              Correo de respaldo:{' '}
              <span className="break-all font-mono text-cyan-300">{emailData.recovery_email_address}</span>
            </div>
          )}
        </div>
      )}

      {/* Backup codes */}
      {isEmail && emailData?.backup_codes && emailData.backup_codes.length > 0 && (
        <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
          <span className="block text-obsidian-muted">Códigos de Respaldo</span>
          <div className="space-y-1.5">
            {emailData.backup_codes.map((bc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 rounded border border-obsidian-border bg-obsidian-bg p-2 text-xs"
              >
                <span
                  className={`font-mono ${
                    bc.is_used ? 'text-obsidian-muted line-through' : 'font-semibold text-emerald-400'
                  }`}
                >
                  {bc.code}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] ${bc.is_used ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {bc.is_used ? 'Usado' : 'Disponible'}
                  </span>
                  <CopyButton
                    value={bc.code}
                    label="Código de respaldo"
                    className="min-h-[30px] min-w-[30px]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security Questions */}
      {isEmail && emailData?.security_questions && emailData.security_questions.length > 0 && (
        <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
          <span className="block text-obsidian-muted">Preguntas de Seguridad</span>
          <div className="space-y-2">
            {emailData.security_questions.map((sq, idx) => (
              <div key={idx} className="space-y-1 rounded border border-obsidian-border bg-obsidian-bg p-2">
                <div className="text-[11px] text-obsidian-muted">{sq.question}</div>
                <div className="flex items-center justify-between gap-2 font-mono text-xs text-white">
                  <span className="break-words">{sq.answer}</span>
                  <CopyButton
                    value={sq.answer}
                    label="Respuesta de seguridad"
                    className="min-h-[30px] min-w-[30px]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
