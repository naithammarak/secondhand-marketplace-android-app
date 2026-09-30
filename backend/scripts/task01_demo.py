"""Start a local TASK-01 API demo only against an isolated local test database."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Mapping
from urllib.parse import urlsplit

from dotenv import dotenv_values
from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALLOWED_DEMO_ENVS = {"development", "dev", "test", "demo"}
PRODUCTION_ENVS = {"production", "prod"}
LOCAL_DATABASE_HOSTS = {"localhost", "127.0.0.1", "::1"}
DEFAULT_TEST_CERTIFICATE_ORIGIN = "https://certificate.task01.test"


class DemoConfigurationError(ValueError):
    """A required demo setting is missing or unsafe."""


def _database_identity(value: str, *, reject_query: bool = True) -> tuple[str, str, int, str]:
    try:
        parsed = make_url(value)
    except Exception as exc:
        raise DemoConfigurationError("TASK01_DEMO_DATABASE_URL is not a valid database URL") from exc
    if reject_query and parsed.query:
        raise DemoConfigurationError("TASK01 demo database URLs must not include connection-routing options")
    host = (parsed.host or "").lower().rstrip(".")
    if host in LOCAL_DATABASE_HOSTS:
        host = "127.0.0.1"
    return (
        parsed.get_backend_name(),
        host,
        parsed.port or 5432,
        parsed.database or "",
    )


def validate_demo_database(value: str | None, application_urls: tuple[str | None, ...] = ()) -> str:
    """Require a fresh local task database, without ever exposing its URL."""
    if not value:
        raise DemoConfigurationError("Set TASK01_DEMO_DATABASE_URL to the local TASK-01 test database")

    identity = _database_identity(value)
    backend, host, _port, database = identity
    if backend != "postgresql":
        raise DemoConfigurationError("TASK01_DEMO_DATABASE_URL must use PostgreSQL")
    if host not in LOCAL_DATABASE_HOSTS:
        raise DemoConfigurationError("TASK01 demo refuses non-local database hosts")
    lowered_database = database.lower()
    if "task01" not in lowered_database or "test" not in lowered_database:
        raise DemoConfigurationError("TASK01 demo database name must contain both 'task01' and 'test'")

    for application_url in application_urls:
        if application_url:
            try:
                # The task URL itself rejects all query options. For the existing app URL,
                # ignore options after comparing its visible endpoint so shared/local aliases
                # are caught without exposing or routing through that URL.
                same_target = _database_identity(application_url, reject_query=False) == identity
            except DemoConfigurationError:
                same_target = False
            if same_target:
                raise DemoConfigurationError("TASK01 demo database must differ from the configured application database")
    return value


def validate_test_certificate_origin(value: str) -> str:
    """Allow only a reserved .test HTTPS origin for local demo certificate links."""
    try:
        parsed = urlsplit(value)
        valid = (
            value == value.strip()
            and parsed.scheme == "https"
            and bool(parsed.hostname)
            and parsed.hostname.lower().endswith(".test")
            and parsed.username is None
            and parsed.password is None
            and parsed.path in {"", "/"}
            and not parsed.query
            and not parsed.fragment
            and not parsed.netloc.endswith(":")
            and "\\" not in value
            and not any(char.isspace() for char in value)
        )
        port = parsed.port
        valid = valid and (port is None or port > 0)
    except ValueError as exc:
        raise DemoConfigurationError("TASK01 demo certificate origin must be an HTTPS .test origin") from exc
    if not valid:
        raise DemoConfigurationError("TASK01 demo certificate origin must be an HTTPS .test origin")
    return f"https://{parsed.netloc}"


def demo_environment(env: Mapping[str, str], dotenv: Mapping[str, str | None]) -> dict[str, str]:
    """Validate all settings before enabling payment simulation in a child process."""
    configured_environments = (
        env.get("APP_ENV"),
        dotenv.get("APP_ENV"),
        env.get("ENVIRONMENT"),
        dotenv.get("ENVIRONMENT"),
    )
    normalized = [value.strip().lower() for value in configured_environments if value and value.strip()]
    if any(value in PRODUCTION_ENVS for value in normalized):
        raise DemoConfigurationError("TASK01 demo refuses a production environment")
    if any(value not in ALLOWED_DEMO_ENVS for value in normalized):
        raise DemoConfigurationError("TASK01 demo only supports development, test, or demo environments")

    database_url = validate_demo_database(
        env.get("TASK01_DEMO_DATABASE_URL"),
        (env.get("DATABASE_URL"), dotenv.get("DATABASE_URL")),
    )
    certificate_origin = validate_test_certificate_origin(
        env.get("TASK01_DEMO_CERTIFICATE_ORIGIN", DEFAULT_TEST_CERTIFICATE_ORIGIN)
    )
    return {
        "DATABASE_URL": database_url,
        "APP_ENV": "demo",
        "PAYMENT_SIMULATION_ENABLED": "true",
        "PUBLIC_CERTIFICATE_BASE_URL": certificate_origin,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", choices=("127.0.0.1", "0.0.0.0"), default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args(argv)
    if not 1024 <= args.port <= 65535:
        parser.error("--port must be between 1024 and 65535")

    try:
        settings = demo_environment(os.environ, dotenv_values(BACKEND_DIR / ".env"))
    except DemoConfigurationError as exc:
        parser.error(str(exc))

    os.environ.update(settings)
    # Run the validation used by API startup now, before spawning the server.
    sys.path.insert(0, str(BACKEND_DIR))
    from app.services.certificate_urls import public_certificate_base_url

    try:
        public_certificate_base_url()
    except ValueError as exc:
        parser.error(str(exc))

    print(
        f"TASK-01 demo API: http://{args.host}:{args.port} "
        "(simulation enabled; local test database verified; certificate origin is reserved .test)"
    )
    return subprocess.call([
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        args.host,
        "--port",
        str(args.port),
    ], cwd=BACKEND_DIR)


if __name__ == "__main__":
    raise SystemExit(main())
