import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, AlertTriangle, ShieldAlert, Key, 
  Lock, RefreshCw, Sparkles, ArrowRight, CheckCircle2, 
  AlertCircle, Users, ExternalLink 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { SecurityAuditResponse } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';

export const SecurityAuditView: React.FC = () => {
  const { isUnlocked, openUnlockModal, openPasswordGen, openInspector, dataVersion } = useVault();

  const [audit, setAudit] = useState<SecurityAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isUnlocked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.getSecurityHealth()
      .then(setAudit)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isUnlocked, dataVersion]);

  if (!isUnlocked) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-6 pt-24 animate-fadeIn">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Lock size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Auditoría de Salud Criptográfica & Detección de Fugas
          </h2>
          <p className="text-xs text-obsidian-muted mt-1 max-w-md mx-auto">
            El análisis de reutilización de contraseñas y cálculo de radio de impacto requiere la validación de tu llave maestra.
          </p>
        </div>
        <button
          type="button"
          onClick={openUnlockModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30"
        >
          <span>Desbloquear Bóveda</span>
        </button>
      </div>
    );
  }

  const score = audit?.health_score || 100;
  const scoreColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#f43f5e';
  const scoreLabel = score >= 80 ? 'Excelente' : score >= 60 ? 'Atención Requerida' : 'Crítico';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="text-indigo-400" size={18} />
            <span>Monitor de Salud Criptográfica & Radio de Impacto</span>
          </h2>
          <p className="text-xs text-obsidian-muted">
            Auditoría en tiempo real de contraseñas repetidas, entropía débil y cuentas sin segundo factor (2FA)
          </p>
        </div>

        <button
          type="button"
          onClick={openPasswordGen}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold"
        >
          <Sparkles size={14} className="text-cyan-400" />
          <span>Generar Clave Segura</span>
        </button>
      </div>

      {/* Main Score Hero Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-obsidian-panel to-obsidian-card border border-obsidian-border shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          {/* Radial Score Gauge */}
          <div className="relative w-28 h-28 flex items-center justify-center flex-shrink-0">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                className="stroke-obsidian-surface"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke={scoreColor}
                strokeWidth="8"
                fill="transparent"
                strokeDasharray="251.2"
                strokeDashoffset={251.2 - (251.2 * score) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-bold font-mono text-white tracking-tight">{score}</span>
              <span className="text-[10px] text-obsidian-muted -mt-1">/100</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-white">Estado de Seguridad Global:</span>
              <span className="font-bold text-xs uppercase px-2 py-0.5 rounded-md" style={{ color: scoreColor, backgroundColor: `${scoreColor}20` }}>
                {scoreLabel}
              </span>
            </div>
            <p className="text-xs text-obsidian-muted mt-1 max-w-lg leading-relaxed">
              {score >= 80
                ? 'Tu bóveda tiene una postura criptográfica sólida. No se detectan brechas masivas de reutilización.'
                : 'Se han detectado contraseñas compartidas o cuentas sin 2FA. Si una de estas plataformas sufre una filtración, el atacante obtendrá acceso a los demás servicios vinculados.'}
            </p>
          </div>
        </div>

        {/* Quick Audit Metrics */}
        <div className="grid grid-cols-3 gap-3 w-full md:w-auto text-center">
          <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border min-w-[90px]">
            <span className="text-xl font-mono font-bold text-rose-400 block">
              {audit?.reused_passwords_count || 0}
            </span>
            <span className="text-[10px] text-obsidian-muted">Reutilizadas</span>
          </div>
          <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border min-w-[90px]">
            <span className="text-xl font-mono font-bold text-amber-400 block">
              {audit?.weak_passwords_count || 0}
            </span>
            <span className="text-[10px] text-obsidian-muted">Entropía Débil</span>
          </div>
          <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border min-w-[90px]">
            <span className="text-xl font-mono font-bold text-cyan-400 block">
              {audit?.no_2fa_emails_count || 0}
            </span>
            <span className="text-[10px] text-obsidian-muted">Sin 2FA</span>
          </div>
        </div>
      </div>

      {/* DETAILED AUDIT SECTIONS */}

      {/* 1. Password Reuse & Blast Radius Matrix */}
      <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-400" />
              <span>Matriz de Reutilización de Contraseñas (Radio de Impacto)</span>
            </h3>
            <p className="text-xs text-obsidian-muted">
              Cuentas que comparten la misma contraseña idéntica. Si una plataforma es vulnerada, todas las demás del grupo quedan comprometidas.
            </p>
          </div>
        </div>

        {audit?.reuse_groups && audit.reuse_groups.length > 0 ? (
          <div className="space-y-3">
            {audit.reuse_groups.map((group, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/25 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-rose-400 font-bold bg-rose-500/20 px-2 py-0.5 rounded">
                      Grupo #{idx + 1}
                    </span>
                    <span className="text-white font-medium">
                      {group.count} cuentas comparten esta misma contraseña
                    </span>
                  </div>
                  <span className="text-[11px] text-rose-400 font-semibold uppercase">
                    Alto Riesgo
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {group.entities.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => openInspector(item.type as any, item.id)}
                      className="p-2.5 rounded-lg bg-obsidian-panel border border-obsidian-border hover:border-indigo-500/40 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <PlatformIcon name={item.name} size="sm" />
                        <div>
                          <div className="font-semibold text-white text-xs">{item.name}</div>
                          <div className="text-[10px] text-obsidian-muted capitalize">{item.type}</div>
                        </div>
                      </div>
                      <ArrowRight size={13} className="text-obsidian-muted" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-obsidian-surface/40 border border-obsidian-border text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
            <CheckCircle2 size={16} />
            <span>Excelente: No se encontraron contraseñas repetidas entre ninguna de tus cuentas.</span>
          </div>
        )}
      </div>

      {/* 2. Weak Entropy & Root Emails without 2FA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Weak Passwords */}
        <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Key size={16} className="text-amber-400" />
            <span>Contraseñas de Baja Entropía (&lt; 50 bits)</span>
          </h3>
          <p className="text-xs text-obsidian-muted">
            Fáciles de adivinar por fuerza bruta o ataques de diccionario.
          </p>

          <div className="space-y-2 pt-1">
            {audit?.weak_accounts && audit.weak_accounts.length > 0 ? (
              audit.weak_accounts.map((w) => (
                <div
                  key={w.id}
                  onClick={() => openInspector(w.type as any, w.id)}
                  className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-indigo-500/40 cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div className="font-semibold text-white">{w.name}</div>
                  <span className="font-mono text-amber-400 font-bold">
                    {w.entropy.bits} bits ({w.entropy.label})
                  </span>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <CheckCircle2 size={15} />
                <span>Todas las contraseñas tienen entropía suficiente.</span>
              </div>
            )}
          </div>
        </div>

        {/* Emails without 2FA */}
        <div className="p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldAlert size={16} className="text-cyan-400" />
            <span>Correos Raíz Sin 2FA Activo</span>
          </h3>
          <p className="text-xs text-obsidian-muted">
            Los nodos padre sostienen tus servicios; deben contar siempre con Passkey o App Autenticadora.
          </p>

          <div className="space-y-2 pt-1">
            {audit?.unprotected_emails && audit.unprotected_emails.length > 0 ? (
              audit.unprotected_emails.map((u) => (
                <div
                  key={u.id}
                  onClick={() => openInspector('email', u.id)}
                  className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-indigo-500/40 cursor-pointer flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <div className="font-semibold text-white">{u.address}</div>
                    <div className="text-[10px] text-obsidian-muted">{u.platform_count} plataformas dependen de este correo</div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    Sin 2FA
                  </span>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <CheckCircle2 size={15} />
                <span>Todos los correos raíz tienen 2FA configurado.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
