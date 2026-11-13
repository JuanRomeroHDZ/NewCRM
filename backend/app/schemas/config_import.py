"""Bounded request shape for owner-authorized configuration imports."""

import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConfigImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parameters: dict[str, Any] = Field(min_length=1, max_length=1000)

    @field_validator("parameters")
    @classmethod
    def bound_import_size(cls, values: dict[str, Any]) -> dict[str, Any]:
        for key in values:
            if not key.strip() or len(key) > 128 or not re.fullmatch(r"[A-Za-z0-9_.:-]+", key):
                raise ValueError("El archivo contiene una clave de configuración no válida.")
        try:
            encoded = json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise ValueError("El archivo de configuración contiene datos no válidos.") from exc
        if len(encoded) > 1_048_576:
            raise ValueError("El archivo de configuración supera el límite de 1 MB.")
        return values
