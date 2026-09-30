import pytest

from scripts import task01_demo
from scripts.task01_demo import (
    DemoConfigurationError,
    LIBPQ_ROUTING_ENVIRONMENT,
    apply_demo_environment,
    demo_environment,
    validate_demo_database,
    validate_test_certificate_origin,
)


LOCAL_TEST_URL = "postgresql+psycopg://postgres@127.0.0.1:55441/task01_payment_test"


def test_demo_environment_explicitly_enables_only_safe_local_configuration():
    settings = demo_environment(
        {"TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL},
        {"DATABASE_URL": "postgresql+psycopg://owner@shared.example.test/shared", "APP_ENV": "development"},
    )

    assert settings == {
        "DATABASE_URL": LOCAL_TEST_URL,
        "APP_ENV": "demo",
        "PAYMENT_SIMULATION_ENABLED": "true",
        "PUBLIC_CERTIFICATE_BASE_URL": "https://certificate.task01.test",
    }


@pytest.mark.parametrize(
    "database_url",
    [
        None,
        "postgresql+psycopg://postgres@db.example.test/task01_payment_test",
        "sqlite:///task01_payment_test.db",
        "postgresql+psycopg://postgres@127.0.0.1:55441/marketplace",
        "postgresql+psycopg://postgres@localhost:55441/task01_payment_test?host=db.shared.example",
        "postgresql+psycopg://postgres@127.0.0.1:55441/task01_payment_test?dbname=shared",
    ],
)
def test_demo_rejects_missing_remote_or_non_task_test_databases(database_url):
    with pytest.raises(DemoConfigurationError):
        validate_demo_database(database_url)


def test_demo_rejects_the_same_database_as_application_configuration():
    same_target = "postgresql+psycopg://different-user@127.0.0.1:55441/task01_payment_test"
    with pytest.raises(DemoConfigurationError, match="differ from the configured application database"):
        validate_demo_database(LOCAL_TEST_URL, (same_target,))


def test_demo_detects_same_local_database_across_loopback_aliases():
    same_target = "postgresql+psycopg://different-user@localhost:55441/task01_payment_test"
    with pytest.raises(DemoConfigurationError, match="differ from the configured application database"):
        validate_demo_database(LOCAL_TEST_URL, (same_target,))


@pytest.mark.parametrize(
    "application_url",
    [
        "postgresql+psycopg://postgres@example.invalid/other"
        "?host=127.0.0.1&port=55441&dbname=task01_payment_test",
        "postgresql+psycopg://postgres@example.invalid/other"
        "?conninfo=hostaddr%3D127.0.0.1%20port%3D55441%20dbname%3Dtask01_payment_test",
    ],
)
@pytest.mark.parametrize("source", ["inherited", "dotenv"])
def test_demo_fails_closed_on_application_database_routing_query_overrides(source, application_url):
    env = {"TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL}
    dotenv = {}
    (env if source == "inherited" else dotenv)["DATABASE_URL"] = application_url

    with pytest.raises(DemoConfigurationError, match="Cannot safely verify"):
        demo_environment(env, dotenv)


def test_demo_allows_non_routing_application_database_query_options():
    settings = demo_environment(
        {"TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL},
        {"DATABASE_URL": "postgresql+psycopg://owner@shared.example.test/shared?sslmode=require"},
    )

    assert settings["DATABASE_URL"] == LOCAL_TEST_URL


@pytest.mark.parametrize("variable", LIBPQ_ROUTING_ENVIRONMENT)
@pytest.mark.parametrize("source", ["inherited", "dotenv"])
def test_demo_rejects_libpq_routing_environment_from_every_source(variable, source):
    env = {"TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL}
    dotenv = {}
    (env if source == "inherited" else dotenv)[variable] = "route-setting"

    with pytest.raises(DemoConfigurationError, match="libpq routing environment"):
        demo_environment(env, dotenv)


@pytest.mark.parametrize("source", ["inherited", "dotenv"])
def test_demo_rejects_whitespace_libpq_routing_setting(source):
    env = {"TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL}
    dotenv = {}
    (env if source == "inherited" else dotenv)["PGHOSTADDR"] = "   "

    with pytest.raises(DemoConfigurationError, match="libpq routing environment"):
        demo_environment(env, dotenv)


def test_demo_accepts_empty_routing_settings_and_non_routing_sslmode():
    env = {
        "TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL,
        "PGHOSTADDR": "",
        "PGSERVICE": "",
        "PGSSLMODE": "require",
    }
    dotenv = {"PGSERVICEFILE": "", "PGHOST": ""}

    settings = demo_environment(env, dotenv)

    assert settings["DATABASE_URL"] == LOCAL_TEST_URL
    # Non-routing PostgreSQL settings remain usable in the child process.
    assert env["PGSSLMODE"] == "require"


def test_apply_demo_environment_removes_routes_after_loading_dotenv_and_blocks_reloading(monkeypatch, tmp_path):
    dotenv_path = tmp_path / ".env"
    dotenv_path.write_text(
        "PGHOSTADDR=\nPGSERVICEFILE=\nTASK01_SAFE_DOTENV_SETTING=loaded\n",
        encoding="utf-8",
    )
    process_env = {"PGHOSTADDR": "", "PGSERVICEFILE": "", "PGPORT": ""}
    monkeypatch.setattr(task01_demo.os, "environ", process_env)

    apply_demo_environment({"DATABASE_URL": LOCAL_TEST_URL}, dotenv_path)
    task01_demo.load_dotenv(dotenv_path)

    assert all(name not in process_env for name in LIBPQ_ROUTING_ENVIRONMENT)
    assert process_env["DATABASE_URL"] == LOCAL_TEST_URL
    assert process_env["TASK01_SAFE_DOTENV_SETTING"] == "loaded"
    assert process_env["PYTHON_DOTENV_DISABLED"] == "true"


def test_migration_cli_passes_only_validated_local_database_and_neutralized_routing_env(monkeypatch):
    process_env = {
        "TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL,
        "PGHOSTADDR": "",
        "PGSERVICE": "",
    }
    monkeypatch.setattr(task01_demo.os, "environ", process_env)
    monkeypatch.setattr(
        task01_demo,
        "dotenv_values",
        lambda _path: {
            "APP_ENV": "development",
            "DATABASE_URL": "postgresql+psycopg://owner@shared.example.test/shared",
            "PGSERVICEFILE": "",
        },
    )
    monkeypatch.setattr(
        task01_demo,
        "load_dotenv",
        lambda _path: process_env.update({"PGSERVICEFILE": "", "TASK01_DOTENV_VALUE": "loaded"}),
    )

    observed = {}

    def fake_call(command, *, cwd):
        observed["command"] = command
        observed["cwd"] = cwd
        observed["database_url"] = process_env["DATABASE_URL"]
        observed["routing"] = {name: name in process_env for name in LIBPQ_ROUTING_ENVIRONMENT}
        observed["dotenv_value"] = process_env["TASK01_DOTENV_VALUE"]
        observed["dotenv_disabled"] = process_env["PYTHON_DOTENV_DISABLED"]
        return 0

    monkeypatch.setattr(task01_demo.subprocess, "call", fake_call)

    assert task01_demo.main(["--migrate"]) == 0
    assert observed["command"] == [task01_demo.sys.executable, "-m", "alembic", "upgrade", "head"]
    assert observed["cwd"] == task01_demo.BACKEND_DIR
    assert observed["database_url"] == LOCAL_TEST_URL
    assert observed["routing"] == {name: False for name in LIBPQ_ROUTING_ENVIRONMENT}
    assert observed["dotenv_value"] == "loaded"
    assert observed["dotenv_disabled"] == "true"


@pytest.mark.parametrize("source", ["inherited", "dotenv"])
def test_migration_cli_refuses_routing_override_before_alembic(monkeypatch, source):
    process_env = {"TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL}
    dotenv = {}
    (process_env if source == "inherited" else dotenv)["PGHOSTADDR"] = "127.0.0.2"
    monkeypatch.setattr(task01_demo.os, "environ", process_env)
    monkeypatch.setattr(task01_demo, "dotenv_values", lambda _path: dotenv)
    monkeypatch.setattr(task01_demo.subprocess, "call", lambda *_args, **_kwargs: pytest.fail("Alembic must not run"))

    with pytest.raises(SystemExit) as error:
        task01_demo.main(["--migrate"])

    assert error.value.code == 2


@pytest.mark.parametrize("environment", ["prod", "PROD", " Production "])
def test_demo_refuses_production_environment_in_all_supported_spellings(environment):
    with pytest.raises(DemoConfigurationError, match="production"):
        demo_environment(
            {"TASK01_DEMO_DATABASE_URL": LOCAL_TEST_URL, "APP_ENV": environment},
            {},
        )


@pytest.mark.parametrize(
    "origin",
    [
        "http://certificate.task01.test",
        "https://certificate.example.com",
        "https://certificate.task01.test/path",
        "https://certificate.task01.test?next=outside",
        "https://certificate.task01.test:",
    ],
)
def test_demo_certificate_origin_must_be_https_reserved_test_host(origin):
    with pytest.raises(DemoConfigurationError):
        validate_test_certificate_origin(origin)


def test_demo_certificate_origin_accepts_reserved_https_test_origin():
    assert validate_test_certificate_origin("https://certificate.task01.test:8443/") == "https://certificate.task01.test:8443"
