import React from 'react';
import { ArrowRight, Network } from 'lucide-react';
import { InfoTooltip } from '../../common/InfoTooltip';

export const DashboardMapLink: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <div className="flex items-center gap-1.5">
    <InfoTooltip content="Consulta cómo se relacionan tus correos, servicios y prospectos." />
    <button type="button" onClick={onOpen} aria-label="Abrir el mapa de conexiones entre correos y servicios" className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-obsidian-muted transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
      <Network size={15} aria-hidden="true" />
      <span>Mapa de conexiones</span>
      <ArrowRight size={12} aria-hidden="true" />
    </button>
  </div>
);
