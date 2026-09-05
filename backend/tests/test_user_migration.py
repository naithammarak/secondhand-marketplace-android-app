import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from dotenv import dotenv_values
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
USER_MIGRATION_REVISION = "b3f1a6c8d902"


def _alembic_config() -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option(
        "script_location",
        str(BACKEND_DIR / "migrations"),
    )
    return config


def test_user_migration_is_the_only_alembic_head():
    script = ScriptDirectory.from_config(_alembic_config())
    migration = script.get_revision(USER_MIGRATION_REVISION)

    assert script.get_heads() == [USER_MIGRATION_REVISION]
    assert migration.down_revision == "9ff73113281a"


def _isolated_test_database_url() -> str:
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip(
            "TEST_DATABASE_URL is not set; PostgreSQL migration tests require "
            "a separate empty test database"
        )

    test_url = make_url(raw_url)
    if not test_url.drivername.startswith("postgresql"):
        pytest.fail("TEST_DATABASE_URL must use PostgreSQL")
    if not test_url.database or "test" not in test_url.database.lower():
        pytest.fail("TEST_DATABASE_URL database name must contain 'test'")

    dotenv_url = dotenv_values(BACKEND_DIR / ".env").get("DATABASE_URL")
    if dotenv_url and make_url(dotenv_url) == test_url:
        pytest.fail(
            "TEST_DATABASE_URL must not point to the application database in .env"
        )

    return raw_url


@pytest.fixture(scope="module")
def migrated_database():
    test_database_url = _isolated_test_database_url()
    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = test_database_url
    engine = create_engine(test_database_url, pool_pre_ping=True)
    upgraded = False

    try:
        with engine.connect() as connection:
            existing_tables = inspect(connection).get_table_names(schema="public")
        if existing_tables:
            pytest.fail(
                "TEST_DATABASE_URL must point to an empty database; found tables: "
                + ", ".join(sorted(existing_tables))
            )

        command.upgrade(_alembic_config(), "head")
        upgraded = True
        yield engine
    finally:
        try:
            if upgraded:
                command.downgrade(_alembic_config(), "base")
                with engine.begin() as connection:
                    connection.execute(text("DROP TABLE IF EXISTS alembic_version"))
        finally:
            engine.dispose()
            if previous_database_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous_database_url


@pytest.fixture()
def user_session(migrated_database):
    with Session(migrated_database) as session:
        yield session
        session.rollback()

    with migrated_database.begin() as connection:
        connection.execute(text("TRUNCATE TABLE public.users RESTART IDENTITY"))


def test_migration_upgrades_the_empty_database_and_secures_users(migrated_database):
    with migrated_database.connect() as connection:
        revision = MigrationContext.configure(connection).get_current_revision()
        rls_enabled = connection.execute(
            text(
                """
                SELECT table_info.relrowsecurity
                FROM pg_class AS table_info
                JOIN pg_namespace AS schema_info
                  ON schema_info.oid = table_info.relnamespace
                WHERE schema_info.nspname = 'public'
                  AND table_info.relname = 'users'
                """
            )
        ).scalar_one()
        policy_count = connection.execute(
            text(
                """
                SELECT count(*)
                FROM pg_policies
                WHERE schemaname = 'public'
                  AND tablename = 'users'
                """
            )
        ).scalar_one()
        data_api_roles = connection.execute(
            text(
                """
                SELECT rolname
                FROM pg_roles
                WHERE rolname IN ('anon', 'authenticated')
                """
            )
        ).scalars()

        assert revision == USER_MIGRATION_REVISION
        assert rls_enabled is True
        assert policy_count == 0
        for role_name in data_api_roles:
            for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                assert connection.execute(
                    text(
                        "SELECT has_table_privilege(:role_name, "
                        "'public.users', :privilege)"
                    ),
                    {"role_name": role_name, "privilege": privilege},
                ).scalar_one() is False


def test_create_user_persists_required_fields(user_session):
    from app.models.user import User, UserRole, UserStatus

    user = User(
        supabase_user_id=uuid4(),
        full_name="Buyer One",
        email="buyer.one@example.com",
        role=UserRole.BUYER,
    )
    user_session.add(user)
    user_session.commit()
    user_session.refresh(user)

    assert user.id is not None
    assert user.role is UserRole.BUYER
    assert user.status is UserStatus.ACTIVE
    assert user.created_at is not None
    assert user.updated_at is not None


def test_duplicate_supabase_user_id_is_rejected(user_session):
    from app.models.user import User

    supabase_user_id = uuid4()
    user_session.add_all(
        [
            User(
                supabase_user_id=supabase_user_id,
                full_name="First Account",
                email="first@example.com",
            ),
            User(
                supabase_user_id=supabase_user_id,
                full_name="Duplicate Account",
                email="duplicate@example.com",
            ),
        ]
    )

    with pytest.raises(IntegrityError):
        user_session.commit()


def test_database_rejects_an_unknown_role(migrated_database):
    with pytest.raises(IntegrityError):
        with migrated_database.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO public.users
                        (supabase_user_id, full_name, email, role)
                    VALUES
                        (:supabase_user_id, 'Unknown Role', 'role@example.com', 'ROOT')
                    """
                ),
                {"supabase_user_id": uuid4()},
            )


def test_database_rejects_an_unknown_status(migrated_database):
    with pytest.raises(IntegrityError):
        with migrated_database.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO public.users
                        (supabase_user_id, full_name, email, status)
                    VALUES
                        (:supabase_user_id, 'Unknown Status', 'status@example.com', 'DELETED')
                    """
                ),
                {"supabase_user_id": uuid4()},
            )


def test_user_can_exist_before_role_selection(user_session):
    from app.models.user import User, UserStatus

    user = User(
        supabase_user_id=uuid4(),
        full_name="Onboarding User",
        email="onboarding@example.com",
    )
    user_session.add(user)
    user_session.commit()
    user_session.refresh(user)

    assert user.role is None
    assert user.status is UserStatus.ACTIVE
