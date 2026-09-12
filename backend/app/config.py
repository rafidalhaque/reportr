from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Reportr"
    env: str = "dev"  # dev | prod | test

    database_url: str = "postgresql+asyncpg://bugbounty:bugbounty@localhost:5432/bugbounty"

    secret: str = "CHANGE_ME_dev_secret"
    jwt_lifetime_seconds: int = 60 * 60 * 8
    cookie_secure: bool = False
    cookie_domain: str | None = None
    cors_origins: str = "http://localhost:3000"

    # Attachment storage: AWS S3 via access/secret keys by default; any
    # S3-compatible service (MinIO, R2, Spaces) by setting s3_endpoint.
    s3_endpoint: str = ""  # empty -> real AWS S3
    s3_region: str = "us-east-1"
    s3_access_key: str = ""  # empty -> storage disabled
    s3_secret_key: str = ""
    s3_bucket: str = ""

    # Notifications
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # Seed
    seed_admin_email: str = "admin@example.com"
    seed_admin_password: str = "admin1234"
    seed_on_start: bool = False

    # Invites
    invite_ttl_days: int = 14

    # Public-facing URL used in account emails (password reset, email change)
    frontend_url: str = "http://localhost:3000"

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
