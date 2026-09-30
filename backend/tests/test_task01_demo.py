import pytest

from scripts.task01_demo import (
    DemoConfigurationError,
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
