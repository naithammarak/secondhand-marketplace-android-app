"""Seed only the dedicated local INSPECT demo database; safe to run repeatedly."""

import os
import uuid

from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.api.inspect_demo import DEMO_DB_NAME
from app.database import DATABASE_URL, engine
from app.models.user import User, UserRole, UserStatus
from tests.order_helpers import create_product


def main() -> None:
    if not DATABASE_URL or engine is None:
        raise SystemExit("DATABASE_URL is required")
    url = make_url(DATABASE_URL)
    if url.get_backend_name() != "postgresql" or url.host not in {"127.0.0.1", "localhost"} or url.database != DEMO_DB_NAME:
        raise SystemExit("Refusing to seed anything but local inspect_demo_local")
    with Session(engine) as db:
        users = {}
        for role in (UserRole.BUYER, UserRole.SELLER, UserRole.INSPECTOR):
            email = f"inspect-demo-{role.value.lower()}@example.test"
            user = db.query(User).filter(User.email == email).one_or_none()
            if user is None:
                user = User(supabase_user_id=uuid.uuid4(), full_name=f"Demo {role.value.title()}",
                            email=email, role=role, status=UserStatus.ACTIVE)
                db.add(user)
                db.flush()
            users[role] = user
        db.commit()
        from app.models.product import Product
        ids = []
        for name in ("Inspect demo PASS item", "Inspect demo negative item"):
            product = db.query(Product).filter(Product.user_id == users[UserRole.SELLER].id,
                                               Product.product_name == name,
                                               Product.status == "AVAILABLE").order_by(Product.id).first()
            ids.append(product.id if product else create_product(db, users[UserRole.SELLER].id, name=name))
    print(f"Local INSPECT demo ready; product_ids={ids}")


if __name__ == "__main__":
    main()
