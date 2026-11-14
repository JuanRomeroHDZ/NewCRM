import React, { lazy, Suspense } from 'react';
import { SectionType, useVault } from '../../context/VaultContext';

const SettingsView = lazy(() => import('../views/SettingsView').then((module) => ({ default: module.SettingsView })));

const sectionViews: Record<SectionType, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: lazy(() => import('../views/DashboardView').then((module) => ({ default: module.DashboardView }))),
  emails: lazy(() => import('../views/EmailsView').then((module) => ({ default: module.EmailsView }))),
  platforms: lazy(() => import('../views/PlatformsView').then((module) => ({ default: module.PlatformsView }))),
  capture: lazy(() => import('../views/MapCaptureView').then((module) => ({ default: module.MapCaptureView }))),
  prospects: lazy(() => import('../views/ProspectsView').then((module) => ({ default: module.ProspectsView }))),
  passwords: lazy(() => import('../views/PasswordsView').then((module) => ({ default: module.PasswordsView }))),
  graph: lazy(() => import('../views/GraphView').then((module) => ({ default: module.GraphView }))),
  writeups: lazy(() => import('../writeups/WriteupsView').then((module) => ({ default: module.WriteupsView }))),
  subscriptions: lazy(() => import('../views/SubscriptionsView').then((module) => ({ default: module.SubscriptionsView }))),
  trash: lazy(() => import('../views/TrashView').then((module) => ({ default: module.TrashView }))),
  settings: SettingsView,
  settings_appearance: SettingsView,
  settings_session: SettingsView,
  settings_limits: SettingsView,
  settings_access: SettingsView,
  settings_network: SettingsView,
  settings_tools: SettingsView,
  settings_backup: SettingsView,
  settings_team: SettingsView,
  security_audit: lazy(() => import('../views/SecurityAuditView').then((module) => ({ default: module.SecurityAuditView }))),
  audit_logs: lazy(() => import('../views/AuditLogsView').then((module) => ({ default: module.AuditLogsView }))),
};

export const SectionRenderer: React.FC = () => {
  const { activeSection } = useVault();
  const ActiveView = sectionViews[activeSection];

  return (
    <Suspense fallback={<div className="p-6 text-sm text-obsidian-muted" role="status">Cargando vista…</div>}>
      <ActiveView />
    </Suspense>
  );
};
