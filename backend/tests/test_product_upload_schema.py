"""Check the new pending-upload registry without touching the shared database."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Base
from app.models.brand import Brand
from app.models.category import Category
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.product_upload import ProductUpload
from app.models.user import User, UserRole


@pytest.fixture
def registry_db():
    engine = create_engine("sqlite+pysqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Category.__table__,
            Brand.__table__,
            Product.__table__,
            ProductUpload.__table__,
            ProductImage.__table__,
        ],
    )
    with Session(engine) as db:
        db.add(User(supabase_user_id=uuid4(), full_name="Seller", email="seller@example.test", role=UserRole.SELLER))
        db.add(Category(category_name="Category"))
        db.add(Brand(brand_name="Brand"))
        db.commit()
        yield db
        db.rollback()
    engine.dispose()


def pending_upload(**overrides):
    now = datetime.now(timezone.utc)
    fields = {
        "user_id": 1,
        "object_key": f"seller/7/{uuid4().hex}.jpg",
        "mime_type": "image/jpeg",
        "file_size": 123,
        "uploaded_at": now,
        "expires_at": now + timedelta(hours=24),
        "state": "PENDING",
    }
    fields.update(overrides)
    return ProductUpload(**fields)


def test_pending_upload_persists_with_owner_and_24_hour_expiry(registry_db):
    record = pending_upload()
    registry_db.add(record)
    registry_db.commit()
    registry_db.refresh(record)
    assert record.id > 0
    assert record.user_id == 1
    assert record.state == "PENDING"
    assert record.attached_product_id is None
    assert record.expires_at - record.uploaded_at == timedelta(hours=24)


@pytest.mark.parametrize(
    "changes",
    [
        {"user_id": 999},
        {"mime_type": "image/webp"},
        {"file_size": 0},
        {"file_size": 5 * 1024 * 1024 + 1},
        {"state": "USED"},
        {"state": "ATTACHED"},
        {"state": "PENDING", "attached_product_id": 999},
        {"expires_at": datetime(2000, 1, 1, tzinfo=timezone.utc)},
    ],
)
def test_registry_rejects_invalid_owner_or_metadata(registry_db, changes):
    registry_db.add(pending_upload(**changes))
    with pytest.raises(IntegrityError):
        registry_db.commit()


def test_object_key_cannot_be_reused(registry_db):
    key = "seller/7/unique.jpg"
    registry_db.add(pending_upload(object_key=key))
    registry_db.commit()
    registry_db.add(pending_upload(object_key=key))
    with pytest.raises(IntegrityError):
        registry_db.commit()


def test_image_binding_keeps_old_urls_and_prevents_reusing_an_upload(registry_db):
    product = Product(
        user_id=1,
        category_id=1,
        brand_id=1,
        product_name="Test",
        description="Test item",
        size="M",
        condition="GOOD",
        price=Decimal("10.00"),
        sale_type="FIXED_PRICE",
        status="AVAILABLE",
    )
    registry_db.add(product)
    registry_db.flush()
    old_image = ProductImage(
        product_id=product.id,
        image_id=1,
        image_url="https://example.invalid/storage/v1/object/public/product-images/old.jpg",
        file_size=100,
        uploaded_at=datetime.now(timezone.utc),
        photo_type="image/jpeg",
        sort_order=0,
    )
    registry_db.add(old_image)
    registry_db.flush()
    assert old_image.upload_id is None

    pending = pending_upload(state="ATTACHED", attached_product_id=product.id)
    registry_db.add(pending)
    registry_db.flush()
    registry_db.add(
        ProductImage(
            product_id=product.id,
            image_id=2,
            upload_id=pending.id,
            image_url=pending.object_key,
            file_size=pending.file_size,
            uploaded_at=pending.uploaded_at,
            photo_type="GALLERY",
            sort_order=1,
        )
    )
    registry_db.commit()
    assert old_image.image_url.startswith("https://example.invalid/")

    registry_db.add(
        ProductImage(
            product_id=product.id,
            image_id=3,
            upload_id=pending.id,
            image_url=pending.object_key,
            file_size=pending.file_size,
            uploaded_at=pending.uploaded_at,
            photo_type="GALLERY",
            sort_order=2,
        )
    )
    with pytest.raises(IntegrityError):
        registry_db.commit()


def test_migration_follows_both_existing_heads():
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "migrations"))
    script = ScriptDirectory.from_config(config)
    assert len(script.get_heads()) == 1
    ancestors = {revision.revision for revision in script.walk_revisions()}
    assert {"9a18d37ce520", "f02a03c91801", "a62f095d810e"} <= ancestors
    assert set(script.get_revision("a62f095d810e").down_revision) == {"9a18d37ce520", "f02a03c91801"}
    upload_revision = script.get_revision("7f4c2e91a6b0")
    assert upload_revision.down_revision == "c6b19e0d4f2a"
    merge_revision = script.get_revision("9a18d37ce520")
    image_revision = script.get_revision("54ca8e0731bd")
    assert image_revision.down_revision == "7f4c2e91a6b0"
    assert set(merge_revision.down_revision) == {"54ca8e0731bd", "e8a4f1c02d77"}
