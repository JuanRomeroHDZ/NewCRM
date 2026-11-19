import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  UserCheck, ShieldCheck, KeyRound, LogOut, UserPlus, Users, Unlock,
  Copy, Check, Search, AlertTriangle, RefreshCw, X, Eye, EyeOff
} from 'lucide-react';
import { api, getApiUserToken, setApiUserToken, useBrowserAccountSession } from '../../lib/api';
import { CoreUser, CoreUserRole, TotpSetupResponse } from '../../types';
import { useVault } from '../../context/VaultContext';
import { INPUT_LIMITS, isAccountPasswordStrong, isValidEmail } from '../../lib/validation';

const ROLE_LABELS: Record<CoreUserRole, string> = {
  owner: 'Propietario',
  business_admin: 'Administrador',
  operator: 'Operador',
  seller: 'Ventas',
  readonly: 'Solo Lectura',
};

export const OperatorAuthSection: React.FC = () => {
  const { showToast, isUnlocked } = useVault();

  const [currentUser, setCurrentUser] = useState<CoreUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTotp, setLoginTotp] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showPwdChangePwd, setShowPwdChangePwd] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [bootstrapStatusError, setBootstrapStatusError] = useState('');
  const [bootstrapChecking, setBootstrapChecking] = useState(false);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [showBootstrapForm, setShowBootstrapForm] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapUsername, setBootstrapUsername] = useState('');
  const [bootstrapEmail, setBootstrapEmail] = useState('');
  const [bootstrapFullName, setBootstrapFullName] = useState('');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [bootstrapPasswordConfirm, setBootstrapPasswordConfirm] = useState('');

  // Password change state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdTotp, setPwdTotp] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);

  // 2FA setup state
  const [totpConfirmPwd, setTotpConfirmPwd] = useState('');
  const [totpSetupData, setTotpSetupData] = useState<TotpSetupResponse | null>(null);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);

  // Owner user management state
  const [usersList, setUsersList] = useState<CoreUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<CoreUserRole>('seller');
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
  const [copiedTempPwd, setCopiedTempPwd] = useState(false);
  const [userMgmtLoading, setUserMgmtLoading] = useState(false);

  const loadUsersIfOwner = useCallback(async (user: CoreUser | null) => {
    if (!user || user.role !== 'owner' || user.must_change_password) {
      setUsersList([]);
      setUsersError(null);
      setUsersLoading(false);
      return;
    }
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await api.listUsers();
      setUsersList(list);
    } catch (err: any) {
      setUsersList([]);
      setUsersError(err?.message || 'No se pudo cargar la lista de operadores.');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const refreshOperatorSession = useCallback(async () => {
    if (!getApiUserToken()) {
      setCurrentUser(null);
      setUsersList([]);
      setSessionError(null);
      return;
    }
    setLoadingSession(true);
    setSessionError(null);
    try {
      const me = await api.getCurrentUser();
      setCurrentUser(me);
      await loadUsersIfOwner(me);
    } catch (err: any) {
      setCurrentUser(null);
      setUsersList([]);
      setSessionError(err?.message || 'No se pudo verificar la sesión de operador.');
    } finally {
      setLoadingSession(false);
    }
  }, [loadUsersIfOwner]);

  useEffect(() => {
    refreshOperatorSession();
    const handleExpired = () => {
      setCurrentUser(null);
      setUsersList([]);
      setSessionError(null);
    };
    window.addEventListener('core_user_session_expired', handleExpired);
    return () => window.removeEventListener('core_user_session_expired', handleExpired);
  }, [refreshOperatorSession]);

  useEffect(() => {
    if (!isUnlocked || loadingSession) {
      setBootstrapAvailable(false);
      setBootstrapChecking(false);
      setBootstrapStatusError('');
      setShowBootstrapForm(false);
      if (!isUnlocked) {
        setBootstrapPassword('');
        setBootstrapPasswordConfirm('');
      }
      return;
    }
    let active = true;
    setBootstrapChecking(true);
    setBootstrapStatusError('');
    api.getBootstrapStatus()
      .then(({ available }) => {
        if (active) setBootstrapAvailable(available);
      })
      .catch(() => {
        if (active) { setBootstrapAvailable(false); setBootstrapStatusError('No se pudo comprobar si ya existe una cuenta de propietario.'); }
      })
      .finally(() => { if (active) setBootstrapChecking(false); });
    return () => {
      active = false;
    };
  }, [isUnlocked, currentUser, loadingSession, bootstrapAttempt]);

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) {
      const msg = 'Ingresa tu usuario o correo y tu contraseña.';
      setLoginError(msg);
      showToast(msg, 'error');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await api.userLogin({
        username_or_email: loginIdentifier.trim(),
        password: loginPassword,
        ...(loginTotp.trim() ? { totp_code: loginTotp.trim() } : {}),
      });
      useBrowserAccountSession(res.token);
      setCurrentUser(res.user);
      setSessionError(null);
      setLoginError(null);
      setLoginPassword('');
      setLoginTotp('');
      showToast(`Sesión iniciada como ${res.user.full_name}.`, 'success');
      await loadUsersIfOwner(res.user);
    } catch (err: any) {
      const msg = err.message || 'No se pudo iniciar sesión operativa.';
      setLoginError(msg);
      showToast(msg, 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleBootstrapAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setBootstrapError(null);
    if (!/^[a-zA-Z0-9._-]{12,64}$/.test(bootstrapUsername.trim()) || !/[._-]/.test(bootstrapUsername)) {
      setBootstrapError('Usa de 12 a 64 caracteres para el usuario, con al menos un punto, guion o guion bajo.');
      return;
    }
    if (!isValidEmail(bootstrapEmail.trim())) {
      setBootstrapError('Ingresa un correo electrónico válido.');
      return;
    }
    if (bootstrapFullName.trim().length < 2) {
      setBootstrapError('Ingresa tu nombre completo.');
      return;
    }
    if (!isAccountPasswordStrong(bootstrapPassword) || bootstrapPassword.length > INPUT_LIMITS.PASSWORD) {
      setBootstrapError('Usa al menos 15 caracteres e incluye un símbolo.');
      return;
    }
    if (bootstrapPassword !== bootstrapPasswordConfirm) {
      setBootstrapError('Las contraseñas no coinciden.');
      return;
    }

    setBootstrapLoading(true);
    try {
      const response = await api.bootstrapAccount({
        username: bootstrapUsername.trim(),
        email: bootstrapEmail.trim(),
        full_name: bootstrapFullName.trim(),
        password: bootstrapPassword,
      });
      useBrowserAccountSession(response.token);
      setCurrentUser(response.user);
      setBootstrapPassword('');
      setBootstrapPasswordConfirm('');
      setBootstrapAvailable(false);
      setShowBootstrapForm(false);
      showToast(`Cuenta creada. Cambia la contraseña provisional para continuar, ${response.user.full_name}.`, 'success');
      await loadUsersIfOwner(response.user);
    } catch (err: any) {
      setBootstrapError(err.message || 'No se pudo crear la cuenta inicial.');
    } finally {
      setBootstrapLoading(false);
    }
  };

  const handleOperatorLogout = async () => {
    try {
      await api.userLogout();
    } catch {
      showToast('No se pudo cerrar la sesión en el servidor. Vuelve a intentarlo.', 'error');
      return;
    }
    setApiUserToken(null);
    setCurrentUser(null);
    setUsersList([]);
    setUsersError(null);
    setSessionError(null);
    setTotpSetupData(null);
    setCreatedTempPassword(null);
    showToast('Sesión operativa cerrada.', 'info');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPwd || !isAccountPasswordStrong(newPwd)) {
      showToast('Ingresa tu contraseña actual y una nueva de al menos 15 caracteres con un símbolo.', 'error');
      return;
    }
    setPwdLoading(true);
    try {
      await api.changeUserPassword({
        current_password: currentPwd,
        new_password: newPwd,
        ...(pwdTotp.trim() ? { totp_code: pwdTotp.trim() } : {}),
      });
      setCurrentPwd('');
      setNewPwd('');
      setPwdTotp('');
      showToast('Contraseña actualizada correctamente.', 'success');
      await refreshOperatorSession();
      window.dispatchEvent(new Event('lessso-user-session-changed'));
    } catch (err: any) {
      showToast(err.message || 'No se pudo cambiar la contraseña.', 'error');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleStart2FA = async () => {
    if (!totpConfirmPwd) {
      showToast('Confirma tu contraseña actual para configurar 2FA.', 'error');
      return;
    }
    setTotpLoading(true);
    try {
      const setup = await api.setup2FA(totpConfirmPwd || undefined);
      setTotpSetupData(setup);
      setTotpConfirmPwd('');
      showToast('Secreto 2FA generado. Verifica un código para activarlo.', 'info');
    } catch (err: any) {
      showToast(err.message || 'No se pudo iniciar la configuración 2FA.', 'error');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6,8}$/.test(totpVerifyCode.trim())) {
      showToast('Ingresa el código numérico de 6 a 8 dígitos de tu app autenticadora.', 'error');
      return;
    }
    setTotpLoading(true);
    try {
      await api.verify2FA(totpVerifyCode.trim());
      setTotpVerifyCode('');
      setTotpSetupData(null);
      showToast('Autenticación en dos pasos (2FA) activada.', 'success');
      await refreshOperatorSession();
    } catch (err: any) {
      showToast(err.message || 'Código 2FA inválido.', 'error');
    } finally {
      setTotpLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateUserError(null);
    if (!currentUser || currentUser.must_change_password || currentUser.role !== 'owner') {
      setCreateUserError('Cambia tu contraseña temporal antes de administrar cuentas.');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(newUsername.trim())) {
      setCreateUserError('Usuario inválido: usa 3-64 caracteres alfanuméricos, ".", "_" o "-".');
      return;
    }
    if (!isValidEmail(newEmail.trim())) {
      setCreateUserError('Ingresa un correo electrónico válido.');
      return;
    }
    if (newFullName.trim().length < 2) {
      setCreateUserError('Ingresa el nombre completo del operador.');
      return;
    }
    setUserMgmtLoading(true);
    try {
      const created = await api.createUser({
        username: newUsername.trim(),
        email: newEmail.trim(),
        full_name: newFullName.trim(),
        role: newRole,
      });
      setCreatedTempPassword(created.temporary_password);
      setCopiedTempPwd(false);
      setNewUsername('');
      setNewEmail('');
      setNewFullName('');
      showToast(`Operador "${created.username}" creado.`, 'success');
      await loadUsersIfOwner(currentUser);
    } catch (err: any) {
      setCreateUserError(err.message || 'No se pudo crear el operador.');
    } finally {
      setUserMgmtLoading(false);
    }
  };

  const handleUpdateUser = async (
    userId: string,
    payload: { role?: CoreUserRole; is_active?: boolean; unlock?: boolean }
  ) => {
    setUserMgmtLoading(true);
    try {
      await api.updateUser(userId, payload);
      showToast('Permisos de operador actualizados.', 'success');
      await loadUsersIfOwner(currentUser);
    } catch (err: any) {
      showToast(err.message || 'No se pudo actualizar el operador.', 'error');
    } finally {
      setUserMgmtLoading(false);
    }
  };

  const copyTempPassword = async () => {
    if (!createdTempPassword) return;
    try {
      await navigator.clipboard.writeText(createdTempPassword);
      setCopiedTempPwd(true);
      showToast('Contraseña temporal copiada al portapapeles.', 'success');
      window.setTimeout(() => setCopiedTempPwd(false), 2000);
    } catch {
      showToast('No se pudo copiar al portapapeles. Cópiala manualmente.', 'error');
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return usersList;
    return usersList.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
    );
  }, [usersList, userSearch]);

  return (
    <div className="bg-obsidian-panel border border-obsidian-border rounded-xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-obsidian-border">
        <div className="flex items-center gap-2">
          <UserCheck size={18} className="text-obsidian-muted" aria-hidden="true" />
          <h3 className="text-sm font-bold text-white">Cuentas del equipo</h3>
        </div>
        {/* [Acción secundaria] Cerrar la sesión del operador actual. */}
        {currentUser && (
          <button
            type="button"
            onClick={handleOperatorLogout}
            className="ui-action-secondary"
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Cerrar sesión</span>
          </button>
        )}
      </div>

      <p className="text-xs text-obsidian-muted leading-relaxed">
        La contraseña de la bóveda desbloquea los datos cifrados. La cuenta del equipo tiene otra contraseña y determina tus permisos, incluido el acceso de propietario a Red y Lab.
      </p>

      <div aria-label="Pasos de acceso" className="border-t border-obsidian-border pt-3 text-xs leading-relaxed text-obsidian-muted">
        <p className="font-semibold text-white">Pasos para comenzar</p>
        <ol className="mt-2 list-inside list-decimal space-y-1">
          <li>Bóveda: {isUnlocked ? 'desbloqueada' : 'crea o desbloquea la bóveda con su contraseña'}.</li>
          <li>Cuenta: {loadingSession ? 'comprobando sesión' : currentUser ? `sesión iniciada como ${currentUser.username} (${ROLE_LABELS[currentUser.role] || currentUser.role})` : bootstrapChecking ? 'comprobando si puedes crear el propietario' : bootstrapStatusError ? 'estado de propietario no disponible' : bootstrapAvailable ? 'crea la cuenta de propietario más abajo' : 'inicia sesión con tu cuenta'}.</li>
          <li>Contraseña de cuenta: {currentUser?.must_change_password ? 'cambia la contraseña temporal para continuar' : currentUser ? 'lista para usar' : 'cámbiala al iniciar sesión si es provisional'}.</li>
        </ol>
        {currentUser && currentUser.role !== 'owner' && <p className="mt-2">Red y Lab requiere una cuenta de propietario. Pide acceso al propietario de esta instalación.</p>}
      </div>
      {bootstrapStatusError && isUnlocked && !currentUser && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-obsidian-border p-3 text-xs text-obsidian-text">
          <span>{bootstrapStatusError}</span>
          <button type="button" onClick={() => setBootstrapAttempt((value) => value + 1)} className="ui-action-secondary">Reintentar</button>
        </div>
      )}

      {sessionError && !loadingSession && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-obsidian-border p-3 text-xs text-obsidian-text">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" aria-hidden="true" />
            <span className="break-words">{sessionError}</span>
          </div>
          <button
            type="button"
            onClick={refreshOperatorSession}
            className="ui-action-secondary"
          >
            <RefreshCw size={16} aria-hidden="true" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {loadingSession ? (
        <div className="text-xs text-obsidian-muted" role="status">
          Verificando tu sesión...
        </div>
      ) : !currentUser ? (
        <>
        {loginError && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-obsidian-border p-3 text-xs text-obsidian-text">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" aria-hidden="true" />
            <span className="break-words">{loginError}</span>
          </div>
        )}
        <form onSubmit={handleOperatorLogin} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="op-login-identifier" className="text-xs text-obsidian-muted block mb-1">
              Usuario o correo
            </label>
            <input
              id="op-login-identifier"
              type="text"
              autoComplete="username"
              value={loginIdentifier}
              onChange={(e) => {
                setLoginIdentifier(e.target.value);
                if (loginError) setLoginError(null);
              }}
              maxLength={INPUT_LIMITS.EMAIL}
              placeholder="Tu usuario o correo"
              className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-obsidian-accent"
            />
          </div>
          <div>
            <label htmlFor="op-login-password" className="text-xs text-obsidian-muted block mb-1">
              Contraseña
            </label>
            <div className="relative flex items-center">
              <input
                id="op-login-password"
                type={showLoginPwd ? 'text' : 'password'}
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => {
                  setLoginPassword(e.target.value);
                  if (loginError) setLoginError(null);
                }}
                maxLength={INPUT_LIMITS.PASSWORD}
                placeholder="••••••••••••"
                className="w-full min-h-[44px] pl-3 pr-11 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
              />
              <button
                type="button"
                onClick={() => setShowLoginPwd((v) => !v)}
                aria-label={showLoginPwd ? 'Ocultar contraseña de operador' : 'Mostrar contraseña de operador'}
                aria-pressed={showLoginPwd}
                className="ui-action-toggle absolute right-0.5"
              >
                {showLoginPwd ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="op-login-totp" className="text-xs text-obsidian-muted block mb-1">
              Código de verificación (opcional)
            </label>
            <div className="flex gap-2">
              <input
                id="op-login-totp"
                type="text"
                autoComplete="one-time-code"
                value={loginTotp}
                onChange={(e) => setLoginTotp(e.target.value)}
                maxLength={32}
                placeholder="123456"
                className="w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
              />
              {/* [Acción principal] Iniciar sesión con los datos ingresados. */}
              <button
                type="submit"
                disabled={loginLoading}
                className="ui-action-primary shrink-0"
              >
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </div>
        </form>
        {isUnlocked && !loadingSession && !currentUser && bootstrapAvailable && (
          <section className="space-y-3 border-t border-obsidian-border pt-3" aria-labelledby="initial-account-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 id="initial-account-heading" className="text-xs font-semibold text-white">Crear cuenta administradora</h4>
                <p className="mt-1 max-w-prose text-[11px] leading-relaxed text-obsidian-muted">
                  Crea la cuenta de propietario. Al iniciar sesión deberás cambiar la contraseña provisional.
                </p>
              </div>
              {/* [Acción secundaria] Abrir o cerrar el formulario de cuenta inicial. */}
              <button
                type="button"
                aria-expanded={showBootstrapForm}
                aria-controls="initial-account-form"
                onClick={() => {
                  if (showBootstrapForm) {
                    setBootstrapPassword('');
                    setBootstrapPasswordConfirm('');
                    setBootstrapError(null);
                  }
                  setShowBootstrapForm((open) => !open);
                }}
                className="ui-action-secondary"
              >
                {showBootstrapForm ? 'Cerrar' : 'Crear cuenta'}
              </button>
            </div>
            {showBootstrapForm && (
              <form id="initial-account-form" onSubmit={handleBootstrapAccount} className="grid min-w-0 gap-3 sm:grid-cols-2">
                <label className="min-w-0 text-xs text-obsidian-muted">
                  Usuario
                  <input
                    required
                    autoComplete="username"
                    minLength={12}
                    maxLength={64}
                    value={bootstrapUsername}
                    onChange={(event) => setBootstrapUsername(event.target.value)}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 text-xs text-white focus:border-obsidian-accent focus:outline-none"
                  />
                </label>
                <label className="min-w-0 text-xs text-obsidian-muted">
                  Nombre completo
                  <input
                    required
                    autoComplete="name"
                    minLength={2}
                    maxLength={128}
                    value={bootstrapFullName}
                    onChange={(event) => setBootstrapFullName(event.target.value)}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 text-xs text-white focus:border-obsidian-accent focus:outline-none"
                  />
                </label>
                <label className="min-w-0 text-xs text-obsidian-muted sm:col-span-2">
                  Correo electrónico
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    maxLength={INPUT_LIMITS.EMAIL}
                    value={bootstrapEmail}
                    onChange={(event) => setBootstrapEmail(event.target.value)}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 text-xs text-white focus:border-obsidian-accent focus:outline-none"
                  />
                </label>
                <label className="min-w-0 text-xs text-obsidian-muted">
                  Contraseña
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={INPUT_LIMITS.PASSWORD}
                    value={bootstrapPassword}
                    onChange={(event) => setBootstrapPassword(event.target.value)}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 text-xs text-white focus:border-obsidian-accent focus:outline-none"
                  />
                </label>
                <label className="min-w-0 text-xs text-obsidian-muted">
                  Confirmar contraseña
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={INPUT_LIMITS.PASSWORD}
                    value={bootstrapPasswordConfirm}
                    onChange={(event) => setBootstrapPasswordConfirm(event.target.value)}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-3 text-xs text-white focus:border-obsidian-accent focus:outline-none"
                  />
                </label>
                <p className="text-[11px] leading-relaxed text-obsidian-muted sm:col-span-2">
                  Esta cuenta se crea una sola vez. Para añadir más personas después, se requiere una cuenta autorizada.
                </p>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="button" className="ui-action-secondary" onClick={() => {
                    const password = crypto.randomUUID().replace(/-/g, '').slice(0, 22) + '!';
                    setBootstrapPassword(password);
                    setBootstrapPasswordConfirm(password);
                  }}>Generar contraseña temporal</button>
                  <button type="button" className="ui-action-secondary" disabled={!bootstrapPassword}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(bootstrapPassword);
                        showToast('Contraseña temporal copiada.', 'success');
                      } catch {
                        showToast('No se pudo copiar al portapapeles.', 'error');
                      }
                    }}>
                    <Copy size={16} aria-hidden="true" /> Copiar
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-obsidian-muted sm:col-span-2">
                  Guarda la contraseña temporal para confirmar el cambio obligatorio. Puedes generar una o escribir la tuya.
                </p>
                {bootstrapError && <p role="alert" className="text-xs text-rose-300 sm:col-span-2">{bootstrapError}</p>}
                {/* [Acción principal] Crear la cuenta inicial al terminar el formulario. */}
                <button
                  type="submit"
                  disabled={bootstrapLoading}
                  className="ui-action-primary sm:col-span-2"
                >
                  {bootstrapLoading ? 'Creando cuenta…' : 'Crear cuenta administradora'}
                </button>
              </form>
            )}
          </section>
        )}
        </>
      ) : (
        <div className="space-y-4">
          {bootstrapAvailable && (
            <p role="status" className="rounded-lg border border-obsidian-border p-3 text-xs text-amber-200">
              Para crear la cuenta administradora inicial, cierra esta sesión y selecciona Crear cuenta.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-3 border-b border-obsidian-border/70">
            <div className="space-y-0.5 min-w-0">
              <div className="font-semibold text-white break-words">
                {currentUser.full_name} <span className="text-obsidian-muted font-mono">@{currentUser.username}</span>
              </div>
              <div className="text-obsidian-muted break-all">{currentUser.email}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-obsidian-surface text-obsidian-muted font-semibold">
                {ROLE_LABELS[currentUser.role] || currentUser.role}
              </span>
              <span className={`rounded border px-2 py-0.5 font-semibold ${currentUser.is_totp_enabled ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'border-amber-500/30 bg-amber-500/15 text-amber-300'}`}>
                {currentUser.is_totp_enabled ? 'Verificación en dos pasos activa' : 'Verificación en dos pasos inactiva'}
              </span>
            </div>
          </div>

          {currentUser.must_change_password && (
            <div className="rounded-lg border border-obsidian-border p-3 text-xs text-amber-200">
              Por seguridad, cambia tu contraseña temporal antes de continuar.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Password Change */}
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <KeyRound size={16} className="text-obsidian-muted" aria-hidden="true" />
                <span>Cambiar contraseña</span>
              </div>
              <div>
                <label htmlFor="op-pwd-current" className="sr-only">
                  Contraseña actual
                </label>
                <div className="relative flex items-center">
                  <input
                    id="op-pwd-current"
                    type={showPwdChangePwd ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    maxLength={INPUT_LIMITS.PASSWORD}
                    placeholder="Contraseña actual"
                    className="w-full min-h-[44px] pl-3 pr-11 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwdChangePwd((v) => !v)}
                    aria-label={showPwdChangePwd ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                    aria-pressed={showPwdChangePwd}
                    className="ui-action-toggle absolute right-0.5"
                  >
                    {showPwdChangePwd ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="op-pwd-new" className="sr-only">
                  Nueva contraseña
                </label>
                <input
                  id="op-pwd-new"
                  type={showPwdChangePwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  maxLength={INPUT_LIMITS.PASSWORD}
                  placeholder="Nueva contraseña (mín. 15 caracteres y un símbolo)"
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
                />
              </div>
              <div className="flex gap-2">
                {currentUser.is_totp_enabled && (
                  <>
                    <label htmlFor="op-pwd-totp" className="sr-only">
                      Código 2FA para cambio de contraseña
                    </label>
                    <input
                      id="op-pwd-totp"
                      type="text"
                      inputMode="numeric"
                      value={pwdTotp}
                      onChange={(e) => setPwdTotp(e.target.value)}
                      maxLength={8}
                      placeholder="Código 2FA"
                      className="w-32 min-h-[44px] px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
                    />
                  </>
                )}
                {/* [Acción principal] Aplicar el cambio de contraseña. */}
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="ui-action-primary"
                >
                  {pwdLoading ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </div>
            </form>

            {/* 2FA Setup */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <ShieldCheck size={16} className="text-obsidian-muted" aria-hidden="true" />
                <span>Verificación en dos pasos (2FA)</span>
              </div>
              {!currentUser.must_change_password && (
                <div>
                  <label htmlFor="op-totp-confirm-pwd" className="sr-only">
                    Contraseña actual para configurar 2FA
                  </label>
                  <input
                    id="op-totp-confirm-pwd"
                    type="password"
                    autoComplete="current-password"
                    value={totpConfirmPwd}
                    onChange={(e) => setTotpConfirmPwd(e.target.value)}
                    maxLength={INPUT_LIMITS.PASSWORD}
                    placeholder="Contraseña actual para configurar 2FA"
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
                  />
                </div>
              )}
              {/* [Acción secundaria] Preparar la configuración de dos pasos. */}
              <button
                type="button"
                onClick={handleStart2FA}
                disabled={totpLoading || currentUser.must_change_password || !totpConfirmPwd}
                className="ui-action-secondary"
              >
                {currentUser.is_totp_enabled ? 'Regenerar secreto 2FA' : 'Configurar 2FA'}
              </button>

              {totpSetupData && (
                <form onSubmit={handleVerify2FA} className="space-y-2 pt-1 text-xs">
                  <div className="border-y border-obsidian-border py-3 space-y-1 font-mono text-[11px]">
                    <div className="text-obsidian-muted">Secreto TOTP:</div>
                    <div className="text-obsidian-muted break-all select-all">{totpSetupData.secret}</div>
                    <div className="text-obsidian-muted pt-1">Códigos de respaldo (guárdalos ahora):</div>
                    <div className="text-white break-all">{totpSetupData.recovery_codes.join('  ')}</div>
                  </div>
                  <div className="flex gap-2">
                    <label htmlFor="op-totp-verify-code" className="sr-only">
                      Código de verificación 2FA de 6 dígitos
                    </label>
                    <input
                      id="op-totp-verify-code"
                      type="text"
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value)}
                      placeholder="Código de 6 dígitos"
                      maxLength={8}
                      className="flex-1 min-w-0 min-h-11 px-3 py-2 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
                    />
                    {/* [Acción principal] Confirmar y activar la verificación. */}
                    <button
                      type="submit"
                      disabled={totpLoading}
                      className="ui-action-primary"
                    >
                      Activar
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Owner User Management */}
          {currentUser.role === 'owner' && (
            <div className="pt-3 border-t border-obsidian-border space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Users size={16} className="text-obsidian-muted" aria-hidden="true" />
                  <span>Cuentas del equipo ({usersList.length})</span>
                </div>
                {usersList.length > 0 && (
                  <div className="relative w-full sm:w-56">
                    <Search size={16} className="absolute left-2.5 top-2 text-obsidian-muted" aria-hidden="true" />
                    <input
                      id="op-user-search"
                      type="text"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      maxLength={INPUT_LIMITS.SEARCH}
                      aria-label="Buscar cuenta por nombre, usuario o correo"
                      placeholder="Buscar cuentas..."
                      className="w-full min-h-11 pl-8 pr-12 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-obsidian-accent"
                    />
                    {userSearch && (
                      <button
                        type="button"
                        onClick={() => setUserSearch('')}
                        aria-label="Limpiar búsqueda de cuentas"
                        className="ui-action-icon absolute right-1 top-1/2 -translate-y-1/2"
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {currentUser.must_change_password && (
                <p role="status" className="text-xs text-amber-200">
                  Cambia primero la contraseña temporal para administrar cuentas del equipo.
                </p>
              )}

              <fieldset disabled={currentUser.must_change_password} className="min-w-0 border-0 p-0 m-0 disabled:opacity-50">
                <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <div>
                  <label htmlFor="op-new-username" className="sr-only">Nombre de usuario</label>
                  <input
                    id="op-new-username"
                    required
                    minLength={3}
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="usuario"
                    maxLength={64}
                    className="w-full min-h-11 px-3 py-2 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-obsidian-accent"
                  />
                </div>
                <div>
                  <label htmlFor="op-new-email" className="sr-only">Correo electrónico</label>
                  <input
                    id="op-new-email"
                    required
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="correo@empresa.com"
                    maxLength={INPUT_LIMITS.EMAIL}
                    className="w-full min-h-11 px-3 py-2 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-obsidian-accent"
                  />
                </div>
                <div>
                  <label htmlFor="op-new-fullname" className="sr-only">Nombre completo</label>
                  <input
                    id="op-new-fullname"
                    required
                    minLength={2}
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="Nombre completo"
                    maxLength={128}
                    className="w-full min-h-11 px-3 py-2 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-obsidian-accent"
                  />
                </div>
                <div>
                  <label htmlFor="op-new-role" className="sr-only">Permisos de la cuenta</label>
                  <select
                    id="op-new-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as CoreUserRole)}
                    className="w-full min-h-11 px-3 py-2 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-obsidian-accent"
                  >
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <option key={role} value={role}>{label}</option>
                    ))}
                  </select>
                </div>
                {/* [Acción principal] Crear una cuenta con los permisos elegidos. */}
                <button
                  type="submit"
                  disabled={userMgmtLoading}
                  className="ui-action-primary sm:col-span-2 lg:col-span-1"
                >
                  <UserPlus size={16} aria-hidden="true" />
                  <span>Crear cuenta</span>
                </button>
                </form>
              </fieldset>

              {createUserError && <p role="alert" className="text-xs text-rose-300">{createUserError}</p>}

              {createdTempPassword && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-obsidian-border p-3 text-xs">
                  <span className="text-obsidian-text break-words">
                    Contraseña temporal generada (muéstrala una sola vez):{' '}
                    <code className="font-mono text-white select-all break-all">{createdTempPassword}</code>
                  </span>
                  <button
                    type="button"
                    onClick={copyTempPassword}
                    className="ui-action-secondary"
                  >
                    {copiedTempPwd ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                    <span>{copiedTempPwd ? 'Copiada' : 'Copiar'}</span>
                  </button>
                </div>
              )}

              {usersError ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-obsidian-border p-3 text-xs text-obsidian-text">
                  <span>{usersError}</span>
                  <button
                    type="button"
                    onClick={() => loadUsersIfOwner(currentUser)}
                    className="ui-action-secondary"
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                    <span>Reintentar</span>
                  </button>
                </div>
              ) : usersLoading && usersList.length === 0 ? (
                <div className="text-xs text-obsidian-muted py-2" role="status">
                  Cargando operadores...
                </div>
              ) : usersList.length === 0 ? (
                <div className="py-3 text-xs text-obsidian-muted text-center">
                  No hay operadores adicionales registrados todavía.
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-3 text-xs text-obsidian-muted text-center space-y-2">
                  <div>Sin operadores que coincidan con "{userSearch}".</div>
                  <button
                    type="button"
                    onClick={() => setUserSearch('')}
                    className="ui-action-secondary"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-obsidian-border/70 text-xs">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div className="min-w-0">
                          <span className="font-semibold text-white">{u.full_name}</span>{' '}
                          <span className="text-obsidian-muted font-mono">@{u.username}</span>{' '}
                          <span className="text-obsidian-muted break-all">({u.email})</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={u.role}
                            aria-label={`Rol de ${u.username}`}
                            disabled={isSelf || userMgmtLoading}
                            onChange={(e) => handleUpdateUser(u.id, { role: e.target.value as CoreUserRole })}
                            className="min-h-[44px] px-3 py-2 rounded bg-obsidian-bg border border-obsidian-border text-white text-[11px] disabled:opacity-50"
                          >
                            {Object.entries(ROLE_LABELS).map(([role, label]) => (
                              <option key={role} value={role}>{label}</option>
                            ))}
                          </select>
                          {/* [Estado seleccionable] Cambia si la cuenta puede iniciar sesión. */}
                          <button
                            type="button"
                            disabled={isSelf || userMgmtLoading}
                            onClick={() => handleUpdateUser(u.id, { is_active: !u.is_active })}
                            aria-pressed={u.is_active}
                            aria-label={`${u.is_active ? 'Desactivar' : 'Activar'} la cuenta de ${u.username}`}
                            className="ui-action-toggle"
                          >
                            {u.is_active ? 'Activo' : 'Inactivo'}
                          </button>
                          <button
                            type="button"
                            disabled={userMgmtLoading}
                            onClick={() => handleUpdateUser(u.id, { unlock: true })}
                            className="ui-action-secondary"
                            title="Desbloquear intentos fallidos"
                          >
                            <Unlock size={16} aria-hidden="true" />
                            <span>Desbloquear</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
