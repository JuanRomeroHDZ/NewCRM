import React, { useState } from 'react';
import { 
  Plus, RefreshCw, DollarSign, Shield, Lock, Unlock, 
  HelpCircle, ArrowUpRight, ShieldAlert, Rocket 
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';

export const Topbar: React.FC = () => {
  const { 
    activeSection, exchangeRate, refreshExchangeRate, 
    openEmailModal, openPlatformModal, openProspectModal, isUnlocked, 
    openUnlockModal, lockVault, panicLock, showToast 
  } = useVault();

  const [isSyncingRate, setIsSyncingRate] = useState(false);

  const sectionTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Dashboard Ejecutivo', subtitle: 'Métricas financieras, inteligencia de cuentas y estado de seguridad' },
    emails: { title: 'Correos Electrónicos (Nodos Raíz)', subtitle: 'Árbol jerárquico de identidades, cadenas de recuperación y 2FA' },
    platforms: { title: 'Plataformas & Servicios (Nodos Hijos)', subtitle: 'Directorio de accesos propios, inicios SSO y variables técnicas' },
    prospects: { title: 'CRM de Prospectos & Páginas Demo', subtitle: 'Seguimiento de páginas demo creadas, cotizaciones directas y SLA de respuesta' },
    passwords: { title: 'Bóveda de Contraseñas & API Keys', subtitle: 'Acceso seguro y copiado instantáneo de secretos y tokens' },
    graph: { title: 'Grafo Relacional (Graph View)', subtitle: 'Lienzo interactivo Obsidian: dependencias, cadenas y puntos de falla' },
    subscriptions: { title: 'Suscripciones & Métodos de Pago', subtitle: 'Control de cobros recurrentes, tarjetas vinculadas y tipo de cambio' },
    trash: { title: 'Papelera de Reciclaje', subtitle: 'Restauración atómica y purga definitiva de elementos eliminados' },
    settings: { title: 'Configuración de Seguridad', subtitle: 'Tiempos de auto-bloqueo, portapapeles y personalización estética' },
    security_audit: { title: 'Auditoría Criptográfica & Salud de Bóveda', subtitle: 'Detección de reutilización, análisis de radio de impacto y entropía' },
    audit_logs: { title: 'Historial de Auditoría & Trazabilidad', subtitle: 'Registro secuencial inmutable de accesos, eventos y operaciones' },
  };

  const handleSyncRate = async () => {
    setIsSyncingRate(true);
    try {
      await api.syncExchangeRate();
      await refreshExchangeRate();
      showToast('Tipo de cambio USD/MXN actualizado con éxito.', 'success');
    } catch (err) {
      showToast('No se pudo conectar al servidor de divisas. Se conserva el valor en caché.', 'warning');
    } finally {
      setIsSyncingRate(false);
    }
  };

  const currentInfo = sectionTitles[activeSection] || { title: 'EmailSaver', subtitle: '' };

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-obsidian-panel/80 backdrop-blur-md border-b border-obsidian-border select-none z-20">
      {/* Title & Breadcrumbs */}
      <div>
        <h1 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
          {currentInfo.title}
        </h1>
        <p className="text-[11px] text-obsidian-muted">
          {currentInfo.subtitle}
        </p>
      </div>

      {/* Right Controls: Exchange ticker + Actions */}
      <div className="flex items-center gap-3">
        {/* USD / MXN live pill */}
        {exchangeRate && (
          <div 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-obsidian-surface border border-obsidian-border text-xs text-obsidian-text hover:border-obsidian-borderLight transition-all cursor-pointer group"
            onClick={handleSyncRate}
            title="Hacer clic para sincronizar tasa oficial con open-exchange"
          >
            <DollarSign size={13} className="text-emerald-400" />
            <span className="font-mono text-white font-medium">1 USD = ${exchangeRate.rate.toFixed(2)} MXN</span>
            {exchangeRate.is_manual && (
              <span className="text-[9px] px-1 bg-amber-500/20 text-amber-300 rounded font-medium">Manual</span>
            )}
            <RefreshCw 
              size={12} 
              className={`text-obsidian-muted group-hover:text-white transition-transform ${isSyncingRate ? 'animate-spin text-indigo-400' : ''}`} 
            />
          </div>
        )}

        {/* Panic Button */}
        <button
          type="button"
          onClick={panicLock}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all group active:scale-95"
          title="Modo Pánico: Bloquea la bóveda y purga el portapapeles de inmediato (Ctrl + Shift + L)"
        >
          <ShieldAlert size={14} className="text-rose-400 group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline">Pánico</span>
        </button>

        {/* Action Buttons */}
        <button
          type="button"
          onClick={() => openProspectModal()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-xs font-medium text-obsidian-text hover:text-white transition-all active:scale-95"
          title="Registrar nuevo prospecto o página demo"
        >
          <Rocket size={13} className="text-indigo-400" />
          <span>Nuevo Prospecto</span>
        </button>

        <button
          type="button"
          onClick={() => openEmailModal()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border text-xs font-medium text-obsidian-text hover:text-white transition-all active:scale-95"
        >
          <Plus size={14} className="text-indigo-400" />
          <span>Nuevo Correo</span>
        </button>

        <button
          type="button"
          onClick={() => openPlatformModal()}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all active:scale-95"
        >
          <Plus size={14} />
          <span>Vincular Plataforma</span>
        </button>
      </div>
    </header>
  );
};
