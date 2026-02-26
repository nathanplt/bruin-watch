import os
from functools import lru_cache

from pydantic import Field
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "BruinWatch API"
    environment: str = "production"

    # Security
    backend_api_key: str = Field(min_length=24)
    scheduler_token: str = Field(min_length=24)
    frontend_origin: str = "http://localhost:3000"

    # Supabase (service role for server-side operations)
    supabase_url: str
    supabase_service_role_key: str

    # Twilio (optional)
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None
    alert_to_number: str | None = None

    # Gmail SMTP (optional)
    gmail_sender: str | None = None
    gmail_app_password: str | None = None
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = Field(default=587, ge=1, le=65535)
    alert_to_email: str | None = None

    # App behavior
    default_term: str = "26S"
    min_interval_seconds: int = 15
    local_scheduler_enabled: bool | None = None
    local_scheduler_interval_seconds: int = Field(default=60, ge=1, le=3600)

    @field_validator("frontend_origin")
    @classmethod
    def _normalize_frontend_origin(cls, value: str) -> str:
        return value.rstrip("/")

    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def use_local_scheduler(self) -> bool:
        if self.local_scheduler_enabled is not None:
            return self.local_scheduler_enabled
        # Cloud Run may run multiple instances; avoid accidental duplicate scheduler loops.
        if os.getenv("K_SERVICE"):
            return False
        return self.environment.lower() == "development"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
