import React, { useState, useEffect } from 'react';
import { 
  X, Rocket, Globe, MessageCircle, Phone, MapPin, 
  Clock, Mail, Share2, Tag, RotateCcw 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount, TagItem, ProspectStatus, ProspectWorkflowType } from '../../types';
import { PROSPECT_STATUS_OPTIONS } from '../../lib/prospectUtils';

function toLocalDatetimeInputValue(isoStr?: string): string {
  const d = isoStr ? new Date(isoStr) : new Date();
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const ProspectModal: React.FC = () => {
  const { 
    isProspectModalOpen, closeProspectModal, editingProspectId, 
    prospectModalDefaultEmailId, showToast, triggerDataReload 
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [emailId, setEmailId] = useState('');
  const [specificAlias, setSpecificAlias] = useState('');
  const [workflowType, setWorkflowType] = useState<ProspectWorkflowType>('demo_first');
  const [status, setStatus] = useState<ProspectStatus>('demo_creada');
  const [demoUrl, setDemoUrl] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [phones, setPhones] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [socialLinks, setSocialLinks] = useState('');
  const [notes, setNotes] = useState('');

  // SLA & Timer
  const [startedAtInput, setStartedAtInput] = useState('');
  const [slaHours, setSlaHours] = useState<number>(48);

  // Tags
  const [tags, setTags] = useState<TagItem[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isProspectModalOpen) {
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
          setCompanyName(p.company_name);
          setContactName(p.contact_name || '');
          setContactEmail(p.contact_email || '');
          setEmailId(p.email_id || '');
          setSpecificAlias(p.specific_alias || '');
          setWorkflowType(p.workflow_type || 'demo_first');
          setStatus(p.status || 'demo_creada');
          setDemoUrl(p.demo_url || '');
          setWhatsapp(p.whatsapp || '');
          setPhones(p.phones || '');
          setMapsUrl(p.maps_url || '');
          setSocialLinks(p.social_links || '');
          setNotes(p.notes || '');
          setStartedAtInput(toLocalDatetimeInputValue(p.started_at));
          setSlaHours(p.sla_hours || 48);
          setTags(p.tags || []);
        }).catch((err) => showToast(err.message, 'error'));
      } else {
        setCompanyName('');
        setContactName('');
        setContactEmail('');
        setSpecificAlias('');
        setWorkflowType('demo_first');
        setStatus('demo_creada');
        setDemoUrl('');
        setWhatsapp('');
        setPhones('');
        setMapsUrl('');
        setSocialLinks('');
        setNotes('');
        setStartedAtInput(toLocalDatetimeInputValue());
        setSlaHours(48);
        setTags([]);
      }
    }
  }, [isProspectModalOpen, editingProspectId, prospectModalDefaultEmailId]);

  if (!isProspectModalOpen) return null;

  const selectedParentEmail = emails.find((e) => e.id === emailId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      showToast('El nombre de la empresa o cliente es obligatorio.', 'error');
      return;
    }

    setLoading(true);
    try {
      const startedIso = startedAtInput ? new Date(startedAtInput).toISOString() : new Date().toISOString();

      const payload: any = {
        company_name: companyName.trim(),
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        email_id: emailId || null,
        specific_alias: specificAlias || null,
        workflow_type: workflowType,
        status,
        demo_url: demoUrl.trim() || null,
        whatsapp: whatsapp.trim() || null,
        phones: phones.trim() || null,
        maps_url: mapsUrl.trim() || null,
        social_links: socialLinks.trim() || null,
        notes: notes.trim() || null,
        started_at: startedIso,
        sla_hours: Number(slaHours) || 48,
        tags
      };

      if (editingProspectId) {
        await api.updateProspect(editingProspectId, payload);
        showToast('Ficha de prospecto / demo actualizada.', 'success');
      } else {
        await api.createProspect(payload);
        showToast('Prospecto / Demo registrado con contador SLA activo.', 'success');
      }
      closeProspectModal();
      triggerDataReload();
    } catch (err: any) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Rocket size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {editingProspectId ? 'Editar Ficha de Prospecto / Demo' : 'Nuevo Prospecto / Página Demo'}
              </h2>
              <p className="text-xs text-obsidian-muted">
                Seguimiento de sitio demo creado, contacto omnicanal y SLA de respuesta vinculado a tus correos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeProspectModal}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {/* Workflow Selector */}
          <div className="p-3.5 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-2">
            <span className="font-semibold text-white uppercase text-[10px] tracking-wider block">
              Tipo de Flujo de Trabajo
            </span>
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
                <Globe size={16} className={workflowType === 'demo_first' ? 'text-indigo-400 mt-0.5' : 'text-obsidian-muted mt-0.5'} />
                <div>
                  <div className="font-semibold text-xs">1. Crear Página Demo Primero</div>
                  <div className="text-[10px] text-obsidian-muted mt-0.5">
                    Armo su sitio web demo y luego los contacto esperando respuesta con timer SLA
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
                <Mail size={16} className={workflowType === 'direct_quote' ? 'text-cyan-400 mt-0.5' : 'text-obsidian-muted mt-0.5'} />
                <div>
                  <div className="font-semibold text-xs">2. Contacto Directo a Cotizar</div>
                  <div className="text-[10px] text-obsidian-muted mt-0.5">
                    Me contacto directo para enviar propuesta o cotización formal
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Main Identity & Flow Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-obsidian-text font-medium block mb-1">
                Nombre de la Empresa / Cliente *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Ej. Clínica Dental Sonrisa Perfecta"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">
                Estado del Flujo *
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
                Nombre del Contacto / Encargado
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ej. Dra. Mariana Vega"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">
                URL de la Página Demo Creada
              </label>
              <input
                type="url"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="https://mi-demo-cliente.vercel.app"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Correlation with Saved Emails */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <span className="font-semibold text-white uppercase text-[10px] tracking-wider flex items-center gap-1.5">
              <Mail size={12} className="text-indigo-400" />
              <span>Correlación con Correo Guardado (EmailSaver)</span>
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">
                  Correo Raíz desde el que gestiono / contacto
                </label>
                <select
                  value={emailId}
                  onChange={(e) => {
                    setEmailId(e.target.value);
                    setSpecificAlias('');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Sin correo raíz vinculado</option>
                  {emails.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.address} ({e.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">
                  Correo Electrónico del Prospecto / Cliente
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contacto@empresa-cliente.com"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {selectedParentEmail && selectedParentEmail.aliases && selectedParentEmail.aliases.length > 0 && (
                <div className="md:col-span-2">
                  <label className="text-obsidian-muted block mb-1">Alias Específico Utilizado</label>
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

          {/* SLA & Response Timer Configuration */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                <Clock size={12} className="text-amber-400" />
                <span>Contador de Tiempo & SLA de Respuesta</span>
              </span>
              <button
                type="button"
                onClick={() => setStartedAtInput(toLocalDatetimeInputValue())}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
              >
                <RotateCcw size={11} />
                <span>Fijar inicio a Ahora</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">
                  Fecha / Hora de Inicio (Creación de Demo o 1er Contacto)
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
                  Tiempo Límite Estipulado (en Horas)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={slaHours}
                    onChange={(e) => setSlaHours(Math.max(1, Number(e.target.value)))}
                    className="w-28 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-obsidian-muted text-[11px]">
                    horas ({(slaHours / 24).toFixed(1).replace(/\.0$/, '')} días)
                  </span>
                </div>
              </div>
            </div>

            {/* Quick SLA Preset Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-obsidian-muted mr-1">Ajustes rápidos:</span>
              {slaPresets.map((preset) => (
                <button
                  key={preset.hours}
                  type="button"
                  onClick={() => setSlaHours(preset.hours)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all ${
                    slaHours === preset.hours
                      ? 'bg-indigo-600 text-white border-indigo-500 font-semibold'
                      : 'bg-obsidian-bg text-obsidian-muted border-obsidian-border hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact & Location Details */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <span className="font-semibold text-white uppercase text-[10px] tracking-wider block">
              Datos de Contacto Extraídos / Asociados
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <MessageCircle size={12} className="text-emerald-400" />
                  <span>Número de WhatsApp (Para abrir chat directo)</span>
                </label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+52 55 1234 5678"
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
                  value={phones}
                  onChange={(e) => setPhones(e.target.value)}
                  placeholder="+52 55 1234 5678 / Oficina: (55) 8765 4321"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <MapPin size={12} className="text-amber-400" />
                  <span>Link a su Ubicación en Google Maps</span>
                </label>
                <input
                  type="url"
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                  placeholder="https://maps.google.com/?q=..."
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted flex items-center gap-1.5 mb-1">
                  <Share2 size={12} className="text-indigo-400" />
                  <span>Redes Sociales / Web Actual</span>
                </label>
                <input
                  type="text"
                  value={socialLinks}
                  onChange={(e) => setSocialLinks(e.target.value)}
                  placeholder="IG: @empresa | FB: /empresa"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-obsidian-text font-medium flex items-center gap-1.5">
              <Tag size={12} className="text-indigo-400" />
              <span>Etiquetas (Sector, Prioridad, etc.)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej. Salud, E-Commerce, Landing Demo..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs"
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-10 h-8 rounded-lg bg-obsidian-bg border border-obsidian-border cursor-pointer p-0.5"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs"
              >
                Añadir Tag
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tags.map((t, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border"
                  style={{
                    backgroundColor: `${t.color}18`,
                    borderColor: `${t.color}40`,
                    color: t.color
                  }}
                >
                  <span>{t.name}</span>
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((_, i) => i !== idx))}
                    className="opacity-75 hover:opacity-100"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-obsidian-text font-medium block mb-1">
              Notas Adicionales / Detalles de la Propuesta
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones sobre la página demo, requerimientos del prospecto o seguimiento..."
              className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
            />
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
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20"
          >
            {loading ? 'Guardando...' : editingProspectId ? 'Actualizar Prospecto' : 'Guardar Prospecto / Demo'}
          </button>
        </div>
      </div>
    </div>
  );
};
