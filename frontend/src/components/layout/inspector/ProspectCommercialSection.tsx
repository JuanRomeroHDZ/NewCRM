import { useEffect, useState, type FormEvent } from 'react';
import { api, type CommercialProposal, type ProposalChannel } from '../../../lib/api';
import { useVault } from '../../../context/VaultContext';
import type { Prospect } from '../../../types';

type Summary = Awaited<ReturnType<typeof api.getProspectCommercial>>;
type ProposalAction = 'sale' | 'send' | 'decision';

const proposalStatus: Record<string, string> = {
  borrador: 'Borrador', enviada: 'Enviada', en_revision: 'En revisión',
  aceptada: 'Aceptada', rechazada: 'Rechazada', vencida: 'Vencida',
};
const channels: Record<ProposalChannel, string> = {
  whatsapp: 'WhatsApp', email: 'Correo electrónico', call: 'Llamada',
  in_person: 'En persona', other: 'Otro',
};
const displayDate = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

function downloadPdf({ blob, filename }: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return filename;
}

export function ProspectCommercialSection({ prospect, onClosed }: {
  prospect: Prospect;
  onClosed: () => void;
}) {
  const { prompt, showToast } = useVault();
  const [summary, setSummary] = useState<Summary>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<'proposal' | 'invoice' | null>(null);
  const [selection, setSelection] = useState<{ proposal: CommercialProposal; action: ProposalAction } | null>(null);
  const selected = selection?.proposal;

  useEffect(() => {
    let current = true;
    api.getProspectCommercial(prospect.id).then(
      (result) => { if (current) setSummary(result); },
      (cause: Error) => { if (current) setError(cause.message); },
    );
    return () => { current = false; };
  }, [prospect.id, attempt]);

  const run = async (action: () => Promise<unknown>, message: string, after?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setForm(null);
      setSelection(null);
      showToast(message, 'success');
      setAttempt((value) => value + 1);
      after?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async (proposal: CommercialProposal, approval = false) => {
    setBusy(true);
    setError('');
    try {
      const result = await (approval
        ? api.getCommercialApprovalPdf(proposal.id)
        : api.prepareCommercialProposalPdf(proposal.id));
      showToast(`Archivo descargado: ${downloadPdf(result)}`, 'success');
      if (!approval && !proposal.issued_at) setAttempt((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo descargar el PDF.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    if (selection?.action === 'send') {
      void run(() => api.recordCommercialProposalDelivery(selection.proposal.id, {
        recipient: value('recipient'),
        channel: value('channel') as ProposalChannel,
      }), 'Envío externo registrado.');
    } else if (selection?.action === 'decision') {
      const decision = value('decision') === 'rechazada' ? 'rechazada' : 'aceptada';
      void run(() => api.recordCommercialProposalDecision(selection.proposal.id, {
        decision,
        respondent: value('recipient'),
        channel: value('channel') as ProposalChannel,
        evidence: value('evidence'),
      }), decision === 'aceptada' ? 'Aceptación registrada.' : 'Rechazo registrado.');
    } else if (selected) {
      void run(() => api.closeCommercialSale({
        prospect_id: prospect.id, proposal_id: selected.id, company_name: prospect.company_name,
        title: selected.title, service_type: selected.service_type, currency: selected.currency,
        total_amount: selected.amount, advance_payment: Number(value('advance')),
        contact_name: prospect.contact_name || undefined,
      }), 'Venta registrada y prospecto convertido en cliente.', onClosed);
    } else if (form === 'invoice' && summary?.sale) {
      const sale = summary.sale;
      void run(() => api.recordCommercialInvoice({
        sale_id: sale.id, client_id: sale.client_id, folio: value('folio'), uuid: value('uuid'),
        rfc: value('rfc'), issue_date: value('date'), amount: Number(value('amount')), currency: sale.currency,
      }), 'Factura externa registrada.');
    } else if (form === 'proposal') {
      void run(() => api.createCommercialProposal({
        prospect_id: prospect.id, title: value('title'), amount: Number(value('amount')),
        currency: value('currency') === 'USD' ? 'USD' : 'MXN', service_type: value('service'),
        content_text: value('description'), expires_days: Number(value('expires')),
      }), 'Propuesta guardada.');
    }
  };

  const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);

  return (
    <section className="space-y-3 border-b border-obsidian-border pb-4" aria-label="Propuestas y venta">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold">Propuestas y venta</h3>
        {summary && !summary.sale && !form && !selected && (
          <button type="button" className="ui-action-secondary" disabled={busy} onClick={() => setForm('proposal')}>Nueva propuesta</button>
        )}
      </div>
      {error && <p role="alert" className="break-words text-sm text-rose-400">{error}</p>}
      {!summary && (error
        ? <button type="button" className="ui-action-secondary" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Reintentar</button>
        : <p role="status" className="text-obsidian-muted">Cargando propuestas…</p>)}
      {summary && !summary.proposals.length && <p className="text-obsidian-muted">Aún no hay propuestas.</p>}
      {!!summary?.proposals.length && (
        <ul className="divide-y divide-obsidian-border">
          {summary.proposals.map((proposal) => (
            <li key={proposal.id} className="space-y-2 py-2">
              <details>
                <summary className="cursor-pointer break-words py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent">
                  {proposal.title} <span className="text-obsidian-muted">· {proposalStatus[proposal.status] ?? proposal.status}</span>
                </summary>
                <div className="space-y-2 pb-3">
                  <p className="break-words">{proposal.folio} · {formatAmount(proposal.amount, proposal.currency)}</p>
                  {proposal.expires_at && <p className="text-obsidian-muted">Vigencia hasta {displayDate.format(new Date(proposal.expires_at))}</p>}
                  {proposal.content_text && <p className="whitespace-pre-wrap break-words">{proposal.content_text}</p>}
                  {proposal.sent_at && (
                    <p className="break-words text-obsidian-muted">
                      Envío registrado el {displayDate.format(new Date(proposal.sent_at))} por {proposal.sent_by}. Destinatario: {proposal.sent_to} · {proposal.send_channel && channels[proposal.send_channel]}.
                    </p>
                  )}
                  {proposal.responded_at && (
                    <div className="space-y-1 border-t border-obsidian-border pt-2">
                      <p className="break-words text-obsidian-muted">
                        Respuesta de {proposal.respondent} por {proposal.response_channel && channels[proposal.response_channel]}. Registro del {displayDate.format(new Date(proposal.responded_at))} por {proposal.responded_by}.
                      </p>
                      <p className="whitespace-pre-wrap break-words">{proposal.response_evidence}</p>
                    </div>
                  )}
                </div>
              </details>
              {!form && !selection && (
                <div className="flex flex-wrap gap-2">
                  {/* [Acciones] El PDF permanece disponible después de registrar el envío. */}
                  {(proposal.issued_at || proposal.status === 'borrador') && (
                    <button type="button" className="ui-action-secondary" disabled={busy} onClick={() => void exportPdf(proposal)}>
                      {proposal.issued_at ? 'Descargar PDF' : 'Preparar y descargar PDF'}
                    </button>
                  )}
                  {proposal.status === 'borrador' && proposal.issued_at && (
                    <button type="button" className="ui-action-secondary" disabled={busy} onClick={() => setSelection({ proposal, action: 'send' })}>
                      Registrar envío
                    </button>
                  )}
                  {proposal.sent_at && ['enviada', 'en_revision'].includes(proposal.status) && (
                    <button type="button" className="ui-action-secondary" disabled={busy} onClick={() => setSelection({ proposal, action: 'decision' })}>
                      Registrar respuesta
                    </button>
                  )}
                  {proposal.status === 'aceptada' && proposal.responded_at && (
                    <>
                      <button type="button" className="ui-action-secondary" disabled={busy} onClick={() => void exportPdf(proposal, true)}>
                        Descargar constancia
                      </button>
                      {!summary.sale && proposal.amount > 0 && (
                        <button type="button" className="ui-action-secondary" disabled={busy} onClick={() => setSelection({ proposal, action: 'sale' })}>
                          Cerrar venta
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {summary?.sale && (
        <div className="space-y-2 border-t border-obsidian-border pt-3">
          <p className="break-words font-semibold">{summary.sale.folio} · {summary.sale.title}</p>
          <p className="text-obsidian-muted">Total {formatAmount(summary.sale.total_amount, summary.sale.currency)} · Saldo {formatAmount(summary.sale.balance_amount, summary.sale.currency)}</p>
          {summary.can_manage_invoices && (
            <>
              <h4 className="font-semibold">Facturas externas</h4>
              <ul className="divide-y divide-obsidian-border">
                {summary.invoices.map((invoice) => (
                  <li key={invoice.id} className="space-y-2 py-2">
                    <p className="break-words">{invoice.folio} · {invoice.uuid}</p>
                    <p className="break-words text-obsidian-muted">{invoice.cancellation_reason ? `Baja registrada · ${invoice.cancellation_reason}` : 'Registrada'}</p>
                    {invoice.status !== 'cancelada' && (
                      <button type="button" className="ui-action-secondary" disabled={busy} onClick={async () => {
                        const reason = await prompt({
                          title: 'Registrar baja de factura externa',
                          message: 'Anota el motivo de la baja en LESSSO.',
                          confirmLabel: 'Registrar baja',
                        });
                        if (reason?.trim()) void run(() => api.cancelCommercialInvoice(invoice.id, reason.trim()), 'Baja registrada.');
                      }}>Registrar baja</button>
                    )}
                  </li>
                ))}
              </ul>
              {!form && !selection && <button type="button" className="ui-action-secondary" disabled={busy} onClick={() => setForm('invoice')}>Registrar factura externa</button>}
            </>
          )}
        </div>
      )}
      {(form || selected) && (
        <form onSubmit={submit} className="space-y-3 border-t border-obsidian-border pt-3">
          {selection && selection.action !== 'sale' ? (
            <>
              <h4 className="break-words font-semibold">{selection.proposal.folio} · {selection.proposal.title}</h4>
              <p className="text-obsidian-muted">
                {selection.action === 'send'
                  ? 'Comparte el PDF por tu cuenta y registra aquí el canal y el destinatario.'
                  : 'Registra la decisión del cliente y una referencia al mensaje o documento donde quedó confirmada.'}
              </p>
              <label className="block">{selection.action === 'send' ? 'Destinatario' : 'Nombre de quien respondió'}
                <input className="block w-full" name="recipient" minLength={2} maxLength={255}
                  defaultValue={prospect.contact_name || prospect.company_name} required />
              </label>
              <label className="block">Canal
                <select className="block w-full" name="channel" required defaultValue={selection.proposal.send_channel ?? 'whatsapp'}>
                  {Object.entries(channels).map(([channel, label]) => <option key={channel} value={channel}>{label}</option>)}
                </select>
              </label>
              {selection.action === 'decision' && (
                <>
                  <label className="block">Decisión
                    <select className="block w-full" name="decision" required defaultValue="">
                      <option value="" disabled>Selecciona la decisión</option>
                      <option value="aceptada">Aceptada</option>
                      <option value="rechazada">Rechazada</option>
                    </select>
                  </label>
                  <label className="block">Referencia de la respuesta
                    <textarea className="block min-h-[88px] w-full" name="evidence" minLength={5} maxLength={4000} required />
                  </label>
                </>
              )}
            </>
          ) : selected ? (
            <>
              <p>Crea una venta para {prospect.company_name} por {formatAmount(selected.amount, selected.currency)} y registra al prospecto como cliente.</p>
              <label className="block">Anticipo recibido
                <input className="block w-full" name="advance" type="number" min="0" max={selected.amount} step="0.01" defaultValue="0" required />
              </label>
            </>
          ) : form === 'invoice' ? (
            <>
              <p className="text-obsidian-muted">Registra los datos de un CFDI emitido fuera de LESSSO.</p>
              <label className="block">Folio<input className="block w-full" name="folio" maxLength={64} required /></label>
              <label className="block">UUID fiscal<input className="block w-full" name="uuid" minLength={36} maxLength={36} required /></label>
              <label className="block">RFC<input className="block w-full" name="rfc" minLength={12} maxLength={13} required /></label>
              <label className="block">Fecha de emisión<input className="block w-full" name="date" type="date" required /></label>
              <label className="block">Importe ({summary?.sale?.currency})<input className="block w-full" name="amount" type="number" step="0.01" min="0.01" max="100000000" required /></label>
            </>
          ) : (
            <>
              <label className="block">Título<input className="block w-full" name="title" minLength={2} maxLength={180} required /></label>
              <label className="block">Importe<input className="block w-full" name="amount" type="number" step="0.01" min="0" max="100000000" defaultValue={prospect.estimated_value || undefined} required /></label>
              <label className="block">Moneda<select className="block w-full" name="currency" defaultValue={prospect.currency === 'USD' ? 'USD' : 'MXN'}><option>MXN</option><option>USD</option></select></label>
              <label className="block">Tipo de servicio<select className="block w-full" name="service">
                <option value="proyecto_unico">Proyecto único</option>
                <option value="mensualidad">Mensualidad</option>
                <option value="mantenimiento">Mantenimiento</option>
                <option value="pentesting">Auditoría técnica</option>
              </select></label>
              <label className="block">Vigencia en días<input className="block w-full" name="expires" type="number" min="1" max="90" defaultValue="15" required /></label>
              <label className="block">Alcance<textarea className="block min-h-[88px] w-full" name="description" maxLength={20000} /></label>
            </>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="ui-action-secondary" disabled={busy} onClick={() => { setSelection(null); setForm(null); }}>Cancelar</button>
            {/* [Acción principal] Confirma la operación que el formulario describe. */}
            <button type="submit" className="ui-action-primary" disabled={busy}>
              {busy ? 'Guardando…' : selection?.action === 'sale' ? 'Confirmar venta' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
