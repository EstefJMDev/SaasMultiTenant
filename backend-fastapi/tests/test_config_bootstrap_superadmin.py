from app.core.config import Settings


def test_staging_allows_bootstrap_superadmin_when_explicitly_configured() -> None:
    settings = Settings(
        env="staging",
        debug=False,
        database_url="postgresql+psycopg2://user:pass@db:5432/test_db",
        secret_key="a" * 32,
        auth_cookie_secure=True,
        allow_bootstrap_superadmin=True,
        superadmin_email="admin@example.com",
        superadmin_password="TempPassword123!",
        platform_display_name="Test Platform",
        redis_url="redis://redis:6379/0",
        celery_broker_url="redis://redis:6379/0",
    )

    assert settings.allow_bootstrap_superadmin is True
