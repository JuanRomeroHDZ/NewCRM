import { useState } from 'react';
import { Lock, RotateCcw, Unlock } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

export function SidebarVaultFooter() {
  const { isUnlocked, remainingSeconds, lockVault, openUnlockModal, recordVaultActivity, showToast } = useVault();
  const [resettingTimer, setResettingTimer] = useState(false);
  const totalSeconds = Math.max(0, Math.floor(remainingSeconds));
  const time = ([
    ['Horas', Math.floor(totalSeconds / 3600)],
    ['Minutos', Math.floor((totalSeconds % 3600) / 60)],
    ['Segundos', totalSeconds % 60],
  ] as const).map(([label, value]) => ({ label, value: String(value).padStart(2, '0') }));
  const status = isUnlocked ? 'Bóveda activa' : 'Bóveda bloqueada';

  async function resetTimer() {
    if (!isUnlocked || resettingTimer) return;
    setResettingTimer(true);
    try {
      const result = await recordVaultActivity();
      if (result.account_active === false) {
        showToast('La cuenta ya no está activa. Revisa tu sesión.', 'warning');
      } else {
        showToast('Temporizador de la bóveda reiniciado.', 'success');
      }
    } catch {
      showToast('No se pudo reiniciar el temporizador. La bóveda permanece abierta.', 'error');
    } finally {
      setResettingTimer(false);
    }
  }

  return (
    <footer className="shrink-0 border-t border-obsidian-border px-3 pb-3 pt-2">
      <div className="flex min-w-0 items-center justify-between gap-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-obsidian-text">{status}</p>
          {!isUnlocked && <p className="mt-1 text-xs text-obsidian-muted">Acceso cifrado</p>}
        </div>
        {/* [Icono] Bloquea la bóveda o abre el diálogo de acceso. */}
        <button
          type="button"
          onClick={() => isUnlocked ? lockVault() : openUnlockModal()}
          className="ui-action-icon shrink-0"
          aria-label={isUnlocked ? 'Bloquear bóveda' : 'Desbloquear bóveda'}
          title={status}
        >
          {isUnlocked ? <Unlock size={16} className="text-emerald-400" aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        </button>
      </div>
      {isUnlocked && (
        <>
          <dl aria-label="Tiempo restante" className="sidebar-timer grid grid-cols-3 gap-1">
            {time.map(({ label, value }) => (
              <div key={label} className="min-w-0 text-center">
                <dt className="text-xs text-obsidian-muted">{label}</dt>
                <dd className="font-mono text-sm tabular-nums text-obsidian-text">{value}</dd>
              </div>
            ))}
          </dl>
          {/* [Acción secundaria] Restablece el tiempo de inactividad. */}
          <button type="button" onClick={resetTimer} disabled={resettingTimer} className="ui-action-secondary mt-2 w-full px-2 text-center">
            <RotateCcw size={16} className={resettingTimer ? 'shrink-0 motion-safe:animate-spin' : 'shrink-0'} aria-hidden="true" />
            <span>{resettingTimer ? 'Reiniciando…' : 'Reiniciar temporizador'}</span>
          </button>
        </>
      )}
    </footer>
  );
}
