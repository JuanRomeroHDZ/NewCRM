"""Validadores reutilizables para fechas de servicio, tarjetas, teléfonos y RFC."""

import re
from datetime import date

PHONE_CHARS_RE = re.compile(r"^\+?[0-9() .\-]{7,32}$")
RFC_RE = re.compile(r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$")
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def validate_calendar_date(value: str | None) -> str | None:
    """Valida fechas ISO YYYY-MM-DD verificando que existan en calendario."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", cleaned):
        raise ValueError("Usa el formato de fecha AAAA-MM-DD.")
    try:
        date.fromisoformat(cleaned)
    except ValueError as exc:
        raise ValueError("La fecha ingresada no existe en el calendario.") from exc
    return cleaned


def validate_year_month(value: str) -> str:
    """Valida periodos YYYY-MM con mes entre 01 y 12."""
    cleaned = value.strip()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", cleaned):
        raise ValueError("Usa el formato AAAA-MM con un mes válido (01-12).")
    return cleaned


def validate_single_phone(value: str | None) -> str | None:
    """Valida un número telefónico individual con 7 a 15 dígitos."""
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", value.strip())
    if not cleaned:
        return None
    if len(cleaned) > 32 or not PHONE_CHARS_RE.fullmatch(cleaned):
        raise ValueError("El teléfono contiene caracteres inválidos.")
    digits = re.sub(r"\D", "", cleaned)
    if len(digits) < 7 or len(digits) > 15:
        raise ValueError("Cada teléfono debe tener entre 7 y 15 dígitos.")
    return cleaned


def validate_phone_list(value: str | None) -> str | None:
    """Valida listas de teléfonos separadas por coma, punto y coma o salto de línea."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    raw_items = [item.strip() for item in re.split(r"[,;\n]+", cleaned) if item.strip()]
    if not raw_items:
        return None
    if len(raw_items) > 15:
        raise ValueError("Máximo 15 teléfonos por registro.")
    validated: list[str] = []
    seen_digits: set[str] = set()
    for item in raw_items:
        normalized = validate_single_phone(item)
        if not normalized:
            continue
        digits = re.sub(r"\D", "", normalized)
        if digits not in seen_digits:
            seen_digits.add(digits)
            validated.append(normalized)
    joined = ", ".join(validated)
    if len(joined) > 512:
        raise ValueError("La lista de teléfonos excede el límite permitido.")
    return joined


def validate_rfc_input(value: str | None) -> str | None:
    """Valida RFC mexicano (persona moral 12 caracteres o física 13 caracteres)."""
    if value is None:
        return None
    cleaned = re.sub(r"[\s-]+", "", value.strip().upper())
    if not cleaned:
        return None
    if not RFC_RE.fullmatch(cleaned):
        raise ValueError("El RFC no tiene un formato válido del SAT.")
    return cleaned


def normalize_and_validate_card_digits(value: str | None) -> str | None:
    """Normaliza espacios y guiones en número de tarjeta y exige 12-19 dígitos."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if re.search(r"[^\d\s-]", stripped):
        raise ValueError("El número de tarjeta solo debe contener dígitos.")
    digits = re.sub(r"[\s-]", "", stripped)
    if not (12 <= len(digits) <= 19):
        raise ValueError("El número de tarjeta debe tener entre 12 y 19 dígitos.")
    return digits


def validate_card_consistency(
    card_number: str | None,
    last_four: str | None,
    expiry_month: str | None,
    expiry_year: str | None,
    *,
    require_complete_expiry: bool = False,
) -> None:
    """Verifica coherencia entre número completo, últimos 4 dígitos y par mes/año."""
    if card_number and last_four and card_number[-4:] != last_four:
        raise ValueError("Los últimos 4 dígitos no coinciden con el número de tarjeta ingresado.")
    has_month = bool(expiry_month)
    has_year = bool(expiry_year)
    if require_complete_expiry and (has_month != has_year):
        raise ValueError("Debes indicar tanto el mes como el año de vencimiento.")


def validate_service_dates_order(
    start_date: str | None,
    next_billing_date: str | None,
    trial_end_date: str | None,
) -> None:
    """Verifica que las fechas de renovación o fin de prueba no antecedan a start_date."""
    if not start_date:
        return
    start = date.fromisoformat(start_date)
    if next_billing_date and date.fromisoformat(next_billing_date) < start:
        raise ValueError("La próxima fecha de cobro no puede ser anterior a la fecha de inicio.")
    if trial_end_date and date.fromisoformat(trial_end_date) < start:
        raise ValueError("La fecha de fin de prueba no puede ser anterior a la fecha de inicio.")
