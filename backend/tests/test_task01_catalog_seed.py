from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.main import mount_task01_demo_assets
from app.models.brand import Brand
from app.models.category import Category
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.product_upload import ProductUpload
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from scripts import seed_task01_catalog
from scripts.seed_task01_catalog import (
    DEFAULT_ASSET_BASE_URL,
    DEMO_ASSET_FILES,
    DEMO_PRODUCTS,
    DEMO_SELLER_UUID,
    DemoConfigurationError,
    seed_catalog,
    validate_asset_base_url,
)


DATABASE_URL = "postgresql+psycopg://demo:local@127.0.0.1:55445/task01_catalog_demo_test"


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _record):
        connection.execute("PRAGMA foreign_keys=ON")

    tables = [
        User.__table__, Category.__table__, Brand.__table__, Verification.__table__,
        Product.__table__, ProductUpload.__table__, ProductImage.__table__,
    ]
    Base.metadata.create_all(engine, tables=tables)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine, tables=tables)
    engine.dispose()


def _seed(db: Session, *, asset_base_url: str = DEFAULT_ASSET_BASE_URL):
    counts = seed_catalog(db, asset_base_url=asset_base_url)
    db.commit()
    return counts


def test_catalog_seed_is_repeatable_and_creates_public_demo_catalog(db):
    first = _seed(db)
    second = _seed(db)

    assert first["seller_created"] == 1
    assert first["products_created"] == len(DEMO_PRODUCTS) == 6
    assert second == {
        "seller_created": 0,
        "products_created": 0,
        "products_kept": 6,
        "products_preserved_unavailable": 0,
    }
    assert db.scalar(select(func.count()).select_from(Product)) == 6
    assert db.scalar(select(func.count()).select_from(ProductImage)) == 6

    seller = db.scalar(select(User).where(User.supabase_user_id == DEMO_SELLER_UUID))
    assert seller is not None
    assert seller.status == UserStatus.ACTIVE
    assert seller.role == UserRole.SELLER
    approval = db.scalar(select(Verification).where(Verification.user_id == seller.id))
    assert approval is not None
    assert approval.verification_status == "APPROVED"
    assert approval.shop_name == "ร้านสินค้าสาธิต"

    categories = db.scalars(select(Category)).all()
    assert len(categories) == 6
    assert all(any("\u0e00" <= char <= "\u0e7f" for char in row.category_name) for row in categories)
    assert all(len(row.category_name) < 36 for row in categories)

    products = db.scalars(select(Product).order_by(Product.id)).all()
    assert all(row.status == "AVAILABLE" for row in products)
    assert all("(เดโม)" in row.product_name for row in products)
    assert all("จำลอง" in row.description and "ไม่ใช่สินค้าจริง" in row.description for row in products)
    images = db.scalars(select(ProductImage).order_by(ProductImage.product_id)).all()
    assert all(image.image_url.startswith(f"{DEFAULT_ASSET_BASE_URL}/") for image in images)
    assert {image.image_url.rsplit("/", 1)[-1] for image in images} == set(DEMO_ASSET_FILES.values())
    assert all(image.file_size > 0 and image.photo_type == "MAIN" for image in images)


def test_catalog_seed_preserves_terminal_and_unrelated_product_states(db):
    _seed(db)
    demo_products = db.scalars(select(Product).order_by(Product.id)).all()
    terminal_states = ("SOLD", "RESERVED", "CANCELLED")
    for product, status in zip(demo_products, terminal_states, strict=False):
        product.status = status
    seller = db.scalar(select(User).where(User.supabase_user_id == DEMO_SELLER_UUID))
    category = db.scalar(select(Category))
    brand = db.scalar(select(Brand))
    unrelated = Product(
        user_id=seller.id,
        category_id=category.id,
        brand_id=brand.id,
        product_name="สินค้าของผู้ขายรายอื่น",
        description="ข้อมูลเดิม",
        size="M",
        condition="GOOD",
        price="88.00",
        sale_type="FIXED_PRICE",
        status="RESERVED",
    )
    db.add(unrelated)
    db.commit()

    result = _seed(db)

    assert result["products_created"] == 0
    assert result["products_kept"] == 3
    assert result["products_preserved_unavailable"] == 3
    assert [product.status for product in demo_products[:3]] == list(terminal_states)
    assert db.scalar(select(func.count()).select_from(Product)) == 7
    unrelated_after = db.scalar(select(Product).where(Product.product_name == "สินค้าของผู้ขายรายอื่น"))
    assert unrelated_after.status == "RESERVED"
    assert unrelated_after.description == "ข้อมูลเดิม"


def test_catalog_seed_refuses_seller_identity_collision_without_mutation(db):
    collision = User(
        supabase_user_id=DEMO_SELLER_UUID,
        full_name="บัญชีที่มีอยู่",
        email="existing@example.test",
        role=UserRole.BUYER,
        status=UserStatus.SUSPENDED,
    )
    db.add(collision)
    db.commit()

    with pytest.raises(DemoConfigurationError, match="seller identity conflicts"):
        seed_catalog(db)

    db.rollback()
    saved = db.get(User, collision.id)
    assert saved.full_name == "บัญชีที่มีอยู่"
    assert saved.role == UserRole.BUYER
    assert saved.status == UserStatus.SUSPENDED
    assert db.scalar(select(func.count()).select_from(Product)) == 0


def test_catalog_seed_refuses_product_name_collision_with_another_seller(db):
    _seed(db)
    existing = db.scalar(select(Product).order_by(Product.id))
    other = User(
        supabase_user_id=uuid.uuid4(),
        full_name="ผู้ขายเดิม",
        email="another-seller@example.test",
        role=UserRole.SELLER,
        status=UserStatus.ACTIVE,
    )
    db.add(other)
    db.flush()
    existing.user_id = other.id
    db.commit()
    old_owner_id = existing.user_id
    old_status = existing.status

    with pytest.raises(DemoConfigurationError, match="conflicts with another seller"):
        seed_catalog(db)

    db.rollback()
    saved = db.get(Product, existing.id)
    assert saved.user_id == old_owner_id
    assert saved.status == old_status == "AVAILABLE"
    assert db.scalar(select(func.count()).select_from(Product)) == 6


@pytest.mark.parametrize(
    "url",
    [
        "https://images.example.test/task01-demo-assets",
        "http://example.test/task01-demo-assets",
        "http://127.0.0.1:8765/other-path",
        "http://127.0.0.1:8765/task01-demo-assets?host=remote",
    ],
)
def test_asset_url_must_be_a_local_demo_endpoint(url):
    with pytest.raises(DemoConfigurationError):
        validate_asset_base_url(url)


@pytest.mark.parametrize("environment", ["", "development", "test", "prod", "production"])
def test_static_demo_artwork_is_disabled_outside_demo(environment):
    app = FastAPI()
    mount_task01_demo_assets(app, environment)
    with TestClient(app) as client:
        response = client.get("/task01-demo-assets/linen-shirt.svg")
    assert response.status_code == 404


def test_demo_static_artwork_serves_only_bundled_svg_files_without_path_traversal():
    app = FastAPI()
    mount_task01_demo_assets(app, "demo")

    with TestClient(app) as client:
        for filename in DEMO_ASSET_FILES.values():
            response = client.get(f"/task01-demo-assets/{filename}")
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("image/svg+xml")
            assert response.content.startswith(b"<svg")
        assert client.get("/task01-demo-assets/%2e%2e/main.py").status_code == 404
        assert client.get("/task01-demo-assets/not-a-demo-asset.png").status_code == 404


@pytest.mark.parametrize(
    "environment, dotenv",
    [
        ({"TASK01_DEMO_DATABASE_URL": "postgresql+psycopg://demo@db.example.test/task01_catalog_demo_test"}, {}),
        ({"TASK01_DEMO_DATABASE_URL": DATABASE_URL, "PGHOSTADDR": "127.0.0.2"}, {}),
        ({"TASK01_DEMO_DATABASE_URL": DATABASE_URL}, {"DATABASE_URL": DATABASE_URL}),
    ],
)
def test_seed_cli_reuses_database_route_and_identity_guards(monkeypatch, environment, dotenv):
    monkeypatch.setattr(seed_task01_catalog.os, "environ", environment)
    monkeypatch.setattr(seed_task01_catalog, "dotenv_values", lambda _path: dotenv)

    with pytest.raises(SystemExit) as error:
        seed_task01_catalog.main([])

    assert error.value.code == 2
