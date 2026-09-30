"""Seed the guarded TASK-01 display catalog in an isolated local PostgreSQL database."""

from __future__ import annotations

import ipaddress
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from dotenv import dotenv_values
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session


BACKEND_DIR = Path(__file__).resolve().parents[1]
DEMO_ASSET_DIR = BACKEND_DIR / "app" / "static" / "task01-demo"
sys.path.insert(0, str(BACKEND_DIR))

from scripts.task01_demo import (  # noqa: E402
    DemoConfigurationError,
    apply_demo_environment,
    demo_environment,
)


DEFAULT_ASSET_BASE_URL = "http://127.0.0.1:8765/task01-demo-assets"
DEMO_SELLER_UUID = uuid.UUID("a1f4d189-df2a-5a01-8ace-c04ca7a01e01")
DEMO_SELLER_EMAIL = "task01-catalog-seller@example.test"
DEMO_SHOP_NAME = "ร้านสินค้าสาธิต"
DEMO_SELLER_NAME = "ผู้ขายสาธิต"
DEMO_BANK_ACCOUNT = "0000000000"
DEMO_ASSET_FILES = {
    "linen-shirt": "linen-shirt.svg",
    "leather-bag": "leather-bag.svg",
    "wireless-headphones": "wireless-headphones.svg",
    "white-sneakers": "white-sneakers.svg",
    "film-camera": "film-camera.svg",
    "leather-watch": "leather-watch.svg",
}
DEMO_PRODUCTS = (
    {
        "name": "เสื้อเชิ้ตลินินสีครีม (เดโม)",
        "description": "สินค้าเดโมสำหรับสาธิตการดูสินค้าและขั้นตอนซื้อจำลองเท่านั้น เสื้อเชิ้ตลินินสีครีมสภาพดี ไม่ใช่สินค้าจริง",
        "price": "690.00",
        "category": "เสื้อผ้า",
        "brand": "MUJI",
        "size": "M",
        "condition": "GOOD",
        "asset": "linen-shirt",
    },
    {
        "name": "กระเป๋าสะพายหนังวินเทจ (เดโม)",
        "description": "สินค้าเดโมสำหรับสาธิตการดูสินค้าและขั้นตอนซื้อจำลองเท่านั้น กระเป๋าสะพายหนังสีน้ำตาล ไม่ใช่สินค้าจริง",
        "price": "1250.00",
        "category": "กระเป๋า",
        "brand": "UNBRANDED",
        "size": "One size",
        "condition": "GOOD",
        "asset": "leather-bag",
    },
    {
        "name": "หูฟังไร้สายสีน้ำเงิน (เดโม)",
        "description": "สินค้าเดโมสำหรับสาธิตการดูสินค้าและขั้นตอนซื้อจำลองเท่านั้น หูฟังไร้สายสีน้ำเงิน ไม่ใช่สินค้าจริง",
        "price": "1590.00",
        "category": "อุปกรณ์ไอที",
        "brand": "SONY",
        "size": "One size",
        "condition": "LIKE_NEW",
        "asset": "wireless-headphones",
    },
    {
        "name": "รองเท้าผ้าใบสีขาว ไซซ์ 39 (เดโม)",
        "description": "สินค้าเดโมสำหรับสาธิตการดูสินค้าและขั้นตอนซื้อจำลองเท่านั้น รองเท้าผ้าใบสีขาวไซซ์ 39 ไม่ใช่สินค้าจริง",
        "price": "2190.00",
        "category": "รองเท้า",
        "brand": "NIKE",
        "size": "39",
        "condition": "GOOD",
        "asset": "white-sneakers",
    },
    {
        "name": "กล้องฟิล์มคอมแพกต์ (เดโม)",
        "description": "สินค้าเดโมสำหรับสาธิตการดูสินค้าและขั้นตอนซื้อจำลองเท่านั้น กล้องฟิล์มคอมแพกต์ ไม่ใช่สินค้าจริง",
        "price": "3490.00",
        "category": "กล้องและอุปกรณ์",
        "brand": "OLYMPUS",
        "size": "One size",
        "condition": "LIKE_NEW",
        "asset": "film-camera",
    },
    {
        "name": "นาฬิกาข้อมือสายหนัง (เดโม)",
        "description": "สินค้าเดโมสำหรับสาธิตการดูสินค้าและขั้นตอนซื้อจำลองเท่านั้น นาฬิกาข้อมือสายหนังสีดำ ไม่ใช่สินค้าจริง",
        "price": "1290.00",
        "category": "นาฬิกาและเครื่องประดับ",
        "brand": "CASIO",
        "size": "One size",
        "condition": "GOOD",
        "asset": "leather-watch",
    },
)
DEMO_CATEGORY_NAMES = tuple(dict.fromkeys(item["category"] for item in DEMO_PRODUCTS))
DEMO_BRAND_NAMES = tuple(dict.fromkeys(item["brand"] for item in DEMO_PRODUCTS))
ADVISORY_LOCK_KEY = 0x5441534B30314341


def validate_asset_base_url(value: str) -> str:
    """Allow only a local HTTP origin and the fixed demo asset path."""
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").lower()
        local_host = hostname in {"localhost", "127.0.0.1"}
        valid = (
            value == value.strip()
            and parsed.scheme == "http"
            and local_host
            and parsed.username is None
            and parsed.password is None
            and parsed.path.rstrip("/") == "/task01-demo-assets"
            and not parsed.query
            and not parsed.fragment
            and "\\" not in value
            and not any(char.isspace() for char in value)
        )
        port = parsed.port
        valid = valid and (port is None or 1024 <= port <= 65535)
    except ValueError as exc:
        raise DemoConfigurationError("TASK01 demo assets must use the local demo asset endpoint") from exc
    if not valid:
        raise DemoConfigurationError("TASK01 demo assets must use the local demo asset endpoint")
    return f"http://{parsed.netloc}{parsed.path.rstrip('/')}"


def _assert_connected_to_validated_local_target(engine: Any, database_url: str) -> None:
    expected = make_url(database_url)
    with engine.connect() as connection:
        info = connection.connection.driver_connection.info
        try:
            actual_host_is_loopback = ipaddress.ip_address(info.hostaddr).is_loopback
        except (TypeError, ValueError):
            actual_host_is_loopback = False
        actual_matches = (
            actual_host_is_loopback
            and info.port == (expected.port or 5432)
            and info.dbname == expected.database
        )
    if not actual_matches:
        raise DemoConfigurationError(
            "The PostgreSQL connection did not match the validated local TASK-01 database target"
        )


def _single_named_row(db: Session, model: Any, column: Any, name: str, label: str):
    rows = db.scalars(select(model).where(column == name)).all()
    if len(rows) > 1:
        raise DemoConfigurationError(f"TASK01 demo found duplicate {label} names; refusing to choose one")
    return rows[0] if rows else None


def _get_or_create_category(db: Session, name: str):
    from app.models.category import Category

    category = _single_named_row(db, Category, Category.category_name, name, "category")
    if category is None:
        category = Category(category_name=name, parent_category_id=None)
        db.add(category)
        db.flush()
    elif category.parent_category_id is not None:
        raise DemoConfigurationError("TASK01 demo category conflicts with an existing category hierarchy")
    return category


def _get_or_create_brand(db: Session, name: str):
    from app.models.brand import Brand

    brand = _single_named_row(db, Brand, Brand.brand_name, name, "brand")
    if brand is None:
        brand = Brand(brand_name=name)
        db.add(brand)
        db.flush()
    return brand


def _ensure_seller(db: Session):
    from app.models.user import User, UserRole, UserStatus
    from app.models.verification import Verification

    seller = db.scalar(select(User).where(User.supabase_user_id == DEMO_SELLER_UUID))
    email_owner = db.scalar(select(User).where(User.email == DEMO_SELLER_EMAIL))
    if seller is None and email_owner is not None:
        raise DemoConfigurationError("TASK01 demo seller email conflicts with an existing account")
    created = seller is None
    if created:
        seller = User(
            supabase_user_id=DEMO_SELLER_UUID,
            full_name=DEMO_SELLER_NAME,
            email=DEMO_SELLER_EMAIL,
            role=UserRole.SELLER,
            status=UserStatus.ACTIVE,
        )
        db.add(seller)
        db.flush()
    elif (
        seller.email != DEMO_SELLER_EMAIL
        or seller.full_name != DEMO_SELLER_NAME
        or seller.role != UserRole.SELLER
        or seller.status != UserStatus.ACTIVE
        or (email_owner is not None and email_owner.id != seller.id)
    ):
        raise DemoConfigurationError("TASK01 demo seller identity conflicts with existing account state")

    approvals = db.scalars(
        select(Verification).where(Verification.user_id == seller.id).order_by(Verification.created_at, Verification.id)
    ).all()
    if not approvals:
        if not created:
            raise DemoConfigurationError("TASK01 demo seller has incomplete approval state; refusing to repair it")
        now = datetime.now(timezone.utc)
        db.add(
            Verification(
                user_id=seller.id,
                id_card_image_url="https://catalog.task01.test/synthetic-id-card.jpg",
                bank_account_name=DEMO_SELLER_NAME,
                bank_account_number=DEMO_BANK_ACCOUNT,
                bank_name="ธนาคารเดโม",
                shop_name=DEMO_SHOP_NAME,
                verification_status="APPROVED",
                verified_at=now,
                reviewed_at=now,
                reject_reason=None,
                reviewed_by=None,
                purge_at=None,
            )
        )
        db.flush()
    elif len(approvals) != 1 or (
        approvals[0].verification_status != "APPROVED"
        or approvals[0].shop_name != DEMO_SHOP_NAME
        or approvals[0].id_card_image_url != "https://catalog.task01.test/synthetic-id-card.jpg"
        or approvals[0].bank_account_name != DEMO_SELLER_NAME
        or approvals[0].bank_account_number != DEMO_BANK_ACCOUNT
        or approvals[0].bank_name != "ธนาคารเดโม"
    ):
        raise DemoConfigurationError("TASK01 demo seller approval conflicts with existing verification state")
    return seller, created


def _expected_asset_url(asset_base_url: str, asset_key: str) -> str:
    return f"{asset_base_url}/{DEMO_ASSET_FILES[asset_key]}"


def seed_catalog(db: Session, *, asset_base_url: str = DEFAULT_ASSET_BASE_URL) -> dict[str, int]:
    """Create known demo rows once; preserve all existing product states and data."""
    from app.models.product import Product
    from app.models.product_image import ProductImage

    asset_base_url = validate_asset_base_url(asset_base_url)
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": ADVISORY_LOCK_KEY})

    seller, seller_created = _ensure_seller(db)
    categories = {
        name: _get_or_create_category(db, name)
        for name in DEMO_CATEGORY_NAMES
    }
    brands = {
        name: _get_or_create_brand(db, name)
        for name in DEMO_BRAND_NAMES
    }
    counts = {
        "seller_created": int(seller_created),
        "products_created": 0,
        "products_kept": 0,
        "products_preserved_unavailable": 0,
    }

    for item in DEMO_PRODUCTS:
        product = _single_named_row(db, Product, Product.product_name, item["name"], "product")
        if product is not None:
            if product.user_id != seller.id:
                raise DemoConfigurationError(
                    "TASK01 demo product name conflicts with another seller; refusing to mutate it"
                )
            if product.status != "AVAILABLE" or product.deleted_at is not None:
                counts["products_preserved_unavailable"] += 1
                continue
            expected_fields = (
                product.category_id == categories[item["category"]].id
                and product.brand_id == brands[item["brand"]].id
                and product.description == item["description"]
                and str(product.price) == item["price"]
                and product.size == item["size"]
                and product.condition == item["condition"]
                and product.sale_type == "FIXED_PRICE"
            )
            images = db.scalars(
                select(ProductImage).where(ProductImage.product_id == product.id)
            ).all()
            expected_image = _expected_asset_url(asset_base_url, item["asset"])
            expected_main_image = any(
                image.image_url == expected_image
                and image.sort_order == 0
                and image.photo_type == "MAIN"
                and image.upload_id is None
                for image in images
            )
            if not expected_fields or not expected_main_image:
                raise DemoConfigurationError(
                    "TASK01 demo product fixture is incomplete or changed; refusing to overwrite it"
                )
            counts["products_kept"] += 1
            continue

        product = Product(
            user_id=seller.id,
            category_id=categories[item["category"]].id,
            brand_id=brands[item["brand"]].id,
            product_name=item["name"],
            description=item["description"],
            size=item["size"],
            condition=item["condition"],
            price=item["price"],
            sale_type="FIXED_PRICE",
            status="AVAILABLE",
        )
        db.add(product)
        db.flush()
        image_values = {
            "product_id": product.id,
            "image_url": _expected_asset_url(asset_base_url, item["asset"]),
            "file_size": (DEMO_ASSET_DIR / DEMO_ASSET_FILES[item["asset"]]).stat().st_size,
            "uploaded_at": datetime.now(timezone.utc),
            "photo_type": "MAIN",
            "upload_id": None,
            "sort_order": 0,
        }
        if db.bind is not None and db.bind.dialect.name == "sqlite":
            # SQLite does not generate Identity values for this composite primary key.
            image_values["image_id"] = product.id
        db.add(ProductImage(**image_values))
        counts["products_created"] += 1

    db.flush()
    return counts


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--asset-base-url",
        default=DEFAULT_ASSET_BASE_URL,
        help="local API asset endpoint; the default matches task01_demo.py on port 8765",
    )
    args = parser.parse_args(argv)
    try:
        asset_base_url = validate_asset_base_url(args.asset_base_url)
        dotenv_path = BACKEND_DIR / ".env"
        settings = demo_environment(os.environ, dotenv_values(dotenv_path))
        apply_demo_environment(settings, dotenv_path)
    except DemoConfigurationError as exc:
        parser.error(str(exc))

    from app.database import engine

    if engine is None:
        parser.error("TASK01 demo database did not initialize")
    try:
        _assert_connected_to_validated_local_target(engine, settings["DATABASE_URL"])
        with Session(engine) as db, db.begin():
            counts = seed_catalog(db, asset_base_url=asset_base_url)
    except DemoConfigurationError as exc:
        parser.error(str(exc))

    print(
        "TASK-01 catalog seed complete: "
        f"created={counts['products_created']} kept={counts['products_kept']} "
        f"preserved-unavailable={counts['products_preserved_unavailable']}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
