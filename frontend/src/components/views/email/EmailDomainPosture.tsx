import React, { useEffect, useId, useState } from 'react';
import { AlertTriangle, ChevronDown, Globe2, LoaderCircle, Search } from 'lucide-react';
import { api } from '../../../lib/api';
import type { EmailDomainPostureResponse, EmailDnsRecordCheck } from '../../../types';

type Props = { domains: string[] };

const statusStyles: Record<EmailDnsRecordCheck['status'], string> = {
  publicado: 'text-emerald-300',
  faltante: 'text-rose-300',
  débil: 'text-amber-200',
  múltiple: 'text-rose-300',
  no_revisado: 'text-slate-400',
  no_determinado: 'text-amber-200',
};

const statusLabels: Record<EmailDnsRecordCheck['status'], string> = {
  publicado: 'Publicado',
  faltante: 'Faltante',
  débil: 'Revisar política',
  múltiple: 'Hay duplicados',
  no_revisado: 'Sin revisar',
  no_determinado: 'Sin respuesta DNS',
};

function DnsCheckRow({ title, check }: { title: string; check: EmailDnsRecordCheck }) {
  return (
    <li className="border-t border-obsidian-border/70 py-2 first:border-t-0">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="text-xs font-semibold text-white">{title}</h3>
        <span className={`text-[10px] font-semibold ${statusStyles[check.status]}`}>{statusLabels[check.status]}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-obsidian-muted">{check.summary}</p>
      {check.records.map((record, index) => <code key={`${title}-${index}`} className="mt-1 block break-all rounded bg-obsidian-bg px-2 py-1 font-mono text-[10px] text-slate-300">{record}</code>)}
    </li>
  );
}

export const EmailDomainPosture: React.FC<Props> = ({ domains }) => {
  const domainId = useId();
  const selectorId = useId();
  const [domain, setDomain] = useState(domains[0] || '');
  const [selector, setSelector] = useState('');
  const [result, setResult] = useState<EmailDomainPostureResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!domains.includes(domain)) {
      setDomain(domains[0] || '');
      setResult(null);
      setError('');
    }
  }, [domains, domain]);

  const inspect = async () => {
    if (!domain || loading) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.checkEmailDomainPosture(domain, selector || undefined);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron consultar los registros DNS.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  if (domains.length === 0) return null;

  return (
    <details className="rounded-lg border border-obsidian-border bg-obsidian-panel">
      <summary data-caret="manual" className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-obsidian-text marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400">
        <Globe2 size={14} className="shrink-0 text-emerald-300" aria-hidden="true" />
        Comprobar configuración del dominio de correo
        <ChevronDown size={14} className="ml-auto shrink-0 text-obsidian-muted" aria-hidden="true" />
      </summary>
      <div className="grid min-w-0 gap-3 border-t border-obsidian-border p-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.2fr)]">
        <div className="min-w-0 space-y-2">
          <label htmlFor={domainId} className="block text-[11px] font-medium text-obsidian-muted">Dominio guardado</label>
          <select id={domainId} value={domain} onChange={(event) => { setDomain(event.target.value); setResult(null); setError(''); }} className="min-h-9 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
            {domains.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <label htmlFor={selectorId} className="block text-[11px] font-medium text-obsidian-muted">Selector DKIM (opcional)</label>
          <input id={selectorId} value={selector} maxLength={63} onChange={(event) => { setSelector(event.target.value.replace(/[^a-zA-Z0-9-]/g, '')); setResult(null); setError(''); }} placeholder="p. ej. google o selector1" className="min-h-9 w-full rounded-lg border border-obsidian-border bg-obsidian-bg px-2 text-xs text-white placeholder:text-obsidian-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" />
          <button type="button" onClick={() => void inspect()} disabled={loading || !domain} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-800 px-3 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-wait disabled:opacity-60">
            {loading ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <Search size={13} aria-hidden="true" />}
            {loading ? 'Consultando…' : 'Consultar DNS'}
          </button>
          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-obsidian-muted"><AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden="true" />Consulta registros públicos mediante el DNS configurado en el servidor. DKIM requiere el selector definido por tu proveedor.</p>
        </div>
        <div className="min-w-0" aria-live="polite" aria-busy={loading}>
          {loading && <p role="status" className="mb-2 flex items-center gap-1.5 text-xs text-obsidian-muted"><LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> Consultando registros públicos…</p>}
          {error ? <p role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">{error}</p> : result ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-white"><Globe2 size={13} className="text-emerald-300" aria-hidden="true" /> Resultado de {result.domain}</p>
                <time dateTime={result.checked_at} className="text-[10px] text-obsidian-muted">{new Date(result.checked_at).toLocaleString()}</time>
              </div>
              <ul className="mt-1">
                <DnsCheckRow title="SPF" check={result.spf} />
                <DnsCheckRow title="DMARC" check={result.dmarc} />
                <DnsCheckRow title="DKIM" check={result.dkim} />
              </ul>
              <p className="mt-1 text-[10px] leading-relaxed text-obsidian-muted">La presencia de registros no valida por sí sola la alineación, la firma real ni la entrega de mensajes.</p>
            </>
          ) : <p className="text-xs text-obsidian-muted">Consulta SPF y DMARC. Para DKIM, agrega el selector que muestra tu proveedor de correo.</p>}
        </div>
      </div>
    </details>
  );
};
