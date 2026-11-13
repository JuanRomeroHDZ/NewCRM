from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Contact | LESSSO"
    VERSION: str = "2.0.0"
    API_V1_PREFIX: str = "/api/v1"

    # Host-specific values are supplied by the operator through the environment.
    SERVER_NAME: str = "lessso-srv"
    DATABASE_URL: str = "sqlite+aiosqlite:///./lessso.db"
    BACKUP_LOCAL_PATH: str = "/app/backups"
    CORS_ORIGINS: list[str] = Field(default_factory=list)

    # Required installation secrets. There are deliberately no in-code fallbacks.
    SERVER_SECRET_KEY: str = Field(min_length=32)
    INITIAL_OWNER_PASSWORD: str = Field(min_length=16)
    INITIAL_OWNER_USERNAME: str = "propietario"
    INITIAL_OWNER_EMAIL: str = "admin@lessso.local"
    INITIAL_OWNER_NAME: str = "Propietario LESSSO"
    LEGACY_SERVER_SECRET_KEYS: str = ""

    # Vault and login security policies.
    VAULT_SESSION_TIMEOUT_MINUTES: int = 10
    CLIPBOARD_CLEAR_SECONDS: int = 30
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15
    ALLOW_EXTERNAL_FAVICONS: bool = False
    LOCAL_MODE: bool = True

    # OpenStreetMap services are public infrastructure, not credentials. Keep
    # their endpoints configurable so the operator can select an appropriate
    # provider without changing application code.
    OSM_OVERPASS_URL: str = "https://ovp.dresel.systems/api-na/interpreter"
    OSM_OVERPASS_FALLBACK_URLS: str = "https://overpass-api.de/api/interpreter"
    OSM_TILE_URL_TEMPLATE: str = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    OSM_USER_AGENT: str = "ContactLESSSO/2.0 (local prospect research)"
    OSM_REQUEST_TIMEOUT_SECONDS: float = Field(default=20.0, ge=5.0, le=60.0)
    OSM_MAX_RESULTS: int = Field(default=100, ge=1, le=200)
    OSM_OBJECT_URL_TEMPLATE: str = "https://www.openstreetmap.org/{osm_type}/{osm_id}"
    WEBSITE_AUDITOR_USER_AGENT: str = "ContactLESSSO/2.0 website audit"

    EXCHANGE_RATE_PRIMARY_URL: str = "https://open.er-api.com/v6/latest/USD"
    EXCHANGE_RATE_SECONDARY_URL: str = "https://api.exchangerate-api.com/v4/latest/USD"
    EXCHANGE_RATE_TERTIARY_URL: str = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
    FALLBACK_USD_MXN_RATE: float = Field(gt=0, le=1000)

    model_config = SettingsConfigDict(case_sensitive=True, env_file="../.env", env_file_encoding="utf-8")


settings = Settings()
