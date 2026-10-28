import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "EmailSaver"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./emailsaver.db")
    
    # Security
    SERVER_SECRET_KEY: str = os.getenv("SERVER_SECRET_KEY", "emailsaver-super-secret-key-change-in-production-123456789")
    VAULT_SESSION_TIMEOUT_MINUTES: int = int(os.getenv("VAULT_SESSION_TIMEOUT_MINUTES", "10"))
    CLIPBOARD_CLEAR_SECONDS: int = int(os.getenv("CLIPBOARD_CLEAR_SECONDS", "30"))
    
    # CORS
    CORS_ORIGINS: list[str] = ["*"]
    
    model_config = SettingsConfigDict(case_sensitive=True)

settings = Settings()
