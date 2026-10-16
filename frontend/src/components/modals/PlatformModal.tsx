import React, { useState, useEffect } from 'react';
import { X, Globe, Plus, Trash2, Key, Code, CreditCard, Tag, Sparkles } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';
import { EmailAccount, PaymentMethod, ApiKeyItem, EnvVarItem, TagItem } from '../../types';

export const PlatformModal: React.FC = () => {
  const { 
    isPlatformModalOpen, closePlatformModal, editingPlatformId, 
    platformModalDefaultEmailId, showToast, triggerDataReload, 
    openPasswordGen 
  } = useVault();

  const [emails, setEmails] = useState<EmailAccount[]>([]);
  const [payments, setPayments] = useState<PaymentMethod[]>([]);

  // Form fields
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

  // Subscription
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'free_trial' | 'paused' | 'cancelled' | 'free'>('active');
  const [subscriptionCost, setSubscriptionCost] = useState(0);
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly' | 'weekly' | 'daily' | 'one_time'>('monthly');
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

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPlatformModalOpen) {
      Promise.all([
        api.getEmails(),
        api.getPaymentMethods()
      ]).then(([eList, pList]) => {
        setEmails(eList);
        setPayments(pList);

        if (platformModalDefaultEmailId) {
          setEmailId(platformModalDefaultEmailId);
        } else if (eList.length > 0 && !editingPlatformId) {
          setEmailId(eList[0].id);
        }
      }).catch(console.error);

      if (editingPlatformId) {
        api.getPlatformDetail(editingPlatformId).then((p) => {
          setName(p.name);
          setEmailId(p.email_id);
          setSpecificAlias(p.specific_alias || '');
          setLoginUrl(p.login_url || '');
          setUsername(p.username || '');
          setAccessType(p.access_type);
          setPassword('');
          setPin('');
          setRecoveryCodes(p.recovery_codes_plain || '');
          setNotes(p.notes || '');
          setSubscriptionStatus(p.subscription_status);
          setSubscriptionCost(p.subscription_cost);
          setCurrency(p.currency);
          setBillingCycle(p.billing_cycle as any);
          setNextBillingDate(p.next_billing_date || '');
          setTrialEndDate(p.trial_end_date || '');
          setPaymentMethodId(p.payment_method_id || '');
          setApiKeys(p.api_keys || []);
          setEnvVars(p.env_variables || []);
          setTags(p.tags || []);
        });
      } else {
        // Reset defaults
        setName('');
        setSpecificAlias('');
        setLoginUrl('');
        setUsername('');
        setAccessType('own_password');
        setPassword('');
        setPin('');
        setRecoveryCodes('');
        setNotes('');
        setSubscriptionStatus('active');
        setSubscriptionCost(0);
        setCurrency('MXN');
        setBillingCycle('monthly');
        setNextBillingDate('');
        setTrialEndDate('');
        setPaymentMethodId('');
        setApiKeys([]);
        setEnvVars([]);
        setTags([]);
      }
    }
  }, [isPlatformModalOpen, editingPlatformId, platformModalDefaultEmailId]);

  if (!isPlatformModalOpen) return null;

  const selectedParentEmail = emails.find((e) => e.id === emailId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !emailId) {
      showToast('El nombre de la plataforma y el correo padre son obligatorios.', 'error');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        name,
        email_id: emailId,
        specific_alias: specificAlias || null,
        login_url: loginUrl || null,
        username: username || null,
        access_type: accessType,
        notes: notes || null,
        subscription_status: subscriptionStatus,
        subscription_cost: Number(subscriptionCost),
        currency,
        billing_cycle: billingCycle,
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
        showToast('Plataforma vinculada exitosamente.', 'success');
      }
      closePlatformModal();
      triggerDataReload();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const addApiKey = () => {
    if (!newApiKeyLabel.trim() || !newApiKeyValue.trim()) return;
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
    if (!newEnvKey.trim() || !newEnvValue.trim()) return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl bg-obsidian-panel border border-obsidian-borderLight rounded-2xl shadow-2xl p-6 overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-obsidian-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                {editingPlatformId ? 'Editar Plataforma / Servicio' : 'Vincular Plataforma o Servicio'}
              </h2>
              <p className="text-xs text-obsidian-muted">
                Asociar servicio al correo raíz y configurar accesos y suscripción
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePlatformModal}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs pr-1">
          {/* Platform Identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-obsidian-text font-medium block mb-1">Nombre de la Plataforma *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Netflix, GitHub, Claude, ChatGPT"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Correo Padre Obligatorio *</label>
              <select
                required
                value={emailId}
                onChange={(e) => {
                  setEmailId(e.target.value);
                  setSpecificAlias('');
                }}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                {emails.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.address} ({e.provider})
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Specific Alias selector */}
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
              <label className="text-obsidian-text font-medium block mb-1">URL Oficial de Acceso</label>
              <input
                type="url"
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="https://app.servicio.com/login"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Nombre de Usuario / Handle</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="usuario123"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-obsidian-text font-medium block mb-1">Tipo de Inicio de Sesión</label>
              <select
                value={accessType}
                onChange={(e) => setAccessType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="own_password">Contraseña Propia de la Plataforma</option>
                <option value="sso">SSO / Inicio Federado con Correo Padre (Google, GitHub, etc.)</option>
              </select>
            </div>
          </div>

          {/* Own password fields */}
          {accessType === 'own_password' && (
            <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white uppercase text-[10px] tracking-wider">
                  Credenciales de Acceso
                </span>
                <button
                  type="button"
                  onClick={openPasswordGen}
                  className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 text-[11px]"
                >
                  <Sparkles size={12} />
                  <span>Generar contraseña</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-obsidian-muted block mb-1">
                    Contraseña {editingPlatformId && '(Dejar en blanco para no cambiarla)'}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-obsidian-muted block mb-1">PIN de Acceso / Perfil (Opcional)</label>
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="1234"
                    maxLength={8}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Subscription & Billing */}
          <div className="p-4 rounded-xl bg-obsidian-surface/60 border border-obsidian-border space-y-3">
            <span className="font-semibold text-white uppercase text-[10px] tracking-wider block">
              Módulo de Suscripción & Pagos
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-obsidian-muted block mb-1">Estado</label>
                <select
                  value={subscriptionStatus}
                  onChange={(e) => setSubscriptionStatus(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="active">Activa (De pago)</option>
                  <option value="free_trial">Prueba Gratuita (Free Trial)</option>
                  <option value="free">Gratis / Sin cobro</option>
                  <option value="paused">Pausada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Costo Numérico</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="0.01"
                    value={subscriptionCost}
                    onChange={(e) => setSubscriptionCost(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as any)}
                    className="px-2 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono"
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-obsidian-muted block mb-1">Periodicidad</label>
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
                  <label className="text-obsidian-muted block mb-1 text-amber-400">Fin de Prueba Gratuita</label>
                  <input
                    type="date"
                    value={trialEndDate}
                    onChange={(e) => setTrialEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-amber-500 text-amber-300 text-xs font-mono focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-obsidian-muted block mb-1">Tarjeta Vinculada</label>
                <select
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Sin tarjeta vinculada</option>
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
            <label className="text-obsidian-text font-medium block">Llaves API Múltiples</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Etiqueta (ej. Producción)"
                value={newApiKeyLabel}
                onChange={(e) => setNewApiKeyLabel(e.target.value)}
                className="w-1/3 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs"
              />
              <input
                type="password"
                placeholder="sk-proj-..."
                value={newApiKeyValue}
                onChange={(e) => setNewApiKeyValue(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono"
              />
              <button
                type="button"
                onClick={addApiKey}
                className="px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border text-white border border-obsidian-border text-xs"
              >
                Añadir Key
              </button>
            </div>
            <div className="space-y-1 pt-1">
              {apiKeys.map((ak, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-obsidian-surface border border-obsidian-border text-xs">
                  <span className="font-medium text-white">{ak.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-cyan-300 text-[11px]">••••••••••••••••</span>
                    <button type="button" onClick={() => setApiKeys(apiKeys.filter((_, i) => i !== idx))} className="text-obsidian-muted hover:text-rose-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-obsidian-text font-medium block">Etiquetas (Tags)</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="IA, Streaming, Cloud, Trabajo..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
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
                  <button type="button" onClick={() => setTags(tags.filter((_, i) => i !== idx))} className="opacity-75 hover:opacity-100">
                    &times;
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-obsidian-text font-medium block mb-1">Notas Enriquecidas</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles de facturación, miembros del equipo o enlaces de interés..."
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
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20"
          >
            {loading ? 'Guardando...' : editingPlatformId ? 'Actualizar Plataforma' : 'Vincular Plataforma'}
          </button>
        </div>
      </div>
    </div>
  );
};
