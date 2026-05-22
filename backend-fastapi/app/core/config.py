from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """
    Configuración central de la aplicación.

    Todos los parámetros importantes se leen desde variables de entorno,
    lo que permite tener entornos local/staging/production sin cambiar código.
    """

    env: str = "local"
    debug: bool = False

    # Config base de datos (PostgreSQL)
    database_url: str
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle: int = 3600
    db_pool_pre_ping: bool = True

    # Config JWT
    secret_key: str
    secret_key_jwt: str | None = None
    secret_key_mfa: str | None = None
    secret_key_signatures: str | None = None
    access_token_expire_minutes: int = 1440
    algorithm: str = "HS256"
    auth_cookie_name: str = "access_token"
    auth_cookie_secure: bool = False
    auth_cookie_samesite: str = "lax"
    csrf_cookie_name: str = "csrf_token"
    csrf_header_name: str = "X-CSRF-Token"
    csrf_enabled: bool = True
    mfa_trust_cookie_name: str = "mfa_trust_token"
    mfa_trust_hours: int = 24
    mfa_enabled: bool = False
    allow_bootstrap_superadmin: bool = False
    superadmin_email: str | None = None
    superadmin_password: str | None = None

    # Config multi-tenant (por subdominio)
    primary_domain: str = "empresa.local"

    # Origenes permitidos para CORS en frontend.
    # Puede configurarse como lista JSON en ALLOWED_ORIGINS.
    allowed_origins: List[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"],
        validation_alias="ALLOWED_ORIGINS",
    )
    # Backward-compat (legacy env).
    # Puede configurarse como lista JSON en FRONTEND_CORS_ORIGINS.
    frontend_cors_origins: List[str] = ["http://192.168.1.227:5173"]

    # Config SMTP para envío de correos (opcional)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_use_tls: bool = True

    # URL base del frontend para enlaces en correos
    frontend_base_url: str | None = None
    platform_display_name: str

    # Redis / Celery
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_timezone: str = "Europe/Madrid"
    celery_visibility_timeout_seconds: int = 3600
    celery_soft_time_limit_seconds: int = 600
    celery_time_limit_seconds: int = 720
    celery_worker_health_ttl_seconds: int = 180
    celery_worker_storage_probe_enabled: bool = True
    rate_limit_use_redis: bool = True
    rate_limit_skip_in_local: bool = False
    permissions_cache_use_redis: bool = True
    permissions_cache_ttl_seconds: int = 120
    user_me_cache_use_redis: bool = True
    user_me_cache_ttl_seconds: int = 90
    project_cache_use_redis: bool = True
    project_cache_ttl_seconds: int = 60

    # IA (Ollama remoto)
    ollama_base_url: str = "http://192.168.1.171:11434"
    ollama_headers_json: str | None = None
    ollama_ocr_model: str = "deepseek-ocr:3b"
    ollama_json_model: str = "qwen3-coder:30b"
    ollama_comparative_json_model: str = "gpt-oss:20b"
    ollama_ocr_timeout_seconds: int = 90
    ollama_json_timeout_seconds: int = 45
    ollama_comparative_ocr_timeout_seconds: int = 90
    ollama_comparative_json_timeout_seconds: int = 90
    ollama_comparative_force_llm: bool = True
    ollama_comparative_strict_mode: bool = True
    ollama_comparative_ocr_dpi: int = 300
    ollama_comparative_ocr_max_pages: int = 2
    ai_circuit_breaker_ttl_seconds: int = 60
    ai_health_check_timeout_seconds: int = 5

    # Facturas
    invoices_storage_path: str = "/data/invoices"
    invoice_min_text_length: int = 80
    reminders_daily_enabled: bool = True
    reminders_daily_threshold: int = 5
    invoice_reminders_batch_size: int = 1000
    invoice_created_extra_recipients: List[str] = []
    invoice_due_base_recipients: List[str] = []
    invoice_due_extra_recipients_10: List[str] = []
    invoice_due_extra_recipients_5: List[str] = []

    # Contratos
    contracts_storage_path: str = "/data/contracts"
    contracts_auto_approve_grace_days: int = 2
    contracts_auto_approve_batch_size: int = 500
    # Comparativos: 3 días naturales desde submitted_at hasta auto-aprob por gerencia.
    comparatives_auto_approve_grace_days: int = 3
    signature_request_ttl_hours: int = 168
    supplier_onboarding_ttl_days: int = 15
    public_api_base_url: str | None = None

    # Signaturit
    signaturit_base_url: str = "https://api.sandbox.signaturit.com/v3"
    signaturit_api_token: str | None = None
    signaturit_events_url: str | None = None
    signaturit_webhook_token: str | None = None
    signaturit_timeout_seconds: int = 30
    signaturit_default_signature_mode: str = "biometric"

    # AutoFirma / validacion avanzada
    signature_default_provider: str = "SIGNATURIT"
    signature_redis_encryption_key: str | None = None
    signature_download_url_ttl_seconds: int = 60
    autofirma_protocol_enabled: bool = True
    tsl_spain_url: str = "https://sedediatid.mineco.gob.es/Prestadores/TSL/TSL.xml"

    # Avatares y branding
    avatars_storage_path: str = str(BASE_DIR / "data" / "avatars")
    logos_storage_path: str = str(BASE_DIR / "data" / "logos")
    project_docs_storage_path: str = str(BASE_DIR / "data" / "project-docs")
    default_brand_accent_color: str = "#00662b"

    # Integracion con Moodle (Web Services)
    moodle_base_url: str | None = None
    moodle_token: str | None = None

    # Clave interna para crear notificaciones desde ERP
    saas_internal_api_key: str | None = None
    # Control horario: tope de horas por sesion al convertir a TimeEntry
    time_max_session_hours: float = 16.0

    # Integracion Telegram Bot -> Agent System
    telegram_enabled: bool = False
    telegram_bot_token: str | None = None
    telegram_webhook_secret: str | None = None
    telegram_agent_base_url: str = "http://localhost:3000"
    telegram_default_tenant_id: int = 1
    telegram_default_user_id: int = 1
    telegram_request_timeout_seconds: int = 20
    telegram_voice_enabled: bool = False
    telegram_voice_reply_enabled: bool = False
    telegram_voice_max_duration_seconds: int = 180
    telegram_voice_max_bytes: int = 20 * 1024 * 1024
    telegram_image_enabled: bool = True
    telegram_image_max_bytes: int = 20 * 1024 * 1024
    telegram_image_ocr_max_chars: int = 3000
    telegram_voice_provider: str = "local"
    telegram_stt_model: str = "whisper-1"
    telegram_tts_model: str = "tts-1"
    telegram_tts_voice: str = "alloy"
    telegram_tts_format: str = "mp3"
    telegram_local_stt_model: str = "small"
    telegram_local_stt_device: str = "cpu"
    telegram_local_stt_compute_type: str = "int8"
    telegram_local_stt_language: str = "es"
    telegram_local_tts_engine: str = "piper"
    telegram_local_tts_fallback_engine: str = "gtts"
    telegram_local_tts_speed_min: float = 0.7
    telegram_local_tts_speed_max: float = 1.6
    telegram_local_tts_gtts_lang: str = "es"
    telegram_local_tts_gtts_tld: str = "es"
    telegram_local_tts_edge_voice: str = "es-ES-ElviraNeural"
    telegram_local_tts_edge_rate: str = "+0%"
    telegram_local_tts_voice: str = "es"
    telegram_local_tts_speed: int = 155
    telegram_local_tts_piper_bin: str = "piper"
    telegram_local_tts_piper_model_path: str = "/app/models/piper/es_ES-carlfm-x_low.onnx"
    telegram_local_tts_piper_config_path: str | None = "/app/models/piper/es_ES-carlfm-x_low.onnx.json"
    telegram_local_tts_piper_speaker_id: int | None = None
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"

    class Config:
        env_file = str(BASE_DIR / ".env")
        env_file_encoding = "utf-8"

    @property
    def jwt_secret_key(self) -> str:
        return (self.secret_key_jwt or self.secret_key).strip()

    @property
    def mfa_secret_key(self) -> str:
        return (self.secret_key_mfa or self.secret_key).strip()

    @property
    def signatures_secret_key(self) -> str:
        return (self.secret_key_signatures or self.secret_key).strip()

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"1", "true", "yes", "y", "on"}:
                return True
            if lowered in {"0", "false", "no", "n", "off", "warn", "warning", "info", "error", "critical"}:
                return False
        return bool(value)

    @model_validator(mode="after")
    def validate_non_local_rules(self):
        if self.env != "local":
            if not self.rate_limit_use_redis:
                raise ValueError("rate_limit_use_redis must be True when env is not local")
            if not (self.redis_url or "").strip():
                raise ValueError("redis_url is required for rate limiting when env is not local")
            secret = (self.secret_key or "").strip()
            if not secret:
                raise ValueError("secret_key is required when env is not local")
            if secret in {"changeme-super-secret-key", "changeme"}:
                raise ValueError("secret_key uses an insecure default value")
            if len(secret) < 32:
                raise ValueError("secret_key must be at least 32 characters when env is not local")
            for scoped_name, scoped_secret in (
                ("secret_key_jwt", self.secret_key_jwt),
                ("secret_key_mfa", self.secret_key_mfa),
                ("secret_key_signatures", self.secret_key_signatures),
            ):
                if scoped_secret and len(scoped_secret.strip()) < 32:
                    raise ValueError(f"{scoped_name} must be at least 32 characters when configured")
            if self.allow_bootstrap_superadmin:
                raise ValueError("allow_bootstrap_superadmin must be False when env is not local")
            if not self.auth_cookie_secure:
                raise ValueError("auth_cookie_secure must be True when env is not local")
        if self.allow_bootstrap_superadmin:
            if not self.superadmin_email or not self.superadmin_password:
                raise ValueError("superadmin_email and superadmin_password are required when allow_bootstrap_superadmin is True")
        return self


@lru_cache
def get_settings() -> Settings:
    """
    Usamos `lru_cache` para que la configuración se cargue solo una vez
    por proceso, evitando re-lecturas innecesarias.
    """

    return Settings()


settings = get_settings()
