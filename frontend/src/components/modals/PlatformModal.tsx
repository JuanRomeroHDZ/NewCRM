import React, { useState, useEffect } from 'react';
import { X, Globe, Trash2, Sparkles, AlertCircle, Mail, UserPlus } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount, PaymentMethod, ApiKeyItem, EnvVarItem, TagItem, Prospect, EntityScope, OwnershipType } from '../../types';
import { validateAndNormalizeUrl, validateServiceDatesOrder, INPUT_LIMITS, isValidEmail } from '../../lib/validation';

export const PlatformModal: React.FC = () => {
  const { 
    isPlatformModalOpen, closePlatformModal, editingPlatformId, 
    platformModalDefaultEmailId, showToast, triggerDataReload, 
    openPasswordGen, defaultEntityScope 
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);

  // Form fields
  const [scope, setScope] = useState<EntityScope>(defaultEntityScope);
  const [ownershipType, setOwnershipType] = useState<OwnershipType>('own');
  const [prospectId, setProspectId] = useState('');
  const [name, setName] = useState('');
  const [emailId, setEmailId] = useState('');
  const [specificAlias, setSpecificAlias] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [username, setUsername] = useState('');
  const [accessType, setAccessType] = useState<'own_password' | 'sso'>('own_password');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState('');
  const [notes, setNotes] = useState('');

  // Inline Quick-create Email
  const [showInlineEmailCreate, setShowInlineEmailCreate] = useState(false);
  const [newEmailAddress, setNewEmailAddress] = useState('');
  const [newEmailProvider, setNewEmailProvider] = useState('Google');
  const [inlineEmailLoading, setInlineEmailLoading] = useState(false);

  // Inline Quick-create Prospect/Client
  const [showInlineClientCreate, setShowInlineClientCreate] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [inlineClientLoading, setInlineClientLoading] = useState(false);

  // Subscription
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'free_trial' | 'paused' | 'cancelled' | 'free'>('active');
  const [subscriptionCost, setSubscriptionCost] = useState<string>('0');
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly' | 'weekly' | 'daily' | 'one_time'>('monthly');
  const [startDate, setStartDate] = useState('');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [trialEndDate, setTrialEndDate] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');

  // Technical
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newApiKeyLabel, setNewApiKeyLabel] = useState('');
  const [newApiKeyValue, setNewApiKeyValue] = useState('');

  const [envVars, setEnvVars] = useState<EnvVarItem[]>([]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');

  // Tags
  const [tags, setTags] = useState<TagItem[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');

  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPlatformModalOpen) {
      setFormError(null);
      Promise.all([
        api.getEmails(),
        api.getPaymentMethods(),
        api.getProspects().catch(() => [])
      ]).then(([eList, pList, prList]) => {
        setEmails(eList);
        setPayments(pList);
        setProspects(prList || []);

        if (platformModalDefaultEmailId) {
          setEmailId(platformModalDefaultEmailId);
        }
      }).catch(console.error);

      if (editingPlatformId) {
        api.getPlatformDetail(editingPlatformId).then((p) => {
          setScope(p.scope || 'business');
          setOwnershipType(p.ownership_type || (p.prospect_id ? 'client' : 'own'));
          setProspectId(p.prospect_id || '');
          setName(p.name);
          setEmailId(p.email_id || '');
          setSpecificAlias(p.specific_alias || '');
          setLoginUrl(p.login_url || '');
          setUsername(p.username || '');
          setAccessType(p.access_type);
          setPassword('');
          setPin('');
          setRecoveryCodes(p.recovery_codes_plain || '');
          setNotes(p.notes || '');
          setSubscriptionStatus(p.subscription_status);
          setSubscriptionCost(String(p.subscription_cost ?? 0));
          setCurrency(p.currency);
          setBillingCycle(p.billing_cycle as any);
          setStartDate(p.start_date || '');
          setNextBillingDate(p.next_billing_date || '');
          setTrialEndDate(p.trial_end_date || '');
          setPaymentMethodId(p.payment_method_id || '');
          setApiKeys(p.api_keys || []);
          setEnvVars(p.env_variables || []);
          setTags(p.tags || []);
        });
      } else {
        setScope(defaultEntityScope);
        setOwnershipType('own');
        setProspectId('');
        setName('');
        setEmailId(platformModalDefaultEmailId || '');
        setSpecificAlias('');
        setLoginUrl('');
        setUsername('');
        setAccessType('own_password');
        setPassword('');
        setPin('');
        setRecoveryCodes('');
        setNotes('');
        setSubscriptionStatus('active');
        setSubscriptionCost('0');
        setCurrency('MXN');
        setBillingCycle('monthly');
        setStartDate('');
        setNextBillingDate('');
        setTrialEndDate('');
        setPaymentMethodId('');
        setApiKeys([]);
        setEnvVars([]);
        setTags([]);
      }
    }
  }, [isPlatformModalOpen, editingPlatformId, platformModalDefaultEmailId, defaultEntityScope]);

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
        scope,
        two_factor_method: 'none',
      });
      setEmails((prev) => [...prev, created]);
      setEmailId(created.id);
      setShowInlineEmailCreate(false);
      setNewEmailAddress('');
      showToast(`Correo ${created.address} creado con éxito.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al crear correo.', 'error');
    } finally {
      setInlineEmailLoading(false);
    }
  };

  const handleQuickCreateClient = async () => {
    const trimmed = newClientName.trim();
    if (!trimmed) {
      showToast('Ingresa el nombre del cliente o prospecto.', 'error');
      return;
    }
    setInlineClientLoading(true);
    try {
      const created = await api.createProspect({
        company_name: trimmed,
        scope,
        workflow_type: 'demo_first',
        status: 'demo_creada',
      });
      setProspects((prev) => [...prev, created]);
      setProspectId(created.id);
      setShowInlineClientCreate(false);
      setNewClientName('');
      showToast(`Cliente ${created.company_name} registrado con éxito.`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al registrar cliente.', 'error');
    } finally {
      setInlineClientLoading(false);
    }
  };

  if (!isPlatformModalOpen) return null;

  const selectedParentEmail = emails.find((e) => e.id === emailId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      const msg = 'El nombre de la plataforma o servicio es obligatorio.';
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    let normalizedLoginUrl = '';
    if (loginUrl.trim()) {
      const urlCheck = validateAndNormalizeUrl(loginUrl, 'URL de Acceso');
      if (!urlCheck.valid) {
        setFormError(urlCheck.error || 'URL de Acceso inválida.');
        showToast(urlCheck.error || 'URL de Acceso inválida.', 'error');
        return;
      }
      normalizedLoginUrl = urlCheck.normalized || '';
    }

    const numericCost = Number(subscriptionCost);
    if (!Number.isFinite(numericCost) || numericCost < 0 || numericCost > INPUT_LIMITS.COST_AMOUNT) {
      const msg = `Ingresa un costo entre 0 y ${INPUT_LIMITS.COST_AMOUNT.toLocaleString('es-MX')}.`;
      setFormError(msg);
      showToast(msg, 'error');
      return;
    }

    const datesError = validateServiceDatesOrder(startDate, nextBillingDate, trialEndDate);
    if (datesError) {
      setFormError(datesError);
      showToast(datesError, 'error');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        name: name.trim(),
        scope,
        ownership_type: ownershipType,
        prospect_id: ownershipType === 'client' ? (prospectId || null) : null,
        email_id: emailId || null,
        specific_alias: specificAlias || null,
        login_url: normalizedLoginUrl || null,
        username: username.trim() || null,
        access_type: accessType,
        notes: notes.trim() || null,
        subscription_status: subscriptionStatus,
        subscription_cost: numericCost,
        currency,
        billing_cycle: billingCycle,
        start_date: startDate || null,
        next_billing_date: nextBillingDate || null,
        trial_end_date: trialEndDate || null,
        payment_method_id: paymentMethodId || null,
        api_keys: apiKeys,
        env_variables: envVars,
        tags
      };

      if (password) payload.password = password;
      if (pin) payload.pin = pin;
      if (recoveryCodes) payload.recovery_codes = recoveryCodes;

      if (editingPlatformId) {
        await api.updatePlatform(editingPlatformId, payload);
        showToast('Plataforma actualizada exitosamente.', 'success');
      } else {
        await api.createPlatform(payload);
        showToast('Plataforma guardada exitosamente.', 'success');
      }
      closePlatformModal();
      triggerDataReload();
    } catch (err: any) {
      setFormError(err.message || 'Error al guardar la plataforma.');
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const addApiKey = () => {
    if (!newApiKeyLabel.trim() || !newApiKeyValue.trim()) {
      showToast('Ingresa etiqueta y valor para añadir la llave API.', 'warning');
      return;
    }
    setApiKeys([
      ...apiKeys,
      {
        id: Math.random().toString(36).substring(2, 9),
        label: newApiKeyLabel.trim(),
        key: newApiKeyValue.trim(),
        key_masked: '••••••••••••••••'
      }
    ]);
    setNewApiKeyLabel('');
    setNewApiKeyValue('');
  };

  const addEnvVar = () => {
    if (!newEnvKey.trim() || !newEnvValue.trim()) {
      showToast('Ingresa el nombre de la variable y su valor.', 'warning');
      return;
    }
    setEnvVars([
      ...envVars,
      {
        key: newEnvKey.trim(),
        value: newEnvValue.trim(),
        value_masked: '••••••••'
      }
    ]);
    setNewEnvKey('');
    setNewEnvValue('');
  };

  const addTag = () => {
    if (!newTagName.trim()) return;
    setTags([...tags, { name: newTagName.trim(), color: newTagColor }]);
    setNewTagName('');
  };

  return (
    <div 
      className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="platform-modal-title"
    >
      <div 
        className="relative w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 overflow-hidden max-h-[calc(100dvh-1rem)] sm:max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 flex-shrink-0">
              <Globe size={20} />
            </div>
            <div className="min-w-0">
              <h2 id="platform-modal-title" className="text-base font-bold text-white tracking-tight truncate">
                {editingPlatformId ? 'Editar Plataforma o Servicio' : 'Agregar Plataforma o Servicio'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={closePlatformModal}
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
            <span className="text-[11px] font-semibold text-white">Ámbito de la Cuenta / Servicio:</span>
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

          {/* Tipo de Pertenencia / Vinculación */}
          <div className="p-3 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-2">
            <label className="text-[11px] font-semibold text-white block">Pertenencia / Vinculación:</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { val: 'own', label: 'Uso Propio / Interno' },
                { val: 'client', label: 'Vinculado a Cliente' },
                { val: 'independent', label: 'Independiente' },
              ] as const).map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setOwnershipType(opt.val)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border text-center transition-all ${
                    ownershipType === opt.val
                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500 font-semibold'
                      : 'bg-obsidian-bg text-obsidian-muted border-obsidian-border hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* If linked to client, show client picker + inline quick-create */}
            {ownershipType === 'client' && (
              <div className="pt-2">
                <label className="text-obsidian-text font-medium block mb-1">Cliente / Prospecto Asociado</label>
                <select
                  value={prospectId}
                  onChange={(e) => {
                    if (e.target.value === '__create_client__') {
                      setShowInlineClientCreate(true);
                    } else {
                      setProspectId(e.target.value);
                      setShowInlineClientCreate(false);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Selecciona un cliente o prospecto...</option>
                  {prospects.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.company_name} {pr.contact_name ? `(${pr.contact_name})` : ''}
                    </option>
                  ))}
                  <option value="__create_client__">+ Registrar nuevo cliente aquí...</option>
                </select>

                {showInlineClientCreate && (
                  <div className="mt-2 p-2.5 rounded-xl bg-obsidian-bg border border-indigo-500/40 space-y-2">
                    <span className="text-[11px] font-semibold text-white block">Nuevo Cliente al Vuelo:</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                        placeholder="Nombre de la empresa o cliente"
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-obsidian-surface border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleQuickCreateClient}
                        disabled={inlineClientLoading}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shrink-0"
                      >
                        {inlineClientLoading ? 'Guardando...' : 'Crear'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Platform Identity & Correlation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-obsidian-text font-medium block mb-1">Nombre de la Plataforma / Servicio *</label>
              <input
                type="text"
                required
                autoFocus
                maxLength={INPUT_LIMITS.PLATFORM_NAME}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. GitHub, Vercel, Stripe, AWS"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Correo Principal Vinculado (Opcional)</label>
              <select
                value={emailId}
                onChange={(e) => {
                  if (e.target.value === '__create_email__') {
                    setShowInlineEmailCreate(true);
                  } else {
                    setEmailId(e.target.value);
                    setShowInlineEmailCreate(false);
                    setSpecificAlias('');
                  }
                }}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="">Sin correo principal vinculado / Independiente</option>
                {emails.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.address} ({e.provider})
                  </option>
                ))}
                <option value="__create_email__">+ Crear nuevo correo aquí...</option>
              </select>

              {showInlineEmailCreate && (
                <div className="mt-2 p-2.5 rounded-xl bg-obsidian-bg border border-indigo-500/40 space-y-2">
                  <span className="text-[11px] font-semibold text-white block">Nuevo Correo al Vuelo:</span>
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

            {selectedParentEmail && selectedParentEmail.aliases && selectedParentEmail.aliases.length > 0 && (
              <div>
                <label className="text-obsidian-text font-medium block mb-1">Alias Específico Utilizado</label>
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

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Enlace de Inicio de Sesión</label>
              <input
                type="text"
                maxLength={INPUT_LIMITS.URL}
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="https://dashboard.servicio.com/login"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Nombre de Usuario / Identificador</label>
              <input
                type="text"
                maxLength={INPUT_LIMITS.USERNAME}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej. usuario_admin o correo"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Forma de Inicio de Sesión</label>
              <select
                value={accessType}
                onChange={(e) => setAccessType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="own_password">Contraseña propia en esta plataforma</option>
                <option value="sso">Inicio directo con el Correo Principal (Google, Apple, etc.)</option>
              </select>
            </div>
          </div>

          {/* Own password fields */}
          {accessType === 'own_password' && (
            <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white uppercase text-[10px] tracking-wider">
                  Contraseña y PIN de la Plataforma
                </span>
                <button
                  type="button"
                  onClick={openPasswordGen}
                  className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 text-[11px]"
                >
                  <Sparkles size={12} />
                  <span>Generador de Contraseñas</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-obsidian-muted block mb-1">
                    Contraseña {editingPlatformId && '(Dejar vacía para conservar actual)'}
                  </label>
                  <input
                    type="password"
                    maxLength={INPUT_LIMITS.PASSWORD}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-obsidian-muted block mb-1">PIN de Seguridad / Perfil (Opcional)</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Ej. 1234"
                    maxLength={INPUT_LIMITS.PIN}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Subscription & Billing */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <div>
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider block">
                Facturación y Suscripción
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">Estado del Plan</label>
                <select
                  value={subscriptionStatus}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setSubscriptionStatus(val);
                    if (val === 'free') setSubscriptionCost('0');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="active">Activa (Con cobro)</option>
                  <option value="free_trial">Prueba Gratuita</option>
                  <option value="free">Gratis / Sin cobro</option>
                  <option value="paused">Pausada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Costo del Plan</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    maxLength={12}
                    value={subscriptionCost}
                    onChange={(e) => setSubscriptionCost(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-full min-w-0 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as any)}
                    className="px-2 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono flex-shrink-0"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Ciclo de Cobro</label>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                  <option value="weekly">Semanal</option>
                  <option value="one_time">Pago Único</option>
                </select>
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Fecha de Inicio / Alta</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Próxima Fecha de Renovación</label>
                <input
                  type="date"
                  value={nextBillingDate}
                  onChange={(e) => setNextBillingDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              {subscriptionStatus === 'free_trial' && (
                <div>
                  <label className="text-amber-400 block mb-1">Vencimiento de Prueba Gratuita</label>
                  <input
                    type="date"
                    value={trialEndDate}
                    onChange={(e) => setTrialEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-amber-500 text-amber-300 text-xs font-mono focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-obsidian-muted block mb-1">Método de Pago Asociado</label>
                <select
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Sin método de pago vinculado</option>
                  {payments.map((pay) => (
                    <option key={pay.id} value={pay.id}>
                      {pay.alias} (*{pay.last_four})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="space-y-2">
            <label className="text-obsidian-text font-medium block">Llaves de Conexión (API) / Tokens</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                maxLength={INPUT_LIMITS.API_KEY_LABEL}
                placeholder="Etiqueta (ej. Producción, Servidor)"
                value={newApiKeyLabel}
                onChange={(e) => setNewApiKeyLabel(e.target.value)}
                className="sm:w-2/5 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs"
              />
              <input
                type="password"
                maxLength={INPUT_LIMITS.API_KEY_VALUE}
                placeholder="Valor de la llave (ej. sk-proj-...)"
                value={newApiKeyValue}
                onChange={(e) => setNewApiKeyValue(e.target.value)}
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono"
              />
              <button
                type="button"
                onClick={addApiKey}
                className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs flex-shrink-0"
              >
                Añadir Llave
              </button>
            </div>
            {apiKeys.length > 0 && (
              <div className="space-y-1 pt-1">
                {apiKeys.map((ak, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-obsidian-surface border border-obsidian-border text-xs">
                    <span className="font-medium text-white truncate">{ak.label}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-cyan-300 text-[11px]">••••••••••••••••</span>
                      <button type="button" onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== idx))} className="text-obsidian-muted hover:text-rose-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Environment Variables */}
          <div className="space-y-2">
            <label className="text-obsidian-text font-medium block">Variables de Entorno (.env) Asociadas</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                maxLength={INPUT_LIMITS.ENV_KEY}
                placeholder="CLAVE_ENV (ej. STRIPE_WEBHOOK_SECRET)"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                className="sm:w-2/5 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono"
              />
              <input
                type="password"
                maxLength={INPUT_LIMITS.ENV_VALUE}
                placeholder="Valor secreto de la variable"
                value={newEnvValue}
                onChange={(e) => setNewEnvValue(e.target.value)}
                className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono"
              />
              <button
                type="button"
                onClick={addEnvVar}
                className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs flex-shrink-0"
              >
                Añadir Variable
              </button>
            </div>
            {envVars.length > 0 && (
              <div className="space-y-1 pt-1">
                {envVars.map((ev, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-obsidian-surface border border-obsidian-border text-xs">
                    <span className="font-mono text-emerald-400 truncate">{ev.key}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono text-obsidian-muted text-[11px]">••••••••</span>
                      <button type="button" onClick={() => setEnvVars(envVars.filter((_, i) => i !== idx))} className="text-obsidian-muted hover:text-rose-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-obsidian-text font-medium block">Etiquetas de Clasificación</label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={INPUT_LIMITS.TAG_NAME}
                placeholder="Ej. Infraestructura, IA, Trabajo, Clientes..."
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
                    <button type="button" onClick={() => setTags(tags.filter((_, i) => i !== idx))} className="opacity-75 hover:opacity-100 flex-shrink-0">
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-obsidian-text font-medium block mb-1">
              Notas Privadas <span className="text-[10px] text-obsidian-muted font-mono">({notes.length}/{INPUT_LIMITS.NOTES})</span>
            </label>
            <textarea
              rows={2}
              maxLength={INPUT_LIMITS.NOTES}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre facturación, permisos, proyectos o uso de este servicio..."
              className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </form>

        <div className="pt-3 border-t border-obsidian-border flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={closePlatformModal}
            className="px-4 py-2 text-xs font-medium text-obsidian-muted hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || emails.length === 0}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : editingPlatformId ? 'Guardar Cambios' : 'Guardar Plataforma'}
          </button>
        </div>
      </div>
    </div>
  );
};
