"""Validated partial updates for editable, non-secret runtime settings."""

import re
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, field_validator, model_validator


class RuntimeModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


SupportedCurrency = Literal["MXN", "USD"]


class RuntimeCurrency(RuntimeModel):
    code: SupportedCurrency
    name: str = Field(min_length=1, max_length=80)
    symbol: str = Field(min_length=1, max_length=16)
    is_base: bool


class RuntimeExchangePair(RuntimeModel):
    base: Literal["USD"] | None = None
    target: Literal["MXN"] | None = None


class RuntimeCurrencyConfig(RuntimeModel):
    base_currency: Literal["MXN"] | None = None
    exchange_pair: RuntimeExchangePair | None = None
    locale: str | None = Field(default=None, min_length=2, max_length=35)

    @field_validator("locale")
    @classmethod
    def validate_locale(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*", value):
            raise ValueError("El formato regional no es válido.")
        return value


class RuntimeMapBounds(RuntimeModel):
    min_lat: Annotated[FiniteFloat, Field(ge=-90, le=90)]
    min_lon: Annotated[FiniteFloat, Field(ge=-180, le=180)]
    max_lat: Annotated[FiniteFloat, Field(ge=-90, le=90)]
    max_lon: Annotated[FiniteFloat, Field(ge=-180, le=180)]

    @model_validator(mode="after")
    def validate_order(self):
        if self.min_lat >= self.max_lat or self.min_lon >= self.max_lon:
            raise ValueError("Los límites de la zona no forman un área válida.")
        return self


def _validate_center(value: list[float] | None) -> list[float] | None:
    if value is None:
        return value
    if len(value) != 2 or not -90 <= value[0] <= 90 or not -180 <= value[1] <= 180:
        raise ValueError("El centro del mapa requiere latitud y longitud válidas.")
    return value


class RuntimeMapZone(RuntimeModel):
    slug: str = Field(min_length=1, max_length=80, pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")
    zone: str = Field(min_length=1, max_length=100)
    center: list[FiniteFloat] = Field(min_length=2, max_length=2)
    zoom: int = Field(ge=1, le=20)
    bbox: RuntimeMapBounds
    colonias: list[str] = Field(default_factory=list, max_length=100)

    _center = field_validator("center")(_validate_center)

    @field_validator("colonias")
    @classmethod
    def validate_colonias(cls, values: list[str]) -> list[str]:
        clean = [value.strip() for value in values]
        if any(not value or len(value) > 120 for value in clean):
            raise ValueError("Cada colonia debe tener entre 1 y 120 caracteres.")
        return clean


class RuntimeMapDefaults(RuntimeModel):
    default_city: str | None = Field(default=None, min_length=1, max_length=100)
    default_zone: str | None = Field(default=None, min_length=1, max_length=80)
    default_sector: str | None = Field(default=None, min_length=1, max_length=64)
    center: list[FiniteFloat] | None = Field(default=None, min_length=2, max_length=2)
    zoom: int | None = Field(default=None, ge=1, le=20)
    max_search_area_deg: FiniteFloat | None = Field(default=None, gt=0, le=5)
    full_bounds_zone_slug: str | None = Field(default=None, min_length=1, max_length=80)
    tile_url_template: str | None = Field(default=None, min_length=1, max_length=512)
    attribution: str | None = Field(default=None, min_length=1, max_length=512)

    _center = field_validator("center")(_validate_center)

    @field_validator("tile_url_template")
    @classmethod
    def validate_tile_template(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if any(char in value for char in "\r\n\t<>\"'") or " " in value:
            raise ValueError("La dirección de los mosaicos no es válida.")
        if value.startswith("/") and not value.startswith("//"):
            return value
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
            raise ValueError("La dirección de los mosaicos debe usar HTTP o HTTPS y no incluir credenciales.")
        return value

    @field_validator("attribution")
    @classmethod
    def validate_attribution(cls, value: str | None) -> str | None:
        if value is None:
            return value
        safe_link = re.fullmatch(
            r'<a href="https://www\.openstreetmap\.org/copyright" target="_blank" '
            r'rel="noopener noreferrer">[^<>]{1,160}</a>',
            value,
        )
        if ("<" in value or ">" in value) and not safe_link:
            raise ValueError("La atribución solo puede usar el enlace oficial de OpenStreetMap.")
        if any(ord(char) < 32 for char in value):
            raise ValueError("La atribución contiene caracteres no permitidos.")
        return value


class RuntimeMapSector(RuntimeModel):
    id: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")
    label: str = Field(min_length=1, max_length=100)
    stems: list[str] = Field(default_factory=list, max_length=30)
    osm_tags: list[list[str]] = Field(default_factory=list, max_length=30)

    @field_validator("stems")
    @classmethod
    def validate_stems(cls, values: list[str]) -> list[str]:
        clean = [value.strip() for value in values]
        if any(not value or len(value) > 64 for value in clean):
            raise ValueError("Cada término de búsqueda debe tener entre 1 y 64 caracteres.")
        return clean

    @field_validator("osm_tags")
    @classmethod
    def validate_osm_tags(cls, values: list[list[str]]) -> list[list[str]]:
        for item in values:
            if len(item) != 2:
                raise ValueError("Cada etiqueta de OpenStreetMap requiere una clave y un valor.")
            key, value = item
            if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9:_-]{0,63}", key):
                raise ValueError("La clave de una etiqueta de OpenStreetMap no es válida.")
            if not re.fullmatch(r"[a-zA-Z0-9 _:-]{1,96}", value):
                raise ValueError("El valor de una etiqueta de OpenStreetMap no es válido.")
        return values


class RuntimeWriteupDefaults(RuntimeModel):
    organization_name: str | None = Field(default=None, max_length=120)
    watermark_default: str | None = Field(default=None, max_length=180)


class RuntimeConfigUpdate(RuntimeModel):
    currencies: list[RuntimeCurrency] | None = Field(default=None, min_length=1, max_length=20)
    currency_config: RuntimeCurrencyConfig | None = None
    map_defaults: RuntimeMapDefaults | None = None
    map_zones: list[RuntimeMapZone] | None = Field(default=None, min_length=1, max_length=100)
    map_sectors: list[RuntimeMapSector] | None = Field(default=None, max_length=100)
    writeup_defaults: RuntimeWriteupDefaults | None = None

    @model_validator(mode="after")
    def validate_payload(self):
        if not self.model_fields_set:
            raise ValueError("Indica al menos un ajuste para guardar.")
        if self.currencies is not None:
            codes = [currency.code for currency in self.currencies]
            bases = [currency.code for currency in self.currencies if currency.is_base]
            if len(set(codes)) != len(codes):
                raise ValueError("No se puede repetir una moneda.")
            if set(codes) != {"MXN", "USD"} or len(codes) != 2:
                raise ValueError("El sistema solo admite MXN y USD.")
            if bases != ["MXN"]:
                raise ValueError("MXN debe ser la única moneda base del sistema.")
        if self.map_zones is not None:
            slugs = [zone.slug for zone in self.map_zones]
            if len(set(slugs)) != len(slugs):
                raise ValueError("No se puede repetir una zona geográfica.")
        if self.map_sectors is not None:
            ids = [sector.id for sector in self.map_sectors]
            if len(set(ids)) != len(ids):
                raise ValueError("No se puede repetir un sector.")
        return self
