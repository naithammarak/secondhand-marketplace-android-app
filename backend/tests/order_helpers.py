"""ข้อมูลสมมติและตัวช่วยสำหรับ test งานสั่งซื้อ (ไม่มีข้อมูลจริงหรือ secret)"""

import time
import uuid
from decimal import Decimal

import jwt
from sqlalchemy.orm import Session

from app.models.brand import Brand
from app.models.category import Category
from app.models.product import Product
from app.models.user import User, UserRole, UserStatus

TEST_SECRET = "test-secret-key-for-jwt-testing-12345678901234567890"
TEST_AUDIENCE = "authenticated"
TEST_ISSUER = "https://example-project.supabase.co/auth/v1"

VALID_ADDRESS = {
    "recipient_name": "ผู้ซื้อ ทดสอบ",
    "phone": "081-234-5678",
    "address_line": "99/1 ถนนทดสอบ",
    "subdistrict": "แขวงทดสอบ",
    "district": "เขตทดสอบ",
    "province": "กรุงเทพมหานคร",
    "postal_code": "10110",
}


def patch_auth(monkeypatch) -> None:
    import app.api.auth as auth_module

    monkeypatch.setattr(auth_module, "SUPABASE_JWT_SECRET", TEST_SECRET)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_AUDIENCE", TEST_AUDIENCE)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ISSUER", TEST_ISSUER)
    monkeypatch.setattr(auth_module, "SUPABASE_JWT_ALGORITHM", "HS256")


def auth_header(supabase_uid: uuid.UUID) -> dict[str, str]:
    token = jwt.encode(
        {"sub": str(supabase_uid), "aud": TEST_AUDIENCE, "iss": TEST_ISSUER, "exp": int(time.time()) + 3600},
        TEST_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def new_key() -> str:
    return str(uuid.uuid4())


def create_user(
    db: Session,
    role: UserRole | None,
    status: UserStatus = UserStatus.ACTIVE,
    name: str = "ผู้ใช้ ทดสอบ",
) -> tuple[int, dict[str, str]]:
    supabase_uid = uuid.uuid4()
    user = User(
        supabase_user_id=supabase_uid,
        full_name=name,
        email=f"{supabase_uid}@example.test",
        role=role,
        status=status,
    )
    db.add(user)
    db.commit()
    return user.id, auth_header(supabase_uid)


def create_catalog(db: Session) -> tuple[int, int]:
    category = Category(category_name="เสื้อผ้า")
    brand = Brand(brand_name="แบรนด์ทดสอบ")
    db.add_all([category, brand])
    db.commit()
    return category.id, brand.id


def create_product(
    db: Session,
    seller_id: int,
    price: str = "1200.00",
    status: str = "AVAILABLE",
    deleted: bool = False,
    name: str = "เสื้อแจ็กเก็ตมือสอง",
) -> int:
    category = db.query(Category).first()
    brand = db.query(Brand).first()
    if category is None or brand is None:
        category_id, brand_id = create_catalog(db)
    else:
        category_id, brand_id = category.id, brand.id
    product = Product(
        user_id=seller_id,
        category_id=category_id,
        brand_id=brand_id,
        product_name=name,
        description="สินค้าสำหรับทดสอบ",
        size="M",
        condition="ดี",
        price=Decimal(price),
        sale_type="FIXED_PRICE",
        status=status,
    )
    if deleted:
        from datetime import datetime, timezone

        product.deleted_at = datetime.now(timezone.utc)
    db.add(product)
    db.commit()
    return product.id


def order_body(product_id: int, **address_overrides) -> dict:
    return {"product_id": product_id, "shipping_address": {**VALID_ADDRESS, **address_overrides}}
