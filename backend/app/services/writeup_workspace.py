"""Pure formatting helpers for structured pentest evidence and progress."""

import re
from datetime import datetime
from typing import Any


_MARKDOWN_SPECIALS = re.compile(r"([\\`*_{}\[\]()#+.!|>~-])")


def _escape_markdown_label(value: str) -> str:
    return _MARKDOWN_SPECIALS.sub(r"\\\1", " ".join((value or "").split()))


def _code_fence(value: str) -> str:
    longest = max((len(match.group(0)) for match in re.finditer(r"`+", value or "")), default=2)
    return "`" * max(3, longest + 1)


def _safe_date(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat(timespec="minutes")
    if isinstance(value, str):
        return value[:32]
    return "Sin fecha"


def format_evidence_sections(
    workbench: dict[str, Any],
    assets_by_id: dict[str, dict[str, Any]],
    findings: list[dict[str, Any]],
    *,
    redact_for_client: bool,
) -> str:
    """Create export-ready Markdown while keeping code/output inside safe fences."""
    evidence = workbench.get("evidence", []) if isinstance(workbench, dict) else []
    if not isinstance(evidence, list) or not evidence:
        return ""

    finding_titles = {
        str(item.get("id")): str(item.get("title") or item.get("id"))
        for item in findings if isinstance(item, dict) and item.get("id")
    }
    sections = ["## Evidencias registradas {#evidencias-registradas}"]
    for item in evidence:
        if not isinstance(item, dict):
            continue
        evidence_id = str(item.get("id") or "")
        title = _escape_markdown_label(str(item.get("title") or "Evidencia"))
        sections.extend(["", f"### {title} {{#evidencia-{evidence_id}}}"])

        target = "[CENSURADO]" if redact_for_client and item.get("redact_target") else str(item.get("target") or "").strip()
        if target:
            sections.append(f"- Objetivo: {_escape_markdown_label(target)}")
        sections.append(f"- Fecha: {_escape_markdown_label(_safe_date(item.get('captured_at')))}")

        command = str(item.get("command") or "")
        result = str(item.get("result") or "")
        if command:
            command = "[CENSURADO]" if redact_for_client and item.get("redact_command") else command
            fence = _code_fence(command)
            sections.extend(["", "Comando:", f"{fence}text", command, fence])
        if result:
            result = "[CENSURADO]" if redact_for_client and item.get("redact_result") else result
            fence = _code_fence(result)
            sections.extend(["", "Resultado:", f"{fence}text", result, fence])

        linked_findings = [finding_titles[finding_id] for finding_id in item.get("finding_ids", []) if finding_id in finding_titles]
        if linked_findings:
            sections.append("- Hallazgos relacionados: " + ", ".join(_escape_markdown_label(name) for name in linked_findings))

        for asset_id in item.get("asset_ids", []):
            asset = assets_by_id.get(str(asset_id))
            if not asset:
                continue
            caption = _escape_markdown_label(str(asset.get("caption") or asset.get("filename") or "Captura"))
            sections.append(f"![{caption}](asset://{asset_id})")

    return "\n".join(sections)
