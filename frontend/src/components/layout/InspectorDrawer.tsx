import React, { useState, useEffect } from 'react';
import { 
  X, ExternalLink, ShieldCheck, Key, Code, CreditCard, 
  History, Copy, Check, Lock, Edit3, Trash2, AlertTriangle, 
  Clock, ShieldAlert, Sparkles, Shield, RefreshCw, Rocket,
  MessageCircle, Phone, MapPin, Globe, CheckCircle2, RotateCcw,
  Mail, Share2, Plus
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { PlatformAccount, EmailAccount, PaymentMethod, PwnedCheckResponse, Prospect, ProspectStatus } from '../../types';
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
  buildWhatsAppUrl
} from '../../lib/prospectUtils';

export const InspectorDrawer: React.FC = () => {
  const { 
    selectedEntity, openInspector, closeInspector, isUnlocked, openUnlockModal, 
    copyToClipboard, openPlatformModal, openEmailModal, openProspectModal, showToast, 
    triggerDataReload, dataVersion 
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
          setEmailData(null);
          setPlatformData(null);
        })
        .catch((err) => showToast(err.message, 'error'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [selectedEntity, isUnlocked, dataVersion]);

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
  const prospectWaUrl = prospectData
    ? buildWhatsAppUrl(prospectData.whatsapp, prospectData.company_name, prospectData.demo_url)
    : null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-obsidian-panel border-l border-obsidian-border shadow-2xl flex flex-col animate-slideLeft">
      {/* Top Header */}
      <div className="p-4 border-b border-obsidian-border flex items-center justify-between bg-obsidian-card">
        <div className="flex items-center gap-3">
          <PlatformIcon
            name={title || 'Item'}
            iconUrl={isPlatform ? platformData?.icon_url : undefined}
            size="md"
          />
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight">{title || 'Cargando...'}</h2>
            <p className="text-[11px] text-obsidian-muted">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
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
          {isProspect ? 'Ficha & SLA' : 'General'}
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
            <span>Credenciales</span>
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
            <span>APIs & Env</span>
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
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
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
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-white font-medium select-all">{emailData.address}</span>
                        <CopyButton value={emailData.address} label="Correo" />
                      </div>
                    </div>

                    {emailData.inbox_url && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-obsidian-surface border border-obsidian-border">
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
                            <div key={idx} className="flex items-center justify-between text-obsidian-text font-mono text-[11px] p-1.5 rounded bg-obsidian-bg">
                              <span>{al}</span>
                              <CopyButton value={al} label="Alias" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                      <span className="text-obsidian-muted block">Plataformas Asociadas</span>
                      <span className="font-semibold text-white text-sm">{emailData.platform_count} servicios dependen de este correo</span>
                    </div>

                    {/* Correlated Prospects / Demos for this Email */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-obsidian-muted font-medium flex items-center gap-1.5">
                          <Rocket size={13} className="text-indigo-400" />
                          <span>Prospectos & Demos Vinculados ({emailProspects.length})</span>
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
                                className="p-2.5 rounded-lg bg-obsidian-bg hover:bg-obsidian-card border border-obsidian-border flex items-center justify-between cursor-pointer transition-colors"
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
                        <p className="text-obsidian-text leading-relaxed whitespace-pre-wrap">{emailData.notes}</p>
                      </div>
                    )}
                  </>
                )}

                {isProspect && prospectData && prospectLive && (
                  <>
                    {/* Flow & Status control */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-obsidian-muted">Flujo de Trabajo</span>
                        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold border ${getWorkflowMeta(prospectData.workflow_type).badgeClass}`}>
                          {getWorkflowMeta(prospectData.workflow_type).label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1">
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
                    </div>

                    {/* Live SLA Timer & Semáforo Card */}
                    <div className="p-4 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-3">
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${getSlaBadgeMeta(prospectLive.slaStatus).badgeClass}`}>
                          <span className={`w-2 h-2 rounded-full ${getSlaBadgeMeta(prospectLive.slaStatus).dotClass}`} />
                          <span>{getSlaBadgeMeta(prospectLive.slaStatus).label}</span>
                        </span>

                        {!prospectLive.isResponded ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const updated = await api.markProspectResponded(prospectData.id);
                                setProspectData(updated);
                                const formatted = formatDuration(updated.response_time_seconds || updated.elapsed_seconds, false);
                                showToast(
                                  updated.met_sla
                                    ? `✓ ¡Cliente respondió en ${formatted}! SLA Cumplido.`
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
                            <span>Marcar "Ya respondió"</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const updated = await api.resetProspectTimer(prospectData.id, true);
                                setProspectData(updated);
                                showToast('Contador SLA reiniciado desde ahora.', 'info');
                                triggerDataReload();
                              } catch (err: any) {
                                showToast(err.message, 'error');
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-obsidian-bg hover:bg-obsidian-border text-obsidian-muted hover:text-white border border-obsidian-border text-[11px]"
                          >
                            <RotateCcw size={12} />
                            <span>Reiniciar Timer</span>
                          </button>
                        )}
                      </div>

                      <div className="p-3 rounded-xl bg-obsidian-bg border border-obsidian-border flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-obsidian-muted uppercase tracking-wider">
                            {prospectLive.isResponded ? 'Tiempo Total de Respuesta' : 'Tiempo Transcurrido en Vivo'}
                          </div>
                          <div className="font-mono text-lg font-bold text-white mt-0.5">
                            {formatDuration(prospectLive.elapsedSeconds, true)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-obsidian-muted uppercase tracking-wider">
                            Límite Estipulado
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

                      <div className="space-y-1 text-[11px] text-obsidian-muted font-mono">
                        {prospectData.started_at && (
                          <div>Inicio: {new Date(prospectData.started_at).toLocaleString()}</div>
                        )}
                        {prospectData.responded_at && (
                          <div className="text-emerald-300">
                            Respondido: {new Date(prospectData.responded_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Demo URL */}
                    {prospectData.demo_url && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                        <span className="text-obsidian-muted block">URL de la Página Demo Creada</span>
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
                    )}

                    {/* Quick Omnichannel Actions: WhatsApp, Phone, Maps */}
                    <div className="p-3.5 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2.5">
                      <span className="text-obsidian-muted block font-medium">Canales de Contacto & Ubicación</span>

                      {prospectData.whatsapp && prospectWaUrl && (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border">
                          <div className="flex items-center gap-2">
                            <MessageCircle size={14} className="text-emerald-400" />
                            <span className="font-mono text-white">{prospectData.whatsapp}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
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
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border">
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-cyan-400" />
                            <span className="font-mono text-white">{prospectData.phones}</span>
                          </div>
                          <CopyButton value={prospectData.phones} label="Teléfono" />
                        </div>
                      )}

                      {prospectData.maps_url && (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border">
                          <div className="flex items-center gap-2 min-w-0">
                            <MapPin size={14} className="text-amber-400 flex-shrink-0" />
                            <span className="text-obsidian-text truncate">Ubicación en Google Maps</span>
                          </div>
                          <a
                            href={prospectData.maps_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold flex-shrink-0"
                          >
                            <span>Abrir Mapa</span>
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      )}

                      {prospectData.contact_email && (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-bg border border-obsidian-border">
                          <div className="flex items-center gap-2">
                            <Mail size={14} className="text-indigo-400" />
                            <span className="font-mono text-white">{prospectData.contact_email}</span>
                          </div>
                          <CopyButton value={prospectData.contact_email} label="Correo del cliente" />
                        </div>
                      )}
                    </div>

                    {/* Linked Root Email */}
                    {prospectData.email_address && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border flex items-center justify-between">
                        <div>
                          <span className="text-obsidian-muted block">Correo Raíz Vinculado (EmailSaver)</span>
                          <span className="font-mono text-cyan-300 font-medium">
                            {prospectData.specific_alias || prospectData.email_address}
                          </span>
                        </div>
                        {prospectData.email_id && (
                          <button
                            type="button"
                            onClick={() => openInspector('email', prospectData.email_id!)}
                            className="px-2.5 py-1 rounded-lg bg-obsidian-bg hover:bg-obsidian-border text-indigo-300 border border-obsidian-border text-[11px] font-medium"
                          >
                            Ver Correo
                          </button>
                        )}
                      </div>
                    )}

                    {/* Social Links & Notes */}
                    {prospectData.social_links && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                        <span className="text-obsidian-muted block">Redes Sociales / Web Actual</span>
                        <p className="text-obsidian-text whitespace-pre-wrap">{prospectData.social_links}</p>
                      </div>
                    )}

                    {prospectData.notes && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-1">
                        <span className="text-obsidian-muted block">Notas Adicionales</span>
                        <p className="text-obsidian-text leading-relaxed whitespace-pre-wrap">{prospectData.notes}</p>
                      </div>
                    )}

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
                      <div className="text-obsidian-muted">Usuario / Handle / Email de Login</div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-white font-medium select-all">
                          {platformData.username || platformData.specific_alias || platformData.email_address}
                        </span>
                        <CopyButton 
                          value={platformData.username || platformData.specific_alias || platformData.email_address || ''} 
                          label="Usuario" 
                        />
                      </div>
                      <div className="text-[11px] text-obsidian-muted">
                        Correo padre: <span className="text-indigo-300">{platformData.email_address}</span>
                      </div>
                    </div>

                    {platformData.login_url && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-obsidian-surface border border-obsidian-border">
                        <span className="text-obsidian-muted">URL Oficial de Acceso</span>
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
                      <span className="text-obsidian-muted block">Etiquetas (Tags)</span>
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
                        <span className="text-obsidian-muted block">Notas Enriquecidas</span>
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
                    <h3 className="font-semibold text-white">Bóveda Cifrada Bloqueada</h3>
                    <p className="text-obsidian-muted text-[11px] max-w-xs mx-auto">
                      Las contraseñas, PINs y códigos de recuperación están protegidos por cifrado autenticado AES-256-GCM.
                    </p>
                    <button
                      type="button"
                      onClick={openUnlockModal}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md"
                    >
                      <Key size={14} />
                      <span>Ingresar Contraseña Maestra</span>
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
                            Entropía: {emailData.entropy_details.label} ({emailData.entropy_details.score}/100)
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
                            <span>{checkingPwned ? 'Consultando k-Anonimato...' : 'Verificar si fue filtrada (HaveIBeenPwned)'}</span>
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
                                  if (!confirm('¿Eliminar el autenticador 2FA de esta plataforma?')) return;
                                  try {
                                    await api.deletePlatformTotp(platformData.id);
                                    showToast('Autenticador 2FA eliminado', 'info');
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
                                      showToast('Autenticador 2FA activado con éxito', 'success');
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
                              <span>Activar Autenticador 2FA (TOTP)</span>
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
                          <span className="text-obsidian-muted">Método 2FA Activo</span>
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
                            Correo de recuperación padre: <span className="text-cyan-300 font-mono">{emailData.recovery_email_address}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Backup codes */}
                    {isEmail && emailData?.backup_codes && emailData.backup_codes.length > 0 && (
                      <div className="p-3 rounded-xl bg-obsidian-surface border border-obsidian-border space-y-2">
                        <span className="text-obsidian-muted block">Códigos de Respaldo de Emergencia</span>
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
                    <h3 className="font-semibold text-white">Bóveda Cifrada Bloqueada</h3>
                    <p className="text-obsidian-muted text-[11px]">
                      Desbloquea la bóveda para ver y copiar API Keys y variables de entorno.
                    </p>
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
                          No hay API Keys configuradas para esta plataforma.
                        </div>
                      )}
                    </div>

                    {/* ENV Variables */}
                    <div className="space-y-2 pt-2">
                      <span className="text-obsidian-muted font-semibold uppercase tracking-wider text-[11px] block">
                        Variables de Entorno & Secretos (KEY=VALUE)
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
                      <div className="font-semibold text-xs">Prueba Gratuita (Free Trial)</div>
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
                  Bitácora Inmutable de Rotación de Contraseñas
                </span>

                {!isUnlocked ? (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center text-amber-300">
                    <Lock size={20} className="mx-auto mb-1 text-amber-400" />
                    El historial histórico de contraseñas requiere validación de contraseña maestra.
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
                    No se han registrado rotaciones previas para este elemento.
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
