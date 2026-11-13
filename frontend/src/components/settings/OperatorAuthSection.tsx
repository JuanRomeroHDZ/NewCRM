import React, { useEffect, useState, useCallback } from 'react';
import { UserCheck, ShieldCheck, KeyRound, LogOut, UserPlus, Users, Unlock, Copy, Check } from 'lucide-react';
import { api, getApiUserToken, setApiUserToken } from '../../lib/api';
import { CoreUser, CoreUserRole, TotpSetupResponse } from '../../types';
import { useVault } from '../../context/VaultContext';
import { INPUT_LIMITS, isValidEmail } from '../../lib/validation';

const ROLE_LABELS: Record<CoreUserRole, string> = {
  owner: 'Owner',
  business_admin: 'Business Admin',
  seller: 'Seller',
  readonly: 'Solo Lectura',
};

export const OperatorAuthSection: React.FC = () => {
  const { showToast } = useVault();

  const [currentUser, setCurrentUser] = useState<CoreUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginTotp, setLoginTotp] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

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
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<CoreUserRole>('seller');
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
  const [copiedTempPwd, setCopiedTempPwd] = useState(false);
  const [userMgmtLoading, setUserMgmtLoading] = useState(false);

  const loadUsersIfOwner = useCallback(async (user: CoreUser | null) => {
    if (!user || user.role !== 'owner') {
      setUsersList([]);
      return;
    }
    try {
      const list = await api.listUsers();
      setUsersList(list);
    } catch {
      setUsersList([]);
    }
  }, []);

  const refreshOperatorSession = useCallback(async () => {
    if (!getApiUserToken()) {
      setCurrentUser(null);
      setUsersList([]);
      return;
    }
    setLoadingSession(true);
    try {
      const me = await api.getCurrentUser();
      setCurrentUser(me);
      await loadUsersIfOwner(me);
    } catch {
      setCurrentUser(null);
      setUsersList([]);
    } finally {
      setLoadingSession(false);
    }
  }, [loadUsersIfOwner]);

  useEffect(() => {
    refreshOperatorSession();
    const handleExpired = () => {
      setCurrentUser(null);
      setUsersList([]);
    };
    window.addEventListener('core_user_session_expired', handleExpired);
    return () => window.removeEventListener('core_user_session_expired', handleExpired);
  }, [refreshOperatorSession]);

  const handleOperatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier.trim() || !loginPassword) {
      showToast('Ingresa tu usuario o correo y contraseña de operador.', 'error');
      return;
    }
    setLoginLoading(true);
    try {
      const res = await api.userLogin({
        username_or_email: loginIdentifier.trim(),
        password: loginPassword,
        ...(loginTotp.trim() ? { totp_code: loginTotp.trim() } : {}),
      });
      setApiUserToken(res.token);
      setCurrentUser(res.user);
      setLoginPassword('');
      setLoginTotp('');
      showToast(`Sesión operativa iniciada como ${res.user.full_name}.`, 'success');
      await loadUsersIfOwner(res.user);
    } catch (err: any) {
      showToast(err.message || 'No se pudo iniciar sesión operativa.', 'error');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleOperatorLogout = async () => {
    try {
      await api.userLogout();
    } catch {
      // Ignore network errors while clearing local operator token
    } finally {
      setApiUserToken(null);
      setCurrentUser(null);
      setUsersList([]);
      setTotpSetupData(null);
      setCreatedTempPassword(null);
      showToast('Sesión operativa cerrada.', 'info');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPwd || newPwd.length < 8) {
      showToast('Ingresa tu contraseña actual y una nueva de al menos 8 caracteres.', 'error');
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
      showToast('Contraseña operativa actualizada correctamente.', 'success');
      await refreshOperatorSession();
    } catch (err: any) {
      showToast(err.message || 'No se pudo cambiar la contraseña.', 'error');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleStart2FA = async () => {
    if (currentUser?.is_totp_enabled && !totpConfirmPwd) {
      showToast('Confirma tu contraseña actual para regenerar tu secreto 2FA.', 'error');
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
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(newUsername.trim())) {
      showToast('Usuario inválido: usa 3-64 caracteres alfanuméricos, ".", "_" o "-".', 'error');
      return;
    }
    if (!isValidEmail(newEmail.trim())) {
      showToast('Ingresa un correo electrónico válido.', 'error');
      return;
    }
    if (newFullName.trim().length < 2) {
      showToast('Ingresa el nombre completo del operador.', 'error');
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
      showToast(err.message || 'No se pudo crear el operador.', 'error');
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

  const copyTempPassword = () => {
    if (!createdTempPassword) return;
    navigator.clipboard.writeText(createdTempPassword);
    setCopiedTempPwd(true);
    setTimeout(() => setCopiedTempPwd(false), 2000);
  };

  return (
    <div className="bg-obsidian-panel border border-obsidian-border rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-obsidian-border">
        <div className="flex items-center gap-2">
          <UserCheck size={16} className="text-indigo-400" />
          <h3 className="text-sm font-bold text-white">Acceso de Operador y Roles (Núcleo)</h3>
        </div>
        {currentUser && (
          <button
            type="button"
            onClick={handleOperatorLogout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-obsidian-surface hover:bg-obsidian-border text-xs font-semibold text-obsidian-text transition-colors"
          >
            <LogOut size={13} />
            <span>Cerrar sesión</span>
          </button>
        )}
      </div>

      <p className="text-xs text-obsidian-muted leading-relaxed">
        Credenciales internas para operar flujos con roles (auditoría de URLs, ventas y usuarios), independientes de la clave maestra de tu bóveda.
      </p>

      {loadingSession ? (
        <div className="text-xs text-obsidian-muted">Verificando sesión de operador...</div>
      ) : !currentUser ? (
        <form onSubmit={handleOperatorLogin} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-obsidian-muted block mb-1">Usuario o correo</label>
            <input
              type="text"
              value={loginIdentifier}
              onChange={(e) => setLoginIdentifier(e.target.value)}
              maxLength={INPUT_LIMITS.EMAIL}
              placeholder="owner o correo@empresa.com"
              className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs text-obsidian-muted block mb-1">Contraseña de operador</label>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              maxLength={INPUT_LIMITS.PASSWORD}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs text-obsidian-muted block mb-1">Código 2FA (opcional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={loginTotp}
                onChange={(e) => setLoginTotp(e.target.value)}
                maxLength={16}
                placeholder="123456"
                className="w-full min-w-0 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={loginLoading}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex-shrink-0 disabled:opacity-50"
              >
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-3 border-b border-obsidian-border/70">
            <div className="space-y-0.5">
              <div className="font-semibold text-white">
                {currentUser.full_name} <span className="text-obsidian-muted font-mono">@{currentUser.username}</span>
              </div>
              <div className="text-obsidian-muted">{currentUser.email}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-semibold">
                {ROLE_LABELS[currentUser.role] || currentUser.role}
              </span>
              <span className={`px-2 py-0.5 rounded font-semibold ${currentUser.is_totp_enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                {currentUser.is_totp_enabled ? '2FA Activo' : '2FA Inactivo'}
              </span>
            </div>
          </div>

          {currentUser.must_change_password && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Por seguridad debes cambiar tu contraseña temporal de operador antes de continuar con acciones administrativas.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Password Change */}
            <form onSubmit={handleChangePassword} className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <KeyRound size={14} className="text-cyan-400" />
                <span>Cambiar contraseña de operador</span>
              </div>
              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Contraseña actual"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Nueva contraseña (mín. 8 caracteres)"
                className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
              />
              <div className="flex gap-2">
                {currentUser.is_totp_enabled && (
                  <input
                    type="text"
                    value={pwdTotp}
                    onChange={(e) => setPwdTotp(e.target.value)}
                    placeholder="Código 2FA"
                    className="w-32 px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-cyan-500"
                  />
                )}
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="px-3.5 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold disabled:opacity-50"
                >
                  {pwdLoading ? 'Actualizando...' : 'Actualizar contraseña'}
                </button>
              </div>
            </form>

            {/* 2FA Setup */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Verificación en dos pasos (2FA)</span>
              </div>
              {currentUser.is_totp_enabled && (
                <input
                  type="password"
                  value={totpConfirmPwd}
                  onChange={(e) => setTotpConfirmPwd(e.target.value)}
                  placeholder="Contraseña actual para rotar 2FA"
                  className="w-full px-3 py-2 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                />
              )}
              <button
                type="button"
                onClick={handleStart2FA}
                disabled={totpLoading}
                className="px-3.5 py-2 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-white text-xs font-semibold disabled:opacity-50"
              >
                {currentUser.is_totp_enabled ? 'Regenerar secreto 2FA' : 'Configurar 2FA'}
              </button>

              {totpSetupData && (
                <form onSubmit={handleVerify2FA} className="space-y-2 pt-1 text-xs">
                  <div className="rounded-lg bg-obsidian-bg p-2.5 space-y-1 font-mono text-[11px]">
                    <div className="text-obsidian-muted">Secreto TOTP:</div>
                    <div className="text-emerald-300 break-all select-all">{totpSetupData.secret}</div>
                    <div className="text-obsidian-muted pt-1">Códigos de respaldo (guárdalos ahora):</div>
                    <div className="text-white break-all">{totpSetupData.recovery_codes.join('  ')}</div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value)}
                      placeholder="Código de 6 dígitos"
                      maxLength={8}
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={totpLoading}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
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
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Users size={14} className="text-indigo-400" />
                <span>Administración de Usuarios ({usersList.length})</span>
              </div>

              <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="usuario"
                  maxLength={64}
                  className="px-2.5 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                  maxLength={INPUT_LIMITS.EMAIL}
                  className="px-2.5 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="Nombre completo"
                  maxLength={128}
                  className="px-2.5 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as CoreUserRole)}
                  className="px-2.5 py-1.5 rounded-lg bg-obsidian-bg border border-obsidian-border text-white text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="seller">Seller</option>
                  <option value="business_admin">Business Admin</option>
                  <option value="readonly">Solo Lectura</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  type="submit"
                  disabled={userMgmtLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <UserPlus size={13} />
                  <span>Crear usuario</span>
                </button>
              </form>

              {createdTempPassword && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
                  <span className="text-emerald-200">
                    Contraseña temporal generada (muéstrala una sola vez):{' '}
                    <code className="font-mono text-white select-all">{createdTempPassword}</code>
                  </span>
                  <button
                    type="button"
                    onClick={copyTempPassword}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/30 text-emerald-100 hover:bg-emerald-600/50"
                  >
                    {copiedTempPwd ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedTempPwd ? 'Copiada' : 'Copiar'}</span>
                  </button>
                </div>
              )}

              {usersList.length > 0 && (
                <div className="divide-y divide-obsidian-border/70 text-xs">
                  {usersList.map((u) => {
                    const isSelf = u.id === currentUser.id;
                    return (
                      <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <span className="font-semibold text-white">{u.full_name}</span>{' '}
                          <span className="text-obsidian-muted font-mono">@{u.username}</span>{' '}
                          <span className="text-obsidian-muted">({u.email})</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={u.role}
                            disabled={isSelf || userMgmtLoading}
                            onChange={(e) => handleUpdateUser(u.id, { role: e.target.value as CoreUserRole })}
                            className="px-2 py-1 rounded bg-obsidian-bg border border-obsidian-border text-white text-[11px] disabled:opacity-50"
                          >
                            <option value="owner">Owner</option>
                            <option value="business_admin">Business Admin</option>
                            <option value="seller">Seller</option>
                            <option value="readonly">Solo Lectura</option>
                          </select>
                          <button
                            type="button"
                            disabled={isSelf || userMgmtLoading}
                            onClick={() => handleUpdateUser(u.id, { is_active: !u.is_active })}
                            className={`px-2 py-1 rounded text-[11px] font-semibold disabled:opacity-50 ${
                              u.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'
                            }`}
                          >
                            {u.is_active ? 'Activo' : 'Inactivo'}
                          </button>
                          <button
                            type="button"
                            disabled={userMgmtLoading}
                            onClick={() => handleUpdateUser(u.id, { unlock: true })}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-obsidian-surface hover:bg-obsidian-border text-[11px] text-obsidian-text"
                            title="Desbloquear intentos fallidos"
                          >
                            <Unlock size={11} />
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
