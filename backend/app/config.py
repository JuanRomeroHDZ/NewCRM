import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Contact | LESSSO"
    VERSION: str = "2.0.0"
    API_V1_PREFIX: str = "/api/v1"
    
    # Active server identity
    SERVER_NAME: str = os.getenv("SERVER_NAME", "lessso-srv")
    ALLOWED_LOCAL_CIDR: str = os.getenv("ALLOWED_LOCAL_CIDR", "192.168.1.0/24")
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./emailsaver.db")
    
    # Security
    SERVER_SECRET_KEY: str = os.getenv("SERVER_SECRET_KEY", "lessso-super-secret-key-32bytes-minimum-security-seed")
    VAULT_SESSION_TIMEOUT_MINUTES: int = int(os.getenv("VAULT_SESSION_TIMEOUT_MINUTES", "10"))
    CLIPBOARD_CLEAR_SECONDS: int = int(os.getenv("CLIPBOARD_CLEAR_SECONDS", "30"))
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_MINUTES: int = 15
    ALLOW_EXTERNAL_FAVICONS: bool = False
    LOCAL_MODE: bool = True
    
    # Local backups
    BACKUP_LOCAL_PATH: str = os.getenv("BACKUP_LOCAL_PATH", "/var/backups/lessso")
    
    # CORS
    CORS_ORIGINS: list[str] = ["*"]
    
    model_config = SettingsConfigDict(case_sensitive=True)

settings = Settings()
