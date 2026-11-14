import React, { useState, useEffect, useId, useRef } from 'react';
import {
  X,
  ExternalLink,
  Key,
  Code,
  CreditCard,
  History,
  Lock,
  Edit3,
  Trash2,
  AlertTriangle,
  Clock,
  Rocket,
  Plus,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import {
  PlatformAccount,
  EmailAccount,
  PaymentMethod,
  PwnedCheckResponse,
  Prospect,
  ClientIncome,
  DomainRenewal,
} from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { TagBadge } from '../common/TagBadge';
import { CopyButton } from '../common/CopyButton';
import { EmptyState } from '../common/EmptyState';
import { getStatusMeta, getSlaBadgeMeta } from '../../lib/prospectUtils';
import { ProspectInspectorSection } from './inspector/ProspectInspectorSection';
import { PlatformCredentialsTab } from './inspector/PlatformCredentialsTab';

export const InspectorDrawer: React.FC = () => {
  const {
    selectedEntity,
    activeSection,
    openInspector,
    closeInspector,
    isUnlocked,
    openUnlockModal,
    openPlatformModal,
    openEmailModal,
    openProspectModal,
    openPaymentModal,
    showToast,
    triggerDataReload,
    dataVersion,
    confirm,
    supportedCurrencies,
    systemLocale,
  } = useVault();

  const titleId = useId();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const previousSectionRef = useRef(activeSection);

  const [activeTab, setActiveTab] = useState<'general' | 'credentials' | 'api_keys' | 'subscription' | 'history'>('general');
  const [emailData, setEmailData] = useState<EmailAccount | null>(null);
  const [emailProspects, setEmailProspects] = useState<Prospect[]>([]);
  const [platformData, setPlatformData] = useState<PlatformAccount | null>(null);
  const [prospectData, setProspectData] = useState<Prospect | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentMethod | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [pwnedResult, setPwnedResult] = useState<PwnedCheckResponse | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [clientIncomes, setClientIncomes] = useState<ClientIncome[]>([]);
  const [clientRenewals, setClientRenewals] = useState<DomainRenewal[]>([]);

  // Focus management & restoration when drawer opens/closes
  useEffect(() => {
    const isOpen = Boolean(selectedEntity);
    if (isOpen && !wasOpenRef.current) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        drawerRef.current?.focus();
      });
    } else if (!isOpen && wasOpenRef.current) {
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [selectedEntity]);

  // Escape key handling
  useEffect(() => {
    if (!selectedEntity) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeInspector();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEntity, closeInspector]);

  // Reset activeTab & transient result whenever selected entity id or type changes
  useEffect(() => {
    setActiveTab('general');
    setPwnedResult(null);
    setFetchError('');
  }, [selectedEntity?.id, selectedEntity?.type]);

  useEffect(() => {
    if (selectedEntity?.type === 'prospect' && previousSectionRef.current !== activeSection) {
      closeInspector();
    }
    previousSectionRef.current = activeSection;
  }, [activeSection, selectedEntity?.type, closeInspector]);

  useEffect(() => {
    if (selectedEntity?.type !== 'prospect') return;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [selectedEntity?.type]);

  useEffect(() => {
    if (!selectedEntity) {
      setEmailData(null);
      setEmailProspects([]);
      setPlatformData(null);
      setProspectData(null);
      setPaymentData(null);
      setHistoryData([]);
      setFetchError('');
      return;
    }

    let active = true;
    setLoading(true);
    setFetchError('');

    if (selectedEntity.type === 'prospect') {
      setProspectData(null);
      setClientIncomes([]);
      setClientRenewals([]);
    }

    if (selectedEntity.type === 'email') {
      api
        .getEmailDetail(selectedEntity.id)
        .then((res) => {
          if (!active) return;
          setEmailData(res);
          setPlatformData(null);
          setProspectData(null);
          setPaymentData(null);
        })
        .catch((err) => {
          if (active) {
            setFetchError(err instanceof Error ? err.message : 'No se pudo cargar el correo.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      api
        .getProspects({ email_id: selectedEntity.id })
        .then((items) => {
          if (active) setEmailProspects(items);
        })
        .catch(() => {
          if (active) setEmailProspects([]);
        });

      api
        .getPasswordHistory(selectedEntity.id)
        .then((items) => {
          if (active) setHistoryData(items);
        })
        .catch(() => {
          if (active) setHistoryData([]);
        });
    } else if (selectedEntity.type === 'platform') {
      api
        .getPlatformDetail(selectedEntity.id)
        .then((res) => {
          if (!active) return;
          setPlatformData(res);
          setEmailData(null);
          setProspectData(null);
          setPaymentData(null);
        })
        .catch((err) => {
          if (active) {
            setFetchError(err instanceof Error ? err.message : 'No se pudo cargar la cuenta o servicio.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      api
        .getPasswordHistory(selectedEntity.id)
        .then((items) => {
          if (active) setHistoryData(items);
        })
        .catch(() => {
          if (active) setHistoryData([]);
        });
    } else if (selectedEntity.type === 'prospect') {
      api
        .getProspectDetail(selectedEntity.id)
        .then((res) => {
          if (!active) return;
          setProspectData(res);
          setEmailData(null);
          setPlatformData(null);
          setPaymentData(null);

          api
            .getIncomes()
            .then((allInc) => {
              if (!active) return;
              const companyName = res.company_name.trim().toLocaleLowerCase();
              const filtered = allInc.filter(
                (item) => item.prospect_id
                  ? item.prospect_id === res.id
                  : (item.client_name || '').trim().toLocaleLowerCase() === companyName
              );
              setClientIncomes(filtered);
            })
            .catch(() => {
              if (active) setClientIncomes([]);
            });

          api
            .getRenewals()
            .then((allRen) => {
              if (!active) return;
              const companyName = res.company_name.trim().toLocaleLowerCase();
              const filtered = allRen.filter(
                (item) => item.prospect_id
                  ? item.prospect_id === res.id
                  : (item.client_name || '').trim().toLocaleLowerCase() === companyName
              );
              setClientRenewals(filtered);
            })
            .catch(() => {
              if (active) setClientRenewals([]);
            });
        })
        .catch((err) => {
          if (active) {
            setFetchError(err instanceof Error ? err.message : 'No se pudo cargar el prospecto.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else if (selectedEntity.type === 'payment') {
      api
        .getPaymentMethods()
        .then((methods) => {
          if (!active) return;
          const found = methods.find((m) => m.id === selectedEntity.id) || null;
          if (!found) {
            setFetchError('No se encontró el método de pago seleccionado.');
          }
          setPaymentData(found);
          setEmailData(null);
          setPlatformData(null);
          setProspectData(null);
        })
        .catch((err) => {
          if (active) {
            setFetchError(err instanceof Error ? err.message : 'No se pudo cargar el método de pago.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [selectedEntity, isUnlocked, dataVersion, retryAttempt]);

  if (!selectedEntity) return null;

  const isEmail = selectedEntity.type === 'email';
  const isPlatform = selectedEntity.type === 'platform';
  const isProspect = selectedEntity.type === 'prospect';
  const isPayment = selectedEntity.type === 'payment';

  const handleDelete = async () => {
    if (!isProspect && !isUnlocked) {
      openUnlockModal();
      return;
    }
    const accepted = await confirm({
      title: 'Enviar a papelera',
      message: '¿Enviar este elemento a la papelera?',
      confirmLabel: 'Enviar a papelera',
      tone: 'danger',
    });
    if (!accepted) return;

    try {
      if (isEmail) {
        await api.deleteEmail(selectedEntity.id);
      } else if (isPlatform) {
        await api.deletePlatform(selectedEntity.id);
      } else if (isProspect) {
        await api.deleteProspect(selectedEntity.id);
      } else if (isPayment) {
        await api.deletePaymentMethod(selectedEntity.id);
      }
      showToast('Elemento enviado a la papelera.', 'info');
      closeInspector();
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'No se pudo enviar a la papelera.', 'error');
    }
  };

  const handleEdit = () => {
    if (isEmail) {
      openEmailModal(selectedEntity.id);
    } else if (isPlatform) {
      openPlatformModal(undefined, selectedEntity.id);
    } else if (isProspect) {
      openProspectModal(undefined, selectedEntity.id);
    } else if (isPayment && paymentData) {
      openPaymentModal(paymentData);
    }
  };

  const title = isEmail
    ? emailData?.address
    : isProspect
    ? prospectData?.company_name
    : isPayment
    ? paymentData?.alias
    : platformData?.name;

  const subtitle = isEmail
    ? `Proveedor: ${emailData?.provider || '...'}`
    : isProspect
    ? `Prospecto / Demo • ${prospectData?.contact_name || 'Sin encargado'}`
    : isPayment
    ? `${paymentData?.issuer || 'Tarjeta'} •••• ${paymentData?.last_four || ''}`
    : `Usuario: ${platformData?.username || 'N/A'}`;

  const getCurrencySymbol = (code?: string) =>
    supportedCurrencies.find((c) => c.code === code)?.symbol || '$';

  return (
    <div
      ref={drawerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-obsidian-border bg-obsidian-panel shadow-2xl outline-none animate-slideLeft"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 border-b border-obsidian-border bg-obsidian-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <PlatformIcon
            name={title || 'Item'}
            iconUrl={isPlatform ? platformData?.icon_url : undefined}
            size="md"
          />
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-bold tracking-tight text-white">
              {title || (loading ? 'Cargando...' : 'Detalle')}
            </h2>
            <p className="truncate text-[11px] text-obsidian-muted">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleEdit}
            title="Editar datos"
            aria-label="Editar datos"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <Edit3 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            title="Enviar a papelera"
            aria-label="Enviar a papelera"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={closeInspector}
            title="Cerrar inspector"
            aria-label="Cerrar inspector"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-obsidian-muted transition-colors hover:bg-obsidian-surface hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Secciones del inspector"
        className="flex overflow-x-auto border-b border-obsidian-border bg-obsidian-surface/40 px-4"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'general'}
          onClick={() => setActiveTab('general')}
          className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
            activeTab === 'general'
              ? 'border-indigo-500 font-semibold text-white'
              : 'border-transparent text-obsidian-muted hover:text-white'
          }`}
        >
          {isProspect ? 'Ficha y Seguimiento' : 'General'}
        </button>
        {(isEmail || isPlatform) && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'credentials'}
            onClick={() => setActiveTab('credentials')}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
              activeTab === 'credentials'
                ? 'border-indigo-500 font-semibold text-white'
                : 'border-transparent text-obsidian-muted hover:text-white'
            }`}
          >
            <Key size={13} aria-hidden="true" />
            <span>Contraseñas</span>
            {!isUnlocked && <Lock size={11} className="text-amber-400" aria-hidden="true" />}
          </button>
        )}
        {isPlatform && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'api_keys'}
            onClick={() => setActiveTab('api_keys')}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
              activeTab === 'api_keys'
                ? 'border-indigo-500 font-semibold text-white'
                : 'border-transparent text-obsidian-muted hover:text-white'
            }`}
          >
            <Code size={13} aria-hidden="true" />
            <span>Llaves API</span>
            {!isUnlocked && <Lock size={11} className="text-amber-400" aria-hidden="true" />}
          </button>
        )}
        {isPlatform && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'subscription'}
            onClick={() => setActiveTab('subscription')}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
              activeTab === 'subscription'
                ? 'border-indigo-500 font-semibold text-white'
                : 'border-transparent text-obsidian-muted hover:text-white'
            }`}
          >
            <CreditCard size={13} aria-hidden="true" />
            <span>Suscripción</span>
          </button>
        )}
        {(isEmail || isPlatform) && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-all ${
              activeTab === 'history'
                ? 'border-indigo-500 font-semibold text-white'
                : 'border-transparent text-obsidian-muted hover:text-white'
            }`}
          >
            <History size={13} aria-hidden="true" />
            <span>Historial</span>
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className={`min-h-0 min-w-0 flex-1 overflow-y-auto break-words p-3 [overflow-wrap:anywhere] sm:p-5 ${isProspect ? 'space-y-3' : 'space-y-5'}`}>
        {loading ? (
          <div role="status" className="flex flex-col items-center justify-center py-12 text-xs text-obsidian-muted">
            <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-500" />
            Cargando detalles...
          </div>
        ) : fetchError ? (
          <EmptyState
            icon={AlertTriangle}
            tone="error"
            title="No se pudieron cargar los detalles"
            description={fetchError}
            actionLabel="Reintentar"
            onAction={() => setRetryAttempt((value) => value + 1)}
          />
        ) : (
          <>
            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-4 text-xs">
                {isEmail && emailData && (
                  <>
                    <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                      <div className="text-obsidian-muted">Dirección Principal</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="select-all break-all font-mono text-sm font-medium text-white">
                          {emailData.address}
                        </span>
                        <CopyButton
                          value={emailData.address}
                          label="Correo"
                          className="min-h-[32px] min-w-[32px]"
                        />
                      </div>
                    </div>

                    {emailData.inbox_url && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                        <span className="text-obsidian-muted">Bandeja de Entrada</span>
                        <a
                          href={emailData.inbox_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-indigo-400 hover:text-indigo-300"
                        >
                          <span>Abrir Webmail</span>
                          <ExternalLink size={13} aria-hidden="true" />
                        </a>
                      </div>
                    )}

                    {emailData.aliases && emailData.aliases.length > 0 && (
                      <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                        <span className="block text-obsidian-muted">Alias / Sub-direcciones vinculadas</span>
                        <div className="space-y-1">
                          {emailData.aliases.map((al, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2 rounded bg-obsidian-bg p-1.5 font-mono text-[11px] text-obsidian-text"
                            >
                              <span className="truncate">{al}</span>
                              <CopyButton value={al} label="Alias" className="min-h-[30px] min-w-[30px]" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                      <span className="block text-obsidian-muted">Cuentas y Servicios Asociados</span>
                      <span className="text-sm font-semibold text-white">
                        {emailData.platform_count} servicios dependen de este correo
                      </span>
                    </div>

                    {/* Correlated Prospects / Demos for this Email */}
                    <div className="space-y-2.5 rounded-xl border border-obsidian-border bg-obsidian-surface p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-medium text-obsidian-muted">
                          <Rocket size={13} className="text-indigo-400" aria-hidden="true" />
                          <span>Prospectos y Demos Vinculados ({emailProspects.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => openProspectModal(emailData.id)}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-600/20 px-2.5 py-1 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-600/30"
                        >
                          <Plus size={11} aria-hidden="true" />
                          <span>Nuevo Prospecto</span>
                        </button>
                      </div>

                      {emailProspects.length > 0 ? (
                        <div className="space-y-1.5">
                          {emailProspects.map((pr) => {
                            const prStatus = getStatusMeta(pr.status);
                            const prSla = getSlaBadgeMeta(pr.sla_status);
                            return (
                              <button
                                key={pr.id}
                                type="button"
                                onClick={() => openInspector('prospect', pr.id)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg border border-obsidian-border bg-obsidian-bg p-2.5 text-left transition-colors hover:bg-obsidian-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-semibold text-white">
                                    {pr.company_name}
                                  </div>
                                  <div className="truncate font-mono text-[10px] text-obsidian-muted">
                                    {pr.demo_url ? pr.demo_url.replace(/^https?:\/\//, '') : prStatus.label}
                                  </div>
                                </div>
                                <span
                                  className={`flex-shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold ${prSla.badgeClass}`}
                                >
                                  {prSla.shortLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-[11px] text-obsidian-muted">
                          No hay prospectos o páginas demo vinculadas a este correo aún.
                        </div>
                      )}
                    </div>

                    {emailData.notes && (
                      <div className="space-y-1 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                        <span className="block text-obsidian-muted">Notas</span>
                        <p className="whitespace-pre-wrap break-words leading-relaxed text-obsidian-text">
                          {emailData.notes}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {isProspect && prospectData && (
                  <ProspectInspectorSection
                    prospectData={prospectData}
                    nowMs={nowMs}
                    clientIncomes={clientIncomes}
                    clientRenewals={clientRenewals}
                    onProspectUpdated={(updated) => {
                      setProspectData((current) => current?.id === updated.id ? updated : current);
                    }}
                    onIncomeCreated={(created) => setClientIncomes((prev) => [created, ...prev])}
                    onRenewalCreated={(created) => setClientRenewals((prev) => [...prev, created])}
                    onRenewalUpdated={(updated) =>
                      setClientRenewals((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
                    }
                    onOpenEmailInspector={(emailId) => openInspector('email', emailId)}
                  />
                )}

                {isPlatform && platformData && (
                  <>
                    <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                      <div className="text-obsidian-muted">Usuario o Correo de Acceso</div>
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span
                          className="select-all truncate font-mono text-sm font-medium text-white"
                          title={platformData.username || platformData.specific_alias || platformData.email_address}
                        >
                          {platformData.username || platformData.specific_alias || platformData.email_address}
                        </span>
                        <CopyButton
                          value={
                            platformData.username ||
                            platformData.specific_alias ||
                            platformData.email_address ||
                            ''
                          }
                          label="Usuario"
                          className="min-h-[32px] min-w-[32px]"
                        />
                      </div>
                      <div className="flex min-w-0 items-center justify-between gap-2 border-t border-obsidian-border/50 pt-1 text-[11px] text-obsidian-muted">
                        <span className="truncate" title={platformData.email_address}>
                          Correo principal:{' '}
                          <span className="font-mono text-indigo-300">{platformData.email_address}</span>
                        </span>
                        {platformData.email_id && (
                          <button
                            type="button"
                            onClick={() => platformData.email_id && openInspector('email', platformData.email_id)}
                            className="min-h-[28px] shrink-0 rounded border border-indigo-500/25 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-500/20"
                          >
                            Abrir Correo
                          </button>
                        )}
                      </div>
                    </div>

                    {platformData.login_url && (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                        <span className="shrink-0 text-obsidian-muted">Enlace de Acceso</span>
                        <a
                          href={platformData.login_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-[200px] items-center gap-1 truncate font-medium text-indigo-400 hover:text-indigo-300"
                        >
                          <span className="truncate">{platformData.login_url}</span>
                          <ExternalLink size={13} className="flex-shrink-0" aria-hidden="true" />
                        </a>
                      </div>
                    )}

                    <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                      <span className="block text-obsidian-muted">Etiquetas</span>
                      <div className="flex flex-wrap gap-1.5">
                        {platformData.tags && platformData.tags.length > 0 ? (
                          platformData.tags.map((t, idx) => (
                            <TagBadge key={idx} name={t.name} color={t.color} />
                          ))
                        ) : (
                          <span className="italic text-obsidian-muted">Sin etiquetas</span>
                        )}
                      </div>
                    </div>

                    {platformData.notes && (
                      <div className="space-y-1 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                        <span className="block text-obsidian-muted">Notas</span>
                        <p className="whitespace-pre-wrap leading-relaxed text-obsidian-text">
                          {platformData.notes}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {isPayment && paymentData && (
                  <>
                    <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                      <div className="text-obsidian-muted">Método de Pago</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-white">
                          {paymentData.alias} ({paymentData.issuer})
                        </span>
                        <span className="font-mono text-xs text-emerald-300">•••• {paymentData.last_four}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                      <span className="text-obsidian-muted">Suscripciones vinculadas</span>
                      <span className="font-mono font-semibold text-white">
                        {paymentData.linked_subscriptions_count}
                      </span>
                    </div>
                    {paymentData.billing_notes && (
                      <div className="space-y-1 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                        <span className="block text-obsidian-muted">Notas de facturación</span>
                        <p className="whitespace-pre-wrap break-words text-obsidian-text">
                          {paymentData.billing_notes}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* CREDENTIALS TAB */}
            {activeTab === 'credentials' && (isEmail || isPlatform) && (
              <PlatformCredentialsTab
                isEmail={isEmail}
                emailData={emailData}
                platformData={platformData}
                pwnedResult={pwnedResult}
                setPwnedResult={setPwnedResult}
              />
            )}

            {/* API KEYS & VARIABLES TAB */}
            {activeTab === 'api_keys' && isPlatform && platformData && (
              <div className="space-y-4 text-xs">
                {!isUnlocked ? (
                  <div className="space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-center">
                    <Lock size={24} className="mx-auto text-amber-400" aria-hidden="true" />
                    <h3 className="font-semibold text-white">Llaves Protegidas</h3>
                    <button
                      type="button"
                      onClick={openUnlockModal}
                      className="mt-2 min-h-[36px] rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                    >
                      Desbloquear
                    </button>
                  </div>
                ) : (
                  <>
                    {/* API Keys */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="block text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
                          Llaves API Registradas ({platformData.api_keys?.length || 0})
                        </span>
                      </div>

                      {platformData.api_keys && platformData.api_keys.length > 0 ? (
                        platformData.api_keys.map((ak) => (
                          <div
                            key={ak.id}
                            className="space-y-1.5 rounded-xl border border-obsidian-border bg-obsidian-surface p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-white">{ak.label}</span>
                              {ak.expires_at && (
                                <span className="flex items-center gap-1 text-[10px] text-obsidian-muted">
                                  <Clock size={10} aria-hidden="true" /> Expira: {ak.expires_at}
                                </span>
                              )}
                            </div>
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-cyan-300">
                                {ak.key || ak.key_masked}
                              </span>
                              <CopyButton
                                value={ak.key || ''}
                                label={`API Key (${ak.label})`}
                                className="min-h-[30px] min-w-[30px] shrink-0"
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-obsidian-border bg-obsidian-surface p-4 text-center text-obsidian-muted">
                          No hay llaves API configuradas para esta cuenta.
                        </div>
                      )}
                    </div>

                    {/* ENV Variables */}
                    <div className="space-y-2 pt-2">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
                        Variables de Entorno (KEY=VALUE)
                      </span>

                      {platformData.env_variables && platformData.env_variables.length > 0 ? (
                        platformData.env_variables.map((ev, idx) => (
                          <div
                            key={idx}
                            className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-2.5 sm:flex-nowrap"
                          >
                            <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-amber-300">
                              {ev.key}
                            </span>
                            <div className="flex min-w-0 max-w-full items-center gap-2">
                              <span className="min-w-0 select-all truncate font-mono text-[11px] text-white">
                                {ev.value || ev.value_masked}
                              </span>
                              <CopyButton
                                value={ev.value || ''}
                                label={`Variable ${ev.key}`}
                                className="min-h-[30px] min-w-[30px] shrink-0"
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-obsidian-border bg-obsidian-surface p-4 text-center text-obsidian-muted">
                          Sin variables de entorno guardadas.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SUBSCRIPTION & BILLING TAB */}
            {activeTab === 'subscription' && isPlatform && platformData && (
              <div className="space-y-4 text-xs">
                <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-obsidian-muted">Estado de la Cuenta</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        platformData.subscription_status === 'active'
                          ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                          : platformData.subscription_status === 'free_trial'
                          ? 'border border-amber-500/20 bg-amber-500/10 text-amber-400'
                          : 'bg-obsidian-border text-obsidian-muted'
                      }`}
                    >
                      {platformData.subscription_status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-obsidian-muted">Costo Recurrente</span>
                    <span className="font-mono text-base font-bold text-white">
                      {getCurrencySymbol(platformData.currency)}
                      {Number(platformData.subscription_cost || 0).toLocaleString(systemLocale, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {platformData.currency} / {platformData.billing_cycle}
                    </span>
                  </div>
                </div>

                {platformData.trial_end_date && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300">
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <div>
                      <div className="text-xs font-semibold">Prueba Gratuita</div>
                      <div className="text-[11px] text-amber-200/80">
                        Finaliza el {platformData.trial_end_date}. Se aplicará el cobro automático si no se
                        cancela antes.
                      </div>
                    </div>
                  </div>
                )}

                {platformData.next_billing_date && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                    <span className="text-obsidian-muted">Próxima Fecha de Renovación</span>
                    <span className="font-mono font-medium text-white">{platformData.next_billing_date}</span>
                  </div>
                )}

                {platformData.payment_alias && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
                    <span className="text-obsidian-muted">Método de Pago Vinculado</span>
                    <span className="font-medium text-indigo-300">{platformData.payment_alias}</span>
                  </div>
                )}
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <div className="space-y-3 text-xs">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-obsidian-muted">
                  Historial de Contraseñas Anteriores
                </span>

                {!isUnlocked ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-center text-amber-300">
                    <Lock size={20} className="mx-auto mb-1 text-amber-400" aria-hidden="true" />
                    Ingresa tu contraseña de acceso para ver las contraseñas anteriores.
                  </div>
                ) : historyData.length > 0 ? (
                  historyData.map((h) => (
                    <div
                      key={h.id}
                      className="space-y-1 rounded-xl border border-obsidian-border bg-obsidian-surface p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-obsidian-muted">
                        <span>
                          Motivo: <strong className="text-white">{h.reason}</strong>
                        </span>
                        <span>{new Date(h.created_at).toLocaleString(systemLocale)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="min-w-0 select-all truncate font-mono text-white">
                          {h.password_plain || h.password_masked}
                        </span>
                        <CopyButton
                          value={h.password_plain || ''}
                          label="Contraseña previa"
                          className="min-h-[30px] min-w-[30px] shrink-0"
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-obsidian-border bg-obsidian-surface p-4 text-center text-obsidian-muted">
                    No se han registrado contraseñas anteriores para este elemento.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
