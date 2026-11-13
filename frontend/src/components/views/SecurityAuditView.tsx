import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck, AlertTriangle, ShieldAlert, Key,
  Lock, Sparkles, ArrowRight, CheckCircle2, Clock, RefreshCw, Code, Search, X
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { SecurityAuditResponse } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { InfoTooltip } from '../common/InfoTooltip';
import { EmptyState } from '../common/EmptyState';
import { INPUT_LIMITS } from '../../lib/validation';

export const SecurityAuditView: React.FC = () => {
  const { isUnlocked, openUnlockModal, openPasswordGen, openInspector, setActiveSection, dataVersion } = useVault();

  const [audit, setAudit] = useState<SecurityAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadAudit = useCallback(async () => {
    if (!isUnlocked) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getSecurityHealth();
      setAudit(data);
    } catch (err: any) {
      setLoadError(err?.message || 'No se pudo cargar el diagnóstico de seguridad.');
    } finally {
      setLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit, dataVersion]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredApiKeyAlerts = useMemo(() => {
    const items = audit?.api_key_alerts || [];
    if (!normalizedQuery) return items;
    return items.filter(
      (ak) =>
        ak.platform_name.toLowerCase().includes(normalizedQuery) ||
        ak.label.toLowerCase().includes(normalizedQuery) ||
        (ak.parent_email && ak.parent_email.toLowerCase().includes(normalizedQuery))
    );
  }, [audit?.api_key_alerts, normalizedQuery]);

  const filteredStaleAccounts = useMemo(() => {
    const items = audit?.stale_accounts || [];
    if (!normalizedQuery) return items;
    return items.filter((st) => st.name.toLowerCase().includes(normalizedQuery));
  }, [audit?.stale_accounts, normalizedQuery]);

  const filteredReuseGroups = useMemo(() => {
    const groups = audit?.reuse_groups || [];
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        entities: group.entities.filter((item) => item.name.toLowerCase().includes(normalizedQuery)),
      }))
      .filter((group) => group.entities.length > 0);
  }, [audit?.reuse_groups, normalizedQuery]);

  const filteredWeakAccounts = useMemo(() => {
    const items = audit?.weak_accounts || [];
    if (!normalizedQuery) return items;
    return items.filter((w) => w.name.toLowerCase().includes(normalizedQuery));
  }, [audit?.weak_accounts, normalizedQuery]);

  const filteredUnprotectedEmails = useMemo(() => {
    const items = audit?.unprotected_emails || [];
    if (!normalizedQuery) return items;
    return items.filter((u) => u.address.toLowerCase().includes(normalizedQuery));
  }, [audit?.unprotected_emails, normalizedQuery]);

  if (!isUnlocked) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-3 pt-6 text-center animate-fadeIn sm:p-8 sm:pt-24">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <Lock size={32} aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
            <span>Nivel de Seguridad de tus Cuentas</span>
            <InfoTooltip text="Para revisar qué contraseñas están repetidas o son fáciles de adivinar, primero desbloquea con tu contraseña de acceso." />
          </h2>
        </div>
        <button
          type="button"
          onClick={openUnlockModal}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30"
        >
          <span>Desbloquear con contraseña de acceso</span>
        </button>
      </div>
    );
  }

  if (loading && !audit) {
    return (
      <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-6 sm:p-6 lg:p-8 animate-fadeIn" role="status" aria-label="Cargando diagnóstico de seguridad">
        <div className="h-8 w-52 rounded-xl bg-obsidian-panel border border-obsidian-border animate-pulse" />
        <div className="h-32 rounded-xl bg-obsidian-panel border border-obsidian-border animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-56 rounded-2xl bg-obsidian-panel border border-obsidian-border animate-pulse" />
          <div className="h-56 rounded-2xl bg-obsidian-panel border border-obsidian-border animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError && !audit) {
    return (
      <div className="mx-auto max-w-4xl p-3 sm:p-6 lg:p-8 animate-fadeIn">
        <EmptyState
          icon={AlertTriangle}
          tone="error"
          title="No se pudo completar la auditoría de seguridad"
          description={loadError}
          actionLabel="Reintentar análisis"
          onAction={loadAudit}
        />
      </div>
    );
  }

  const score = audit?.health_score ?? 0;
  const scoreColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#f43f5e';
  const scoreLabel = score >= 80 ? 'Muy Seguro' : score >= 60 ? 'Por Mejorar' : 'Riesgo Alto';
  const urgentApiCount =
    (audit?.expired_api_keys_count || 0) +
    (audit?.expiring_api_keys_count ?? audit?.expiring_soon_api_keys_count ?? 0);
  const stalePassCount = audit?.stale_passwords_count || 0;

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:space-y-6 sm:p-6 lg:p-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="text-indigo-400 shrink-0" size={18} aria-hidden="true" />
          <h2 className="text-base font-bold text-white tracking-tight">
            Seguridad
          </h2>
          <InfoTooltip
            title="Revisión de Seguridad"
            text="Detecta automáticamente si usas la misma contraseña en varias páginas, si alguna clave es muy corta o si a tus correos principales les falta verificación en 2 pasos."
            position="bottom"
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadAudit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-obsidian-panel hover:bg-obsidian-surface border border-obsidian-border text-obsidian-muted hover:text-white text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('settings')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-obsidian-panel hover:bg-obsidian-surface border border-obsidian-border text-obsidian-muted hover:text-white text-xs font-medium"
          >
            <Clock size={13} aria-hidden="true" />
            <span>Frecuencia de cambio</span>
          </button>
          <button
            type="button"
            onClick={openPasswordGen}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold shrink-0"
          >
            <Sparkles size={14} className="text-cyan-400 shrink-0" aria-hidden="true" />
            <span>Generar contraseña</span>
          </button>
        </div>
      </div>

      {/* Main Score Hero Card */}
      <div className="flex min-w-0 flex-col items-stretch justify-between gap-4 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-5 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5">
          {/* Radial Score Gauge */}
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center sm:h-24 sm:w-24">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
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

          <div className="min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white">Nivel de seguridad</span>
              <span
                className="font-bold text-xs uppercase px-2.5 py-0.5 rounded-md shrink-0"
                style={{ color: scoreColor, backgroundColor: `${scoreColor}20` }}
              >
                {scoreLabel}
              </span>
              <InfoTooltip
                title="Cómo se calcula tu calificación"
                text="Baja puntos cuando repites la misma contraseña en varias cuentas, usas contraseñas fáciles de adivinar, dejas correos principales sin verificación en 2 pasos o tienes llaves vencidas."
              />
            </div>
            <p className="text-xs text-obsidian-muted mt-1">
              {audit?.total_accounts || 0} cuentas revisadas · {audit?.vulnerable_accounts_count || 0} por mejorar
            </p>
          </div>
        </div>

        {/* Quick Audit Metrics - Responsive Non-Overlapping Grid */}
        <div className="grid w-full min-w-0 grid-cols-2 gap-2 border-t border-obsidian-border pt-3 sm:grid-cols-3 lg:grid-cols-5 xl:w-auto xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className="text-lg font-mono font-bold text-rose-400 block leading-tight">
              {audit?.reused_passwords_count || 0}
            </span>
            <span className="mt-0.5 break-words text-[10px] text-obsidian-muted">Repetidas</span>
          </div>
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className="text-lg font-mono font-bold text-amber-400 block leading-tight">
              {audit?.weak_passwords_count || 0}
            </span>
            <span className="mt-0.5 break-words text-[10px] text-obsidian-muted">Fáciles de adivinar</span>
          </div>
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className="text-lg font-mono font-bold text-cyan-400 block leading-tight">
              {audit?.no_2fa_emails_count || 0}
            </span>
            <span className="mt-0.5 break-words text-[10px] text-obsidian-muted">Sin 2 pasos</span>
          </div>
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className="text-lg font-mono font-bold text-rose-300 block leading-tight">
              {urgentApiCount}
            </span>
            <span className="mt-0.5 break-words text-[10px] text-obsidian-muted">Llaves por vencer</span>
          </div>
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className="text-lg font-mono font-bold text-indigo-300 block leading-tight">
              {stalePassCount}
            </span>
            <span className="mt-0.5 break-words text-[10px] text-obsidian-muted">Sin cambiar hace mucho</span>
          </div>
        </div>
      </div>

      {/* Quick Filter across Findings */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-obsidian-border bg-obsidian-panel p-3">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="absolute left-3 top-2.5 text-obsidian-muted" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            maxLength={INPUT_LIMITS.SEARCH}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filtrar hallazgos de seguridad"
            placeholder="Filtrar hallazgos por cuenta, servicio, llave o correo..."
            className="w-full pl-8 pr-8 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-xs text-white placeholder-obsidian-muted/60 focus:outline-none focus:border-indigo-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda de hallazgos"
              className="absolute right-2.5 top-2 text-obsidian-muted hover:text-white"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* LLAVES POR VENCER & CONTRASEÑAS ANTIGUAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Llaves API por Vencer */}
        <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-3.5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Code size={16} className="text-rose-400 shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-bold text-white break-words">
                Llaves de Conexión (API) por Vencer ({urgentApiCount})
              </h3>
              <InfoTooltip
                title="Vencimiento de Llaves API"
                text="Te avisa cuando una llave API ya venció o le quedan menos de 15 días de vigencia para que la renueves antes de que falle tu servicio."
              />
            </div>
            {audit && (audit.expired_api_keys_count || 0) > 0 && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/35 shrink-0">
                {audit.expired_api_keys_count} Vencida(s)
              </span>
            )}
          </div>

          <div className="space-y-2 pt-1">
            {filteredApiKeyAlerts.length > 0 ? (
              filteredApiKeyAlerts.map((ak) => {
                const isExpired = ak.status === 'expired';
                return (
                  <button
                    key={ak.id}
                    type="button"
                    onClick={() => openInspector('platform', ak.platform_id)}
                    className={`w-full text-left p-3 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors min-w-0 ${
                      isExpired
                        ? 'bg-rose-500/10 border-rose-500/35 hover:border-rose-500/60'
                        : 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-white truncate" title={`${ak.platform_name} — ${ak.label}`}>
                          {ak.platform_name}: <span className="font-mono text-indigo-200">{ak.label}</span>
                        </span>
                      </div>
                      <div className="text-[10px] text-obsidian-muted font-mono truncate mt-0.5">
                        {ak.parent_email ? `${ak.parent_email} · ` : ak.key_prefix ? `Inicio: ${ak.key_prefix}... · ` : ''}Vence: {ak.expires_at}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          isExpired
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {isExpired ? 'Ya venció' : 'Por vencer'}
                      </span>
                      <span className="text-[10px] font-mono text-obsidian-muted">
                        {isExpired ? `Hace ${Math.abs(ak.days_remaining)}d` : `En ${ak.days_remaining} día(s)`}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (audit?.api_key_alerts?.length || 0) > 0 && normalizedQuery ? (
              <div className="py-5 text-center text-xs text-obsidian-muted">
                Sin coincidencias en llaves API para "{searchQuery}".
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
                <span>Ninguna llave API está vencida ni por vencer pronto.</span>
              </div>
            )}
          </div>
        </div>

        {/* Contraseñas Antiguas */}
        <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-3.5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clock size={16} className="text-indigo-400 shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-bold text-white break-words">
                Contraseñas que Llevan Mucho Tiempo sin Cambiarse ({stalePassCount})
              </h3>
              <InfoTooltip
                title="Recomendación de Cambio de Contraseña"
                text={`Te sugiere cambiar la contraseña cada ${audit?.password_rotation_days_root || 90} días en Correos Principales y cada ${audit?.password_rotation_days_secondary || 180} días en tus demás cuentas.`}
              />
            </div>
            <span className="text-[10px] font-mono text-obsidian-muted shrink-0">
              Correos: {audit?.password_rotation_days_root || 90}d · Cuentas: {audit?.password_rotation_days_secondary || 180}d
            </span>
          </div>

          <div className="space-y-2 pt-1">
            {filteredStaleAccounts.length > 0 ? (
              filteredStaleAccounts.map((st) => (
                <button
                  key={`${st.type}-${st.id}`}
                  type="button"
                  onClick={() => openInspector(st.type, st.id)}
                  className="w-full text-left p-3 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-indigo-500/40 flex items-center justify-between gap-3 text-xs transition-colors min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate" title={st.name}>
                      {st.name}
                    </div>
                    <div className="text-[10px] text-obsidian-muted truncate">
                      {st.type === 'email' ? 'Correo Principal' : 'Cuenta / Servicio'} · Plazo sugerido: {st.threshold_days} días
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Conviene cambiarla
                    </span>
                    <span className="text-[10px] font-mono text-obsidian-muted">
                      {st.age_days} días sin cambiar
                    </span>
                  </div>
                </button>
              ))
            ) : (audit?.stale_accounts?.length || 0) > 0 && normalizedQuery ? (
              <div className="py-5 text-center text-xs text-obsidian-muted">
                Sin coincidencias en contraseñas antiguas para "{searchQuery}".
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
                <span>Todas tus contraseñas están al día.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DETAILED AUDIT SECTIONS */}

      {/* 1. Cuentas con la misma contraseña */}
      <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white break-words">
              Cuentas con la Misma Contraseña
            </h3>
            <InfoTooltip
              title="Por qué es peligroso repetir contraseñas"
              text="Si algún sitio web sufre un robo de datos, cualquier persona podría entrar a todas las demás cuentas donde pusiste la misma contraseña."
            />
          </div>
        </div>

        {filteredReuseGroups.length > 0 ? (
          <div className="space-y-3">
            {filteredReuseGroups.map((group, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/25 space-y-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-rose-400 font-bold bg-rose-500/20 px-2 py-0.5 rounded shrink-0">
                      Grupo #{idx + 1}
                    </span>
                    <span className="text-white font-medium break-words">
                      {group.count} cuentas usan exactamente la misma contraseña
                    </span>
                  </div>
                  <span className="text-[10px] text-rose-400 font-semibold uppercase px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 shrink-0">
                    Cambiar Contraseña
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {group.entities.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onClick={() => openInspector(item.type as any, item.id)}
                      title={`${item.name} (${item.type === 'email' ? 'Correo Principal' : 'Cuenta'})`}
                      className="w-full text-left p-2.5 rounded-lg bg-obsidian-panel border border-obsidian-border hover:border-indigo-500/40 flex items-center justify-between gap-2 transition-colors min-w-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <PlatformIcon name={item.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-white text-xs truncate" title={item.name}>
                            {item.name}
                          </div>
                          <div className="text-[10px] text-obsidian-muted capitalize truncate">
                            {item.type === 'email' ? 'Correo Principal' : 'Cuenta / Servicio'}
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={13} className="text-obsidian-muted shrink-0" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (audit?.reuse_groups?.length || 0) > 0 && normalizedQuery ? (
          <div className="p-5 rounded-xl bg-obsidian-surface/40 border border-obsidian-border text-center text-xs text-obsidian-muted">
            Sin coincidencias en contraseñas repetidas para "{searchQuery}".
          </div>
        ) : (
          <div className="p-5 rounded-xl bg-obsidian-surface/40 border border-obsidian-border text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
            <span>Excelente: No tienes ninguna contraseña repetida entre tus cuentas.</span>
          </div>
        )}
      </div>

      {/* 2. Contraseñas fáciles de adivinar & Correos principales sin 2 pasos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weak Passwords */}
        <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Key size={16} className="text-amber-400 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white break-words">
              Contraseñas Fáciles de Adivinar
            </h3>
            <InfoTooltip
              title="Fortaleza de la Contraseña"
              text="Son contraseñas cortas o con poca variedad de letras, números y símbolos. Conviene reemplazarlas usando el Generador de Contraseñas."
            />
          </div>

          <div className="space-y-2 pt-1">
            {filteredWeakAccounts.length > 0 ? (
              filteredWeakAccounts.map((w) => (
                <button
                  key={`${w.type}-${w.id}`}
                  type="button"
                  onClick={() => openInspector(w.type as any, w.id)}
                  title={w.name}
                  className="w-full text-left p-3 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-indigo-500/40 flex items-center justify-between gap-3 text-xs transition-colors min-w-0"
                >
                  <div className="font-semibold text-white truncate min-w-0 flex-1" title={w.name}>
                    {w.name}
                  </div>
                  <span className="font-mono text-amber-400 font-bold shrink-0 whitespace-nowrap">
                    Débil ({w.entropy.label})
                  </span>
                </button>
              ))
            ) : (audit?.weak_accounts?.length || 0) > 0 && normalizedQuery ? (
              <div className="py-5 text-center text-xs text-obsidian-muted">
                Sin coincidencias en contraseñas débiles para "{searchQuery}".
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
                <span>Todas tus contraseñas tienen buena longitud y seguridad.</span>
              </div>
            )}
          </div>
        </div>

        {/* Emails without 2FA */}
        <div className="p-5 sm:p-6 rounded-2xl bg-obsidian-panel border border-obsidian-border space-y-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert size={16} className="text-cyan-400 shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white break-words">
              Correos Principales sin Verificación en 2 Pasos
            </h3>
            <InfoTooltip
              title="Por qué proteger tus Correos Principales"
              text="Quien entra a tu correo principal puede cambiar la contraseña de tus demás cuentas. Activa siempre la verificación en 2 pasos (App Autenticadora o Passkey)."
            />
          </div>

          <div className="space-y-2 pt-1">
            {filteredUnprotectedEmails.length > 0 ? (
              filteredUnprotectedEmails.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openInspector('email', u.id)}
                  title={u.address}
                  className="w-full text-left p-3 rounded-xl bg-obsidian-surface border border-obsidian-border hover:border-indigo-500/40 flex items-center justify-between gap-3 text-xs transition-colors min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate" title={u.address}>
                      {u.address}
                    </div>
                    <div className="text-[10px] text-obsidian-muted truncate">
                      {u.platform_count} cuentas dependen de este correo
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                    Sin 2 pasos
                  </span>
                </button>
              ))
            ) : (audit?.unprotected_emails?.length || 0) > 0 && normalizedQuery ? (
              <div className="py-5 text-center text-xs text-obsidian-muted">
                Sin coincidencias en correos sin 2FA para "{searchQuery}".
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-emerald-400 flex items-center justify-center gap-2">
                <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
                <span>Todos tus correos principales tienen verificación en 2 pasos.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
