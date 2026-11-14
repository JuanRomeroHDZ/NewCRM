import React from 'react';
import { ArrowRight, BellRing, CheckCircle2, Copy, ExternalLink, Globe, Mail, MessageCircle, Plus } from 'lucide-react';
import type { Prospect } from '../../../types';
import {
  computeLiveSla,
  formatDuration,
  formatRelativeContactTime,
  getSlaBadgeMeta,
  getStatusMeta,
  isProspectNeedingRecontact,
} from '../../../lib/prospectUtils';

export type ProspectContactChannel = 'whatsapp' | 'email' | 'template_copy';

type DashboardProspectsSectionProps = {
  prospects: Prospect[];
  recontactCount: number;
  nowMs: number;
  onOpenProspects: () => void;
  onCreateProspect: () => void;
  onOpenProspect: (prospectId: string | number) => void;
  onQuickContact: (event: React.MouseEvent, prospect: Prospect, channel: ProspectContactChannel) => void;
  onMarkResponded: (event: React.MouseEvent, prospect: Prospect) => void;
};

export const DashboardProspectsSection: React.FC<DashboardProspectsSectionProps> = ({
  prospects,
  recontactCount,
  nowMs,
  onOpenProspects,
  onCreateProspect,
  onOpenProspect,
  onQuickContact,
  onMarkResponded,
}) => (
  <section aria-labelledby="dashboard-prospects-heading" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h2 id="dashboard-prospects-heading" className="text-sm font-bold tracking-tight text-white">
          Prospectos y páginas demo
        </h2>
        {recontactCount > 0 && (
          <button type="button" onClick={onOpenProspects} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25">
            <BellRing size={11} aria-hidden="true" />
            <span>{recontactCount} por contactar</span>
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCreateProspect} className="inline-flex items-center gap-1 rounded-lg border border-obsidian-border bg-obsidian-surface px-3 py-1.5 text-xs font-medium text-white hover:bg-obsidian-card">
          <Plus size={13} aria-hidden="true" /> Nuevo prospecto
        </button>
        <button type="button" onClick={onOpenProspects} className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-400 hover:text-indigo-300">
          Ver todos <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>

    {prospects.length > 0 ? (
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {prospects.slice(0, 3).map((prospect) => (
          <ProspectSummary
            key={prospect.id}
            prospect={prospect}
            nowMs={nowMs}
            onOpen={() => onOpenProspect(prospect.id)}
            onQuickContact={onQuickContact}
            onMarkResponded={onMarkResponded}
          />
        ))}
      </div>
    ) : (
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-y border-obsidian-border py-4 text-xs text-obsidian-muted">
        <p>No hay prospectos ni páginas demo registrados.</p>
      </div>
    )}
  </section>
);

type ProspectSummaryProps = {
  prospect: Prospect;
  nowMs: number;
  onOpen: () => void;
  onQuickContact: DashboardProspectsSectionProps['onQuickContact'];
  onMarkResponded: DashboardProspectsSectionProps['onMarkResponded'];
};

const ProspectSummary: React.FC<ProspectSummaryProps> = ({ prospect, nowMs, onOpen, onQuickContact, onMarkResponded }) => {
  const live = computeLiveSla(prospect, nowMs);
  const slaMeta = getSlaBadgeMeta(live.slaStatus);
  const statusMeta = getStatusMeta(prospect.status);
  const needsRecontact = prospect.status !== 'archivado_frio' && isProspectNeedingRecontact(prospect, nowMs);

  return (
    <article className={`flex min-w-0 flex-col gap-3 border-b pb-3 sm:rounded-lg sm:border sm:p-3 ${needsRecontact ? 'border-amber-500/40' : 'border-obsidian-border'}`}>
      <button type="button" onClick={onOpen} className="min-w-0 space-y-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-xs font-bold text-white" title={prospect.company_name}>{prospect.company_name}</h3>
            <p className="truncate text-[11px] text-obsidian-muted" title={prospect.email_address || 'Sin correo vinculado'}>
              {prospect.email_address || 'Sin correo vinculado'}
            </p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${slaMeta.badgeClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${slaMeta.dotClass}`} />
            {slaMeta.shortLabel}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 text-[11px]">
          <span className={`min-w-0 truncate rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
          <span className="shrink-0 font-mono font-semibold text-obsidian-muted">{formatDuration(live.elapsedSeconds)}</span>
        </div>
        {prospect.last_contacted_at && (
          <p className="truncate text-[10px] font-mono text-obsidian-muted">
            Último contacto: {formatRelativeContactTime(prospect.last_contacted_at)} ({prospect.followup_count || 1})
          </p>
        )}
      </button>

      <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-obsidian-border/60 pt-2">
        {prospect.demo_url && (
          <a href={prospect.demo_url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir página demo de ${prospect.company_name}`} className="inline-flex items-center gap-1 rounded-md border border-indigo-500/25 bg-indigo-500/10 px-2 py-1 text-[10px] font-medium text-indigo-300 hover:bg-indigo-500/20">
            <Globe size={11} aria-hidden="true" /> Demo <ExternalLink size={9} aria-hidden="true" />
          </a>
        )}
        {prospect.whatsapp && (
          <button type="button" onClick={(event) => onQuickContact(event, prospect, 'whatsapp')} aria-label={`Enviar seguimiento por WhatsApp a ${prospect.company_name}`} className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/20">
            <MessageCircle size={11} aria-hidden="true" /> WhatsApp
          </button>
        )}
        {prospect.contact_email && (
          <button type="button" onClick={(event) => onQuickContact(event, prospect, 'email')} aria-label={`Preparar correo para ${prospect.company_name}`} className="inline-flex items-center gap-1 rounded-md border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[10px] font-medium text-cyan-300 hover:bg-cyan-500/20">
            <Mail size={11} aria-hidden="true" /> Correo
          </button>
        )}
        <button type="button" onClick={(event) => onQuickContact(event, prospect, 'template_copy')} aria-label={`Copiar mensaje de seguimiento para ${prospect.company_name}`} className="inline-flex items-center gap-1 rounded-md border border-obsidian-border bg-obsidian-panel px-2 py-1 text-[10px] font-medium text-obsidian-muted hover:text-white">
          <Copy size={11} aria-hidden="true" /> Copiar
        </button>
        <button type="button" onClick={onOpen} className="rounded-md px-2 py-1 text-[10px] font-medium text-obsidian-muted hover:text-white">
          Registrar contacto
        </button>
        {!prospect.responded_at ? (
          <button type="button" onClick={(event) => onMarkResponded(event, prospect)} className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500">
            <CheckCircle2 size={11} aria-hidden="true" /> Respondió
          </button>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
            <CheckCircle2 size={11} aria-hidden="true" /> Respondido
          </span>
        )}
      </div>
    </article>
  );
};
