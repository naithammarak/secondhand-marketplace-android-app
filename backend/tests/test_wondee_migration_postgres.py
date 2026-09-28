"""WUI migration acceptance. Only a disposable localhost database is allowed."""
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, DataError

URL = os.getenv('WUI_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='WUI_TEST_DATABASE_URL requires disposable PostgreSQL')
PREDECESSOR = 'c93b7e5a1d84'
REVISION = 'e8b2c490a713'


@pytest.fixture
def db(monkeypatch):
    parsed = make_url(URL)
    assert parsed.get_backend_name() == 'postgresql'
    assert parsed.host in {'127.0.0.1', 'localhost', '::1'} and 'test' in parsed.database
    engine = create_engine(URL)
    with engine.begin() as connection:
        connection.execute(text('DROP SCHEMA public CASCADE'))
        connection.execute(text('CREATE SCHEMA public'))
    monkeypatch.setenv('DATABASE_URL', URL)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    yield engine, config
    engine.dispose()


def test_upgrade_old_data_constraints_and_forward_only_downgrade(db):
    engine, config = db
    command.upgrade(config, PREDECESSOR)
    old_roles = [None, 'BUYER', 'SELLER', 'ADMIN', 'INSPECTOR']
    with engine.begin() as c:
        for i, role in enumerate(old_roles, start=1):
            c.execute(text("INSERT INTO users(id, supabase_user_id, full_name, email, role, status) VALUES (:id, :sub, 'Legacy User', :email, :role, :status)"),
                      dict(id=i, sub=uuid4(), email=f'legacy-{i}@example.test', role=role, status='SUSPENDED' if i == 1 else 'ACTIVE'))
        c.execute(text("INSERT INTO verifications(user_id,id_card_image_url,bank_account_name,bank_account_number,bank_name,verification_status) VALUES (3,'private/old','Legacy Name','1234567890','Legacy Bank','APPROVED')"))
    command.upgrade(config, 'head')
    with engine.connect() as c:
        assert c.execute(text('SELECT version_num FROM alembic_version')).scalar_one() == REVISION
        assert c.execute(text('SELECT role FROM users ORDER BY id')).scalars().all() == ['BUYER', 'BUYER', 'SELLER', 'ADMIN', 'INSPECTOR']
        assert c.execute(text('SELECT status FROM users WHERE id=1')).scalar_one() == 'SUSPENDED'
        assert c.execute(text('SELECT shop_name FROM verifications')).scalar_one() is None
    for invalid in ['', 'ก', ' padded ', 'a' * 101]:
        with pytest.raises((IntegrityError, DataError)), engine.begin() as c:
            c.execute(text('UPDATE verifications SET shop_name=:name'), dict(name=invalid))
    with engine.begin() as c:
        c.execute(text('UPDATE verifications SET shop_name=:name'), dict(name='ก' * 100))
        c.execute(text("INSERT INTO users(id,supabase_user_id,full_name,email,status) VALUES(10,:sub,'New Buyer','new@example.test','ACTIVE')"), dict(sub=uuid4()))
        assert c.execute(text('SELECT role FROM users WHERE id=10')).scalar_one() == 'BUYER'
    command.downgrade(config, PREDECESSOR)
    with engine.connect() as c:
        assert 'shop_name' not in {col['name'] for col in inspect(c).get_columns('verifications')}
        assert c.execute(text('SELECT role FROM users WHERE id=1')).scalar_one() == 'BUYER'
        assert c.execute(text('SELECT verification_status FROM verifications')).scalar_one() == 'APPROVED'
    command.upgrade(config, 'head')


def test_empty_database_has_one_head(db):
    from alembic.script import ScriptDirectory
    engine, config = db
    assert ScriptDirectory.from_config(config).get_heads() == [REVISION]
    command.upgrade(config, 'head')
    with engine.connect() as c:
        assert c.execute(text('SELECT count(*) FROM users')).scalar_one() == 0


def test_adopts_preexisting_verify_shop_without_shrinking_or_dropping_it(db):
    engine, config = db
    command.upgrade(config, PREDECESSOR)
    with engine.begin() as c:
        c.execute(text("ALTER TABLE verifications ADD COLUMN shop_name VARCHAR(255)"))
        c.execute(text("ALTER TABLE verifications ADD CONSTRAINT ck_verifications_shop_name CHECK (shop_name IS NULL OR length(trim(shop_name)) BETWEEN 2 AND 255)"))
        c.execute(text("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'BUYER'"))
    command.upgrade(config, 'head')
    with engine.connect() as c:
        column = next(col for col in inspect(c).get_columns('verifications') if col['name'] == 'shop_name')
        assert column['type'].length == 255
    command.downgrade(config, PREDECESSOR)
    with engine.connect() as c:
        assert 'shop_name' in {col['name'] for col in inspect(c).get_columns('verifications')}
        default = c.execute(text("SELECT column_default FROM information_schema.columns WHERE table_name='users' AND column_name='role'")).scalar_one()
        assert 'BUYER' in default
