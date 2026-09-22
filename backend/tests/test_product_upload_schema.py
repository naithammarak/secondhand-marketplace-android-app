"""Check product upload schema without touching a shared database."""

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import make_url
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
        photo_type="MAIN",
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


def test_product_model_constraints_enforced(registry_db):
    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                Product(
                    user_id=1,
                    category_id=1,
                    brand_id=1,
                    product_name="Bad Price",
                    description="Desc",
                    size="M",
                    condition="GOOD",
                    price=Decimal("0.00"),
                    sale_type="FIXED_PRICE",
                    status="AVAILABLE",
                )
            )
            registry_db.flush()

    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                Product(
                    user_id=1,
                    category_id=1,
                    brand_id=1,
                    product_name="Neg Price",
                    description="Desc",
                    size="M",
                    condition="GOOD",
                    price=Decimal("-10.00"),
                    sale_type="FIXED_PRICE",
                    status="AVAILABLE",
                )
            )
            registry_db.flush()

    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                Product(
                    user_id=1,
                    category_id=1,
                    brand_id=1,
                    product_name="Bad Condition",
                    description="Desc",
                    size="M",
                    condition="INVALID_COND",
                    price=Decimal("10.00"),
                    sale_type="FIXED_PRICE",
                    status="AVAILABLE",
                )
            )
            registry_db.flush()

    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                Product(
                    user_id=1,
                    category_id=1,
                    brand_id=1,
                    product_name="Bad Sale",
                    description="Desc",
                    size="M",
                    condition="GOOD",
                    price=Decimal("10.00"),
                    sale_type="AUCTION",
                    status="AVAILABLE",
                )
            )
            registry_db.flush()

    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                Product(
                    user_id=1,
                    category_id=1,
                    brand_id=1,
                    product_name="Bad Status",
                    description="Desc",
                    size="M",
                    condition="GOOD",
                    price=Decimal("10.00"),
                    sale_type="FIXED_PRICE",
                    status="UNKNOWN",
                )
            )
            registry_db.flush()


def test_product_image_model_constraints_enforced(registry_db):
    product = Product(
        user_id=1,
        category_id=1,
        brand_id=1,
        product_name="Valid Product",
        description="Desc",
        size="M",
        condition="GOOD",
        price=Decimal("100.00"),
        sale_type="FIXED_PRICE",
        status="AVAILABLE",
    )
    registry_db.add(product)
    registry_db.flush()

    # sort_order < 0 rejected
    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                ProductImage(
                    product_id=product.id,
                    image_id=10,
                    image_url="neg.jpg",
                    file_size=100,
                    uploaded_at=datetime.now(timezone.utc),
                    photo_type="MAIN",
                    sort_order=-1,
                )
            )
            registry_db.flush()

    # sort_order > 9 rejected
    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                ProductImage(
                    product_id=product.id,
                    image_id=11,
                    image_url="ten.jpg",
                    file_size=100,
                    uploaded_at=datetime.now(timezone.utc),
                    photo_type="GALLERY",
                    sort_order=10,
                )
            )
            registry_db.flush()

    # sort_order 0 with GALLERY rejected
    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                ProductImage(
                    product_id=product.id,
                    image_id=12,
                    image_url="bad_main.jpg",
                    file_size=100,
                    uploaded_at=datetime.now(timezone.utc),
                    photo_type="GALLERY",
                    sort_order=0,
                )
            )
            registry_db.flush()

    # sort_order > 0 with MAIN rejected
    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                ProductImage(
                    product_id=product.id,
                    image_id=13,
                    image_url="bad_gal.jpg",
                    file_size=100,
                    uploaded_at=datetime.now(timezone.utc),
                    photo_type="MAIN",
                    sort_order=1,
                )
            )
            registry_db.flush()

    # Valid: 0 is MAIN, 1 is GALLERY
    valid_main = ProductImage(
        product_id=product.id,
        image_id=1,
        image_url="main.jpg",
        file_size=100,
        uploaded_at=datetime.now(timezone.utc),
        photo_type="MAIN",
        sort_order=0,
    )
    valid_gal = ProductImage(
        product_id=product.id,
        image_id=2,
        image_url="gallery.jpg",
        file_size=100,
        uploaded_at=datetime.now(timezone.utc),
        photo_type="GALLERY",
        sort_order=1,
    )
    registry_db.add(valid_main)
    registry_db.add(valid_gal)
    registry_db.flush()

    # Duplicate sort_order rejected
    with pytest.raises(IntegrityError):
        with registry_db.begin_nested():
            registry_db.add(
                ProductImage(
                    product_id=product.id,
                    image_id=3,
                    image_url="dup.jpg",
                    file_size=100,
                    uploaded_at=datetime.now(timezone.utc),
                    photo_type="MAIN",
                    sort_order=0,
                )
            )
            registry_db.flush()


def test_migration_graph_unifies_to_single_head():
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "migrations"))
    script = ScriptDirectory.from_config(config)
    assert script.get_heads() == ["9446ec1a2c5d"]

    merge_revision = script.get_revision("f3862bffea77")
    assert set(merge_revision.down_revision) == {"9a18d37ce520", "f02a03c91801"}

    product_revision = script.get_revision("daf675afc8fc")
    assert product_revision.down_revision == "f3862bffea77"

    image_revision = script.get_revision("9446ec1a2c5d")
    assert image_revision.down_revision == "daf675afc8fc"


def _alembic_config() -> Config:
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "migrations"))
    return config


@pytest.fixture(scope="module")
def migrated_product_database():
    raw_url = os.getenv("TEST_DATABASE_URL")
    if not raw_url:
        pytest.skip("TEST_DATABASE_URL is not set (isolated PostgreSQL required)")

    parsed_url = make_url(raw_url)
    if not parsed_url.drivername.startswith("postgresql"):
        pytest.fail("TEST_DATABASE_URL must use PostgreSQL")
    if "test" not in (parsed_url.database or "").lower():
        pytest.fail("TEST_DATABASE_URL database name must contain 'test'")

    previous_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = raw_url
    engine = create_engine(raw_url, pool_pre_ping=True)
    config = _alembic_config()
    try:
        with engine.connect() as connection:
            existing_tables = inspect(connection).get_table_names(schema="public")
        if existing_tables:
            pytest.fail(
                "TEST_DATABASE_URL must point to an empty database; found tables: "
                + ", ".join(sorted(existing_tables))
            )

        command.upgrade(config, "c6b19e0d4f2a")
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO users
                        (supabase_user_id, full_name, email, role, status)
                    VALUES
                        ('00000000-0000-0000-0000-000000000001',
                         'Legacy Seller', 'legacy@example.test', 'SELLER', 'ACTIVE')
                    """
                )
            )
            connection.execute(
                text("INSERT INTO categories (category_name) VALUES ('Legacy Category')")
            )
            connection.execute(
                text("INSERT INTO brands (brand_name) VALUES ('Legacy Brand')")
            )
            connection.execute(
                text(
                    """
                    INSERT INTO products
                        (user_id, category_id, brand_id, product_name, description,
                         size, condition, price, sale_type, status)
                    VALUES (1, 1, 1, 'Legacy Product', 'Existing data', 'M',
                            'ดี', 10.00, 'ราคาคงที่', 'พร้อมขาย')
                    """
                )
            )
            connection.execute(
                text(
                    """
                    INSERT INTO product_images
                        (product_id, image_id, image_url, file_size, uploaded_at, photo_type)
                    VALUES
                        (1, 1, 'legacy/image.jpg', 100, now(), 'image/jpeg'),
                        (1, 2, 'legacy/gallery.jpg', 200, now(), 'image/jpeg')
                    """
                )
            )

        command.upgrade(config, "9446ec1a2c5d")
        yield engine
    finally:
        try:
            command.downgrade(config, "base")
            with engine.begin() as connection:
                connection.execute(text("DROP TABLE IF EXISTS public.alembic_version"))
        finally:
            engine.dispose()
            if previous_url is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous_url


def test_product_migration_preserves_data_and_enforces_schema(
    migrated_product_database,
):
    with migrated_product_database.connect() as connection:
        assert MigrationContext.configure(connection).get_current_revision() == "9446ec1a2c5d"
        assert "product_uploads" in inspect(connection).get_table_names(schema="public")
        product_upload_columns = {
            column["name"] for column in inspect(connection).get_columns("product_uploads")
        }
        assert {"id", "user_id", "object_key", "state", "attached_product_id"} <= product_upload_columns

        image_columns = {
            column["name"] for column in inspect(connection).get_columns("product_images")
        }
        assert {"upload_id", "sort_order", "photo_type"} <= image_columns

        # Verify legacy product sale_type, condition and status normalized
        legacy_sale_type, legacy_product_condition, legacy_product_status = connection.execute(
            text("SELECT sale_type, condition, status FROM products WHERE id = 1")
        ).one()
        assert legacy_sale_type == "FIXED_PRICE"
        assert legacy_product_condition == "GOOD"
        assert legacy_product_status == "AVAILABLE"

        # Verify legacy images preserved and photo_type normalized
        legacy_images = connection.execute(
            text(
                "SELECT image_id, image_url, sort_order, photo_type "
                "FROM product_images WHERE product_id = 1 "
                "ORDER BY sort_order"
            )
        ).all()
        assert len(legacy_images) == 2
        assert legacy_images[0] == (1, "legacy/image.jpg", 0, "MAIN")
        assert legacy_images[1] == (2, "legacy/gallery.jpg", 1, "GALLERY")

        upload_foreign_keys = inspect(connection).get_foreign_keys("product_uploads")
        assert {
            (foreign_key["referred_table"], tuple(foreign_key["constrained_columns"]))
            for foreign_key in upload_foreign_keys
        } == {("users", ("user_id",)), ("products", ("attached_product_id",))}

        image_foreign_keys = inspect(connection).get_foreign_keys("product_images")
        assert any(
            foreign_key["referred_table"] == "product_uploads"
            and foreign_key["constrained_columns"] == ["upload_id"]
            for foreign_key in image_foreign_keys
        )

        # Constraint: price must be > 0
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(
                    text(
                        """
                        INSERT INTO products
                            (user_id, category_id, brand_id, product_name, description,
                             size, condition, price, sale_type, status)
                        VALUES (1, 1, 1, 'Bad Price', 'Desc', 'M',
                                'GOOD', 0.00, 'FIXED_PRICE', 'AVAILABLE')
                        """
                    )
                )

        # Constraint: condition must be valid
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(
                    text(
                        """
                        INSERT INTO products
                            (user_id, category_id, brand_id, product_name, description,
                             size, condition, price, sale_type, status)
                        VALUES (1, 1, 1, 'Bad Condition', 'Desc', 'M',
                                'BROKEN', 10.00, 'FIXED_PRICE', 'AVAILABLE')
                        """
                    )
                )

        # Constraint: sale_type must be FIXED_PRICE
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(
                    text(
                        """
                        INSERT INTO products
                            (user_id, category_id, brand_id, product_name, description,
                             size, condition, price, sale_type, status)
                        VALUES (1, 1, 1, 'Bad Sale Type', 'Desc', 'M',
                                'GOOD', 10.00, 'AUCTION', 'AVAILABLE')
                        """
                    )
                )

        # Constraint: status must be valid
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(
                    text(
                        """
                        INSERT INTO products
                            (user_id, category_id, brand_id, product_name, description,
                             size, condition, price, sale_type, status)
                        VALUES (1, 1, 1, 'Bad Status', 'Desc', 'M',
                                'GOOD', 10.00, 'FIXED_PRICE', 'ARCHIVED')
                        """
                    )
                )

        # Constraint: sort_order between 0 and 9
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(
                    text(
                        """
                        INSERT INTO product_images
                            (product_id, image_id, image_url, file_size, uploaded_at,
                             photo_type, sort_order)
                        VALUES (1, 10, 'out_of_range.jpg', 100, now(), 'GALLERY', 10)
                        """
                    )
                )

        # Constraint: duplicate sort_order rejected
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(
                    text(
                        """
                        INSERT INTO product_images
                            (product_id, image_id, image_url, file_size, uploaded_at,
                             photo_type, sort_order)
                        VALUES (1, 11, 'duplicate.jpg', 100, now(), 'MAIN', 0)
                        """
                    )
                )

        # Constraint: sort_order 0 must be MAIN
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(
                    text(
                        """
                        INSERT INTO products
                            (user_id, category_id, brand_id, product_name, description,
                             size, condition, price, sale_type, status)
                        VALUES (1, 1, 1, 'Product 2', 'Desc', 'M',
                                'GOOD', 10.00, 'FIXED_PRICE', 'AVAILABLE')
                        """
                    )
                )
                connection.execute(
                    text(
                        """
                        INSERT INTO product_images
                            (product_id, image_id, image_url, file_size, uploaded_at,
                             photo_type, sort_order)
                        VALUES (2, 20, 'bad_main.jpg', 100, now(), 'GALLERY', 0)
                        """
                    )
                )

        # Constraint: sort_order > 0 must be GALLERY
        with pytest.raises(IntegrityError):
            with connection.begin_nested():
                connection.execute(
                    text(
                        """
                        INSERT INTO product_images
                            (product_id, image_id, image_url, file_size, uploaded_at,
                             photo_type, sort_order)
                        VALUES (1, 21, 'bad_gallery.jpg', 100, now(), 'MAIN', 2)
                        """
                    )
                )


def test_product_migration_rollback_keeps_legacy_rows(migrated_product_database):
    config = _alembic_config()
    command.downgrade(config, "c6b19e0d4f2a")
    with migrated_product_database.connect() as connection:
        assert "c6b19e0d4f2a" in MigrationContext.configure(connection).get_current_heads()
        assert "product_uploads" not in inspect(connection).get_table_names(schema="public")
        legacy = connection.execute(
            text(
                "SELECT image_id, image_url "
                "FROM product_images WHERE product_id = 1 "
                "ORDER BY image_id"
            )
        ).all()
        assert legacy == [(1, "legacy/image.jpg"), (2, "legacy/gallery.jpg")]
    command.upgrade(config, "9446ec1a2c5d")


def test_product_migration_aborts_on_unmapped_status(migrated_product_database):
    config = _alembic_config()
    command.downgrade(config, "f3862bffea77")
    try:
        with migrated_product_database.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO products
                        (user_id, category_id, brand_id, product_name, description,
                         size, condition, price, sale_type, status)
                    VALUES
                        (1, 1, 1, 'Draft Product', 'Draft item', 'M',
                         'GOOD', 10.00, 'FIXED_PRICE', 'DRAFT'),
                        (1, 1, 1, 'Hidden Product', 'Hidden item', 'L',
                         'GOOD', 20.00, 'FIXED_PRICE', 'HIDDEN')
                    """
                )
            )

        with pytest.raises(Exception, match="unmapped/unknown status"):
            command.upgrade(config, "daf675afc8fc")

        # Confirm status was NOT converted to AVAILABLE
        with migrated_product_database.connect() as connection:
            statuses = dict(
                connection.execute(
                    text("SELECT product_name, status FROM products WHERE product_name IN ('Draft Product', 'Hidden Product')")
                ).all()
            )
            assert statuses["Draft Product"] == "DRAFT"
            assert statuses["Hidden Product"] == "HIDDEN"
    finally:
        with migrated_product_database.begin() as connection:
            connection.execute(
                text("DELETE FROM products WHERE product_name IN ('Draft Product', 'Hidden Product')")
            )
        command.upgrade(config, "9446ec1a2c5d")


def test_product_migration_aborts_on_unmapped_sale_type(migrated_product_database):
    config = _alembic_config()
    command.downgrade(config, "f3862bffea77")
    try:
        with migrated_product_database.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO products
                        (user_id, category_id, brand_id, product_name, description,
                         size, condition, price, sale_type, status)
                    VALUES
                        (1, 1, 1, 'Auction Product', 'Auction item', 'M',
                         'GOOD', 10.00, 'AUCTION', 'AVAILABLE')
                    """
                )
            )

        with pytest.raises(Exception, match="unmapped/unsupported sale_type"):
            command.upgrade(config, "daf675afc8fc")

        # Confirm sale_type was NOT converted to FIXED_PRICE
        with migrated_product_database.connect() as connection:
            sale_type = connection.execute(
                text("SELECT sale_type FROM products WHERE product_name = 'Auction Product'")
            ).scalar_one()
            assert sale_type == "AUCTION"
    finally:
        with migrated_product_database.begin() as connection:
            connection.execute(
                text("DELETE FROM products WHERE product_name = 'Auction Product'")
            )
        command.upgrade(config, "9446ec1a2c5d")


def test_product_migration_aborts_on_unmapped_condition(migrated_product_database):
    config = _alembic_config()
    command.downgrade(config, "f3862bffea77")
    try:
        with migrated_product_database.begin() as connection:
            connection.execute(
                text(
                    """
                    INSERT INTO products
                        (user_id, category_id, brand_id, product_name, description,
                         size, condition, price, sale_type, status)
                    VALUES
                        (1, 1, 1, 'Broken Product', 'Broken item', 'M',
                         'BROKEN', 10.00, 'FIXED_PRICE', 'AVAILABLE')
                    """
                )
            )

        with pytest.raises(Exception, match="unmapped/unknown condition"):
            command.upgrade(config, "daf675afc8fc")

        # Confirm condition was NOT converted to GOOD
        with migrated_product_database.connect() as connection:
            condition = connection.execute(
                text("SELECT condition FROM products WHERE product_name = 'Broken Product'")
            ).scalar_one()
            assert condition == "BROKEN"
    finally:
        with migrated_product_database.begin() as connection:
            connection.execute(
                text("DELETE FROM products WHERE product_name = 'Broken Product'")
            )
        command.upgrade(config, "9446ec1a2c5d")
