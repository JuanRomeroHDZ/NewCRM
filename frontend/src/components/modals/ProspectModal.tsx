import React, { useState, useEffect } from 'react';
import { 
  X, Rocket, Globe, MessageCircle, Phone, MapPin, 
  Clock, Mail, Share2, Tag, RotateCcw, AlertCircle, DollarSign 
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

export const ProspectModal: React.FC = () => {
  const { 
    isProspectModalOpen, closeProspectModal, editingProspectId, 
    prospectModalDefaultEmailId, showToast, triggerDataReload, defaultEntityScope 
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
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN');
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
  const [newTagColor, setNewTagColor] = useState('#6366f1');

  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFollowupConfig, setShowFollowupConfig] = useState(false);

  useEffect(() => {
    if (isProspectModalOpen) {
      setFormError(null);
      setShowFollowupConfig(Boolean(editingProspectId));
      api.getEmails().then((eList) => {
        setEmails(eList);
        if (prospectModalDefaultEmailId) {
          setEmailId(prospectModalDefaultEmailId);
        } else if (eList.length > 0 && !editingProspectId) {
          setEmailId(eList[0].id);
        }
      }).catch(console.error);

      if (editingProspectId) {
        api.getProspectDetail(editingProspectId).then((p) => {
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
          setCurrency(p.currency || 'MXN');
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
        }).catch((err) => showToast(err.message, 'error'));
      } else {
        setScope(defaultEntityScope);
        setCompanyName('');
        setContactName('');
        setContactEmail('');
        setSpecificAlias('');
        setWorkflowType('demo_first');
        setStatus('demo_creada');
        setDemoUrl('');
        setEstimatedValue('0');
        setCurrency('MXN');
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
    }
  }, [isProspectModalOpen, editingProspectId, prospectModalDefaultEmailId, defaultEntityScope]);

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
    setFormError(null);

    if (!companyName.trim()) {
      const msg = 'El nombre de la empresa o cliente es obligatorio.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    const numericValue = estimatedValue.trim() === '' ? 0 : Number(estimatedValue);
    if (!Number.isFinite(numericValue) || numericValue < 0 || numericValue > INPUT_LIMITS.ESTIMATED_VALUE) {
      const msg = `Ingresa un valor entre 0 y ${INPUT_LIMITS.ESTIMATED_VALUE.toLocaleString('es-MX')}.`;
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
    if (!newTagName.trim()) return;
    setTags([...tags, { name: newTagName.trim(), color: newTagColor }]);
    setNewTagName('');
  };

  const slaPresets = [
    { label: '24 horas', hours: 24 },
    { label: '48 horas', hours: 48 },
    { label: '72 horas', hours: 72 },
    { label: '5 días (120h)', hours: 120 },
    { label: '7 días (168h)', hours: 168 }
  ];

  const numericSlaPreview = Number(slaHours) || 0;

  return (
    <div className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="prospect-modal-title"
        className="relative w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 flex-shrink-0">
              <Rocket size={20} />
            </div>
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
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-rose-300 text-xs">
              <AlertCircle size={15} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <span className="break-words">{formError}</span>
            </div>
          )}

          {/* Ámbito (Empresa vs Personal) */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border">
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
                  onClick={() => setScope(opt.val)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                    scope === opt.val
                      ? 'bg-indigo-600 text-white'
                      : 'bg-obsidian-bg text-obsidian-muted hover:text-white border border-obsidian-border'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Modalidad de Trabajo */}
          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-2">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider">
                Modalidad del Flujo Comercial
              </span>
              <InfoTooltip content="Selecciona si primero construiste una página demo para mostrarle al cliente o si fue contacto directo para cotizar." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setWorkflowType('demo_first');
                  if (!editingProspectId && status === 'en_cotizacion') {
                    setStatus('demo_creada');
                  }
                }}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  workflowType === 'demo_first'
                    ? 'bg-indigo-600/15 border-indigo-500 text-white shadow-sm'
                    : 'bg-obsidian-bg border-obsidian-border text-obsidian-muted hover:text-white'
                }`}
              >
                <Globe size={16} className={`flex-shrink-0 mt-0.5 ${workflowType === 'demo_first' ? 'text-indigo-400' : 'text-obsidian-muted'}`} />
                <div className="min-w-0">
                  <div className="font-semibold text-xs">1. Página Demo Creada Primero</div>
                  <div className="text-[10px] text-obsidian-muted mt-0.5 leading-relaxed">
                    Armo una página web demo y luego contacto al prospecto midiendo el tiempo de respuesta.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setWorkflowType('direct_quote');
                  if (!editingProspectId && status === 'demo_creada') {
                    setStatus('en_cotizacion');
                  }
                }}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                  workflowType === 'direct_quote'
                    ? 'bg-cyan-500/15 border-cyan-500 text-white shadow-sm'
                    : 'bg-obsidian-bg border-obsidian-border text-obsidian-muted hover:text-white'
                }`}
              >
                <Mail size={16} className={`flex-shrink-0 mt-0.5 ${workflowType === 'direct_quote' ? 'text-cyan-400' : 'text-obsidian-muted'}`} />
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
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <div className="flex items-center gap-1.5">
              <Globe size={12} className="text-indigo-400" />
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider">
                1. Datos del Prospecto y Página Demo
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-obsidian-text font-medium block mb-1">
                  Nombre de la Empresa / Cliente *
                </label>
                <input
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
                <label className="text-obsidian-text font-medium block mb-1">
                  Estado Actual del Seguimiento *
                </label>
                <select
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
                <label className="text-obsidian-text font-medium block mb-1">
                  Nombre de la Persona de Contacto
                </label>
                <input
                  type="text"
                  maxLength={INPUT_LIMITS.CONTACT_NAME}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Ej. Lic. Roberto Mendoza"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-text font-medium block mb-1">
                  URL de la Página Demo o Sitio Creado
                </label>
                <input
                  type="text"
                  maxLength={INPUT_LIMITS.URL}
                  value={demoUrl}
                  onChange={(e) => setDemoUrl(e.target.value)}
                  placeholder="https://demo-cliente.vercel.app"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <MessageCircle size={12} className="text-emerald-400" />
                  <span>Número de WhatsApp (Con código de país)</span>
                </label>
                <input
                  type="text"
                  maxLength={INPUT_LIMITS.PHONE}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="Ej. +52 55 1234 5678"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <Phone size={12} className="text-cyan-400" />
                  <span>Teléfono(s) Fijo o Móvil</span>
                </label>
                <input
                  type="text"
                  maxLength={INPUT_LIMITS.PHONES_LIST}
                  value={phones}
                  onChange={(e) => setPhones(e.target.value)}
                  placeholder="Ej. +52 55 1234 5678, (55) 8765 4321"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <MapPin size={12} className="text-amber-400" />
                  <span>Enlace a Ubicación en Google Maps</span>
                </label>
                <input
                  type="text"
                  maxLength={INPUT_LIMITS.URL}
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                  placeholder="https://maps.google.com/?q=..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <Share2 size={12} className="text-indigo-400" />
                  <span>Redes Sociales o Sitio Web Actual</span>
                </label>
                <input
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
                <label className="text-obsidian-text font-medium flex items-center gap-1 mb-1">
                  <DollarSign size={12} className="text-emerald-400" />
                  <span>Valor Estimado / Cotización</span>
                  <InfoTooltip content="Se suma a tus proyectos en negociación o cerrados en el Resumen Ejecutivo y en Suscripciones y Finanzas." />
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  maxLength={12}
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Divisa</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as 'MXN' | 'USD')}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="MXN">MXN (Peso Mexicano)</option>
                  <option value="USD">USD (Dólar Americano)</option>
                </select>
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Modalidad de Cobro</label>
                <select
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
            className="rounded-xl border border-obsidian-border bg-obsidian-panel/60"
          >
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-xs font-semibold text-obsidian-text marker:text-indigo-300 hover:bg-obsidian-surface/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">
              Correo y seguimiento <span className="ml-1 font-normal text-obsidian-muted">· respuesta {slaHours || '—'} h · seguimiento +{followupSlaHours} h</span>
            </summary>
            <div className="space-y-3 p-3 pt-0">
          {/* BLOQUE 2: Correlación de Emails */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <div>
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                <Mail size={12} className="text-indigo-400" />
                <span>2. Correos de Contacto</span>
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">
                  Mi Correo Principal de Envío / Seguimiento
                </label>
                <select
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
                  <div className="mt-2 p-2.5 rounded-xl bg-obsidian-bg border border-indigo-500/40 space-y-2">
                    <span className="text-[11px] font-semibold text-white block">Nuevo Correo Principal al Vuelo:</span>
                    <input
                      type="email"
                      value={newEmailAddress}
                      onChange={(e) => setNewEmailAddress(e.target.value)}
                      placeholder="nuevo@dominio.com"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center gap-1.5">
                      <select
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
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0"
                      >
                        {inlineEmailLoading ? 'Creando...' : 'Crear'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">
                  Correo Electrónico del Cliente / Prospecto
                </label>
                <input
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
                  <label className="text-obsidian-muted block mb-1">Alias Específico Utilizado para Contactar</label>
                  <select
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
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-amber-400" />
                <span className="font-semibold text-white uppercase text-[10px] tracking-wider">
                  3. Tiempo Límite de Respuesta y Seguimientos
                </span>
                <InfoTooltip content="Define en cuántas horas esperas respuesta inicial y cada cuántas horas volverás a contactar al cliente si no responde." />
              </div>
              <button
                type="button"
                onClick={() => setStartedAtInput(toLocalDatetimeInputValue())}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
              >
                <RotateCcw size={11} />
                <span>Usar fecha/hora actual</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">
                  Fecha y Hora del Primer Contacto
                </label>
                <input
                  type="datetime-local"
                  value={startedAtInput}
                  onChange={(e) => setStartedAtInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">
                  Tiempo Límite de Respuesta (Horas) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    maxLength={10}
                    value={slaHours}
                    onChange={(e) => setSlaHours(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-28 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-obsidian-muted text-[11px]">
                    horas ({numericSlaPreview > 0 ? (numericSlaPreview / 24).toFixed(1).replace(/\.0$/, '') : '0'} días)
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
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all ${
                    Number(slaHours) === preset.hours
                      ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                      : 'bg-obsidian-bg text-obsidian-muted border-obsidian-border hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Secondary Follow-up Cadence & Max Attempts */}
            <div className="pt-2 border-t border-obsidian-border/70 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">
                  Plazo de Espera por Mensaje de Seguimiento
                </label>
                <div className="flex items-center gap-1.5">
                  {[24, 48, 72].map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setFollowupSlaHours(h)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                        followupSlaHours === h
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold'
                          : 'bg-obsidian-bg text-obsidian-muted border-obsidian-border hover:text-white'
                      }`}
                    >
                      +{h}h
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-obsidian-muted flex items-center gap-1 mb-1">
                  <span>Límite de Intentos Sin Respuesta</span>
                  <InfoTooltip content="Al cumplir este número de seguimientos y vencer el último plazo sin respuesta, el prospecto pasa automáticamente a 'Archivado / Frío'." />
                </label>
                <div className="flex items-center gap-1.5">
                  {[3, 4].map((limit) => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => setMaxFollowupAttempts(limit)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                        maxFollowupAttempts === limit
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                          : 'bg-obsidian-bg text-obsidian-muted border-obsidian-border hover:text-white'
                      }`}
                    >
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
                <Tag size={12} className="text-indigo-400" />
                <span>Etiquetas del Prospecto (Giro, Prioridad, Ciudad)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
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
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="w-10 h-8 rounded-lg bg-obsidian-bg border border-obsidian-border cursor-pointer p-0.5 flex-shrink-0"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs flex-shrink-0"
                >
                  Añadir Etiqueta
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border max-w-full"
                      style={{
                        backgroundColor: `${t.color}18`,
                        borderColor: `${t.color}40`,
                        color: t.color
                      }}
                    >
                      <span className="truncate">{t.name}</span>
                      <button
                        type="button"
                        onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                        className="opacity-75 hover:opacity-100 flex-shrink-0"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">
                Notas Privadas <span className="text-[10px] text-obsidian-muted font-mono">({notes.length}/{INPUT_LIMITS.NOTES})</span>
              </label>
              <textarea
                rows={2}
                maxLength={INPUT_LIMITS.NOTES}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Qué secciones incluiste en la demo, comentarios del cliente o recordatorios de seguimiento..."
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={closeProspectModal}
            className="px-4 py-2 text-xs font-medium text-obsidian-muted hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : editingProspectId ? 'Guardar Cambios' : 'Registrar Prospecto'}
          </button>
        </div>
      </div>
    </div>
  );
};
