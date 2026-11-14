import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useVault } from '../../context/VaultContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { SectionRenderer } from './SectionRenderer';
import { ModalHost } from './ModalHost';
import { ToastViewport } from './ToastViewport';

const InspectorDrawer = lazy(() => import('./InspectorDrawer').then((module) => ({ default: module.InspectorDrawer })));

function getAccentTextColor(color: string): string {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match) return '#ffffff';
  const channels = match[1].match(/[\da-f]{2}/gi)?.map((part) => parseInt(part, 16) / 255) || [];
  const luminance = channels.reduce((sum, channel, index) => {
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

export const MainLayout: React.FC = () => {
  const { canvasStyle, accentColor, selectedEntity } = useVault();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const wasMobileNavOpen = useRef(false);
  const canvasClass = canvasStyle === 'dot-grid' ? 'dot-grid-canvas' : canvasStyle === 'subtle-grid' ? 'subtle-grid' : '';

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (wasMobileNavOpen.current && !mobileNavOpen) menuTriggerRef.current?.focus();
    wasMobileNavOpen.current = mobileNavOpen;
  }, [mobileNavOpen]);

  return (
    <div
      className={`brand-theme flex h-[100dvh] min-h-[100dvh] w-full overflow-hidden bg-obsidian-bg text-obsidian-text ${canvasClass}`}
      style={{
        ['--brand-accent' as any]: accentColor,
        ['--brand-accent-contrast' as any]: getAccentTextColor(accentColor),
      }}
    >
      <Sidebar isMobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Cerrar menú de navegación"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
        <Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          menuTriggerRef={menuTriggerRef}
          isMenuOpen={mobileNavOpen}
        />
        <main className="min-w-0 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <SectionRenderer />
        </main>
      </div>

      {selectedEntity && (
        <Suspense fallback={null}>
          <InspectorDrawer />
        </Suspense>
      )}
      <ModalHost />
      <ToastViewport />
    </div>
  );
};
