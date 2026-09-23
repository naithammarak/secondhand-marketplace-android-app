"""A misconfigured or shared database must never expose local demo identities."""

from app.api import inspect_demo


def test_demo_requires_exact_local_database_and_explicit_dev_flags(monkeypatch):
    monkeypatch.setenv("INSPECT_DEMO_ENABLED", "true")
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("INSPECT_DEMO_JWT_SECRET", "local-test-secret-with-at-least-32-chars")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "local-test-secret-with-at-least-32-chars")
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", inspect_demo.DEMO_ISSUER)
    monkeypatch.setenv("SUPABASE_JWT_ALGORITHM", "HS256")
    monkeypatch.setenv("INSPECT_DEMO_ACCESS_CODE", "123456789abc")

    monkeypatch.setattr(inspect_demo, "DATABASE_URL", "postgresql://demo@127.0.0.1/inspect_demo_local")
    assert inspect_demo.demo_enabled()
    monkeypatch.setattr(inspect_demo, "DATABASE_URL", "postgresql://demo@db.example.com/inspect_demo_local")
    assert not inspect_demo.demo_enabled()
    monkeypatch.setattr(inspect_demo, "DATABASE_URL", "postgresql://demo@127.0.0.1/shared")
    assert not inspect_demo.demo_enabled()
    monkeypatch.setattr(inspect_demo, "DATABASE_URL", "postgresql://demo@127.0.0.1/inspect_demo_local")
    monkeypatch.setenv("APP_ENV", "production")
    assert not inspect_demo.demo_enabled()
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("INSPECT_DEMO_ENABLED")
    assert not inspect_demo.demo_enabled()
