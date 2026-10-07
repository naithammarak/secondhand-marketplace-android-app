"""Preserve a real legacy fixture through A -> C; never touch a shared DB."""
import os
from pathlib import Path
import subprocess
import sys

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

URL = os.getenv('PROFILE_MIGRATION_TEST_DATABASE_URL')
LEGACY = os.getenv('PROFILE_LEGACY_SOURCE')
BASE = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(not URL or not LEGACY, reason='disposable C migration database and legacy source required')


def test_nullable_profile_and_review_upgrade_preserves_original_facts(monkeypatch):
    target = make_url(URL)
    assert target.host in {'127.0.0.1', 'localhost'} and target.database.startswith('c_') and 'test' in target.database
    engine = create_engine(URL)
    with engine.begin() as connection:
        connection.execute(text('DROP SCHEMA public CASCADE'))
        connection.execute(text('CREATE SCHEMA public'))
    monkeypatch.setenv('DATABASE_URL', URL)
    config = Config(); config.set_main_option('script_location', str(BASE/'migrations'))
    command.upgrade(config, '714f11c84d53')
    result = subprocess.run([sys.executable, '-m', 'scripts.seed_inspections', '--database-url', URL,
                             '--namespace', 'package-c-legacy', '--apply'], cwd=LEGACY,
                            env={**os.environ, 'DATABASE_URL':'sqlite:///:memory:'}, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    command.upgrade(config, 'a02f20261002')
    with engine.connect() as connection:
        tables = [t for t in inspect(connection).get_table_names() if t != 'alembic_version']
        before = {t: connection.execute(text(f'SELECT to_jsonb(t) FROM {t} t ORDER BY to_jsonb(t)::text')).scalars().all() for t in tables}
    command.upgrade(config, 'c07f20261002')
    with engine.begin() as connection:
        assert connection.execute(text('SELECT count(*) FROM users WHERE privacy_policy_version IS NOT NULL OR privacy_acknowledged_at IS NOT NULL')).scalar_one() == 0
        acknowledged_id = connection.execute(text('SELECT min(id) FROM users')).scalar_one()
        connection.execute(text("UPDATE users SET privacy_policy_version='submission-2026-10-01', privacy_acknowledged_at='2026-10-02T00:00:00Z' WHERE id=:id"), {'id': acknowledged_id})
    command.upgrade(config, 'head')
    with engine.connect() as connection:
        for table, rows in before.items():
            columns = "to_jsonb(t) - 'privacy_policy_version' - 'privacy_acknowledged_at'" if table == 'users' else 'to_jsonb(t)'
            after = connection.execute(text(f'SELECT {columns} FROM {table} t ORDER BY ({columns})::text')).scalars().all()
            assert after == rows, table
        assert connection.execute(text('SELECT count(*) FROM users WHERE privacy_policy_version IS NOT NULL AND privacy_acknowledged_at IS NOT NULL')).scalar_one() == 1
        assert connection.execute(text('SELECT privacy_policy_version FROM users WHERE id=:id'), {'id':acknowledged_id}).scalar_one() == 'submission-2026-10-01'
        assert connection.execute(text("SELECT privacy_acknowledged_at = '2026-10-02T00:00:00Z'::timestamptz FROM users WHERE id=:id"), {'id':acknowledged_id}).scalar_one()
        heads = ScriptDirectory.from_config(config).get_heads()
        assert len(heads) == 1
        assert connection.execute(text('SELECT version_num FROM alembic_version')).scalar_one() == heads[0]
    with pytest.raises(RuntimeError, match='downgrade refused'):
        command.downgrade(config, 'a02f20261002')
    engine.dispose()
