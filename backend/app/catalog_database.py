"""Dedicated read-only sessions for the public catalog application."""

import os

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker


class CatalogSession(Session):
    """A session that makes every PostgreSQL transaction read-only."""


@event.listens_for(CatalogSession, "after_begin")
def _set_postgres_transaction_read_only(
    _session: Session, transaction, connection
) -> None:
    # A savepoint inherits the read-only state of its outer transaction. The
    # event also runs again when Session starts a new transaction after rollback.
    if connection.dialect.name == "postgresql" and not transaction.nested:
        connection.exec_driver_sql("SET TRANSACTION READ ONLY")


def create_catalog_session_factory(database_url: str) -> tuple[Engine, sessionmaker]:
    engine = create_engine(database_url, pool_pre_ping=True)
    factory = sessionmaker(
        bind=engine,
        class_=CatalogSession,
        autoflush=False,
        autocommit=False,
    )
    return engine, factory


DATABASE_URL = os.getenv("DATABASE_URL")
engine: Engine | None = None
SessionLocal: sessionmaker | None = None

if DATABASE_URL:
    engine, SessionLocal = create_catalog_session_factory(DATABASE_URL)


def get_catalog_db():
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured for the catalog API")

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
