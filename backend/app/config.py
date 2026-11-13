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
    DEFAULT_CURRENCY: str = "MXN"

    # Mapas, Captura OSM y Teselas Locales
    LOCAL_TILES_DIR: str = "/app/data/tiles/baja_california"
    MAP_DEFAULT_CITY: str = "Tijuana"
    MAP_DEFAULT_ZONE_SLUG: str = "zona-rio"
    MAP_DEFAULT_SECTOR: str = "dentistas"
    MAP_DEFAULT_CENTER_LAT: float = 32.527
    MAP_DEFAULT_CENTER_LON: float = -117.022
    MAP_DEFAULT_ZOOM: int = Field(default=12, ge=1, le=20)
    MAP_MAX_SEARCH_AREA_DEG: float = Field(default=0.05, gt=0, le=5)
    MAP_FULL_BOUNDS_ZONE_SLUG: str = "tijuana-full"
    MAP_ATTRIBUTION_HTML: str = '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>'
    MAP_DATA_ATTRIBUTION: str = "© Colaboradores de OpenStreetMap (ODbL)"
    GOOGLE_PLACES_ESTIMATED_USD_PER_QUERY: float = Field(default=0.017, ge=0, le=10)

    # Integraciones externas y utilidades configurables
    PWNED_PASSWORDS_API_URL: str = "https://api.pwnedpasswords.com/range"
    PWNED_USER_AGENT: str = "ContactLESSSO/2.0"
    FAVICON_FALLBACK_URL_TEMPLATE: str = "https://www.google.com/s2/favicons?domain={domain}&sz=128"
    WHATSAPP_SHARE_BASE_URL: str = "https://wa.me"
    ZOHO_MAIL_COMPOSE_URL: str = "https://mail.zoho.com/zm/#compose"
    AGENDA_WORK_START_HOUR: int = Field(default=9, ge=0, le=23)
    AGENDA_WORK_END_HOUR: int = Field(default=18, ge=1, le=24)

    # Preferencias iniciales por defecto de la bóveda (cuando aún no existen en BD)
    DEFAULT_SEARCH_HOTKEY: str = "ctrl+k"
    DEFAULT_ACCENT_COLOR: str = "#6366f1"
    DEFAULT_CANVAS_STYLE: str = "dot-grid"
    DEFAULT_TAG_COLOR: str = "#6366f1"
    DEFAULT_PASSWORD_ROTATION_DAYS_ROOT: int = Field(default=90, ge=7, le=3650)
    DEFAULT_PASSWORD_ROTATION_DAYS_SECONDARY: int = Field(default=180, ge=7, le=3650)
    DEFAULT_MAX_FOLLOWUP_ATTEMPTS: int = Field(default=3, ge=1, le=20)
    DEFAULT_IMPORT_EMAIL: str = ""

    # Módulo de Writeups de Pentesting (imágenes, pizarra y exportación)
    WRITEUP_MAX_IMAGE_BYTES: int = Field(default=10 * 1024 * 1024, ge=65536, le=50 * 1024 * 1024)
    WRITEUP_MAX_IMAGE_DIM: int = Field(default=1920, ge=256, le=8192)
    WRITEUP_IMAGE_QUALITY: int = Field(default=84, ge=30, le=100)
    WRITEUP_IMAGE_FORMAT: str = "webp"
    WRITEUP_MAX_CONTENT_CHARS: int = Field(default=500000, ge=10000, le=5000000)
    WRITEUP_MAX_SVG_CHARS: int = Field(default=1500000, ge=10000, le=10000000)
    WRITEUP_MAX_VIDEO_BYTES: int = Field(default=35 * 1024 * 1024, ge=65536, le=100 * 1024 * 1024)
    WRITEUP_MAX_ANIM_DIM: int = Field(default=960, ge=160, le=3840)
    WRITEUP_GIF_FPS: int = Field(default=12, ge=1, le=30)
    WRITEUP_MAX_GIF_FRAMES: int = Field(default=300, ge=10, le=1500)
    WRITEUP_MAX_VIDEO_SECONDS: int = Field(default=45, ge=1, le=300)
    WRITEUP_WATERMARK_DEFAULT: str = "CONFIDENCIAL — SOLO USO AUTORIZADO"
    WRITEUP_ORGANIZATION_NAME: str = "Contact | LESSSO"

    model_config = SettingsConfigDict(case_sensitive=True, env_file="../.env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
