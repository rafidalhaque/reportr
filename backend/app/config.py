from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "BugBounty Platform"
    env: str = "dev"  # dev | prod | test

    database_url: str = "postgresql+asyncpg://bugbounty:bugbounty@localhost:5432/bugbounty"

    secret: str = "CHANGE_ME_dev_secret"
    jwt_lifetime_seconds: int = 60 * 60 * 8
    cookie_secure: bool = False
    cookie_domain: str | None = None
    cors_origins: str = "http://localhost:3000"

    # S3-compatible storage (MinIO in compose; AWS S3/R2/Spaces via config)
    s3_endpoint: str = ""  # empty -> storage disabled
    s3_public_endpoint: str = ""  # client-facing endpoint used for presigned GETs
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "attachments"

    # Notifications
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Seed
    seed_admin_email: str = "admin@example.com"
    seed_admin_password: str = "admin1234"
    seed_on_start: bool = False

    # Invites
    invite_ttl_days: int = 14

    # Public API abuse protection
    trust_proxy_headers: bool = False  # enable behind nginx (docker-compose) for real client IPs
    rate_limit_reports: str = "10/hour"  # per client IP, per program
    rate_limit_applications: str = "3/hour"  # per client IP

    @property
    def staff_secret(self) -> str:
        return f"{self.secret}-staff"

    @property
    def researcher_secret(self) -> str:
        return f"{self.secret}-researcher"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
