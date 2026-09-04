from sqlalchemy import text

from app.database import engine


def test_test_messages_has_rls_enabled():
    query = text(
        """
        SELECT table_info.relrowsecurity
        FROM pg_class AS table_info
        JOIN pg_namespace AS schema_info
          ON schema_info.oid = table_info.relnamespace
        WHERE schema_info.nspname = 'public'
          AND table_info.relname = 'test_messages'
        """
    )

    with engine.connect() as connection:
        rls_enabled = connection.execute(query).scalar_one()

    assert rls_enabled is True