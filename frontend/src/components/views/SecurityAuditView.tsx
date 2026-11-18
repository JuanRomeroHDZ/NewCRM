import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  const [statusMessage, setStatusMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const loadGeneration = useRef(0);

  const loadAudit = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!isUnlocked) {
      setAudit(null);
      setSearchQuery('');
      setLoadError(null);
      setStatusMessage('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setStatusMessage('Actualizando diagnóstico de seguridad.');
    try {
      const data = await api.getSecurityHealth();
      if (generation !== loadGeneration.current) return;
      setAudit(data);
      setStatusMessage('Diagnóstico de seguridad actualizado.');
    } catch (err: any) {
      if (generation !== loadGeneration.current) return;
      setLoadError(err?.message || 'No se pudo cargar el diagnóstico de seguridad.');
      setStatusMessage('No se pudo actualizar el diagnóstico de seguridad.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    void loadAudit();
    return () => {
      loadGeneration.current += 1;
    };
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
      <div className="mx-auto max-w-xl space-y-4 p-3 pt-6 text-center animate-fadeIn motion-reduce:animate-none sm:p-8 sm:pt-24">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-obsidian-surface border border-obsidian-border flex items-center justify-center text-obsidian-muted">
          <Lock size={32} aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
            <span>Nivel de Seguridad de tus Cuentas</span>
            <InfoTooltip text="Para revisar qué contraseñas están repetidas o son fáciles de adivinar, primero desbloquea con tu contraseña de acceso." />
          </h2>
        </div>
        {/* [Acción principal] Desbloquear antes de consultar el diagnóstico. */}
        <button
          type="button"
          onClick={openUnlockModal}
          className="ui-action-primary"
        >
          <span>Desbloquear con contraseña de acceso</span>
        </button>
      </div>
    );
  }

  if (loading && !audit) {
    return (
      <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:p-4 animate-fadeIn motion-reduce:animate-none" role="status" aria-label="Cargando diagnóstico de seguridad">
        <div className="h-8 w-52 rounded-xl bg-obsidian-panel border border-obsidian-border animate-pulse motion-reduce:animate-none" />
        <div className="h-32 rounded-xl bg-obsidian-panel border border-obsidian-border animate-pulse motion-reduce:animate-none" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-56 rounded-2xl bg-obsidian-panel border border-obsidian-border animate-pulse motion-reduce:animate-none" />
          <div className="h-56 rounded-2xl bg-obsidian-panel border border-obsidian-border animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if (loadError && !audit) {
    return (
      <div className="mx-auto max-w-4xl p-3 sm:p-4 animate-fadeIn motion-reduce:animate-none">
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

  const totalAuditedAccounts = audit?.total_accounts ?? 0;
  const checkedPasswords = audit?.passwords_checked_count ?? 0;
  const checkedEmails = audit?.email_accounts_count ?? 0;
  const rawScore = Number(audit?.health_score);
  const score = totalAuditedAccounts > 0 && Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, rawScore))
    : null;
  const scoreLabel = score === null ? 'Sin datos' : score >= 80 ? 'Muy seguro' : score >= 60 ? 'Por mejorar' : 'Riesgo alto';
  const scoreTone = score === null
    ? 'text-obsidian-muted'
    : score >= 80
      ? 'text-emerald-400'
      : score >= 60
        ? 'text-amber-400'
        : 'text-rose-400';
  const scoreBadgeTone = score === null
    ? 'bg-obsidian-surface text-obsidian-muted'
    : score >= 80
      ? 'bg-emerald-500/10 text-emerald-400'
      : score >= 60
        ? 'bg-amber-500/10 text-amber-300'
        : 'bg-rose-500/10 text-rose-300';
  const expiredApiCount = audit?.expired_api_keys_count || 0;
  const expiringApiCount = audit?.expiring_api_keys_count ?? audit?.expiring_soon_api_keys_count ?? 0;
  const urgentApiCount = expiredApiCount + expiringApiCount;
  const stalePassCount = audit?.stale_passwords_count || 0;
  const reusedPasswordCount = audit?.reused_passwords_count || 0;
  const weakPasswordCount = audit?.weak_passwords_count || 0;
  const unprotectedEmailCount = audit?.no_2fa_emails_count || 0;
  const nextStep = expiredApiCount > 0
    ? { sectionId: 'security-api-findings', label: `Renueva las ${expiredApiCount} llaves vencidas` }
    : reusedPasswordCount > 0
      ? { sectionId: 'security-reuse-findings', label: `Cambia las contraseñas repetidas en ${reusedPasswordCount} cuentas` }
      : unprotectedEmailCount > 0
        ? { sectionId: 'security-2fa-findings', label: `Activa la verificación en 2 pasos en ${unprotectedEmailCount} correos` }
        : weakPasswordCount > 0
          ? { sectionId: 'security-weak-findings', label: `Refuerza ${weakPasswordCount} contraseñas fáciles de adivinar` }
          : expiringApiCount > 0
            ? { sectionId: 'security-api-findings', label: `Renueva las ${expiringApiCount} llaves próximas a vencer` }
            : stalePassCount > 0
              ? { sectionId: 'security-stale-findings', label: `Actualiza ${stalePassCount} contraseñas antiguas` }
              : null;
  const goToNextStep = () => {
    if (!nextStep) return;
    if (normalizedQuery) setSearchQuery('');
    const target = document.getElementById(nextStep.sectionId);
    if (!target) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto max-w-7xl min-w-0 space-y-4 p-3 sm:p-4 animate-fadeIn motion-reduce:animate-none">
      {loadError && audit && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-amber-200">
          <span>No se pudo actualizar el diagnóstico. Los datos visibles son de la última revisión correcta.</span>
          <button type="button" onClick={() => void loadAudit()} className="ui-action-secondary shrink-0">
            Reintentar
          </button>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="text-obsidian-muted shrink-0" size={18} aria-hidden="true" />
          <h2 className="text-base font-bold text-white tracking-tight">
            Seguridad
          </h2>
          <InfoTooltip
            title="Revisión de Seguridad"
            text="Detecta automáticamente si usas la misma contraseña en varias páginas, si alguna clave es muy corta o si a tus correos principales les falta verificación en 2 pasos."
            position="bottom"
          />
        </div>

        {/* [Acción secundaria] Actualizar la auditoría y abrir herramientas relacionadas. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadAudit}
            disabled={loading}
            className="ui-action-secondary"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            <span>Actualizar</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('settings_limits')}
            className="ui-action-secondary"
          >
            <Clock size={16} aria-hidden="true" />
            <span>Frecuencia de cambio</span>
          </button>
          <button
            type="button"
            onClick={openPasswordGen}
            className="ui-action-secondary shrink-0"
          >
            <Sparkles size={16} className="shrink-0" aria-hidden="true" />
            <span>Generar contraseña</span>
          </button>
        </div>
      </div>

      {/* Main Score Hero Card */}
      <div className="flex min-w-0 flex-col items-stretch justify-between gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel p-3 sm:p-4 xl:flex-row xl:items-center">
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
              {score !== null && (
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * score) / 100}
                  strokeLinecap="round"
                  className={`stroke-current ${scoreTone}`}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-bold font-mono text-white tracking-tight">{score ?? '—'}</span>
              {score !== null && <span className="text-xs text-obsidian-muted -mt-1">/100</span>}
            </div>
          </div>

          <div className="min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-white">Nivel de seguridad</span>
              <span
                className={`rounded-md px-3 py-0.5 text-xs font-bold uppercase ${scoreBadgeTone}`}
              >
                {scoreLabel}
              </span>
              <InfoTooltip
                title="Cómo se calcula tu calificación"
                text="80–100: muy seguro. 60–79: por mejorar. 0–59: riesgo alto. El puntaje baja si repites contraseñas, usas claves fáciles de adivinar, dejas correos principales sin verificación en 2 pasos o tienes llaves API vencidas."
              />
            </div>
            <p className="text-xs text-obsidian-muted mt-1">
              {score === null
                ? 'Agrega un correo o servicio para revisar la seguridad.'
                : `${totalAuditedAccounts} cuentas revisadas · ${audit?.vulnerable_accounts_count || 0} por mejorar`}
            </p>
            {nextStep ? (
              <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs">
                <span className="text-obsidian-muted">Siguiente paso:</span>
                <button
                  type="button"
                  onClick={goToNextStep}
                  className="ui-nav-action font-semibold"
                >
                  {nextStep.label}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              score !== null && <p className="mt-1 text-xs text-obsidian-muted">
                Sin acciones prioritarias. Mantén la revisión actualizada.
              </p>
            )}
          </div>
        </div>

        {/* Quick Audit Metrics - Responsive Non-Overlapping Grid */}
        <div className="grid w-full min-w-0 grid-cols-2 gap-2 border-t border-obsidian-border pt-3 sm:grid-cols-3 lg:grid-cols-5 xl:w-auto xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className={`block font-mono text-lg font-bold leading-tight ${(audit?.reused_passwords_count || 0) > 0 ? 'text-rose-400' : 'text-obsidian-muted'}`}>
              {audit?.reused_passwords_count || 0}
            </span>
            <span className="mt-0.5 break-words text-[11px] sm:text-xs text-obsidian-muted">Repetidas</span>
          </div>
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className={`block font-mono text-lg font-bold leading-tight ${(audit?.weak_passwords_count || 0) > 0 ? 'text-amber-400' : 'text-obsidian-muted'}`}>
              {audit?.weak_passwords_count || 0}
            </span>
            <span className="mt-0.5 break-words text-[11px] sm:text-xs text-obsidian-muted">Fáciles de adivinar</span>
          </div>
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className={`block font-mono text-lg font-bold leading-tight ${(audit?.no_2fa_emails_count || 0) > 0 ? 'text-amber-300' : 'text-obsidian-muted'}`}>
              {audit?.no_2fa_emails_count || 0}
            </span>
            <span className="mt-0.5 break-words text-[11px] sm:text-xs text-obsidian-muted">Sin 2 pasos</span>
          </div>
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className={`block font-mono text-lg font-bold leading-tight ${expiredApiCount > 0 ? 'text-rose-300' : expiringApiCount > 0 ? 'text-amber-300' : 'text-obsidian-muted'}`}>
              {urgentApiCount}
            </span>
            <span className="mt-0.5 break-words text-[11px] sm:text-xs text-obsidian-muted">Llaves por vencer</span>
          </div>
          <div className="flex min-w-0 flex-col px-1 py-1">
            <span className={`block font-mono text-lg font-bold leading-tight ${stalePassCount > 0 ? 'text-amber-300' : 'text-obsidian-muted'}`}>
              {stalePassCount}
            </span>
            <span className="mt-0.5 break-words text-[11px] sm:text-xs text-obsidian-muted">Sin cambiar hace mucho</span>
          </div>
        </div>
      </div>

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </span>

      {/* Quick Filter across Findings */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-3 text-obsidian-muted" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            maxLength={INPUT_LIMITS.SEARCH}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filtrar hallazgos de seguridad"
            placeholder="Filtrar hallazgos por cuenta, servicio, llave o correo..."
            className="w-full min-h-11 pl-8 pr-12 rounded-lg bg-obsidian-surface border border-obsidian-border text-xs text-white placeholder:text-obsidian-muted focus:outline-none focus:border-obsidian-accent focus-visible:ring-2 focus-visible:ring-obsidian-accent"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Limpiar búsqueda de hallazgos"
              className="ui-action-icon absolute right-0 top-0"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* LLAVES POR VENCER & CONTRASEÑAS ANTIGUAS */}
      <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
        {/* Llaves API por Vencer */}
        <div id="security-api-findings" className="min-w-0 scroll-mt-4 space-y-2 border-t border-obsidian-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Code size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-bold text-white break-words">
                Llaves API por vencer ({urgentApiCount})
              </h3>
              <InfoTooltip
                title="Vencimiento de llaves API"
                text="Te avisa cuando una llave API ya venció o le quedan menos de 15 días de vigencia para que la renueves antes de que falle tu servicio."
              />
            </div>
            {audit && (audit.expired_api_keys_count || 0) > 0 && (
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/35 shrink-0">
                {audit.expired_api_keys_count} Vencida(s)
              </span>
            )}
          </div>

          {/* [Navegación] Cada hallazgo abre el detalle de su cuenta o servicio. */}
          <div className="divide-y divide-obsidian-border">
            {filteredApiKeyAlerts.length > 0 ? (
              filteredApiKeyAlerts.map((ak) => {
                const isExpired = ak.status === 'expired';
                return (
                  <button
                    key={ak.id}
                    type="button"
                    onClick={() => openInspector('platform', ak.platform_id)}
                    className="ui-nav-action w-full min-w-0 justify-between py-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-white truncate" title={`${ak.platform_name} — ${ak.label}`}>
                          {ak.platform_name}: <span className="font-mono text-obsidian-text">{ak.label}</span>
                        </span>
                      </div>
                      <div className="text-xs text-obsidian-muted font-mono truncate mt-0.5">
                        {ak.parent_email ? `${ak.parent_email} · ` : ak.key_prefix ? `Inicio: ${ak.key_prefix}... · ` : ''}Vence: {ak.expires_at}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                          isExpired
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {isExpired ? 'Ya venció' : 'Por vencer'}
                      </span>
                      <span className="text-xs font-mono text-obsidian-muted">
                        {isExpired ? `Hace ${Math.abs(ak.days_remaining)}d` : `En ${ak.days_remaining} día(s)`}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (audit?.api_key_alerts?.length || 0) > 0 && normalizedQuery ? (
              <div className="py-2 text-xs text-obsidian-muted">
                Sin coincidencias en llaves API para "{searchQuery}".
              </div>
            ) : (
              <p className="py-2 text-xs text-obsidian-muted">No hay alertas de vencimiento de llaves API.</p>
            )}
          </div>
        </div>

        {/* Contraseñas Antiguas */}
        <div id="security-stale-findings" className="min-w-0 scroll-mt-4 space-y-2 border-t border-obsidian-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Clock size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
              <h3 className="text-sm font-bold text-white break-words">
                Contraseñas antiguas ({stalePassCount})
              </h3>
              <InfoTooltip
              title="Recomendación de cambio de contraseña"
                text={`Te sugiere cambiar la contraseña cada ${audit?.password_rotation_days_root || 90} días en Correos Principales y cada ${audit?.password_rotation_days_secondary || 180} días en tus demás cuentas.`}
              />
            </div>
            <span className="text-xs font-mono text-obsidian-muted shrink-0">
              Correos: {audit?.password_rotation_days_root || 90}d · Cuentas: {audit?.password_rotation_days_secondary || 180}d
            </span>
          </div>

          <div className="divide-y divide-obsidian-border">
            {filteredStaleAccounts.length > 0 ? (
              filteredStaleAccounts.map((st) => (
                <button
                  key={`${st.type}-${st.id}`}
                  type="button"
                  onClick={() => openInspector(st.type, st.id)}
                  className="ui-nav-action w-full min-w-0 justify-between py-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate" title={st.name}>
                      {st.name}
                    </div>
                    <div className="text-xs text-obsidian-muted truncate">
                      {st.type === 'email' ? 'Correo Principal' : 'Cuenta / Servicio'} · Plazo sugerido: {st.threshold_days} días
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Conviene cambiarla
                    </span>
                    <span className="text-xs font-mono text-obsidian-muted">
                      {st.age_days} días sin cambiar
                    </span>
                  </div>
                </button>
              ))
            ) : (audit?.stale_accounts?.length || 0) > 0 && normalizedQuery ? (
              <div className="py-2 text-xs text-obsidian-muted">
                Sin coincidencias en contraseñas antiguas para "{searchQuery}".
              </div>
            ) : (
              <div className={`flex items-center gap-2 py-2 text-xs ${checkedPasswords === 0 ? 'text-obsidian-muted' : 'text-emerald-400'}`}>
                {checkedPasswords > 0 && <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />}
                <span>{checkedPasswords === 0 ? 'No hay contraseñas para revisar.' : 'No se encontraron contraseñas pendientes de cambio.'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DETAILED AUDIT SECTIONS */}

      {/* 1. Cuentas con la misma contraseña */}
      <div id="security-reuse-findings" className="min-w-0 scroll-mt-4 space-y-2 border-t border-obsidian-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white break-words">
              Cuentas con la misma contraseña
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
              <div key={idx} className="space-y-3 border-t border-obsidian-border py-3 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-rose-400 font-bold bg-rose-500/20 px-2 py-0.5 rounded shrink-0">
                      Grupo #{idx + 1}
                    </span>
                    <span className="text-white font-medium break-words">
                      {group.count} cuentas usan exactamente la misma contraseña
                    </span>
                  </div>
                  <span className="text-[11px] text-rose-400 font-semibold uppercase px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 shrink-0">
                    Cambiar Contraseña
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.entities.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      onClick={() => openInspector(item.type as any, item.id)}
                      title={`${item.name} (${item.type === 'email' ? 'Correo Principal' : 'Cuenta'})`}
                      className="ui-nav-action w-full min-w-0 justify-between py-2 text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <PlatformIcon name={item.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-white text-xs truncate" title={item.name}>
                            {item.name}
                          </div>
                          <div className="text-xs text-obsidian-muted capitalize truncate">
                            {item.type === 'email' ? 'Correo Principal' : 'Cuenta / Servicio'}
                          </div>
                        </div>
                      </div>
                      <ArrowRight size={16} className="text-obsidian-muted shrink-0" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (audit?.reuse_groups?.length || 0) > 0 && normalizedQuery ? (
          <div className="py-2 text-xs text-obsidian-muted">
            Sin coincidencias en contraseñas repetidas para "{searchQuery}".
          </div>
        ) : (
          <div className={`flex items-center gap-2 py-2 text-xs ${checkedPasswords === 0 ? 'text-obsidian-muted' : 'text-emerald-400'}`}>
            {checkedPasswords > 0 && <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />}
            <span>{checkedPasswords === 0 ? 'No hay contraseñas para revisar.' : 'No se encontraron contraseñas repetidas.'}</span>
          </div>
        )}
      </div>

      {/* 2. Contraseñas fáciles de adivinar & Correos principales sin 2 pasos */}
      <div className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
        {/* Weak Passwords */}
        <div id="security-weak-findings" className="min-w-0 scroll-mt-4 space-y-2 border-t border-obsidian-border pt-4">
          <div className="flex items-center gap-2 min-w-0">
            <Key size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white break-words">
              Contraseñas fáciles de adivinar
            </h3>
            <InfoTooltip
              title="Fortaleza de la Contraseña"
              text="Son contraseñas cortas o con poca variedad de letras, números y símbolos. Conviene reemplazarlas usando el Generador de Contraseñas."
            />
          </div>

          <div className="divide-y divide-obsidian-border">
            {filteredWeakAccounts.length > 0 ? (
              filteredWeakAccounts.map((w) => (
                <button
                  key={`${w.type}-${w.id}`}
                  type="button"
                  onClick={() => openInspector(w.type as any, w.id)}
                  title={w.name}
                  className="ui-nav-action w-full min-w-0 justify-between py-3 text-xs"
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
              <div className="py-2 text-xs text-obsidian-muted">
                Sin coincidencias en contraseñas débiles para "{searchQuery}".
              </div>
            ) : (
              <div className={`flex items-center gap-2 py-2 text-xs ${checkedPasswords === 0 ? 'text-obsidian-muted' : 'text-emerald-400'}`}>
                {checkedPasswords > 0 && <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />}
                <span>{checkedPasswords === 0 ? 'No hay contraseñas para revisar.' : 'No se encontraron contraseñas fáciles de adivinar.'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Emails without 2FA */}
        <div id="security-2fa-findings" className="min-w-0 scroll-mt-4 space-y-2 border-t border-obsidian-border pt-4">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert size={18} className="text-obsidian-muted shrink-0" aria-hidden="true" />
            <h3 className="text-sm font-bold text-white break-words">
              Correos principales sin verificación en 2 pasos
            </h3>
            <InfoTooltip
              title="Por qué proteger tus Correos Principales"
              text="Quien entra a tu correo principal puede cambiar la contraseña de tus demás cuentas. Activa siempre la verificación en 2 pasos (App Autenticadora o Passkey)."
            />
          </div>

          <div className="divide-y divide-obsidian-border">
            {filteredUnprotectedEmails.length > 0 ? (
              filteredUnprotectedEmails.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openInspector('email', u.id)}
                  title={u.address}
                  className="ui-nav-action w-full min-w-0 justify-between py-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate" title={u.address}>
                      {u.address}
                    </div>
                    <div className="text-xs text-obsidian-muted truncate">
                      {u.platform_count} cuentas dependen de este correo
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                    Sin 2 pasos
                  </span>
                </button>
              ))
            ) : (audit?.unprotected_emails?.length || 0) > 0 && normalizedQuery ? (
              <div className="py-2 text-xs text-obsidian-muted">
                Sin coincidencias en correos sin 2FA para "{searchQuery}".
              </div>
            ) : (
              <div className={`flex items-center gap-2 py-2 text-xs ${checkedEmails === 0 ? 'text-obsidian-muted' : 'text-emerald-400'}`}>
                {checkedEmails > 0 && <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />}
                <span>{checkedEmails === 0 ? 'No hay correos principales para revisar.' : 'Todos tus correos principales tienen verificación en 2 pasos.'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
