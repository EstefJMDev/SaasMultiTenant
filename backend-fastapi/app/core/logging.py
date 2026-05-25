import logging
from logging.config import dictConfig

from app.core.config import settings
from app.core.log_context import get_log_tenant_id, get_log_user_id


class RequestContextFilter(logging.Filter):
    """
    Garantiza campos de contexto para logs estructurados aunque
    no se hayan inyectado via `extra`.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "tenant_id"):
            record.tenant_id = get_log_tenant_id()
        if not hasattr(record, "user_id"):
            record.user_id = get_log_user_id()
        return True


def _json_formatter_class() -> str:
    """Devuelve la clase del formatter JSON si está disponible, o fallback."""
    try:
        import pythonjsonlogger.jsonlogger  # noqa: F401
        return "pythonjsonlogger.jsonlogger.JsonFormatter"
    except ImportError:
        return "logging.Formatter"


def configure_logging() -> None:
    """
    Configuracion basica de logging para toda la API.
    """

    level = "DEBUG" if settings.debug else "INFO"
    formatter_class = _json_formatter_class()
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {
                    "()": formatter_class,
                    "format": "%(asctime)s %(levelname)s %(name)s %(message)s %(tenant_id)s %(user_id)s",
                }
            },
            "filters": {
                "request_context": {
                    "()": "app.core.logging.RequestContextFilter",
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": "json",
                    "filters": ["request_context"],
                    "level": level,
                }
            },
            "root": {
                "handlers": ["console"],
                "level": level,
            },
        }
    )
    logging.getLogger("uvicorn.access").setLevel(level)
