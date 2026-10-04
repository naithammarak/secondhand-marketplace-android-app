"""Resolve a seller's typed brand inside the product write transaction."""

from hashlib import sha256

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.brand import Brand


def resolve_product_brand(
    db: Session, *, brand_id: int | None = None, brand_name: str | None = None
) -> Brand | None:
    if brand_id is not None:
        return db.get(Brand, brand_id)
    if brand_name is None:
        return None

    name = brand_name.strip()
    # Use the database's case mapping for both lookup and lock identity; Python
    # and PostgreSQL can fold Unicode letters (for example dotted I) differently.
    key = db.scalar(select(func.lower(name)))
    if db.get_bind().dialect.name == "postgresql":
        # The existing brands table has no unique name constraint. Serialize
        # same-name writes across sellers without changing the team schema.
        lock_key = int.from_bytes(
            sha256(f"product-brand:{key}".encode()).digest()[:8], "big", signed=True
        )
        db.execute(select(func.pg_advisory_xact_lock(lock_key)))

    brand = db.scalar(
        select(Brand)
        .where(func.lower(func.trim(Brand.brand_name)) == key)
        .order_by(Brand.id)
        .limit(1)
    )
    if brand is None:
        brand = Brand(brand_name=name)
        db.add(brand)
        db.flush()
    return brand
