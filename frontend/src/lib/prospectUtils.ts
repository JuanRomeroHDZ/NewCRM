import { Prospect, ProspectStatus, ProspectSlaStatus, ProspectWorkflowType } from '../types';

export const PROSPECT_STATUS_OPTIONS: {
  value: ProspectStatus;
  label: string;
  badgeClass: string;
  dotClass: string;
}[] = [
  {
    value: 'nuevo',
    label: 'Nuevo',
    badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    dotClass: 'bg-cyan-400'
  },
  {
    value: 'demo_creada',
    label: 'Demo Creada',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
    dotClass: 'bg-indigo-400'
  },
  {
    value: 'primer_contacto',
    label: 'Primer Contacto',
    badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
    dotClass: 'bg-cyan-400'
  },
  {
    value: 'en_cotizacion',
    label: 'En Cotización',
    badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
    dotClass: 'bg-amber-400'
  },
  {
    value: 'respondido',
    label: 'Respondido',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    dotClass: 'bg-emerald-400'
  },
  {
    value: 'tiempo_agotado',
    label: 'Tiempo Agotado',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
    dotClass: 'bg-rose-400'
  },
  {
    value: 'archivado_frio',
    label: 'Archivado / Frío',
    badgeClass: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    dotClass: 'bg-slate-400'
  }
];

export const getStatusMeta = (status: string) => {
  return (
    PROSPECT_STATUS_OPTIONS.find((s) => s.value === status) || {
      value: status as ProspectStatus,
      label: status,
      badgeClass: 'bg-obsidian-surface text-obsidian-muted border-obsidian-border',
      dotClass: 'bg-obsidian-muted'
    }
  );
};

export const getWorkflowMeta = (workflow: ProspectWorkflowType | string) => {
  if (workflow === 'direct_quote') {
    return {
      label: 'Cotización Directa',
      shortLabel: 'Cotización',
      badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
    };
  }
  return {
    label: 'Demo Web + Seguimiento',
    shortLabel: 'Demo Web',
    badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
  };
};

export const getSlaBadgeMeta = (slaStatus: ProspectSlaStatus) => {
  switch (slaStatus) {
    case 'cumplido':
      return {
        label: 'Respondido a tiempo',
        shortLabel: 'A tiempo',
        badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        barClass: 'bg-emerald-500',
        dotClass: 'bg-emerald-400'
      };
    case 'vencido':
      return {
        label: 'Plazo vencido (Atender)',
        shortLabel: 'Plazo vencido',
        badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        barClass: 'bg-rose-500',
        dotClass: 'bg-rose-400 animate-ping'
      };
    case 'en_tiempo':
    default:
      return {
        label: 'Dentro del plazo',
        shortLabel: 'En plazo',
        badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        barClass: 'bg-amber-400',
        dotClass: 'bg-amber-400 animate-pulse'
      };
  }
};

export function formatDuration(totalSeconds: number, showSeconds: boolean = true): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const remSecs = secs % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (days > 0) {
    return showSeconds
      ? `${days}d ${pad(hours)}h ${pad(mins)}m ${pad(remSecs)}s`
      : `${days}d ${hours}h ${mins}m`;
  }
  return showSeconds
    ? `${pad(hours)}h ${pad(mins)}m ${pad(remSecs)}s`
    : `${hours}h ${mins}m`;
}

export function formatSlaHoursLabel(hours: number): string {
  if (!hours) return '48h (2 días)';
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${hours}h (${days} ${days === 1 ? 'día' : 'días'})`;
  }
  return `${hours}h`;
}

export function computeLiveSla(prospect: Prospect, nowMs: number = Date.now()) {
  const slaSeconds = Math.max(60, Math.round((prospect.sla_hours || 48) * 3600));
  const isResponded = Boolean(prospect.responded_at) || prospect.status === 'respondido';

  let elapsedSeconds = prospect.elapsed_seconds || 0;

  if (isResponded) {
    if (prospect.response_time_seconds !== undefined && prospect.response_time_seconds !== null) {
      elapsedSeconds = Math.max(0, prospect.response_time_seconds);
    } else if (prospect.started_at && prospect.responded_at) {
      const startMs = new Date(prospect.started_at).getTime();
      const endMs = new Date(prospect.responded_at).getTime();
      if (!isNaN(startMs) && !isNaN(endMs)) {
        elapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
      }
    }
  } else if (prospect.started_at) {
    const startMs = new Date(prospect.started_at).getTime();
    if (!isNaN(startMs)) {
      elapsedSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
    }
  }

  let slaStatus: ProspectSlaStatus = 'en_tiempo';
  const metSla =
    prospect.met_sla !== undefined && prospect.met_sla !== null
      ? prospect.met_sla
      : elapsedSeconds <= slaSeconds;

  if (isResponded) {
    slaStatus = metSla ? 'cumplido' : 'vencido';
  } else if (prospect.status === 'tiempo_agotado' || elapsedSeconds > slaSeconds) {
    slaStatus = 'vencido';
  } else {
    slaStatus = 'en_tiempo';
  }

  const remainingSeconds = Math.max(0, slaSeconds - elapsedSeconds);
  const overdueSeconds = Math.max(0, elapsedSeconds - slaSeconds);
  const progressPercent = Math.min(100, Math.round((elapsedSeconds / slaSeconds) * 100));

  return {
    isResponded,
    elapsedSeconds,
    slaSeconds,
    remainingSeconds,
    overdueSeconds,
    progressPercent,
    slaStatus,
    metSla
  };
}

export function computeLiveFollowUpSla(prospect: Prospect, nowMs: number = Date.now()) {
  const fSlaHours = prospect.followup_sla_hours || 48;
  const fSlaSeconds = Math.max(60, Math.round(fSlaHours * 3600));
  const isResponded = Boolean(prospect.responded_at) || prospect.status === 'respondido';

  if (isResponded) {
    return {
      active: false,
      hasStarted: true,
      elapsedSeconds: 0,
      slaSeconds: fSlaSeconds,
      remainingSeconds: 0,
      overdueSeconds: 0,
      progressPercent: 100,
      status: 'completado' as const
    };
  }

  if (!prospect.last_contacted_at) {
    return {
      active: false,
      hasStarted: false,
      elapsedSeconds: 0,
      slaSeconds: fSlaSeconds,
      remainingSeconds: fSlaSeconds,
      overdueSeconds: 0,
      progressPercent: 0,
      status: 'sin_iniciar' as const
    };
  }

  const lastMs = new Date(prospect.last_contacted_at).getTime();
  const elapsedSeconds = !isNaN(lastMs) ? Math.max(0, Math.floor((nowMs - lastMs) / 1000)) : (prospect.followup_elapsed_seconds || 0);
  const remainingSeconds = Math.max(0, fSlaSeconds - elapsedSeconds);
  const overdueSeconds = Math.max(0, elapsedSeconds - fSlaSeconds);
  const progressPercent = Math.min(100, Math.round((elapsedSeconds / fSlaSeconds) * 100));
  const status = elapsedSeconds > fSlaSeconds ? ('vencido' as const) : ('en_tiempo' as const);

  return {
    active: true,
    hasStarted: true,
    elapsedSeconds,
    slaSeconds: fSlaSeconds,
    remainingSeconds,
    overdueSeconds,
    progressPercent,
    status
  };
}

export function isProspectNeedingRecontact(prospect: Prospect, nowMs: number = Date.now()): boolean {
  if (prospect.status === 'respondido' || prospect.status === 'archivado_frio' || Boolean(prospect.responded_at)) {
    return false;
  }
  const live = computeLiveSla(prospect, nowMs);
  const follow = computeLiveFollowUpSla(prospect, nowMs);
  if (follow.hasStarted) {
    return follow.status === 'vencido' || follow.progressPercent >= 75;
  }
  if (live.slaStatus === 'vencido' || prospect.status === 'tiempo_agotado') return true;
  if (prospect.needs_recontact) return true;
  return live.progressPercent >= 50;
}

export interface CommercialPipelineSummary {
  activePipelineMXN: number;
  activePipelineUSD: number;
  closedWonMXN: number;
  closedWonUSD: number;
  monthlyRetainerActiveMXN: number;
  monthlyRetainerClosedMXN: number;
  activeDealsCount: number;
  closedDealsCount: number;
  activeCount: number;
  closedWonCount: number;
  coldArchivedCount: number;
  pipelineCoverageRatioMonthly: number;
  closedCoverageRatioMonthly: number;
  monthlyCostCoverageRatio: number;
  annualCostCoverageRatio: number;
}

export function computeCommercialPipelineSummary(
  prospects: Prospect[],
  usdRateInput?: number,
  monthlyOperatingMXN: number = 0
): CommercialPipelineSummary {
  const rate = usdRateInput && usdRateInput > 0 ? usdRateInput : 0;
  const toMXN = (val: number, curr?: string) => (curr === 'USD' ? val * rate : val);

  let activePipelineMXN = 0;
  let closedWonMXN = 0;
  let monthlyRetainerActiveMXN = 0;
  let monthlyRetainerClosedMXN = 0;
  let activeDealsCount = 0;
  let closedDealsCount = 0;
  let coldArchivedCount = 0;

  for (const p of prospects) {
    if (p.is_deleted) continue;
    const val = Number(p.estimated_value || 0);
    const valMXN = toMXN(val, p.currency);

    if (p.status === 'archivado_frio') {
      coldArchivedCount++;
      continue;
    }

    if (p.status === 'respondido' || Boolean(p.responded_at)) {
      closedWonMXN += valMXN;
      if (val > 0) closedDealsCount++;
      if (p.billing_type === 'monthly_retainer') {
        monthlyRetainerClosedMXN += valMXN;
      }
    } else {
      activePipelineMXN += valMXN;
      if (val > 0) activeDealsCount++;
      if (p.billing_type === 'monthly_retainer') {
        monthlyRetainerActiveMXN += valMXN;
      }
    }
  }

  const pipelineCoverageRatioMonthly =
    monthlyOperatingMXN > 0 ? Number(((activePipelineMXN + closedWonMXN) / monthlyOperatingMXN).toFixed(1)) : 0;
  const closedCoverageRatioMonthly =
    monthlyOperatingMXN > 0 ? Number((closedWonMXN / monthlyOperatingMXN).toFixed(1)) : 0;
  const annualOperatingMXN = monthlyOperatingMXN * 12;
  const annualCostCoverageRatio =
    annualOperatingMXN > 0 ? Number(((activePipelineMXN + closedWonMXN) / annualOperatingMXN).toFixed(2)) : 0;

  return {
    activePipelineMXN,
    activePipelineUSD: activePipelineMXN / rate,
    closedWonMXN,
    closedWonUSD: closedWonMXN / rate,
    monthlyRetainerActiveMXN,
    monthlyRetainerClosedMXN,
    activeDealsCount,
    closedDealsCount,
    activeCount: activeDealsCount,
    closedWonCount: closedDealsCount,
    coldArchivedCount,
    pipelineCoverageRatioMonthly,
    closedCoverageRatioMonthly,
    monthlyCostCoverageRatio: pipelineCoverageRatioMonthly,
    annualCostCoverageRatio
  };
}

export function buildFollowUpMessage(prospect: Prospect): string {
  const greetingName = prospect.contact_name ? prospect.contact_name.split(' ')[0] : prospect.company_name;
  const isFollowUp = (prospect.followup_count || 0) > 0 || !['demo_creada', 'nuevo'].includes(prospect.status);

  if (prospect.workflow_type === 'demo_first') {
    if (isFollowUp) {
      return `Hola ${greetingName}, espero que te encuentres muy bien. Te escribo brevemente para dar seguimiento a la propuesta y demostración interactiva que preparamos para ${prospect.company_name}${prospect.demo_url ? ` (${prospect.demo_url})` : ''}. ¿Tuvieron oportunidad de revisarla? Quedo atento a tus comentarios para ajustar cualquier detalle.`;
    }
    return `Hola ${greetingName}, preparamos una demostración funcional a medida para ${prospect.company_name}${prospect.demo_url ? `: ${prospect.demo_url}` : '.'} Me encantaría conocer tu opinión y saber si tienes unos minutos esta semana para revisarla juntos.`;
  }

  if (isFollowUp) {
    return `Hola ${greetingName}, doy seguimiento a la cotización e información enviada para ${prospect.company_name}. Quedo atento por si tienen alguna duda técnica o comercial para avanzar.`;
  }
  return `Hola ${greetingName}, me pongo en contacto con ustedes respecto a los servicios para ${prospect.company_name}. Quedo a tu disposición para compartirte nuestra propuesta.`;
}

export function buildWhatsAppUrl(
  whatsapp?: string,
  companyName?: string,
  demoUrl?: string,
  customMessage?: string
): string | null {
  if (!whatsapp) return null;
  const digits = whatsapp.replace(/[^\d]/g, '');
  if (!digits) return null;
  let msg = customMessage || '';
  if (!msg) {
    if (companyName && demoUrl) {
      msg = `Hola, te comparto la demostración que preparamos para ${companyName}: ${demoUrl} — Quedo atento a tus comentarios.`;
    } else if (companyName) {
      msg = `Hola, doy seguimiento a nuestra propuesta para ${companyName}. ¿Tuvieron oportunidad de revisarla?`;
    }
  }
  const qs = msg ? `?text=${encodeURIComponent(msg)}` : '';
  return `https://wa.me/${digits}${qs}`;
}

export function buildMailtoUrl(prospect: Prospect): string | null {
  const targetEmail = prospect.contact_email?.trim();
  if (!targetEmail) return null;
  const isFollowUp = (prospect.followup_count || 0) > 0 || !['demo_creada', 'nuevo'].includes(prospect.status);
  const subject = isFollowUp
    ? `Seguimiento: Propuesta y Demo para ${prospect.company_name}`
    : `Propuesta y Demostración Interactiva — ${prospect.company_name}`;
  const body = buildFollowUpMessage(prospect);
  return `mailto:${encodeURIComponent(targetEmail.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function formatRelativeContactTime(isoDate?: string, nowMs: number = Date.now()): string {
  if (!isoDate) return 'Sin registro previo';
  const ts = new Date(isoDate).getTime();
  if (isNaN(ts)) return 'Sin registro previo';
  const diffSecs = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSecs < 60) return 'Hace unos segundos';
  const mins = Math.floor(diffSecs / 60);
  if (mins < 60) return `Hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}
