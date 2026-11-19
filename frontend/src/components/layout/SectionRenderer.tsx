import React, { lazy, Suspense } from 'react';
import { OperatorAuthSection } from '../settings/OperatorAuthSection';
import { SectionType, useVault } from '../../context/VaultContext';

const SettingsView = lazy(() => import('../views/SettingsView').then((module) => ({ default: module.SettingsView })));
const C2WorkspaceShell = lazy(() => import('../c2/C2WorkspaceShell').then((module) => ({ default: module.C2WorkspaceShell })));

const sectionViews: Record<SectionType, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: lazy(() => import('../views/DashboardView').then((module) => ({ default: module.DashboardView }))),
  help: lazy(() => import('../views/HelpView').then((module) => ({ default: module.HelpView }))),
  emails: lazy(() => import('../views/EmailsView').then((module) => ({ default: module.EmailsView }))),
  platforms: lazy(() => import('../views/PlatformsView').then((module) => ({ default: module.PlatformsView }))),
  capture: lazy(() => import('../views/MapCaptureView').then((module) => ({ default: module.MapCaptureView }))),
  prospects: lazy(() => import('../views/ProspectsView').then((module) => ({ default: module.ProspectsView }))),
  passwords: lazy(() => import('../views/PasswordsView').then((module) => ({ default: module.PasswordsView }))),
  graph: lazy(() => import('../views/GraphView').then((module) => ({ default: module.GraphView }))),
  writeups: lazy(() => import('../writeups/WriteupsView').then((module) => ({ default: module.WriteupsView }))),
  reports_documents: lazy(() => import('../reports/ReportsDocumentsView').then((module) => ({ default: module.ReportsDocumentsView }))),
  reports_canvases: lazy(() => import('../reports/ReportsCanvasesView').then((module) => ({ default: module.ReportsCanvasesView }))),
  overview_reports: lazy(() => import('../views/ModuleOverviewView').then((module) => ({ default: module.ModuleOverviewView }))),
  subscriptions: lazy(() => import('../views/SubscriptionsView').then((module) => ({ default: module.SubscriptionsView }))),
  overview_finances: lazy(() => import('../views/SubscriptionsView').then((module) => ({ default: module.SubscriptionsView }))),
  finance_income: lazy(() => import('../views/SubscriptionsView').then((module) => ({ default: module.SubscriptionsView }))),
  finance_services: lazy(() => import('../views/SubscriptionsView').then((module) => ({ default: module.SubscriptionsView }))),
  finance_expenses: lazy(() => import('../views/SubscriptionsView').then((module) => ({ default: module.SubscriptionsView }))),
  finance_cards: lazy(() => import('../views/SubscriptionsView').then((module) => ({ default: module.SubscriptionsView }))),
  overview_prospection: lazy(() => import('../views/ModuleOverviewView').then((module) => ({ default: module.ModuleOverviewView }))),
  overview_communications: lazy(() => import('../views/ModuleOverviewView').then((module) => ({ default: module.ModuleOverviewView }))),
  overview_security: lazy(() => import('../views/ModuleOverviewView').then((module) => ({ default: module.ModuleOverviewView }))),
  overview_c2: lazy(() => import('../views/ModuleOverviewView').then((module) => ({ default: module.ModuleOverviewView }))),
  overview_activity: lazy(() => import('../views/ModuleOverviewView').then((module) => ({ default: module.ModuleOverviewView }))),
  overview_settings: lazy(() => import('../views/ModuleOverviewView').then((module) => ({ default: module.ModuleOverviewView }))),
  trash: lazy(() => import('../views/TrashView').then((module) => ({ default: module.TrashView }))),
  settings: SettingsView,
  settings_appearance: SettingsView,
  settings_session: SettingsView,
  settings_limits: SettingsView,
  settings_access: SettingsView,
  settings_network: SettingsView,
  settings_writeups: SettingsView,
  settings_tools: SettingsView,
  settings_backup: SettingsView,
  settings_team: SettingsView,
  security_audit: lazy(() => import('../views/SecurityAuditView').then((module) => ({ default: module.SecurityAuditView }))),
  audit_logs: lazy(() => import('../views/AuditLogsView').then((module) => ({ default: module.AuditLogsView }))),
  c2_hosts: C2WorkspaceShell,
  c2_topo: C2WorkspaceShell,
  c2_ports: C2WorkspaceShell,
  c2_mitm: C2WorkspaceShell,
  c2_sniff: C2WorkspaceShell,
  c2_dns: C2WorkspaceShell,
  c2_creds: C2WorkspaceShell,
  c2_http: C2WorkspaceShell,
  c2_poison: C2WorkspaceShell,
  c2_mitm6: C2WorkspaceShell,
  c2_wifi: C2WorkspaceShell,
  c2_camera: C2WorkspaceShell,
  c2_opsec: C2WorkspaceShell,
};

class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; onBack: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert" className="mx-auto mt-8 max-w-lg rounded-xl border border-obsidian-border bg-obsidian-panel p-5 text-obsidian-text">
        <h2 className="text-lg font-semibold text-white">No se pudo abrir este apartado</h2>
        <p className="mt-2 text-sm text-obsidian-muted">La vista no terminó de cargarse. Puedes volver al resumen o recargar la aplicación.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {/* [Navegación] Regresa al resumen general de Inicio. */}
          <button type="button" onClick={this.props.onBack} className="ui-action-secondary">Ir al resumen</button>
          {/* [Acción secundaria] Vuelve a cargar el apartado después del error. */}
          <button type="button" onClick={() => window.location.reload()} className="ui-action-secondary">Recargar</button>
        </div>
      </section>
    );
  }
}

export const SectionRenderer: React.FC = () => {
  const { activeSection, isUnlocked, operator, setActiveSection } = useVault();
  const ActiveView = sectionViews[activeSection];
  const isC2Section = activeSection.startsWith('c2_');
  const settingsSection = activeSection === 'settings' || activeSection.startsWith('settings_') || activeSection === 'overview_settings';
  const isAdmin = operator?.role === 'owner' || operator?.role === 'business_admin';
  const commercialOnly = operator?.role === 'seller' || operator?.role === 'readonly';

  if (isUnlocked && settingsSection && !isAdmin) {
    return <div className="mx-auto max-w-4xl p-4 sm:p-6"><OperatorAuthSection /></div>;
  }
  if (isUnlocked && operator === undefined && activeSection !== 'help') {
    return <p role="status" className="p-6 text-obsidian-muted">Comprobando la sesión…</p>;
  }
  if (isUnlocked && (!operator || operator.must_change_password) && activeSection !== 'help') {
    return (
      <section className="mx-auto max-w-xl space-y-4 p-6">
        <h2 className="font-heading text-lg font-semibold">
          {operator?.must_change_password ? 'Cambia tu contraseña temporal' : 'Inicia sesión con tu cuenta'}
        </h2>
        <p className="text-sm text-obsidian-muted">La bóveda está abierta. Usa tu cuenta de equipo para acceder a los apartados de tu rol.</p>
        <button type="button" className="ui-action-primary" onClick={() => setActiveSection('settings_team')}>
          Ir a accesos del equipo
        </button>
      </section>
    );
  }


  const prospectSection = activeSection === 'overview_prospection' || activeSection === 'prospects';
  const limited = commercialOnly && !prospectSection && activeSection !== 'help'
    && !(activeSection === 'capture' && operator.role === 'seller');
  if (isUnlocked && operator && (limited || (!isAdmin && (activeSection.startsWith('finance_')
    || activeSection === 'overview_finances' || activeSection === 'audit_logs' || activeSection === 'overview_activity')))) {
    return (
      <section className="mx-auto max-w-xl space-y-4 p-6">
        <h2 className="font-heading text-lg font-semibold">{activeSection === 'dashboard' ? 'Tu espacio de trabajo' : 'Tu rol no tiene acceso a este apartado'}</h2>
        <button type="button" className="ui-action-secondary" onClick={() => setActiveSection('prospects')}>Abrir prospectos</button>
      </section>
    );
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-obsidian-muted" role="status">Cargando vista…</div>}>
      {isC2Section ? <ActiveView /> : (
        <SectionErrorBoundary key={ActiveView === SettingsView ? 'settings-form' : activeSection} onBack={() => setActiveSection('dashboard')}>
          <ActiveView />
        </SectionErrorBoundary>
      )}
    </Suspense>
  );
};
