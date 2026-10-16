import { Prospect, ProspectStatus, ProspectSlaStatus, ProspectWorkflowType } from '../types';

export const PROSPECT_STATUS_OPTIONS: {
  value: ProspectStatus;
  label: string;
  badgeClass: string;
  dotClass: string;
}[] = [
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
        label: 'Cumplido (Éxito)',
        shortLabel: 'Cumplido',
        badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        barClass: 'bg-emerald-500',
        dotClass: 'bg-emerald-400'
      };
    case 'vencido':
      return {
        label: 'Vencido (Alerta)',
        shortLabel: 'Vencido',
        badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        barClass: 'bg-rose-500',
        dotClass: 'bg-rose-400 animate-ping'
      };
    case 'en_tiempo':
    default:
      return {
        label: 'En tiempo (Pendiente)',
        shortLabel: 'En tiempo',
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

export function buildWhatsAppUrl(whatsapp?: string, companyName?: string, demoUrl?: string): string | null {
  if (!whatsapp) return null;
  const digits = whatsapp.replace(/[^\d]/g, '');
  if (!digits) return null;
  let msg = '';
  if (companyName && demoUrl) {
    msg = `Hola ${companyName}, te comparto la página demo que preparamos para ustedes: ${demoUrl}`;
  } else if (companyName) {
    msg = `Hola ${companyName}, me pongo en contacto con ustedes.`;
  }
  const qs = msg ? `?text=${encodeURIComponent(msg)}` : '';
  return `https://wa.me/${digits}${qs}`;
}
