"""Wall clock sampled after locks; callers may inject a clock in isolated tests."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.services.order_pricing import utcnow


def database_now(db: Session, *, fallback=utcnow):
    if db.get_bind().dialect.name == "postgresql":
        return db.scalar(select(func.clock_timestamp()))
    return fallback()
