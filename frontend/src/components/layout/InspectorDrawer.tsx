import React, { useState, useEffect } from 'react';
import { 
  X, ExternalLink, ShieldCheck, Key, Code, CreditCard, 
  History, Copy, Check, Lock, Edit3, Trash2, AlertTriangle, 
  Clock, ShieldAlert, Sparkles, Shield, RefreshCw, Rocket,
  MessageCircle, Phone, MapPin, Globe, CheckCircle2, RotateCcw,
  Mail, Share2, Plus, Archive, Timer, DollarSign
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { PlatformAccount, EmailAccount, PaymentMethod, PwnedCheckResponse, Prospect, ProspectStatus, ClientIncome, DomainRenewal } from '../../types';
import { PlatformIcon } from '../common/PlatformIcon';
import { TagBadge } from '../common/TagBadge';
import { SecretField } from '../common/SecretField';
import { CopyButton } from '../common/CopyButton';
import { TotpWidget } from '../common/TotpWidget';
import {
  PROSPECT_STATUS_OPTIONS,
  getStatusMeta,
  getWorkflowMeta,
  getSlaBadgeMeta,
  formatDuration,
  formatSlaHoursLabel,
  computeLiveSla,
  computeLiveFollowUpSla,
  buildWhatsAppUrl,
  buildMailtoUrl,
  buildFollowUpMessage,
  formatRelativeContactTime
} from '../../lib/prospectUtils';
import { INPUT_LIMITS } from '../../lib/validation';

export const InspectorDrawer: React.FC = () => {
  const { 
    selectedEntity, openInspector, closeInspector, isUnlocked, openUnlockModal, 
    copyToClipboard, openPlatformModal, openEmailModal, openProspectModal, showToast, 
    triggerDataReload, dataVersion, exchangeRate 
  } = useVault();

  const [activeTab, setActiveTab] = useState<'general' | 'credentials' | 'api_keys' | 'subscription' | 'history'>('general');
  const [emailData, setEmailData] = useState<EmailAccount | null>(null);
  const [emailProspects, setEmailProspects] = useState<Prospect[]>([]);
  const [platformData, setPlatformData] = useState<PlatformAccount | null>(null);
  const [prospectData, setProspectData] = useState<Prospect | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pwnedResult, setPwnedResult] = useState<PwnedCheckResponse | null>(null);
  const [checkingPwned, setCheckingPwned] = useState(false);
  const [isAddingTotp, setIsAddingTotp] = useState(false);
  const [totpInput, setTotpInput] = useState('');
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [followupWindowHours, setFollowupWindowHours] = useState<24 | 48 | 72>(48);
  const [contactChannel, setContactChannel] = useState<'' | 'whatsapp' | 'email' | 'phone' | 'template'>('');
  const [recordingContact, setRecordingContact] = useState(false);

  // Client financial & domain monitor state
  const [clientIncomes, setClientIncomes] = useState<ClientIncome[]>([]);
  const [clientRenewals, setClientRenewals] = useState<DomainRenewal[]>([]);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [incConcept, setIncConcept] = useState('');
  const [incAmount, setIncAmount] = useState('');
  const [incCurrency, setIncCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [incCategory, setIncCategory] = useState('anticipo');
  const [incStatus, setIncStatus] = useState<'cobrado' | 'pendiente'>('cobrado');
  const [incDate, setIncDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [incRecurring, setIncRecurring] = useState(false);
  const [incLoading, setIncLoading] = useState(false);

  const [showAddDomain, setShowAddDomain] = useState(false);
  const [domName, setDomName] = useState('');
  const [domType, setDomType] = useState('dominio');
  const [domProvider, setDomProvider] = useState('');
  const [domCost, setDomCost] = useState('');
  const [domCharge, setDomCharge] = useState('');
  const [domCurrency, setDomCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [domCycle, setDomCycle] = useState<'yearly' | 'monthly'>('yearly');
  const [domPaidBy, setDomPaidBy] = useState<'me' | 'client'>('client');
  const [domDate, setDomDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });
  const [domLoading, setDomLoading] = useState(false);

  useEffect(() => {
    setContactChannel('');
  }, [selectedEntity?.id]);

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
      setHistoryData([]);
      return;
    }

    setLoading(true);
    if (selectedEntity.type === 'email') {
      api.getEmailDetail(selectedEntity.id)
        .then((res) => {
          setEmailData(res);
          setPlatformData(null);
          setProspectData(null);
        })
        .catch((err) => showToast(err.message, 'error'))
        .finally(() => setLoading(false));

      api.getProspects({ email_id: selectedEntity.id })
        .then(setEmailProspects)
        .catch(() => setEmailProspects([]));

      api.getPasswordHistory(selectedEntity.id)
        .then(setHistoryData)
        .catch(() => {});
    } else if (selectedEntity.type === 'platform') {
      api.getPlatformDetail(selectedEntity.id)
        .then((res) => {
          setPlatformData(res);
          setEmailData(null);
          setProspectData(null);
        })
        .catch((err) => showToast(err.message, 'error'))
        .finally(() => setLoading(false));

      api.getPasswordHistory(selectedEntity.id)
        .then(setHistoryData)
        .catch(() => {});
    } else if (selectedEntity.type === 'prospect') {
      setActiveTab('general');
      api.getProspectDetail(selectedEntity.id)
        .then((res) => {
          setProspectData(res);
          const fh = res.followup_sla_hours;
          if (fh === 24 || fh === 48 || fh === 72) {
            setFollowupWindowHours(fh);
          }
          setEmailData(null);
          setPlatformData(null);

          // Fetch financial history & domain renewals for this client
          api.getIncomes().then((allInc) => {
            const filtered = allInc.filter(
              (i) => i.prospect_id === res.id || i.client_name.toLowerCase() === res.company_name.toLowerCase()
            );
            setClientIncomes(filtered);
          }).catch(() => setClientIncomes([]));

          api.getRenewals().then((allRen) => {
            const filtered = allRen.filter(
              (r) => r.prospect_id === res.id || r.client_name.toLowerCase() === res.company_name.toLowerCase()
            );
            setClientRenewals(filtered);
          }).catch(() => setClientRenewals([]));
        })
        .catch((err) => showToast(err.message, 'error'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [selectedEntity, isUnlocked, dataVersion]);

  const handleCreateIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prospectData) return;
    if (!incConcept.trim()) {
      showToast('El concepto del pago es obligatorio.', 'warning');
      return;
    }
    const amountVal = parseFloat(incAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast('Ingresa un monto válido mayor a 0.', 'warning');
      return;
    }
    setIncLoading(true);
    try {
      const created = await api.createIncome({
        prospect_id: prospectData.id,
        client_name: prospectData.company_name,
        concept: incConcept.trim(),
        category: incCategory,
        amount: amountVal,
        currency: incCurrency,
        status: incStatus,
        received_date: incDate,
        is_recurring: incRecurring,
        scope: prospectData.scope || 'business',
      });
      setClientIncomes((prev) => [created, ...prev]);
      setShowAddIncome(false);
      setIncConcept('');
      setIncAmount('');
      showToast('Pago registrado correctamente para este cliente.', 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al registrar el pago.', 'error');
    } finally {
      setIncLoading(false);
    }
  };

  const handleCreateRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prospectData) return;
    if (!domName.trim()) {
      showToast('El nombre del dominio o servicio es obligatorio.', 'warning');
      return;
    }
    const costVal = parseFloat(domCost) || 0;
    const chargeVal = parseFloat(domCharge) || 0;
    setDomLoading(true);
    try {
      const created = await api.createRenewal({
        prospect_id: prospectData.id,
        client_name: prospectData.company_name,
        domain_or_service: domName.trim(),
        service_type: domType,
        provider: domProvider.trim() || null,
        renewal_cost: costVal,
        client_charge_amount: chargeVal,
        currency: domCurrency,
        billing_cycle: domCycle,
        paid_by: domPaidBy,
        renewal_date: domDate,
        scope: prospectData.scope || 'business',
      });
      setClientRenewals((prev) => [...prev, created]);
      setShowAddDomain(false);
      setDomName('');
      setDomCost('');
      setDomCharge('');
      setDomProvider('');
      showToast('Vencimiento de dominio/hosting asociado con éxito.', 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al asociar vencimiento.', 'error');
    } finally {
      setDomLoading(false);
    }
  };

  const handleAdvanceRenewal = async (renId: string) => {
    try {
      const updated = await api.advanceRenewalCycle(renId);
      setClientRenewals((prev) => prev.map((r) => (r.id === renId ? updated : r)));
      showToast(`Ciclo avanzado (+1 año). Próximo vencimiento: ${updated.renewal_date}`, 'success');
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message || 'Error al renovar ciclo.', 'error');
    }
  };

  if (!selectedEntity) return null;

  const isEmail = selectedEntity.type === 'email';
  const isPlatform = selectedEntity.type === 'platform';
  const isProspect = selectedEntity.type === 'prospect';

  const handleDelete = async () => {
    if (!isProspect && !isUnlocked) {
      openUnlockModal();
      return;
    }
    if (!confirm('¿Enviar este elemento a la papelera?')) return;

    try {
      if (isEmail) {
        await api.deleteEmail(selectedEntity.id);
      } else if (isPlatform) {
        await api.deletePlatform(selectedEntity.id);
      } else if (isProspect) {
        await api.deleteProspect(selectedEntity.id);
      }
      showToast('Elemento enviado a la papelera.', 'info');
      closeInspector();
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleEdit = () => {
    if (isEmail) {
      openEmailModal(selectedEntity.id);
    } else if (isPlatform) {
      openPlatformModal(undefined, selectedEntity.id);
    } else if (isProspect) {
      openProspectModal(undefined, selectedEntity.id);
    }
  };

  const title = isEmail
    ? emailData?.address
    : isProspect
    ? prospectData?.company_name
    : platformData?.name;

  const subtitle = isEmail
    ? `Proveedor: ${emailData?.provider}`
    : isProspect
    ? `Prospecto / Demo • ${prospectData?.contact_name || 'Sin encargado'}`
    : `Usuario: ${platformData?.username || 'N/A'}`;

  const prospectLive = prospectData ? computeLiveSla(prospectData, nowMs) : null;
  const prospectFollowupLive = prospectData ? computeLiveFollowUpSla(prospectData, nowMs) : null;
  const prospectWaUrl = prospectData
    ? buildWhatsAppUrl(prospectData.whatsapp, prospectData.company_name, prospectData.demo_url)
    : null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-obsidian-panel border-l border-obsidian-border shadow-2xl flex flex-col animate-slideLeft">
      {/* Top Header */}
      <div className="p-4 border-b border-obsidian-border flex items-center justify-between gap-2 bg-obsidian-card">
        <div className="flex items-center gap-3 min-w-0">
          <PlatformIcon
            name={title || 'Item'}
            iconUrl={isPlatform ? platformData?.icon_url : undefined}
            size="md"
          />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white tracking-tight truncate">{title || 'Cargando...'}</h2>
            <p className="text-[11px] text-obsidian-muted truncate">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleEdit}
            title="Editar datos"
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
          >
            <Edit3 size={15} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            title="Enviar a papelera"
            className="p-1.5 text-obsidian-muted hover:text-rose-400 rounded-lg hover:bg-obsidian-surface transition-colors"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            onClick={closeInspector}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-4 border-b border-obsidian-border bg-obsidian-surface/40 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'general' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-obsidian-muted hover:text-white'
          }`}
        >
          {isProspect ? 'Ficha y Seguimiento' : 'General'}
        </button>
        {!isProspect && (
          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'credentials' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-obsidian-muted hover:text-white'
            }`}
          >
            <Key size={13} />
            <span>Contraseñas</span>
            {!isUnlocked && <Lock size={11} className="text-amber-400" />}
          </button>
        )}
        {isPlatform && (
          <button
            type="button"
            onClick={() => setActiveTab('api_keys')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'api_keys' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-obsidian-muted hover:text-white'
            }`}
          >
            <Code size={13} />
            <span>Llaves API</span>
            {!isUnlocked && <Lock size={11} className="text-amber-400" />}
          </button>
        )}
        {isPlatform && (
          <button
            type="button"
            onClick={() => setActiveTab('subscription')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'subscription' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-obsidian-muted hover:text-white'
            }`}
          >
            <CreditCard size={13} />
            <span>Suscripción</span>
          </button>
        )}
        {!isProspect && (
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'history' ? 'border-indigo-500 text-white font-semibold' : 'border-transparent text-obsidian-muted hover:text-white'
            }`}
          >
            <History size={13} />
            <span>Historial</span>
          </button>
        )}
      </div>

      {/* Content Area */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto break-words p-3 space-y-5 sm:p-5 [overflow-wrap:anywhere]">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-obsidian-muted text-xs">
            <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-2" />
            Cargando detalles...
          </div>
        ) : (
          <>
            {/* GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-4 text-xs">
                {isEmail && emailData && (
                  <>
                    <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                      <div className="text-obsidian-muted">Dirección Principal</div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm text-white font-medium select-all break-all">{emailData.address}</span>
                        <CopyButton value={emailData.address} label="Correo" />
                      </div>
                    </div>

                    {emailData.inbox_url && (
                      <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-obsidian-surface border border-obsidian-border">
                        <span className="text-obsidian-muted">Bandeja de Entrada</span>
                        <a
                          href={emailData.inbox_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          <span>Abrir Webmail</span>
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    )}

                    {emailData.aliases && emailData.aliases.length > 0 && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                        <span className="text-obsidian-muted block">Alias / Sub-direcciones vinculadas</span>
                        <div className="space-y-1">
                          {emailData.aliases.map((al, idx) => (
                            <div key={idx} className="flex items-center justify-between gap-2 text-obsidian-text font-mono text-[11px] p-1.5 rounded bg-obsidian-bg">
                              <span className="truncate">{al}</span>
                              <CopyButton value={al} label="Alias" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                      <span className="text-obsidian-muted block">Cuentas y Servicios Asociados</span>
                      <span className="font-semibold text-white text-sm">{emailData.platform_count} servicios dependen de este correo</span>
                    </div>

                    {/* Correlated Prospects / Demos for this Email */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-obsidian-muted font-medium flex items-center gap-1.5">
                          <Rocket size={13} className="text-indigo-400" />
                          <span>Prospectos y Demos Vinculados ({emailProspects.length})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => openProspectModal(emailData.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold"
                        >
                          <Plus size={11} />
                          <span>Nuevo Prospecto</span>
                        </button>
                      </div>

                      {emailProspects.length > 0 ? (
                        <div className="space-y-1.5">
                          {emailProspects.map((pr) => {
                            const prStatus = getStatusMeta(pr.status);
                            const prSla = getSlaBadgeMeta(pr.sla_status);
                            return (
                              <div
                                key={pr.id}
                                onClick={() => openInspector('prospect', pr.id)}
                                className="p-2.5 rounded-lg bg-obsidian-bg hover:bg-obsidian-card border border-obsidian-border flex items-center justify-between gap-2 cursor-pointer transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="font-semibold text-white text-xs truncate">{pr.company_name}</div>
                                  <div className="text-[10px] text-obsidian-muted font-mono truncate">
                                    {pr.demo_url ? pr.demo_url.replace(/^https?:\/\//, '') : prStatus.label}
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${prSla.badgeClass}`}>
                                  {prSla.shortLabel}
                                </span>
                              </div>
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
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                        <span className="text-obsidian-muted block">Notas</span>
                        <p className="text-obsidian-text leading-relaxed whitespace-pre-wrap break-words">{emailData.notes}</p>
                      </div>
                    )}
                  </>
                )}

                {isProspect && prospectData && prospectLive && prospectFollowupLive && (
                  <>
                    {/* Flow, Status & Commercial Value control */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-obsidian-muted">Modalidad del Flujo</span>
                        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold border ${getWorkflowMeta(prospectData.workflow_type).badgeClass}`}>
                          {getWorkflowMeta(prospectData.workflow_type).label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-obsidian-muted">Estado del Prospecto</span>
                        <select
                          value={prospectData.status}
                          onChange={async (e) => {
                            const newSt = e.target.value as ProspectStatus;
                            try {
                              const updated = await api.updateProspect(prospectData.id, { status: newSt });
                              setProspectData(updated);
                              showToast(`Estado actualizado a "${getStatusMeta(newSt).label}".`, 'success');
                              triggerDataReload();
                            } catch (err: any) {
                              showToast(err.message, 'error');
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase border cursor-pointer focus:outline-none ${getStatusMeta(prospectData.status).badgeClass}`}
                        >
                          {PROSPECT_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-obsidian-panel text-white">
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(prospectData.estimated_value || 0) > 0 && (
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-obsidian-border/60">
                          <span className="text-obsidian-muted flex items-center gap-1">
                            <DollarSign size={12} className="text-emerald-400" />
                            <span>Valor Comercial Estimado</span>
                          </span>
                          <span className="font-mono font-bold text-emerald-300 text-xs">
                            ${Number(prospectData.estimated_value).toLocaleString()} {prospectData.currency || 'MXN'}{' '}
                            <span className="text-[10px] text-obsidian-muted font-sans font-normal">
                              ({prospectData.billing_type === 'monthly_retainer' ? 'Iguala Mensual' : 'Pago Único'})
                            </span>
                          </span>
                        </div>
                      )}

                      {prospectData.status === 'archivado_frio' && (
                        <div className="pt-2 border-t border-obsidian-border/60 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-300 flex items-center gap-1.5">
                            <Archive size={13} className="text-slate-400" />
                            <span>Archivado por límite de intentos</span>
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await api.reactivateProspect(prospectData.id, followupWindowHours);
                                  setProspectData(updated);
                                  showToast(`Prospecto reactivado (+${followupWindowHours}h).`, 'success');
                                  triggerDataReload();
                                } catch (err: any) {
                                  showToast(err.message, 'error');
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 text-[10px] font-semibold"
                            >
                              <RefreshCw size={11} />
                              <span>Reactivar prospecto</span>
                            </button>
                            {prospectData.demo_url && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!window.confirm('¿Liberar/reciclar la URL Demo para usarla con otro prospecto?')) return;
                                  try {
                                    const updated = await api.recycleProspectDemo(prospectData.id);
                                    setProspectData(updated);
                                    showToast('URL Demo liberada y archivada en notas.', 'info');
                                    triggerDataReload();
                                  } catch (err: any) {
                                    showToast(err.message, 'error');
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 text-[10px] font-semibold"
                              >
                                <RotateCcw size={11} />
                                <span>Liberar/Reciclar Demo</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* BLOQUE 1: Correlación de Emails */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2.5">
                      <span className="text-white font-semibold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                        <Mail size={12} className="text-indigo-400" />
                        <span>1. Correos Relacionados</span>
                      </span>

                      <div className="p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-obsidian-muted block">Mi Correo Principal Vinculado</span>
                          <span className="font-mono text-cyan-300 font-medium truncate block">
                            {prospectData.specific_alias || prospectData.email_address || 'Sin correo vinculado'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {(prospectData.specific_alias || prospectData.email_address) && (
                            <CopyButton value={prospectData.specific_alias || prospectData.email_address || ''} label="Mi correo" />
                          )}
                          {prospectData.email_id && (
                            <button
                              type="button"
                              onClick={() => openInspector('email', prospectData.email_id!)}
                              className="px-2.5 py-1 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-indigo-300 border border-obsidian-border text-[11px] font-medium"
                            >
                              Ver Correo
                            </button>
                          )}
                        </div>
                      </div>

                      {prospectData.contact_email && (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border">
                          <div className="min-w-0">
                            <span className="text-[10px] text-obsidian-muted block">Correo del Cliente / Prospecto</span>
                            <span className="font-mono text-white truncate block">{prospectData.contact_email}</span>
                          </div>
                          <CopyButton value={prospectData.contact_email} label="Correo del cliente" />
                        </div>
                      )}
                    </div>

                    {/* BLOQUE 2: Datos del Prospecto y Página Demo */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2.5">
                      <span className="text-white font-semibold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                        <Globe size={12} className="text-cyan-400" />
                        <span>2. Datos del Prospecto y Página Demo</span>
                      </span>

                      {prospectData.demo_url ? (
                        <div className="p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border space-y-1.5">
                          <span className="text-[10px] text-obsidian-muted block">URL de la Página Demo Creada</span>
                          <div className="flex items-center justify-between gap-2">
                            <a
                              href={prospectData.demo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-indigo-400 hover:text-indigo-300 truncate underline"
                            >
                              {prospectData.demo_url}
                            </a>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <CopyButton value={prospectData.demo_url} label="URL Demo" />
                              <a
                                href={prospectData.demo_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold"
                              >
                                <span>Abrir</span>
                                <ExternalLink size={11} />
                              </a>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-obsidian-muted italic">
                          Sin URL de página demo asignada.
                        </div>
                      )}

                      {prospectData.whatsapp && prospectWaUrl && (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <MessageCircle size={14} className="text-emerald-400 flex-shrink-0" />
                            <span className="font-mono text-white truncate">{prospectData.whatsapp}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <CopyButton value={prospectData.whatsapp} label="WhatsApp" />
                            <a
                              href={prospectWaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold"
                            >
                              <span>Abrir Chat</span>
                              <ExternalLink size={11} />
                            </a>
                          </div>
                        </div>
                      )}

                      {prospectData.phones && (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <Phone size={14} className="text-cyan-400 flex-shrink-0" />
                            <span className="font-mono text-white truncate">{prospectData.phones}</span>
                          </div>
                          <CopyButton value={prospectData.phones} label="Teléfono" />
                        </div>
                      )}

                      {prospectData.maps_url && (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <MapPin size={14} className="text-amber-400 flex-shrink-0" />
                            <span className="text-obsidian-text truncate">Ubicación en Google Maps</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <CopyButton value={prospectData.maps_url} label="Enlace Google Maps" />
                            <a
                              href={prospectData.maps_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold"
                            >
                              <span>Abrir Mapa</span>
                              <ExternalLink size={11} />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Acciones Rápidas de Seguimiento y Contacto Directo */}
                    <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/25 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-indigo-300 font-semibold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                          <MessageCircle size={12} className="text-indigo-400" />
                          <span>Acciones Rápidas de Seguimiento</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-[10px]">
                            {([24, 48, 72] as const).map((hrs) => (
                              <button
                                key={hrs}
                                type="button"
                                onClick={() => setFollowupWindowHours(hrs)}
                                className={`px-1.5 py-0.5 rounded font-mono transition-colors ${
                                  followupWindowHours === hrs
                                    ? 'bg-indigo-600 text-white font-semibold'
                                    : 'text-obsidian-muted hover:text-white'
                                }`}
                              >
                                +{hrs}h
                              </button>
                            ))}
                          </div>
                          <span className="text-[10px] font-mono text-obsidian-muted">
                            Int: <strong className="text-white">{prospectData.followup_count || 0}/{prospectData.max_followup_attempts || 3}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {prospectWaUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              window.open(prospectWaUrl, '_blank', 'noopener,noreferrer');
                              setContactChannel('whatsapp');
                              showToast('Mensaje preparado. Registra el contacto después de enviarlo.', 'info');
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition-all"
                          >
                            <MessageCircle size={13} />
                            <span>WhatsApp</span>
                          </button>
                        )}

                        {prospectData.contact_email && (
                          <button
                            type="button"
                            onClick={() => {
                              const mailUrl = buildMailtoUrl(prospectData);
                              if (mailUrl) window.location.href = mailUrl;
                              setContactChannel('email');
                              showToast('Correo preparado. Registra el contacto después de enviarlo.', 'info');
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-semibold transition-all"
                          >
                            <Mail size={13} />
                            <span>Enviar Correo</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={async () => {
                            const msg = buildFollowUpMessage(prospectData);
                            await copyToClipboard(msg, 'Plantilla de seguimiento');
                            setContactChannel('template');
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition-all"
                        >
                          <Copy size={13} />
                          <span>Copiar Plantilla</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-obsidian-muted">Canal del contacto
                          <select value={contactChannel} onChange={(event) => setContactChannel(event.target.value as typeof contactChannel)}
                            className="block mt-1 rounded-lg border border-obsidian-border bg-obsidian-bg px-2 py-1.5 text-white">
                            <option value="">Selecciona un canal</option>
                            <option value="whatsapp">WhatsApp</option><option value="email">Correo</option>
                            <option value="phone">Llamada</option><option value="template">Otro mensaje</option>
                          </select>
                        </label>
                        <button type="button" disabled={recordingContact || !contactChannel} onClick={async () => {
                          if (!contactChannel) return;
                          setRecordingContact(true);
                          try {
                            const updated = await api.recordProspectContactAttempt(prospectData.id, contactChannel, followupWindowHours);
                            setProspectData(updated);
                            triggerDataReload();
                            showToast('Contacto registrado.', 'success');
                          } catch (err: any) {
                            showToast(err.message || 'No se pudo registrar el contacto.', 'error');
                          } finally {
                            setRecordingContact(false);
                          }
                        }} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                          {recordingContact ? 'Registrando...' : 'Registrar contacto'}
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-obsidian-muted pt-1 border-t border-indigo-500/15">
                        <span>Último intento: <strong className="text-slate-300">{formatRelativeContactTime(prospectData.last_contacted_at, nowMs)}</strong></span>
                        {prospectData.last_contact_channel && (
                          <span className="uppercase font-mono text-indigo-300">{prospectData.last_contact_channel}</span>
                        )}
                      </div>
                    </div>

                    {/* BLOQUE 3: Doble Cronómetro (Tiempo Total Transcurrido + Seguimiento Actual) */}
                    <div className="p-4 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-3">
                      <span className="text-white font-semibold uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                        <Clock size={12} className="text-amber-400" />
                        <span>3. Tiempo de Respuesta y Seguimiento</span>
                      </span>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getSlaBadgeMeta(prospectLive.slaStatus).badgeClass}`}>
                          <span className={`w-2 h-2 rounded-full ${getSlaBadgeMeta(prospectLive.slaStatus).dotClass}`} />
                          <span>{getSlaBadgeMeta(prospectLive.slaStatus).label}</span>
                        </span>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {!prospectLive.isResponded && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const updated = await api.markProspectResponded(prospectData.id);
                                  setProspectData(updated);
                                  const formatted = formatDuration(updated.response_time_seconds || updated.elapsed_seconds, false);
                                  showToast(
                                    updated.met_sla
                                      ? `Cliente respondió en ${formatted}. Respondido a tiempo.`
                                      : `Cliente marcado como respondido (${formatted}).`,
                                    updated.met_sla ? 'success' : 'warning'
                                  );
                                  triggerDataReload();
                                } catch (err: any) {
                                  showToast(err.message, 'error');
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 text-xs font-semibold transition-all"
                            >
                              <CheckCircle2 size={14} className="text-emerald-400" />
                              <span>Ya respondió</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const updated = await api.resetProspectTimer(prospectData.id, true);
                                setProspectData(updated);
                                showToast('Contador reiniciado desde ahora.', 'info');
                                triggerDataReload();
                              } catch (err: any) {
                                showToast(err.message, 'error');
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-obsidian-bg hover:bg-obsidian-border text-obsidian-muted hover:text-white border border-obsidian-border text-[11px]"
                          >
                            <RotateCcw size={12} />
                            <span>Reiniciar</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] text-obsidian-muted uppercase tracking-wider">
                            {prospectLive.isResponded ? 'Tiempo Total de Respuesta' : 'Tiempo Total Transcurrido (Original)'}
                          </div>
                          <div className="font-mono text-lg font-bold text-white mt-0.5">
                            {formatDuration(prospectLive.elapsedSeconds, true)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-obsidian-muted uppercase tracking-wider">
                            Límite Original
                          </div>
                          <div className="font-mono text-xs font-semibold text-indigo-300 mt-0.5">
                            {formatSlaHoursLabel(prospectData.sla_hours)}
                          </div>
                        </div>
                      </div>

                      <div className="w-full h-2 rounded-full bg-obsidian-bg overflow-hidden">
                        <div
                          className={`h-full transition-all duration-500 ${getSlaBadgeMeta(prospectLive.slaStatus).barClass}`}
                          style={{ width: `${prospectLive.progressPercent}%` }}
                        />
                      </div>

                      {/* Secondary Follow-up SLA Readout */}
                      {prospectFollowupLive.active && !prospectLive.isResponded && (
                        <div className="p-3 rounded-xl bg-obsidian-bg border border-indigo-500/30 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-indigo-300 uppercase tracking-wider font-semibold flex items-center gap-1">
                              <Timer size={12} />
                              <span>Plazo de Espera Actual (+{prospectData.followup_sla_hours || 48}h)</span>
                            </span>
                            <span className={`text-[10px] font-mono font-semibold ${
                              prospectFollowupLive.status === 'vencido' ? 'text-rose-400' : 'text-indigo-300'
                            }`}>
                              {prospectFollowupLive.status === 'vencido'
                                ? `Vencido por ${formatDuration(prospectFollowupLive.overdueSeconds, false)}`
                                : `Vence en ${formatDuration(prospectFollowupLive.remainingSeconds, false)}`}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-obsidian-surface overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                prospectFollowupLive.status === 'vencido' ? 'bg-rose-500' : 'bg-indigo-500'
                              }`}
                              style={{ width: `${prospectFollowupLive.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-1 text-[11px] text-obsidian-muted font-mono">
                        {prospectData.started_at && (
                          <div>Inicio original: {new Date(prospectData.started_at).toLocaleString()}</div>
                        )}
                        {prospectData.last_contacted_at && (
                          <div className="text-indigo-300">
                            Último seguimiento: {new Date(prospectData.last_contacted_at).toLocaleString()}
                          </div>
                        )}
                        {prospectData.responded_at && (
                          <div className="text-emerald-300">
                            Respondido: {new Date(prospectData.responded_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Social Links & Notes */}
                    {prospectData.social_links && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                        <span className="text-obsidian-muted block">Redes Sociales / Web Actual</span>
                        <p className="text-obsidian-text whitespace-pre-wrap break-words">{prospectData.social_links}</p>
                      </div>
                    )}

                    {prospectData.notes && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                        <span className="text-obsidian-muted block">Notas Adicionales</span>
                        <p className="text-obsidian-text leading-relaxed whitespace-pre-wrap break-words">{prospectData.notes}</p>
                      </div>
                    )}

                    {/* HISTORIAL FINANCIERO / PAGOS DE ESTE CLIENTE */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <DollarSign size={14} className="text-emerald-400" />
                          <span className="font-semibold text-white text-xs">Pagos Realizados por este Cliente</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAddIncome(!showAddIncome)}
                          className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Plus size={12} />
                          <span>{showAddIncome ? 'Cerrar' : '+ Registrar Pago'}</span>
                        </button>
                      </div>

                      {/* Summary Metrics */}
                      {(() => {
                        const totalInMXN = (status: 'cobrado' | 'pendiente') => {
                          const incomes = clientIncomes.filter((i) => i.status === status);
                          const rate = exchangeRate?.rate;
                          if (incomes.some((i) => i.currency === 'USD') && (!rate || rate <= 0)) return null;
                          return incomes.reduce((acc, i) => acc + (i.currency === 'USD' ? i.amount * (rate || 0) : i.amount), 0);
                        };
                        const totalCobradoMXN = totalInMXN('cobrado');
                        const totalPendienteMXN = totalInMXN('pendiente');
                        const formatTotal = (total: number | null) => total === null
                          ? 'Sin tipo de cambio'
                          : `$${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

                        return (
                          <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="p-2 rounded-lg bg-obsidian-bg border border-obsidian-border">
                              <span className="text-[10px] text-obsidian-muted block">Total Cobrado</span>
                              <span className="text-xs font-mono font-bold text-emerald-400">{formatTotal(totalCobradoMXN)}</span>
                            </div>
                            <div className="p-2 rounded-lg bg-obsidian-bg border border-obsidian-border">
                              <span className="text-[10px] text-obsidian-muted block">Total Pendiente</span>
                              <span className="text-xs font-mono font-bold text-amber-400">{formatTotal(totalPendienteMXN)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Quick Add Income Form */}
                      {showAddIncome && (
                        <form onSubmit={handleCreateIncome} className="p-2.5 rounded-lg bg-obsidian-bg border border-emerald-500/40 space-y-2">
                          <span className="text-[11px] font-semibold text-white block">Nuevo Pago Recibido:</span>
                          <input
                            type="text"
                            required
                            maxLength={180}
                            value={incConcept}
                            onChange={(e) => setIncConcept(e.target.value)}
                            placeholder="Concepto (ej. Anticipo 50% Página Web)"
                            className="w-full px-2.5 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs focus:outline-none focus:border-emerald-500"
                          />
                          <div className="grid grid-cols-3 gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={INPUT_LIMITS.COST_AMOUNT}
                              required
                              value={incAmount}
                              onChange={(e) => setIncAmount(e.target.value)}
                              placeholder="Monto"
                              className="px-2.5 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                            />
                            <select
                              value={incCurrency}
                              onChange={(e) => setIncCurrency(e.target.value as any)}
                              className="px-2 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs"
                            >
                              <option value="MXN">MXN</option>
                              <option value="USD">USD</option>
                            </select>
                            <select
                              value={incStatus}
                              onChange={(e) => setIncStatus(e.target.value as any)}
                              className="px-2 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs"
                            >
                              <option value="cobrado">Cobrado</option>
                              <option value="pendiente">Pendiente</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={incCategory}
                              onChange={(e) => setIncCategory(e.target.value)}
                              className="px-2 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs"
                            >
                              <option value="anticipo">Anticipo</option>
                              <option value="liquidacion">Liquidación</option>
                              <option value="iguala_mensual">Iguala Mensual</option>
                              <option value="renovacion_dominio_hosting">Renovación Dominio/Hosting</option>
                              <option value="otro">Otro</option>
                            </select>
                            <input
                              type="date"
                              value={incDate}
                              onChange={(e) => setIncDate(e.target.value)}
                              className="px-2 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs font-mono"
                            />
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <label className="inline-flex items-center gap-1.5 text-[11px] text-obsidian-muted">
                              <input
                                type="checkbox"
                                checked={incRecurring}
                                onChange={(e) => setIncRecurring(e.target.checked)}
                              />
                              <span>Es cobro recurrente (Iguala)</span>
                            </label>
                            <button
                              type="submit"
                              disabled={incLoading}
                              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                            >
                              {incLoading ? 'Guardando...' : 'Guardar Pago'}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Incomes List */}
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {clientIncomes.length === 0 ? (
                          <div className="text-center py-3 text-obsidian-muted text-[11px] italic">
                            Sin pagos registrados para este cliente.
                          </div>
                        ) : (
                          clientIncomes.map((inc) => (
                            <div
                              key={inc.id}
                              className="p-2 rounded-lg bg-obsidian-bg border border-obsidian-border flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-white text-xs block truncate">{inc.concept}</span>
                                <span className="text-[10px] text-obsidian-muted font-mono">{inc.received_date} • {inc.category}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className={`text-xs font-mono font-bold block ${inc.status === 'cobrado' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  ${inc.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {inc.currency}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                  inc.status === 'cobrado' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                                }`}>
                                  {inc.status === 'cobrado' ? 'Cobrado' : 'Pendiente'}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* DOMINIOS Y HOSTING ASOCIADOS */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Globe size={14} className="text-indigo-400" />
                          <span className="font-semibold text-white text-xs">Dominios y Hosting Asociados</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAddDomain(!showAddDomain)}
                          className="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Plus size={12} />
                          <span>{showAddDomain ? 'Cerrar' : '+ Asociar'}</span>
                        </button>
                      </div>

                      {/* Quick Add Domain Form */}
                      {showAddDomain && (
                        <form onSubmit={handleCreateRenewal} className="p-2.5 rounded-lg bg-obsidian-bg border border-indigo-500/40 space-y-2">
                          <span className="text-[11px] font-semibold text-white block">Asociar Dominio o Hosting:</span>
                          <input
                            type="text"
                            required
                            maxLength={255}
                            value={domName}
                            onChange={(e) => setDomName(e.target.value)}
                            placeholder="Dominio o Servicio (ej. www.cliente.com)"
                            className="w-full px-2.5 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <select
                              value={domType}
                              onChange={(e) => setDomType(e.target.value)}
                              className="px-2 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs"
                            >
                              <option value="dominio">Dominio</option>
                              <option value="hosting">Hosting</option>
                              <option value="dominio_y_hosting">Dominio + Hosting</option>
                              <option value="ssl_otro">SSL / Otro</option>
                            </select>
                            <input
                              type="text"
                              maxLength={128}
                              value={domProvider}
                              onChange={(e) => setDomProvider(e.target.value)}
                              placeholder="Proveedor (ej. Namecheap)"
                              className="px-2.5 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={INPUT_LIMITS.COST_AMOUNT}
                              value={domCost}
                              onChange={(e) => setDomCost(e.target.value)}
                              placeholder="Costo base"
                              className="px-2.5 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs font-mono"
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={INPUT_LIMITS.COST_AMOUNT}
                              value={domCharge}
                              onChange={(e) => setDomCharge(e.target.value)}
                              placeholder="Cobro cliente"
                              className="px-2.5 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs font-mono"
                            />
                            <select
                              value={domPaidBy}
                              onChange={(e) => setDomPaidBy(e.target.value as any)}
                              className="px-2 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs"
                            >
                              <option value="client">Por cuenta del cliente</option>
                              <option value="me">Por mi cuenta</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              type="date"
                              value={domDate}
                              onChange={(e) => setDomDate(e.target.value)}
                              className="px-2 py-1.5 rounded bg-obsidian-surface border border-obsidian-border text-white text-xs font-mono"
                            />
                            <button
                              type="submit"
                              disabled={domLoading}
                              className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                            >
                              {domLoading ? 'Guardando...' : 'Asociar Vencimiento'}
                            </button>
                          </div>
                        </form>
                      )}

                      {/* Domain Renewals List */}
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {clientRenewals.length === 0 ? (
                          <div className="text-center py-3 text-obsidian-muted text-[11px] italic">
                            Sin dominios ni hosting asociados a este cliente.
                          </div>
                        ) : (
                          clientRenewals.map((ren) => (
                            <div
                              key={ren.id}
                              className="p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-white text-xs block truncate">{ren.domain_or_service}</span>
                                <span className="text-[10px] text-obsidian-muted block truncate">
                                  {ren.service_type} • Vence: <span className="font-mono text-white">{ren.renewal_date}</span>
                                </span>
                                <span className="text-[9px] text-obsidian-muted">
                                  {ren.paid_by === 'me' ? 'Por mi cuenta' : 'Por cuenta del cliente'} • Costo: ${ren.renewal_cost} {ren.currency}
                                </span>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                                  ren.days_remaining < 0 || ren.expiry_semaphore === 'vencido'
                                    ? 'bg-rose-500/20 text-rose-300'
                                    : ren.days_remaining <= 7 || ren.expiry_semaphore === 'urgente'
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}>
                                  {ren.days_remaining < 0
                                    ? `Vencido (${Math.abs(ren.days_remaining)}d)`
                                    : `${ren.days_remaining} días restantes`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAdvanceRenewal(ren.id)}
                                  className="px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold"
                                  title="Avanzar 1 ciclo de renovación"
                                >
                                  +1 ciclo
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Tags */}
                    <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                      <span className="text-obsidian-muted block">Etiquetas</span>
                      <div className="flex flex-wrap gap-1.5">
                        {prospectData.tags && prospectData.tags.length > 0 ? (
                          prospectData.tags.map((t, idx) => <TagBadge key={idx} name={t.name} color={t.color} />)
                        ) : (
                          <span className="text-obsidian-muted italic">Sin etiquetas</span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {isPlatform && platformData && (
                  <>
                    <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                      <div className="text-obsidian-muted">Usuario o Correo de Acceso</div>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span
                          className="font-mono text-sm text-white font-medium select-all truncate"
                          title={platformData.username || platformData.specific_alias || platformData.email_address}
                        >
                          {platformData.username || platformData.specific_alias || platformData.email_address}
                        </span>
                        <CopyButton 
                          value={platformData.username || platformData.specific_alias || platformData.email_address || ''} 
                          label="Usuario" 
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-obsidian-border/50 text-[11px] text-obsidian-muted min-w-0">
                        <span className="truncate" title={platformData.email_address}>
                          Correo principal: <span className="text-indigo-300 font-mono">{platformData.email_address}</span>
                        </span>
                        {platformData.email_id && (
                          <button
                            type="button"
                            onClick={() => platformData.email_id && openInspector('email', platformData.email_id)}
                            className="px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 text-[10px] font-semibold shrink-0"
                          >
                            Abrir Correo
                          </button>
                        )}
                      </div>
                    </div>

                    {platformData.login_url && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-obsidian-surface border border-obsidian-border">
                        <span className="text-obsidian-muted">Enlace de Acceso</span>
                        <a
                          href={platformData.login_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium truncate max-w-[200px]"
                        >
                          <span className="truncate">{platformData.login_url}</span>
                          <ExternalLink size={13} className="flex-shrink-0" />
                        </a>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                      <span className="text-obsidian-muted block">Etiquetas</span>
                      <div className="flex flex-wrap gap-1.5">
                        {platformData.tags && platformData.tags.length > 0 ? (
                          platformData.tags.map((t, idx) => (
                            <TagBadge key={idx} name={t.name} color={t.color} />
                          ))
                        ) : (
                          <span className="text-obsidian-muted italic">Sin etiquetas</span>
                        )}
                      </div>
                    </div>

                    {platformData.notes && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                        <span className="text-obsidian-muted block">Notas</span>
                        <p className="text-obsidian-text leading-relaxed whitespace-pre-wrap">{platformData.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* CREDENTIALS TAB */}
            {activeTab === 'credentials' && (
              <div className="space-y-4 text-xs">
                {!isUnlocked ? (
                  <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center space-y-3">
                    <Lock size={28} className="mx-auto text-amber-400" />
                    <h3 className="font-semibold text-white">Contraseñas Protegidas</h3>
                    <button
                      type="button"
                      onClick={openUnlockModal}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md"
                    >
                      <Key size={14} />
                      <span>Ingresar contraseña de acceso</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Password display */}
                    <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                      <div className="flex items-center justify-between text-obsidian-muted">
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
                      <div className="pt-2 border-t border-obsidian-border/50 flex flex-col gap-2">
                        {pwnedResult ? (
                          <div className={`p-2.5 rounded-lg text-[11px] font-mono border flex items-center justify-between gap-2 ${
                            pwnedResult.is_pwned
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          }`}>
                            <div className="flex items-center gap-1.5">
                              {pwnedResult.is_pwned ? <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                              <span>{pwnedResult.message}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPwnedResult(null)}
                              className="text-white/40 hover:text-white"
                            >
                              &times;
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
                                const res = await api.checkPasswordPwned(pw || undefined, !isEmail ? platformData?.id : undefined);
                                setPwnedResult(res);
                              } catch (err: any) {
                                showToast(err.message, 'error');
                              } finally {
                                setCheckingPwned(false);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/50 hover:text-indigo-300 transition-colors"
                          >
                            <Shield className={`w-3.5 h-3.5 text-indigo-400 ${checkingPwned ? 'animate-spin' : ''}`} />
                            <span>{checkingPwned ? 'Revisando filtraciones...' : 'Revisar si esta contraseña ha sido filtrada'}</span>
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
                                  if (!confirm('¿Eliminar el código de verificación de esta cuenta?')) return;
                                  try {
                                    await api.deletePlatformTotp(platformData.id);
                                    showToast('Código de verificación eliminado', 'info');
                                    triggerDataReload();
                                  } catch (e: any) {
                                    showToast(e.message, 'error');
                                  }
                                }}
                                className="text-[10px] text-rose-400/80 hover:text-rose-300"
                              >
                                Desactivar TOTP
                              </button>
                            </div>
                          </div>
                        ) : (
                          isAddingTotp ? (
                            <div className="p-3 rounded-xl bg-obsidian-surface border border-indigo-500/30 space-y-2">
                              <span className="text-white font-semibold text-xs block">Vincular Secreto TOTP (Base32)</span>
                              <input
                                type="text"
                                maxLength={INPUT_LIMITS.TOTP_SECRET}
                                placeholder="ej: JBSWY3DPEHPK3PXP..."
                                value={totpInput}
                                onChange={(e) => setTotpInput(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-xs text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                              />
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setIsAddingTotp(false)}
                                  className="px-2.5 py-1 text-xs text-white/50 hover:text-white"
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
                                      showToast(e.message, 'error');
                                    }
                                  }}
                                  className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                                >
                                  Guardar TOTP
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setIsAddingTotp(true)}
                              className="w-full py-2.5 px-3 rounded-xl bg-obsidian-surface/60 hover:bg-obsidian-surface border border-obsidian-border hover:border-indigo-500/30 text-xs font-medium text-white/60 hover:text-indigo-300 transition-all flex items-center justify-center gap-2"
                            >
                              <ShieldCheck className="w-4 h-4 text-indigo-400" />
                              <span>Activar código de verificación</span>
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {/* PIN if platform */}
                    {!isEmail && platformData?.pin_plain && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1.5">
                        <span className="text-obsidian-muted block">PIN de Perfil / Acceso (ej. Netflix)</span>
                        <SecretField value={platformData.pin_plain} masked="••••" label="PIN" />
                      </div>
                    )}

                    {/* 2FA Method for emails */}
                    {isEmail && emailData && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-obsidian-muted">Verificación en 2 Pasos</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {emailData.two_factor_method}
                          </span>
                        </div>
                        {emailData.recovery_phone && (
                          <div className="text-[11px] text-obsidian-muted">
                            Teléfono de recuperación: <span className="text-white font-mono">{emailData.recovery_phone}</span>
                          </div>
                        )}
                        {emailData.recovery_email_address && (
                          <div className="text-[11px] text-obsidian-muted">
                            Correo de respaldo: <span className="text-cyan-300 font-mono">{emailData.recovery_email_address}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Backup codes */}
                    {isEmail && emailData?.backup_codes && emailData.backup_codes.length > 0 && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                        <span className="text-obsidian-muted block">Códigos de Respaldo</span>
                        <div className="space-y-1.5">
                          {emailData.backup_codes.map((bc, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded bg-obsidian-bg border border-obsidian-border text-xs">
                              <span className={`font-mono ${bc.is_used ? 'line-through text-obsidian-muted' : 'text-emerald-400 font-semibold'}`}>
                                {bc.code}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] ${bc.is_used ? 'text-rose-400' : 'text-emerald-400'}`}>
                                  {bc.is_used ? 'Usado' : 'Disponible'}
                                </span>
                                <CopyButton value={bc.code} label="Código de respaldo" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Security Questions */}
                    {isEmail && emailData?.security_questions && emailData.security_questions.length > 0 && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                        <span className="text-obsidian-muted block">Preguntas de Seguridad</span>
                        <div className="space-y-2">
                          {emailData.security_questions.map((sq, idx) => (
                            <div key={idx} className="p-2 rounded bg-obsidian-bg border border-obsidian-border space-y-1">
                              <div className="text-obsidian-muted text-[11px]">{sq.question}</div>
                              <div className="flex items-center justify-between text-white font-mono text-xs">
                                <span>{sq.answer}</span>
                                <CopyButton value={sq.answer} label="Respuesta de seguridad" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* API KEYS & VARIABLES TAB */}
            {activeTab === 'api_keys' && !isEmail && platformData && (
              <div className="space-y-4 text-xs">
                {!isUnlocked ? (
                  <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-center space-y-2">
                    <Lock size={24} className="mx-auto text-amber-400" />
                    <h3 className="font-semibold text-white">Llaves Protegidas</h3>
                    <button
                      type="button"
                      onClick={openUnlockModal}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium text-xs mt-2"
                    >
                      Desbloquear
                    </button>
                  </div>
                ) : (
                  <>
                    {/* API Keys */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-obsidian-muted font-semibold uppercase tracking-wider text-[11px]">
                          Llaves API Registradas ({platformData.api_keys?.length || 0})
                        </span>
                      </div>

                      {platformData.api_keys && platformData.api_keys.length > 0 ? (
                        platformData.api_keys.map((ak) => (
                          <div key={ak.id} className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-white">{ak.label}</span>
                              {ak.expires_at && (
                                <span className="text-[10px] text-obsidian-muted flex items-center gap-1">
                                  <Clock size={10} /> Expira: {ak.expires_at}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[11px] text-cyan-300 truncate max-w-[280px]">
                                {ak.key || ak.key_masked}
                              </span>
                              <CopyButton value={ak.key || ''} label={`API Key (${ak.label})`} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 rounded-xl bg-obsidian-surface border border-obsidian-border text-center text-obsidian-muted">
                          No hay llaves API configuradas para esta cuenta.
                        </div>
                      )}
                    </div>

                    {/* ENV Variables */}
                    <div className="space-y-2 pt-2">
                      <span className="text-obsidian-muted font-semibold uppercase tracking-wider text-[11px] block">
                        Variables de Entorno (KEY=VALUE)
                      </span>

                      {platformData.env_variables && platformData.env_variables.length > 0 ? (
                        platformData.env_variables.map((ev, idx) => (
                          <div key={idx} className="p-2.5 rounded-xl bg-obsidian-surface border border-obsidian-border flex items-center justify-between">
                            <span className="font-mono text-[11px] text-amber-300 font-semibold">{ev.key}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-white select-all">
                                {ev.value || ev.value_masked}
                              </span>
                              <CopyButton value={ev.value || ''} label={`Variable ${ev.key}`} />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 rounded-xl bg-obsidian-surface border border-obsidian-border text-center text-obsidian-muted">
                          Sin variables de entorno guardadas.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SUBSCRIPTION & BILLING TAB */}
            {activeTab === 'subscription' && !isEmail && platformData && (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-obsidian-muted">Estado de la Cuenta</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      platformData.subscription_status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : platformData.subscription_status === 'free_trial'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-obsidian-border text-obsidian-muted'
                    }`}>
                      {platformData.subscription_status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-obsidian-muted">Costo Recurrente</span>
                    <span className="font-mono text-base font-bold text-white">
                      ${platformData.subscription_cost.toFixed(2)} {platformData.currency} / {platformData.billing_cycle}
                    </span>
                  </div>
                </div>

                {platformData.trial_end_date && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-300">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-xs">Prueba Gratuita</div>
                      <div className="text-[11px] text-amber-200/80">
                        Finaliza el {platformData.trial_end_date}. Se aplicará el cobro automático si no se cancela antes.
                      </div>
                    </div>
                  </div>
                )}

                {platformData.next_billing_date && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-obsidian-surface border border-obsidian-border">
                    <span className="text-obsidian-muted">Próxima Fecha de Renovación</span>
                    <span className="font-mono text-white font-medium">{platformData.next_billing_date}</span>
                  </div>
                )}

                {platformData.payment_alias && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-obsidian-surface border border-obsidian-border">
                    <span className="text-obsidian-muted">Método de Pago Vinculado</span>
                    <span className="text-indigo-300 font-medium">{platformData.payment_alias}</span>
                  </div>
                )}
              </div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <div className="space-y-3 text-xs">
                <span className="text-obsidian-muted font-semibold uppercase tracking-wider text-[11px] block">
                  Historial de Contraseñas Anteriores
                </span>

                {!isUnlocked ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center text-amber-300">
                    <Lock size={20} className="mx-auto mb-1 text-amber-400" />
                    Ingresa tu contraseña de acceso para ver las contraseñas anteriores.
                  </div>
                ) : historyData.length > 0 ? (
                  historyData.map((h) => (
                    <div key={h.id} className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-obsidian-muted">
                        <span>Motivo: <strong className="text-white">{h.reason}</strong></span>
                        <span>{new Date(h.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-mono text-white select-all">{h.password_plain || h.password_masked}</span>
                        <CopyButton value={h.password_plain || ''} label="Contraseña previa" />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 rounded-xl bg-obsidian-surface border border-obsidian-border text-center text-obsidian-muted">
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
