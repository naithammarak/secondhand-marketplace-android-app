"""Local-only demo identities for trying INSPECT with a real isolated database."""

import os
import time
import secrets

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.database import DATABASE_URL, get_db
from app.models.user import User
from app.models.product import Product


router = APIRouter(prefix="/__inspect_demo", tags=["Local demo"])
DEMO_ISSUER = "https://inspect-demo.local/auth/v1"
DEMO_DB_NAME = "inspect_demo_local"


def demo_enabled() -> bool:
    if os.getenv("INSPECT_DEMO_ENABLED") != "true" or os.getenv("APP_ENV") != "development":
        return False
    if not DATABASE_URL:
        return False
    url = make_url(DATABASE_URL)
    secret = os.getenv("INSPECT_DEMO_JWT_SECRET")
    return (
        url.get_backend_name() == "postgresql"
        and url.host in {"127.0.0.1", "localhost"}
        and url.database == DEMO_DB_NAME
        and bool(secret) and len(secret) >= 32
        and os.getenv("SUPABASE_JWT_SECRET") == secret
        and os.getenv("SUPABASE_JWT_ISSUER") == DEMO_ISSUER
        and os.getenv("SUPABASE_JWT_ALGORITHM") == "HS256"
        and len(os.getenv("INSPECT_DEMO_ACCESS_CODE", "")) >= 12
    )


@router.post("/session/{role}")
def demo_session(role: str, response: Response, x_demo_code: str | None = Header(None), db: Session = Depends(get_db)):
    if not demo_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    if not x_demo_code or not secrets.compare_digest(x_demo_code, os.environ["INSPECT_DEMO_ACCESS_CODE"]):
        raise HTTPException(status_code=403, detail="Demo code required")
    role = role.upper()
    if role not in {"BUYER", "SELLER", "INSPECTOR"}:
        raise HTTPException(status_code=404, detail="Not found")
    user = db.query(User).filter(User.email == f"inspect-demo-{role.lower()}@example.test").one_or_none()
    if user is None or user.role.value != role:
        raise HTTPException(status_code=503, detail="Demo data not seeded")
    expiry = int(time.time()) + 3600
    token = jwt.encode(
        {"sub": str(user.supabase_user_id), "aud": "authenticated", "iss": DEMO_ISSUER,
         "exp": expiry, "email": user.email},
        os.environ["INSPECT_DEMO_JWT_SECRET"], algorithm="HS256",
    )
    response.headers["Cache-Control"] = "no-store"
    products = []
    for name in ("Inspect demo PASS item", "Inspect demo negative item"):
        product = db.query(Product).filter(Product.product_name == name, Product.status == "AVAILABLE").order_by(Product.id).first()
        products.append({"id": product.id, "name": name} if product else None)
    return {"access_token": token, "expires_at": expiry,
            "user": {"id": str(user.supabase_user_id), "role": role, "name": user.full_name},
            "products": [item for item in products if item]}
