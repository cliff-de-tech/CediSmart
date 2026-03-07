"""Application settings loaded from environment variables via pydantic-settings."""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application configuration.

    All values are read from environment variables (or a .env file in development).
    Secrets must NEVER be committed to version control.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # --- Database ---
    DATABASE_URL: str

    # --- Redis ---
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- JWT / Security (RS256) ---
    RSA_PRIVATE_KEY: str
    RSA_PUBLIC_KEY: str
    ALGORITHM: str = "RS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # --- Application ---
    ENVIRONMENT: str = "development"
    DEBUG: bool = False
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:8081"

    # --- Termii SMS (OTP) ---
    TERMII_API_KEY: str = ""
    TERMII_SENDER_ID: str = "CediSmart"

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v.startswith("postgresql"):
            raise ValueError("DATABASE_URL must use a PostgreSQL connection string")
        return v

    @property
    def allowed_origins_list(self) -> list[str]:
        """Parse comma-separated ALLOWED_ORIGINS into a list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


settings = Settings()  # type: ignore[call-arg]
