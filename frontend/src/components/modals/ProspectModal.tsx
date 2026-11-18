import { useFormModalFocus } from '../../hooks/useFormModalFocus';
import React, { useState, useEffect } from 'react';
import { 
  X, Rocket, Globe, MessageCircle, Phone, MapPin, 
  Clock, Mail, Share2, Tag, RotateCcw, AlertCircle, DollarSign, ChevronDown
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount, TagItem, ProspectStatus, ProspectWorkflowType, EntityScope } from '../../types';
import { PROSPECT_STATUS_OPTIONS } from '../../lib/prospectUtils';
import { isValidEmail, validateAndNormalizeUrl, isValidPhone, isValidPhoneList, validateSlaHours, INPUT_LIMITS } from '../../lib/validation';
import { InfoTooltip } from '../common/InfoTooltip';

function toLocalDatetimeInputValue(isoStr?: string): string {
  const d = isoStr ? new Date(isoStr) : new Date();
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeDecimalInput(value: string, maxDecimals = 2): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const separator = cleaned.indexOf('.');
  if (separator < 0) return cleaned;
  const whole = cleaned.slice(0, separator);
  const fraction = cleaned.slice(separator + 1).replace(/\./g, '').slice(0, maxDecimals);
  return `${whole}.${fraction}`;
}

export const ProspectModal: React.FC = () => {
  const { 
    isProspectModalOpen, closeProspectModal, editingProspectId, 
    prospectModalDefaultEmailId, showToast, triggerDataReload, defaultEntityScope,
    supportedCurrencies, baseCurrency, systemLocale
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);

  // Form fields
  const [scope, setScope] = useState<EntityScope>(defaultEntityScope);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [emailId, setEmailId] = useState('');
  const [specificAlias, setSpecificAlias] = useState('');
  const [workflowType, setWorkflowType] = useState<ProspectWorkflowType>('demo_first');
  const [status, setStatus] = useState<ProspectStatus>('demo_creada');
  const [demoUrl, setDemoUrl] = useState('');
  const [estimatedValue, setEstimatedValue] = useState<string>('0');
  const [currency, setCurrency] = useState<string>(baseCurrency || 'MXN');
  const [billingType, setBillingType] = useState<'one_time' | 'monthly_retainer'>('one_time');
  const [whatsapp, setWhatsapp] = useState('');
  const [phones, setPhones] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [socialLinks, setSocialLinks] = useState('');
  const [notes, setNotes] = useState('');

  // Inline Quick-create Root Email
  const [showInlineEmailCreate, setShowInlineEmailCreate] = useState(false);
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [newEmailProvider, setNewEmailProvider] = useState('Google');
  const [inlineEmailLoading, setInlineEmailLoading] = useState(false);

  // SLA & Cadence Timers
  const [startedAtInput, setStartedAtInput] = useState('');
  const [slaHours, setSlaHours] = useState<string>('48');
  const [followupSlaHours, setFollowupSlaHours] = useState<number>(48);
  const [maxFollowupAttempts, setMaxFollowupAttempts] = useState<number>(3);

  // Tags
  const [tags, setTags] = useState<TagItem[]>([]);
  const [newTagName, setNewTagName] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [showFollowupConfig, setShowFollowupConfig] = useState(false);

  const fallbackCurrency = baseCurrency || 'MXN';
  const currencyOptions = supportedCurrencies.length > 0
    ? (supportedCurrencies.some((c) => c.code === currency)
        ? supportedCurrencies
        : [...supportedCurrencies, { code: currency, name: currency, symbol: '' }])
    : [{ code: fallbackCurrency, name: fallbackCurrency, symbol: '$' }];

  useEffect(() => {
    if (!isProspectModalOpen) return;
    setDetailFailed(false);
    let active = true;
    setFormError(null);
    setShowFollowupConfig(Boolean(editingProspectId));
    setShowInlineEmailCreate(false);
    setNewEmailAddress('');
    setNewTagName('');
    api.getEmails().then((eList) => {
      if (!active) return;
      setEmails(eList);
      if (prospectModalDefaultEmailId) {
        setEmailId(prospectModalDefaultEmailId);
      } else if (eList.length > 0 && !editingProspectId) {
        setEmailId(eList[0].id);
      }
    }).catch((err: any) => {
      if (active) showToast(err?.message || 'No se pudieron cargar los correos disponibles.', 'warning');
    });

    if (editingProspectId) {
      setLoadingDetail(true);
      api.getProspectDetail(editingProspectId).then((p) => {
        if (!active) return;
        setScope(p.scope || 'business');
        setCompanyName(p.company_name);
        setContactName(p.contact_name || '');
        setContactEmail(p.contact_email || '');
        setEmailId(p.email_id || '');
        setSpecificAlias(p.specific_alias || '');
        setWorkflowType(p.workflow_type || 'demo_first');
        setStatus(p.status || 'demo_creada');
        setDemoUrl(p.demo_url || '');
        setEstimatedValue(String(p.estimated_value ?? 0));
        setCurrency(p.currency || fallbackCurrency);
        setBillingType(p.billing_type || 'one_time');
        setWhatsapp(p.whatsapp || '');
        setPhones(p.phones || '');
        setMapsUrl(p.maps_url || '');
        setSocialLinks(p.social_links || '');
        setNotes(p.notes || '');
        setStartedAtInput(toLocalDatetimeInputValue(p.started_at));
        setSlaHours(String(p.sla_hours || 48));
        setFollowupSlaHours(p.followup_sla_hours || 48);
        setMaxFollowupAttempts(p.max_followup_attempts || 3);
        setTags(p.tags || []);
      }).catch((err: any) => {
        if (!active) return;
        const msg = err?.message || 'Error al cargar la ficha del prospecto.';
        setDetailFailed(true);
        setFormError(msg);
        showToast(msg, 'error');
      }).finally(() => {
        if (active) setLoadingDetail(false);
      });
    } else {
      setLoadingDetail(false);
      setScope(defaultEntityScope);
      setCompanyName('');
      setContactName('');
      setContactEmail('');
      setSpecificAlias('');
      setWorkflowType('demo_first');
      setStatus('demo_creada');
      setDemoUrl('');
      setEstimatedValue('0');
      setCurrency(fallbackCurrency);
      setBillingType('one_time');
      setWhatsapp('');
      setPhones('');
      setMapsUrl('');
      setSocialLinks('');
      setNotes('');
      setStartedAtInput(toLocalDatetimeInputValue());
      setSlaHours('48');
      setFollowupSlaHours(48);
      setMaxFollowupAttempts(3);
      setTags([]);
    }

    return () => {
      active = false;
    };
  }, [isProspectModalOpen, editingProspectId, prospectModalDefaultEmailId, defaultEntityScope, fallbackCurrency, showToast]);

  useFormModalFocus(isProspectModalOpen, 'prospect-modal-title', closeProspectModal);

  const handleQuickCreateEmail = async () => {
    const trimmed = newEmailAddress.trim();
    if (!trimmed || !isValidEmail(trimmed)) {
      showToast('Ingresa un correo electrónico válido.', 'error');
      return;
    }
    setInlineEmailLoading(true);
    try {
      const created = await api.createEmail({
        address: trimmed,
        provider: newEmailProvider,
        scope: scope,
        two_factor_method: 'none',
      });
      setEmails((prev) => [...prev, created]);
      setEmailId(created.id);
      setShowInlineEmailCreate(false);
      setNewEmailAddress('');
      showToast(`Correo ${created.address} creado y vinculado.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al crear correo.', 'error');
    } finally {
      setInlineEmailLoading(false);
    }
  };

  if (!isProspectModalOpen) return null;

  const selectedParentEmail = emails.find((e) => e.id === emailId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || loadingDetail || detailFailed) return;
    setFormError(null);

    if (!companyName.trim()) {
      const msg = 'El nombre de la empresa o cliente es obligatorio.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    const numericValue = estimatedValue.trim() === '' ? 0 : Number(estimatedValue);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > INPUT_LIMITS.ESTIMATED_VALUE) {
      const msg = `Ingresa un valor entre 0 y ${INPUT_LIMITS.ESTIMATED_VALUE.toLocaleString(systemLocale || 'es-MX')}.`;
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    if (contactEmail.trim() && !isValidEmail(contactEmail)) {
      const msg = 'El correo electrónico del prospecto no tiene un formato válido.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    let normalizedDemoUrl = '';
    if (demoUrl.trim()) {
      const demoCheck = validateAndNormalizeUrl(demoUrl, 'URL de la Página Demo');
      if (!demoCheck.valid) {
        setFormError(demoCheck.error || 'URL de la Página Demo inválida.');
        showToast(demoCheck.error || 'URL de la Página Demo inválida.', 'error');
        return;
      }
      normalizedDemoUrl = demoCheck.normalized || '';
    }

    let normalizedMapsUrl = '';
    if (mapsUrl.trim()) {
      const mapsCheck = validateAndNormalizeUrl(mapsUrl, 'Link de Google Maps');
      if (!mapsCheck.valid) {
        setFormError(mapsCheck.error || 'Link de Google Maps inválido.');
        showToast(mapsCheck.error || 'Link de Google Maps inválido.', 'error');
        return;
      }
      normalizedMapsUrl = mapsCheck.normalized || '';
    }

    if (whatsapp.trim() && !isValidPhone(whatsapp)) {
      const msg = 'El número de WhatsApp debe contener al menos 7 dígitos numéricos válidos.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    if (phones.trim() && !isValidPhoneList(phones)) {
      const msg = 'Cada teléfono en la lista debe tener entre 7 y 15 dígitos (máx. 15 teléfonos).';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    const slaValidation = validateSlaHours(slaHours);
    if (!slaValidation.valid) {
      setShowFollowupConfig(true);
      setFormError(slaValidation.error || 'El tiempo de respuesta no es válido.');
      showToast(slaValidation.error || 'El tiempo de respuesta no es válido.', 'error');
      return;
    }

    let startedIso = new Date().toISOString();
    if (startedAtInput) {
      const parsedDate = new Date(startedAtInput);
      if (isNaN(parsedDate.getTime())) {
        const msg = 'La fecha/hora de inicio del temporizador no es válida.';
        setFormError(msg);
        showToast(msg, 'error');
        return;
      }
      startedIso = parsedDate.toISOString();
    }

    setLoading(true);
    try {
      const payload: any = {
        company_name: companyName.trim(),
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        email_id: emailId || null,
        specific_alias: specificAlias || null,
        scope,
        workflow_type: workflowType,
        status,
        demo_url: normalizedDemoUrl || null,
        estimated_value: numericValue,
        currency,
        billing_type: billingType,
        whatsapp: whatsapp.trim() || null,
        phones: phones.trim() || null,
        maps_url: normalizedMapsUrl || null,
        social_links: socialLinks.trim() || null,
        notes: notes.trim() || null,
        started_at: startedIso,
        sla_hours: slaValidation.hours ?? 24,
        followup_sla_hours: followupSlaHours,
        max_followup_attempts: maxFollowupAttempts,
        tags
      };

      if (editingProspectId) {
        await api.updateProspect(editingProspectId, payload);
        showToast('Ficha de prospecto actualizada correctamente.', 'success');
      } else {
        await api.createProspect(payload);
        showToast('Prospecto registrado con seguimiento activo.', 'success');
      }
      closeProspectModal();
      triggerDataReload();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar el prospecto.');
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    const name = newTagName.trim();
    if (!name) return;
    if (tags.some((tag) => tag.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      showToast('Esa etiqueta ya está agregada.', 'warning');
      return;
    }
    if (tags.length >= 100) {
      showToast('Un prospecto puede tener hasta 100 etiquetas.', 'warning');
      return;
    }
    setTags((current) => [...current, { name }]);
    setNewTagName('');
  };

  const slaPresets = [
    { label: '24 horas', hours: 24 },
    { label: '48 horas', hours: 48 },
    { label: '72 horas', hours: 72 },
    { label: '5 días (120h)', hours: 120 },
    { label: '7 días (168h)', hours: 168 }
  ];

  const numericSlaPreview = Number(slaHours);
  const hasValidSlaPreview = slaHours.trim() !== '' && Number.isFinite(numericSlaPreview);

  return (
    <div
      className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      onClick={closeProspectModal}
    >
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="prospect-modal-title"
        className="relative w-full max-w-2xl bg-obsidian-panel border border-obsidian-border rounded-xl shadow-xl p-4 sm:p-6 overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <Rocket size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="prospect-modal-title" className="text-base font-bold text-white tracking-tight truncate">
                {editingProspectId ? 'Editar Ficha de Prospecto / Página Demo' : 'Registrar Prospecto / Página Demo'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={closeProspectModal}
            aria-label="Cerrar formulario"
            className="ui-action-icon flex-shrink-0"
          >{/* [Icono] Acción identificada por su nombre accesible. */}
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {loadingDetail && (
            <div className="text-xs text-obsidian-muted" role="status">
              Cargando ficha del prospecto...
            </div>
          )}
          {formError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-obsidian-border bg-obsidian-surface p-3 text-xs text-obsidian-muted">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-rose-400" aria-hidden="true" />
              <span className="break-words">{formError}</span>
            </div>
          )}

          {/* Ámbito (Empresa vs Personal) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-obsidian-border pb-3">
            <span className="text-[11px] font-semibold text-white">Ámbito del Prospecto / Cliente:</span>
            <div className="flex items-center gap-1">
              {([
                { val: 'business', label: 'Empresa / Negocio' },
                { val: 'personal', label: 'Personal' },
                { val: 'shared', label: 'Compartido (Ambos)' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  aria-pressed={scope === opt.val}
                  onClick={() => setScope(opt.val)}
                  className="ui-action-toggle"
                >{/* [Estado seleccionable] La opción activa se identifica con aria-pressed. */}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modalidad de Trabajo */}
          <div className="space-y-2 border-t border-obsidian-border pt-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-obsidian-text">
                Modalidad del Flujo Comercial
              </span>
              <InfoTooltip content="Selecciona si primero construiste una página demo para mostrarle al cliente o si fue contacto directo para cotizar." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* [Estado seleccionable] Define la modalidad de seguimiento comercial. */}
              <button
                type="button"
                aria-pressed={workflowType === 'demo_first'}
                onClick={() => {
                  setWorkflowType('demo_first');
                  if (!editingProspectId && status === 'en_cotizacion') {
                    setStatus('demo_creada');
                  }
                }}
                className="ui-action-toggle w-full items-start justify-start p-3 text-left"
              >
                <Globe size={16} className="mt-0.5 shrink-0 text-obsidian-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="font-semibold text-xs">1. Página Demo Creada Primero</div>
                  <div className="text-[10px] text-obsidian-muted mt-0.5 leading-relaxed">
                    Armo una página web demo y luego contacto al prospecto midiendo el tiempo de respuesta.
                  </div>
                </div>
              </button>

              <button
                type="button"
                aria-pressed={workflowType === 'direct_quote'}
                onClick={() => {
                  setWorkflowType('direct_quote');
                  if (!editingProspectId && status === 'demo_creada') {
                    setStatus('en_cotizacion');
                  }
                }}
                className="ui-action-toggle w-full items-start justify-start p-3 text-left"
              >
                <Mail size={16} className="mt-0.5 shrink-0 text-obsidian-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="font-semibold text-xs">2. Contacto Directo a Cotización</div>
                  <div className="text-[10px] text-obsidian-muted mt-0.5 leading-relaxed">
                    Me comunico directamente con el cliente para presentar propuesta o cotización formal.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* BLOQUE 1: Datos del Prospecto y Página Demo */}
          <div className="space-y-3 border-t border-obsidian-border pt-4">
            <div className="flex items-center gap-1.5">
              <Globe size={16} className="text-obsidian-muted" aria-hidden="true" />
              <span className="text-xs font-semibold text-obsidian-text">
                1. Datos del Prospecto y Página Demo
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="prospectmodal-field-1" className="text-obsidian-text font-medium block mb-1">Nombre de la Empresa / Cliente *</label>
                <input id="prospectmodal-field-1"
                  type="text"
                  required
                  autoFocus
                  maxLength={INPUT_LIMITS.COMPANY_NAME}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ej. Estudio Arquitectónico Norte"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prospectmodal-field-2" className="text-obsidian-text font-medium block mb-1">Estado Actual del Seguimiento *</label>
                <select id="prospectmodal-field-2"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProspectStatus)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  {PROSPECT_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="prospectmodal-field-3" className="text-obsidian-text font-medium block mb-1">Nombre de la Persona de Contacto</label>
                <input id="prospectmodal-field-3"
                  type="text"
                  maxLength={INPUT_LIMITS.CONTACT_NAME}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ej. Lic. Roberto Mendoza"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prospectmodal-field-4" className="text-obsidian-text font-medium block mb-1">URL de la Página Demo o Sitio Creado</label>
                <input id="prospectmodal-field-4"
                  type="text"
                  maxLength={INPUT_LIMITS.URL}
                  value={demoUrl}
                  onChange={(e) => setDemoUrl(e.target.value)}
                  placeholder="https://demo-cliente.vercel.app"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prospect-whatsapp" className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <MessageCircle size={16} className="text-obsidian-muted" aria-hidden="true" />
                  <span>Número de WhatsApp (Con código de país)</span>
                </label>
                <input id="prospect-whatsapp"
                  type="text"
                  maxLength={INPUT_LIMITS.PHONE}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Ej. +52 55 1234 5678"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prospect-phones" className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <Phone size={16} className="text-obsidian-muted" aria-hidden="true" />
                  <span>Teléfono(s) Fijo o Móvil</span>
                </label>
                <input id="prospect-phones"
                  type="text"
                  maxLength={INPUT_LIMITS.PHONES_LIST}
                  value={phones}
                  onChange={(e) => setPhones(e.target.value)}
                  placeholder="Ej. +52 55 1234 5678, (55) 8765 4321"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prospect-maps" className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <MapPin size={16} className="text-obsidian-muted" aria-hidden="true" />
                  <span>Enlace a Ubicación en Google Maps</span>
                </label>
                <input id="prospect-maps"
                  type="text"
                  maxLength={INPUT_LIMITS.URL}
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                  placeholder="https://maps.google.com/?q=..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prospect-social" className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <Share2 size={16} className="text-obsidian-muted" aria-hidden="true" />
                  <span>Redes Sociales o Sitio Web Actual</span>
                </label>
                <input id="prospect-social"
                  type="text"
                  maxLength={INPUT_LIMITS.SOCIAL_LINKS}
                  value={socialLinks}
                  onChange={(e) => setSocialLinks(e.target.value)}
                  placeholder="Ej. IG: @negocio | FB: /negocio"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Valor Estimado & Tipo de Cobro (Pipeline Comercial) */}
            <div className="pt-2 border-t border-obsidian-border/70 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="text-obsidian-text font-medium flex items-center gap-1 mb-1">
                  <DollarSign size={16} className="text-obsidian-muted" aria-hidden="true" />
                  <label htmlFor="prospect-value">Valor Estimado / Cotización</label>
                  <InfoTooltip content="Se suma a tus proyectos en negociación o cerrados en el Resumen Ejecutivo y en Suscripciones y Finanzas." />
                </div>
                <input id="prospect-value"
                  type="text"
                  inputMode="decimal"
                  maxLength={12}
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(normalizeDecimalInput(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prospectmodal-field-5" className="text-obsidian-muted block mb-1">Divisa</label>
                <select id="prospectmodal-field-5"
                  aria-label="Divisa"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  {currencyOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}{c.name && c.name !== c.code ? ` (${c.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="prospectmodal-field-6" className="text-obsidian-muted block mb-1">Modalidad de Cobro</label>
                <select id="prospectmodal-field-6"
                  value={billingType}
                  onChange={(e) => setBillingType(e.target.value as 'one_time' | 'monthly_retainer')}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="one_time">Pago Único (Proyecto)</option>
                  <option value="monthly_retainer">Iguala Mensual (Recurrente)</option>
                </select>
              </div>
            </div>
          </div>

          <details
            open={showFollowupConfig}
            onToggle={(event) => setShowFollowupConfig(event.currentTarget.open)}
            className="group rounded-xl border border-obsidian-border bg-obsidian-panel/60"
          >
            {/* [Menú y selector] Expande las opciones de correo y seguimiento. */}
            <summary data-caret="manual" className="ui-nav-action w-full cursor-pointer justify-between text-xs font-semibold">
              <span className="min-w-0">Correo y seguimiento <span className="ml-1 font-normal text-obsidian-muted">· respuesta {slaHours || '—'} h · seguimiento +{followupSlaHours} h</span></span>
              <ChevronDown size={16} className="shrink-0 text-obsidian-muted transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-3 p-3 pt-0">
          {/* BLOQUE 2: Correlación de Emails */}
          <div className="space-y-3 border-t border-obsidian-border pt-4">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-obsidian-text">
                <Mail size={16} className="text-obsidian-muted" aria-hidden="true" />
                <span>2. Correos de Contacto</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="prospectmodal-field-7" className="text-obsidian-muted block mb-1">Mi Correo Principal de Envío / Seguimiento</label>
                <select id="prospectmodal-field-7"
                  value={emailId}
                  onChange={(e) => {
                    if (e.target.value === '__create_new__') {
                      setShowInlineEmailCreate(true);
                    } else {
                      setEmailId(e.target.value);
                      setShowInlineEmailCreate(false);
                      setSpecificAlias('');
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Sin correo principal vinculado</option>
                  {emails.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.address} ({e.provider})
                    </option>
                  ))}
                  <option value="__create_new__">+ Crear nuevo correo aquí...</option>
                </select>

                {showInlineEmailCreate && (
                  <div className="mt-3 space-y-2 border-t border-obsidian-border pt-3">
                    <span className="text-[11px] font-semibold text-white block">Nuevo Correo Principal al Vuelo:</span>
                    <input
                      type="email"
                      aria-label="Dirección del nuevo correo principal"
                      maxLength={INPUT_LIMITS.EMAIL}
                      value={newEmailAddress}
                      onChange={(e) => setNewEmailAddress(e.target.value)}
                      placeholder="nuevo@dominio.com"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="Proveedor del nuevo correo principal"
                        value={newEmailProvider}
                        onChange={(e) => setNewEmailProvider(e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-white text-xs"
                      >
                        <option value="Google">Google</option>
                        <option value="Proton">Proton Mail</option>
                        <option value="Outlook">Outlook</option>
                        <option value="Zoho">Zoho</option>
                        <option value="Custom">Personalizado</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleQuickCreateEmail}
                        disabled={inlineEmailLoading}
                        className="ui-action-primary shrink-0"
                      >{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
                        {inlineEmailLoading ? 'Creando...' : 'Crear'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="prospectmodal-field-8" className="text-obsidian-muted block mb-1">Correo Electrónico del Cliente / Prospecto</label>
                <input id="prospectmodal-field-8"
                  type="email"
                  maxLength={INPUT_LIMITS.EMAIL}
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contacto@cliente.com"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {selectedParentEmail && selectedParentEmail.aliases && selectedParentEmail.aliases.length > 0 && (
                <div className="md:col-span-2">
                  <label htmlFor="prospectmodal-field-9" className="text-obsidian-muted block mb-1">Alias Específico Utilizado para Contactar</label>
                  <select id="prospectmodal-field-9"
                    value={specificAlias}
                    onChange={(e) => setSpecificAlias(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Dirección principal ({selectedParentEmail.address})</option>
                    {selectedParentEmail.aliases.map((al, idx) => (
                      <option key={idx} value={al}>
                        {al}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* BLOQUE 3: Tiempo Límite de Respuesta y Seguimiento */}
          <div className="space-y-3 border-t border-obsidian-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Clock size={16} className="text-obsidian-muted" aria-hidden="true" />
                <span className="text-xs font-semibold text-obsidian-text">
                  3. Tiempo Límite de Respuesta y Seguimientos
                </span>
                <InfoTooltip content="Define en cuántas horas esperas respuesta inicial y cada cuántas horas volverás a contactar al cliente si no responde." />
              </div>
              <button
                type="button"
                onClick={() => setStartedAtInput(toLocalDatetimeInputValue())}
                className="ui-action-secondary items-center gap-1"
              >{/* [Acción secundaria] Mantiene disponible esta acción en su contexto. */}
                <RotateCcw size={11} />
                <span>Usar fecha/hora actual</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="prospectmodal-field-10" className="text-obsidian-muted block mb-1">Fecha y Hora del Primer Contacto</label>
                <input id="prospectmodal-field-10"
                  type="datetime-local"
                  value={startedAtInput}
                  onChange={(e) => setStartedAtInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="prospect-sla" className="text-obsidian-muted block mb-1">
                  Tiempo Límite de Respuesta (Horas) *
                </label>
                <div className="flex items-center gap-2">
                  <input id="prospect-sla"
                    type="text"
                    inputMode="decimal"
                    maxLength={10}
                    value={slaHours}
                    onChange={(e) => setSlaHours(normalizeDecimalInput(e.target.value))}
                    className="w-20 shrink-0 px-2 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500 sm:w-28 sm:px-3"
                  />
                  <span className="min-w-0 text-obsidian-muted text-[11px]">
                    horas ({hasValidSlaPreview ? (numericSlaPreview / 24).toFixed(1).replace(/\.0$/, '') : '—'} días)
                  </span>
                </div>
              </div>
            </div>

            {/* Quick SLA Preset Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-obsidian-muted mr-1">Plazo rápido:</span>
              {slaPresets.map((preset) => (
                <button
                  key={preset.hours}
                  type="button"
                  onClick={() => setSlaHours(String(preset.hours))}
                  aria-pressed={Number(slaHours) === preset.hours}
                  className="ui-action-toggle"
                >
                  {/* [Estado seleccionable] Define el plazo de respuesta. */}
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Secondary Follow-up Cadence & Max Attempts */}
            <div className="pt-2 border-t border-obsidian-border/70 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p id="prospect-followup-label" className="text-obsidian-muted block mb-1">
                  Plazo de Espera por Mensaje de Seguimiento
                </p>
                <div role="group" aria-labelledby="prospect-followup-label" className="flex items-center gap-1.5">
                  {[24, 48, 72].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setFollowupSlaHours(h)}
                      aria-pressed={followupSlaHours === h}
                      className="ui-action-toggle"
                    >{/* [Estado seleccionable] La opción activa se identifica con aria-pressed. */}
                      +{h}h
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div id="prospect-attempts-label" className="text-obsidian-muted flex items-center gap-1 mb-1">
                  <span>Límite de Intentos Sin Respuesta</span>
                  <InfoTooltip content="Al cumplir este número de seguimientos y vencer el último plazo sin respuesta, el prospecto pasa automáticamente a 'Archivado / Frío'." />
                </div>
                <div role="group" aria-labelledby="prospect-attempts-label" className="flex items-center gap-1.5">
                  {[3, 4].map((limit) => (
              <button
                      key={limit}
                      type="button"
                      onClick={() => setMaxFollowupAttempts(limit)}
                      aria-pressed={maxFollowupAttempts === limit}
                      className="ui-action-toggle"
                    >{/* [Estado seleccionable] La opción activa se identifica con aria-pressed. */}
                      {limit} intentos
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

            </div>
          </details>

          {/* Tags & Notes */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-2">
              <label className="text-obsidian-text font-medium flex items-center gap-1.5">
                <Tag size={16} className="text-obsidian-muted" aria-hidden="true" />
                <span>Etiquetas del Prospecto (Giro, Prioridad, Ciudad)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  aria-label="Nueva etiqueta del prospecto"
                  maxLength={INPUT_LIMITS.TAG_NAME}
                  placeholder="Ej. Restaurante, Inmobiliaria, Urgente..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="ui-action-secondary flex-shrink-0"
                >{/* [Acción secundaria] Ejecuta la operación de apoyo en este espacio. */}
                  Añadir Etiqueta
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-obsidian-border bg-obsidian-surface px-2.5 py-1 text-xs font-medium text-obsidian-muted"
                    >
                      <span className="truncate">{t.name}</span>
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                        aria-label={`Quitar etiqueta ${t.name}`}
                        className="ui-action-icon ui-action-danger shrink-0"
                      >
                        {/* [Acción destructiva] Quita la etiqueta del borrador. */}
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="prospectmodal-notes" className="text-obsidian-text font-medium block mb-1">
                Notas Privadas <span className="text-[10px] text-obsidian-muted font-mono">({notes.length}/{INPUT_LIMITS.NOTES})</span>
              </label>
              <textarea id="prospectmodal-notes"
                rows={2}
                maxLength={INPUT_LIMITS.NOTES}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Qué secciones incluiste en la demo, comentarios del cliente o recordatorios de seguimiento..."
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5 flex-shrink-0">
            <button
              type="button"
              onClick={closeProspectModal}
              className="ui-action-secondary"
            >{/* [Acción secundaria] Permite volver o reintentar sin modificar otros datos. */}
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || loadingDetail || detailFailed}
              className="ui-action-primary"
            >{/* [Acción principal] Inicia o confirma la tarea de este espacio. */}
              {loading ? 'Guardando...' : editingProspectId ? 'Guardar Cambios' : 'Registrar Prospecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
