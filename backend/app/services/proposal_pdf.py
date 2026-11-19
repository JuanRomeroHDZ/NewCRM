"""Print layout for commercial proposals and their approval records."""

import json
import re
from datetime import datetime, timezone
from hashlib import sha256

from app.models.crm_sales import Proposal
from app.services.typst_compiler import compile_typst_source

PROPOSAL_LAYOUT = r'''
#let data = json("proposal.json")
#let ink = rgb("#182320")
#let muted = rgb("#52635d")
#let accent = rgb("#0f6258")
#let rule = rgb("#c9d6d2")
#set document(title: data.kind + " " + data.folio, author: "LESSSO")
#set text(font: "DejaVu Sans", size: 10pt, fill: ink, lang: "es")
#set page(
  paper: "a4",
  margin: (x: 23mm, top: 24mm, bottom: 23mm),
  footer: [
    #line(length: 100%, stroke: 0.5pt + rule)
    #set text(size: 8pt, fill: muted)
    #data.folio #h(1fr) Página #context counter(page).display()
  ],
)
#set par(leading: 0.72em)
#let label(value) = text(size: 9pt, weight: "bold", fill: muted, value)
#let detail(name, value) = block(width: 100%, below: 0.85em)[
  #label(name) \
  #value
]
#let prose(value) = {
  for paragraph in value.split("\n") {
    if paragraph == "" { v(0.5em) }
    else { par(text(paragraph)) }
  }
}

#text(size: 11pt, weight: "bold", fill: accent)[LESSSO]
#h(1fr)
#text(size: 9pt, fill: muted, data.folio + "  ·  v" + data.version)
#line(length: 100%, stroke: 0.75pt + rule)
#v(9mm)
#label(data.kind)
#v(2mm)
#block(below: 6mm, text(size: 24pt, weight: "bold", data.title))

#if data.approval {
  detail("Importe aprobado", data.amount)
  detail("Envío registrado", data.sent)
  detail("Aceptación registrada", data.response)
  detail("Registró la aceptación", data.operator)
  detail("Huella SHA-256 del PDF de la propuesta", text(size: 8pt, data.digest))
  v(4mm)
  heading(outlined: false)[Referencia de aprobación]
  prose(data.evidence)
  v(4mm)
  text(size: 9pt, fill: muted)[Registro administrativo de una aceptación comunicada externamente.]
} else {
  grid(columns: (1fr, 1fr), gutter: 8mm,
    detail("Preparada para", data.recipient),
    detail("Tipo de servicio", data.service),
    detail("Fecha de emisión (UTC)", data.issued),
    detail("Vigente hasta (UTC)", data.expiry),
  )
  line(length: 100%, stroke: 0.5pt + rule)
  block(above: 3mm, below: 6mm)[
    #label("Importe de la propuesta")
    #h(1fr)
    #text(size: 15pt, weight: "bold", fill: accent, data.amount)
  ]
  heading(outlined: false)[Alcance]
  prose(data.scope)
}
'''

SERVICE_NAMES = {
    "proyecto_unico": "Proyecto único",
    "mensualidad": "Mensualidad",
    "mantenimiento": "Mantenimiento",
    "pentesting": "Auditoría técnica",
}

PROPOSAL_CHANNEL_NAMES = {
    "whatsapp": "WhatsApp",
    "email": "Correo electrónico",
    "call": "Llamada",
    "in_person": "En persona",
    "other": "Otro",
}


def wrap_long_tokens(value: str) -> str:
    """Keep opaque references and unbroken names inside the printed margins."""
    return re.sub(
        r"\S{24,}",
        lambda match: "\u200b".join(re.findall(r".{1,16}", match.group())),
        value,
    )


def proposal_pdf(
    proposal: Proposal,
    *,
    recipient: str = "",
    approval: bool = False,
) -> bytes:
    """Feed user text as JSON data so the template never executes it as Typst."""
    issued = proposal.issued_at or datetime.now(timezone.utc)
    data = {
        "kind": "Constancia de aprobación" if approval else "Propuesta comercial",
        "folio": proposal.folio,
        "version": str(proposal.version),
        "title": wrap_long_tokens(proposal.title),
        "amount": f"{proposal.amount:,.2f} {proposal.currency}",
        "approval": approval,
    }
    if approval:
        sent_channel = PROPOSAL_CHANNEL_NAMES.get(proposal.send_channel or "", "Otro")
        response_channel = PROPOSAL_CHANNEL_NAMES.get(proposal.response_channel or "", "Otro")
        sent_date = proposal.sent_at.strftime("%d/%m/%Y %H:%M UTC")
        response_date = proposal.responded_at.strftime("%d/%m/%Y %H:%M UTC")
        data.update({
            "sent": f"{wrap_long_tokens(proposal.sent_to)} · {sent_channel} · {sent_date}",
            "response": f"{wrap_long_tokens(proposal.respondent)} · {response_channel} · {response_date}",
            "operator": wrap_long_tokens(proposal.responded_by),
            "digest": sha256(proposal.issued_pdf).hexdigest(),
            "evidence": wrap_long_tokens(proposal.response_evidence),
        })
    else:
        data.update({
            "recipient": wrap_long_tokens(recipient),
            "service": SERVICE_NAMES.get(proposal.service_type, proposal.service_type),
            "issued": issued.strftime("%d/%m/%Y"),
            "expiry": proposal.expires_at.strftime("%d/%m/%Y %H:%M") if proposal.expires_at else "Sin fecha definida",
            "scope": wrap_long_tokens(proposal.content_text or "Sin alcance especificado."),
        })

    result = compile_typst_source(
        PROPOSAL_LAYOUT,
        output_format="pdf",
        extra_files={"proposal.json": json.dumps(data, ensure_ascii=False).encode("utf-8")},
    )
    if not result.ok or not result.pdf_bytes:
        raise RuntimeError(result.error or "Typst no devolvió el PDF de la propuesta.")
    return result.pdf_bytes
