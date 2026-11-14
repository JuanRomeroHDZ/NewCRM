import React, { useEffect, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Timer,
} from 'lucide-react';
import { useVault } from '../../../context/VaultContext';
import { api } from '../../../lib/api';
import {
  PROSPECT_STATUS_OPTIONS,
  buildFollowUpMessage,
  buildMailtoUrl,
  buildWhatsAppUrl,
  computeLiveFollowUpSla,
  computeLiveSla,
  formatDuration,
  formatRelativeContactTime,
  formatSlaHoursLabel,
  getSlaBadgeMeta,
  getStatusMeta,
  getWorkflowMeta,
} from '../../../lib/prospectUtils';
import { TagBadge } from '../../common/TagBadge';
import { CopyButton } from '../../common/CopyButton';
import { InspectorFinanceForms } from './InspectorFinanceForms';
import type { ClientIncome, DomainRenewal, Prospect, ProspectStatus } from '../../../types';

interface ProspectInspectorSectionProps {
  prospectData: Prospect;
  nowMs: number;
  clientIncomes: ClientIncome[];
  clientRenewals: DomainRenewal[];
  onProspectUpdated: (prospect: Prospect) => void;
  onIncomeCreated: (income: ClientIncome) => void;
  onRenewalCreated: (renewal: DomainRenewal) => void;
  onRenewalUpdated: (renewal: DomainRenewal) => void;
  onOpenEmailInspector: (emailId: string) => void;
}

export const ProspectInspectorSection: React.FC<ProspectInspectorSectionProps> = ({
  prospectData,
  nowMs,
  clientIncomes,
  clientRenewals,
  onProspectUpdated,
  onIncomeCreated,
  onRenewalCreated,
  onRenewalUpdated,
  onOpenEmailInspector,
}) => {
  const {
    copyToClipboard,
    showToast,
    triggerDataReload,
    confirm,
    supportedCurrencies,
    baseCurrency,
    systemLocale,
  } = useVault();

  const initialFollowupWindow =
    prospectData.followup_sla_hours === 24 ||
    prospectData.followup_sla_hours === 48 ||
    prospectData.followup_sla_hours === 72
      ? prospectData.followup_sla_hours
      : 48;

  const [followupWindowHours, setFollowupWindowHours] = useState<24 | 48 | 72>(initialFollowupWindow);
  const [contactChannel, setContactChannel] = useState<'' | 'whatsapp' | 'email' | 'phone' | 'template'>('');
  const [recordingContact, setRecordingContact] = useState(false);

  useEffect(() => {
    setFollowupWindowHours(
      prospectData.followup_sla_hours === 24 ||
      prospectData.followup_sla_hours === 48 ||
      prospectData.followup_sla_hours === 72
        ? prospectData.followup_sla_hours
        : 48
    );
    setContactChannel('');
    setRecordingContact(false);
  }, [prospectData.id]);

  const prospectLive = computeLiveSla(prospectData, nowMs);
  const prospectFollowupLive = computeLiveFollowUpSla(prospectData, nowMs);
  const prospectWaUrl = buildWhatsAppUrl(
    prospectData.whatsapp,
    prospectData.company_name,
    prospectData.demo_url
  );
  const firstPhone = prospectData.phones?.split(/[,;\n]+/)[0]?.trim() || '';
  const firstPhoneDigits = firstPhone.replace(/\D/g, '');
  const prospectPhoneUrl = firstPhoneDigits.length >= 7 && firstPhoneDigits.length <= 15
    ? `tel:${firstPhone.startsWith('+') ? '+' : ''}${firstPhoneDigits}`
    : null;

  const estimatedCurrency = prospectData.currency || baseCurrency;
  const estimatedSymbol =
    supportedCurrencies.find((c) => c.code === estimatedCurrency)?.symbol || '$';

  return (
    <>
      {/* Flow, Status & Commercial Value control */}
      <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-obsidian-muted">Modalidad del Flujo</span>
          <span
            className={`rounded-lg border px-2.5 py-0.5 text-[10px] font-semibold ${
              getWorkflowMeta(prospectData.workflow_type).badgeClass
            }`}
          >
            {getWorkflowMeta(prospectData.workflow_type).label}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <label htmlFor="prospect-status-select" className="text-obsidian-muted">
            Estado del Prospecto
          </label>
          <select
            id="prospect-status-select"
            value={prospectData.status}
            onChange={async (e) => {
              const newSt = e.target.value as ProspectStatus;
              try {
                const updated = await api.updateProspect(prospectData.id, { status: newSt });
                onProspectUpdated(updated);
                showToast(`Estado actualizado a "${getStatusMeta(newSt).label}".`, 'success');
                triggerDataReload();
              } catch (err: any) {
                showToast(err.message || 'No se pudo actualizar el estado.', 'error');
              }
            }}
            className={`min-h-[34px] cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              getStatusMeta(prospectData.status).badgeClass
            }`}
          >
            {PROSPECT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-obsidian-panel text-white">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {(prospectData.estimated_value || 0) > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-obsidian-border/60 pt-2">
            <span className="flex items-center gap-1 text-obsidian-muted">
              <DollarSign size={12} className="text-emerald-400" aria-hidden="true" />
              <span>Valor Comercial Estimado</span>
            </span>
            <span className="font-mono text-xs font-bold text-emerald-300">
              {estimatedSymbol}
              {Number(prospectData.estimated_value).toLocaleString(systemLocale, {
                maximumFractionDigits: 2,
              })}{' '}
              {estimatedCurrency}{' '}
              <span className="font-sans text-[10px] font-normal text-obsidian-muted">
                ({prospectData.billing_type === 'monthly_retainer' ? 'Iguala Mensual' : 'Pago Único'})
              </span>
            </span>
          </div>
        )}

        {prospectData.status === 'archivado_frio' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-obsidian-border/60 pt-2">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <Archive size={13} className="text-slate-400" aria-hidden="true" />
              <span>Archivado por límite de intentos</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const updated = await api.reactivateProspect(prospectData.id, followupWindowHours);
                    onProspectUpdated(updated);
                    showToast(`Prospecto reactivado (+${followupWindowHours}h).`, 'success');
                    triggerDataReload();
                  } catch (err: any) {
                    showToast(err.message || 'No se pudo reactivar el prospecto.', 'error');
                  }
                }}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-600/25 px-2.5 py-1 text-[10px] font-semibold text-indigo-200 hover:bg-indigo-600/40"
              >
                <RefreshCw size={11} aria-hidden="true" />
                <span>Reactivar prospecto</span>
              </button>
              {prospectData.demo_url && (
                <button
                  type="button"
                  onClick={async () => {
                    const accepted = await confirm({
                      title: 'Liberar URL Demo',
                      message: '¿Liberar y reciclar la URL Demo para usarla con otro prospecto?',
                      confirmLabel: 'Liberar URL',
                      tone: 'warning',
                    });
                    if (!accepted) return;
                    try {
                      const updated = await api.recycleProspectDemo(prospectData.id);
                      onProspectUpdated(updated);
                      showToast('URL Demo liberada y archivada en notas.', 'info');
                      triggerDataReload();
                    } catch (err: any) {
                      showToast(err.message || 'No se pudo liberar la URL Demo.', 'error');
                    }
                  }}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-amber-500/35 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/25"
                >
                  <RotateCcw size={11} aria-hidden="true" />
                  <span>Liberar/Reciclar Demo</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BLOQUE 1: Correlación de Emails */}
      <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          <Mail size={12} className="text-indigo-400" aria-hidden="true" />
          <span>Correos</span>
        </span>

        <div className="flex min-w-0 items-center justify-between gap-2 border-b border-obsidian-border/60 py-1.5 last:border-0">
          <div className="min-w-0">
            <span className="block text-[10px] text-obsidian-muted">Correo principal</span>
            <span className="block truncate font-mono font-medium text-cyan-300">
              {prospectData.specific_alias || prospectData.email_address || 'Sin correo vinculado'}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {(prospectData.specific_alias || prospectData.email_address) && (
              <CopyButton
                value={prospectData.specific_alias || prospectData.email_address || ''}
                label="Mi correo"
                className="min-h-[32px] min-w-[32px]"
              />
            )}
            {prospectData.email_id && (
              <button
                type="button"
                onClick={() => onOpenEmailInspector(prospectData.email_id!)}
                className="min-h-[32px] rounded-lg border border-obsidian-border bg-obsidian-surface px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-obsidian-border"
              >
                Ver Correo
              </button>
            )}
          </div>
        </div>

        {prospectData.contact_email && (
          <div className="flex min-w-0 items-center justify-between gap-2 border-b border-obsidian-border/60 py-1.5 last:border-0">
            <div className="min-w-0">
              <span className="block text-[10px] text-obsidian-muted">Correo del prospecto</span>
              <span className="block truncate font-mono text-white">{prospectData.contact_email}</span>
            </div>
            <CopyButton
              value={prospectData.contact_email}
              label="Correo del cliente"
              className="min-h-[32px] min-w-[32px]"
            />
          </div>
        )}
      </div>

      {/* BLOQUE 2: Datos del Prospecto y Página Demo */}
      <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          <Globe size={12} className="text-cyan-400" aria-hidden="true" />
          <span>Contacto y página demo</span>
        </span>

        {prospectData.demo_url ? (
          <div className="space-y-1 border-b border-obsidian-border/60 py-1.5">
            <span className="block text-[10px] text-obsidian-muted">URL de la Página Demo Creada</span>
            <div className="flex items-center justify-between gap-2">
              <a
                href={prospectData.demo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-mono text-indigo-400 underline hover:text-indigo-300"
              >
                {prospectData.demo_url}
              </a>
              <div className="flex flex-shrink-0 items-center gap-1">
                <CopyButton
                  value={prospectData.demo_url}
                  label="URL Demo"
                  className="min-h-[32px] min-w-[32px]"
                />
                <a
                  href={prospectData.demo_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500"
                >
                  <span>Abrir</span>
                  <ExternalLink size={11} aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-1 text-obsidian-muted">
            Sin URL de página demo asignada.
          </div>
        )}

        {prospectData.whatsapp && prospectWaUrl && (
          <div className="flex min-w-0 items-center justify-between gap-2 border-b border-obsidian-border/60 py-1.5 last:border-0">
            <div className="flex min-w-0 items-center gap-2">
              <MessageCircle size={14} className="flex-shrink-0 text-emerald-400" aria-hidden="true" />
              <span className="truncate font-mono text-white">{prospectData.whatsapp}</span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <CopyButton
                value={prospectData.whatsapp}
                label="WhatsApp"
                className="min-h-[32px] min-w-[32px]"
              />
              <a
                href={prospectWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/30"
              >
                <span>Abrir Chat</span>
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>
          </div>
        )}

        {prospectData.phones && (
          <div className="flex min-w-0 items-center justify-between gap-2 border-b border-obsidian-border/60 py-1.5 last:border-0">
            <div className="flex min-w-0 items-center gap-2">
              <Phone size={14} className="flex-shrink-0 text-cyan-400" aria-hidden="true" />
              <span className="truncate font-mono text-white">{prospectData.phones}</span>
            </div>
            <CopyButton value={prospectData.phones} label="Teléfono" className="min-h-[32px] min-w-[32px]" />
          </div>
        )}

        {prospectData.maps_url && (
          <div className="flex min-w-0 items-center justify-between gap-2 border-b border-obsidian-border/60 py-1.5 last:border-0">
            <div className="flex min-w-0 items-center gap-2">
              <MapPin size={14} className="flex-shrink-0 text-amber-400" aria-hidden="true" />
              <span className="truncate text-obsidian-text">Ubicación en Mapa</span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <CopyButton
                value={prospectData.maps_url}
                label="Enlace de mapa"
                className="min-h-[32px] min-w-[32px]"
              />
              <a
                href={prospectData.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/30"
              >
                <span>Abrir Mapa</span>
                <ExternalLink size={11} aria-hidden="true" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Acciones Rápidas de Seguimiento y Contacto Directo */}
      <div className="space-y-2 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
            <MessageCircle size={12} className="text-indigo-400" aria-hidden="true" />
            <span>Acciones Rápidas de Seguimiento</span>
          </span>
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="Ventana de espera para seguimiento"
              className="flex items-center gap-0.5 rounded-lg border border-obsidian-border bg-obsidian-bg p-0.5 text-[10px]"
            >
              {([24, 48, 72] as const).map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  aria-pressed={followupWindowHours === hrs}
                  onClick={() => setFollowupWindowHours(hrs)}
                  className={`min-h-[26px] rounded px-1.5 py-0.5 font-mono transition-colors ${
                    followupWindowHours === hrs
                      ? 'bg-indigo-600 font-semibold text-white'
                      : 'text-obsidian-muted hover:text-white'
                  }`}
                >
                  +{hrs}h
                </button>
              ))}
            </div>
            <span className="font-mono text-[10px] text-obsidian-muted">
              Int:{' '}
              <strong className="text-white">
                {prospectData.followup_count ?? 0}/{prospectData.max_followup_attempts ?? 3}
              </strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {prospectWaUrl && (
            <button
              type="button"
              onClick={() => {
                window.open(prospectWaUrl, '_blank', 'noopener,noreferrer');
                setContactChannel('whatsapp');
                showToast('Mensaje preparado. Registra el contacto después de enviarlo.', 'info');
              }}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-2 text-[11px] font-semibold text-emerald-300 transition-all hover:bg-emerald-500/25"
            >
              <MessageCircle size={13} aria-hidden="true" />
              <span>WhatsApp</span>
            </button>
          )}

          {prospectPhoneUrl && (
            <a
              href={prospectPhoneUrl}
              onClick={() => {
                setContactChannel('phone');
                showToast('Llamada preparada. Registra el contacto después de realizarla.', 'info');
              }}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-2 text-[11px] font-semibold text-cyan-300 transition-all hover:bg-cyan-500/25"
            >
              <PhoneCall size={13} aria-hidden="true" />
              <span>Llamar</span>
            </a>
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
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-2 text-[11px] font-semibold text-cyan-300 transition-all hover:bg-cyan-500/25"
            >
              <Mail size={13} aria-hidden="true" />
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
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-2 text-[11px] font-semibold text-indigo-300 transition-all hover:bg-indigo-500/25"
          >
            <Copy size={13} aria-hidden="true" />
            <span>Copiar Plantilla</span>
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-obsidian-muted">
            Canal del contacto
            <select
              value={contactChannel}
              onChange={(event) => setContactChannel(event.target.value as typeof contactChannel)}
              className="mt-1 block min-h-[36px] rounded-lg border border-obsidian-border bg-obsidian-bg px-2 py-1.5 text-white"
            >
              <option value="">Selecciona un canal</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Correo</option>
              <option value="phone">Llamada</option>
              <option value="template">Otro mensaje</option>
            </select>
          </label>
          <button
            type="button"
            disabled={recordingContact || !contactChannel}
            onClick={async () => {
              if (!contactChannel) return;
              setRecordingContact(true);
              try {
                const updated = await api.recordProspectContactAttempt(
                  prospectData.id,
                  contactChannel,
                  followupWindowHours
                );
                onProspectUpdated(updated);
                triggerDataReload();
                showToast('Contacto registrado.', 'success');
              } catch (err: any) {
                showToast(err.message || 'No se pudo registrar el contacto.', 'error');
              } finally {
                setRecordingContact(false);
              }
            }}
            className="min-h-[36px] rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {recordingContact ? 'Registrando...' : 'Registrar contacto'}
          </button>
        </div>

        <div className="flex items-center justify-between border-t border-indigo-500/15 pt-1 text-[10px] text-obsidian-muted">
          <span>
            Último intento:{' '}
            <strong className="text-slate-300">
              {formatRelativeContactTime(prospectData.last_contacted_at, nowMs)}
            </strong>
          </span>
          {prospectData.last_contact_channel && (
            <span className="font-mono uppercase text-indigo-300">
              {prospectData.last_contact_channel}
            </span>
          )}
        </div>
      </div>

      {/* BLOQUE 3: Doble Cronómetro */}
      <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          <Clock size={12} className="text-amber-400" aria-hidden="true" />
          <span>Tiempo de respuesta</span>
        </span>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
              getSlaBadgeMeta(prospectLive.slaStatus).badgeClass
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${getSlaBadgeMeta(prospectLive.slaStatus).dotClass}`}
              aria-hidden="true"
            />
            <span>{getSlaBadgeMeta(prospectLive.slaStatus).label}</span>
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            {!prospectLive.isResponded && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    const updated = await api.markProspectResponded(prospectData.id);
                    onProspectUpdated(updated);
                    const formatted = formatDuration(
                      updated.response_time_seconds || updated.elapsed_seconds,
                      false
                    );
                    showToast(
                      updated.met_sla
                        ? `Cliente respondió en ${formatted}. Respondido a tiempo.`
                        : `Cliente marcado como respondido (${formatted}).`,
                      updated.met_sla ? 'success' : 'warning'
                    );
                    triggerDataReload();
                  } catch (err: any) {
                    showToast(err.message || 'No se pudo marcar como respondido.', 'error');
                  }
                }}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-all hover:bg-emerald-500/25"
              >
                <CheckCircle2 size={14} className="text-emerald-400" aria-hidden="true" />
                <span>Ya respondió</span>
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                try {
                  const updated = await api.resetProspectTimer(prospectData.id, true);
                  onProspectUpdated(updated);
                  showToast('Contador reiniciado desde ahora.', 'info');
                  triggerDataReload();
                } catch (err: any) {
                  showToast(err.message || 'No se pudo reiniciar el contador.', 'error');
                }
              }}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-bg px-2.5 py-1 text-[11px] text-obsidian-muted hover:bg-obsidian-border hover:text-white"
            >
              <RotateCcw size={12} aria-hidden="true" />
              <span>Reiniciar</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-obsidian-border/60 pt-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-obsidian-muted">
              {prospectLive.isResponded
                ? 'Tiempo Total de Respuesta'
                : 'Tiempo Total Transcurrido (Original)'}
            </div>
            <div className="mt-0.5 font-mono text-lg font-bold text-white">
              {formatDuration(prospectLive.elapsedSeconds, true)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-obsidian-muted">
              Límite Original
            </div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-indigo-300">
              {formatSlaHoursLabel(prospectData.sla_hours)}
            </div>
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-obsidian-bg">
          <div
            className={`h-full transition-all duration-500 ${
              getSlaBadgeMeta(prospectLive.slaStatus).barClass
            }`}
            style={{ width: `${prospectLive.progressPercent}%` }}
          />
        </div>

        {/* Secondary Follow-up SLA Readout */}
        {prospectFollowupLive.active && !prospectLive.isResponded && (
          <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-obsidian-bg p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-300">
                <Timer size={12} aria-hidden="true" />
                <span>Plazo de Espera Actual (+{prospectData.followup_sla_hours || 48}h)</span>
              </span>
              <span
                className={`font-mono text-[10px] font-semibold ${
                  prospectFollowupLive.status === 'vencido' ? 'text-rose-400' : 'text-indigo-300'
                }`}
              >
                {prospectFollowupLive.status === 'vencido'
                  ? `Vencido por ${formatDuration(prospectFollowupLive.overdueSeconds, false)}`
                  : `Vence en ${formatDuration(prospectFollowupLive.remainingSeconds, false)}`}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-obsidian-surface">
              <div
                className={`h-full transition-all duration-500 ${
                  prospectFollowupLive.status === 'vencido' ? 'bg-rose-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${prospectFollowupLive.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="space-y-1 font-mono text-[11px] text-obsidian-muted">
          {prospectData.started_at && (
            <div>Inicio original: {new Date(prospectData.started_at).toLocaleString(systemLocale)}</div>
          )}
          {prospectData.last_contacted_at && (
            <div className="text-indigo-300">
              Último seguimiento: {new Date(prospectData.last_contacted_at).toLocaleString(systemLocale)}
            </div>
          )}
          {prospectData.responded_at && (
            <div className="text-emerald-300">
              Respondido: {new Date(prospectData.responded_at).toLocaleString(systemLocale)}
            </div>
          )}
        </div>
      </div>

      {/* Social Links & Notes */}
      {prospectData.social_links && (
        <div className="space-y-1 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
          <span className="block text-obsidian-muted">Redes Sociales / Web Actual</span>
          <p className="whitespace-pre-wrap break-words text-obsidian-text">{prospectData.social_links}</p>
        </div>
      )}

      {prospectData.notes && (
        <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-surface p-3">
          <span className="block text-xs font-semibold text-white">Notas</span>
          <p className="whitespace-pre-wrap break-words leading-5 text-obsidian-text">
            {prospectData.notes}
          </p>
        </div>
      )}

      <InspectorFinanceForms
        prospect={prospectData}
        clientIncomes={clientIncomes}
        clientRenewals={clientRenewals}
        onIncomeCreated={onIncomeCreated}
        onRenewalCreated={onRenewalCreated}
        onRenewalUpdated={onRenewalUpdated}
      />

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-obsidian-border pt-3">
        <span className="text-obsidian-muted">Etiquetas</span>
        <div className="flex flex-wrap gap-1.5">
          {prospectData.tags && prospectData.tags.length > 0 ? (
            prospectData.tags.map((t, idx) => <TagBadge key={idx} name={t.name} color={t.color} />)
          ) : (
            <span className="italic text-obsidian-muted">Sin etiquetas</span>
          )}
        </div>
      </div>
    </>
  );
};
