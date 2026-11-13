import React from 'react';
import { ArrowRight, Network } from 'lucide-react';
import { InfoTooltip } from '../../common/InfoTooltip';

export const DashboardMapLink: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <section className="flex min-w-0 flex-col items-start justify-between gap-3 border-t border-obsidian-border pt-4 sm:flex-row sm:items-center">
    <div className="flex min-w-0 items-center gap-3">
      <Network size={19} className="shrink-0 text-indigo-300" aria-hidden="true" />
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="truncate text-sm font-semibold text-white">Mapa de conexiones</h2>
        <InfoTooltip content="Consulta cómo se relacionan tus correos, servicios y prospectos." />
      </div>
    </div>
    <button type="button" onClick={onOpen} aria-label="Abrir el mapa de conexiones entre correos y servicios" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
      Ver mapa <ArrowRight size={14} aria-hidden="true" />
    </button>
  </section>
);
