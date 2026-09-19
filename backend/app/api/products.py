"""Create products for currently approved sellers (PRODUCT-03)."""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from anyio.from_thread import run
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.product_uploads import SIGNED_URL_SECONDS, sign_private_object
from app.database import get_db
from app.models.brand import Brand
from app.models.category import Category
from app.models.product import Product
from app.models.user import User
from app.schemas.product import CreateProductRequest
from app.services.product_seller_access import require_approved_seller
from app.services.product_upload_binding import bind_pending_uploads


logger = logging.getLogger(__name__)

ERROR_MESSAGES = {
    "AUTH_REQUIRED": "กรุณาเข้าสู่ระบบใหม่",
    "ACCOUNT_NOT_REGISTERED": "กรุณาเข้าสู่ระบบให้เสร็จก่อน",
    "ACCOUNT_INACTIVE": "บัญชีนี้ไม่สามารถทำรายการได้",
    "SELLER_ONLY": "เฉพาะผู้ขายเท่านั้นที่ลงขายสินค้าได้",
    "SELLER_NOT_APPROVED": "บัญชีผู้ขายยังไม่ได้รับอนุมัติ",
    "APPROVAL_STATE_UNAVAILABLE": "ไม่สามารถตรวจสถานะผู้ขายได้ในขณะนี้",
    "INVALID_IMAGE_COUNT": "สินค้าต้องมีรูป 1–10 รูป",
    "INVALID_IMAGE_REFERENCE": "ไม่สามารถใช้รูปที่ระบุได้",
    "IMAGE_ALREADY_ATTACHED": "รูปนี้ถูกใช้กับสินค้าแล้ว",
    "UPLOAD_EXPIRED": "รูปที่อัปโหลดหมดอายุแล้ว",
    "INVALID_REFERENCE": "ไม่พบหมวดหมู่หรือแบรนด์ที่ระบุ",
    "FIELD_NOT_ALLOWED": "มีฟิลด์ที่ไม่อนุญาตให้ส่ง",
    "VALIDATION_ERROR": "กรุณาตรวจสอบข้อมูลสินค้า",
    "STORAGE_UNAVAILABLE": "ไม่สามารถอ่านรูปได้ในขณะนี้",
    "PRODUCT_SAVE_FAILED": "ไม่สามารถบันทึกสินค้าได้ในขณะนี้",
}


def product_error(status_code: int, code: str, fields: dict | None = None) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "fields": fields or {}})


def validation_fields(exc: RequestValidationError) -> dict[str, list[str]]:
    fields: dict[str, list[str]] = {}
    for error in exc.errors():
        path = ".".join(str(part) for part in error["loc"] if part != "body") or "body"
        message = error.get("ctx", {}).get("error")
        fields.setdefault(path, []).append(str(message or error["msg"]))
    return fields


class ProductCreateRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request: Request):
            try:
                return await original(request)
            except (HTTPException, RequestValidationError) as exc:
                fields = {}
                if isinstance(exc, RequestValidationError):
                    fields = validation_fields(exc)
                    errors = exc.errors()
                    if any(error["type"] == "extra_forbidden" for error in errors):
                        code = "FIELD_NOT_ALLOWED"
                    elif any(
                        error["loc"][-1:] == ("images",)
                        and "1–10" in str(error.get("ctx", {}).get("error", ""))
                        for error in errors
                    ):
                        code = "INVALID_IMAGE_COUNT"
                    elif any(
                        "images" in error["loc"]
                        and (
                            "upload_id" in error["loc"]
                            or "ซ้ำ" in str(error.get("ctx", {}).get("error", ""))
                        )
                        for error in errors
                    ):
                        code = "INVALID_IMAGE_REFERENCE"
                    else:
                        code = "VALIDATION_ERROR"
                    status_code = 422
                else:
                    status_code = exc.status_code
                    if isinstance(exc.detail, dict) and isinstance(exc.detail.get("code"), str):
                        code = exc.detail["code"]
                        fields = exc.detail.get("fields") or {}
                    elif status_code == 401 or exc.detail == "Not authenticated":
                        status_code, code = 401, "AUTH_REQUIRED"
                    elif status_code == 404 and exc.detail == "User not found in system. Please perform initial login.":
                        status_code, code = 403, "ACCOUNT_NOT_REGISTERED"
                    else:
                        code = "PRODUCT_SAVE_FAILED"
                return JSONResponse(
                    status_code=status_code,
                    content={
                        "error": {
                            "code": code,
                            "message": ERROR_MESSAGES.get(code, "ไม่สามารถทำรายการได้"),
                            "fields": fields,
                            "request_id": f"req-{uuid4().hex}",
                        }
                    },
                    headers={"Cache-Control": "no-store"},
                )

        return handler


router = APIRouter(tags=["Products"], route_class=ProductCreateRoute)


@router.post(
    "/products",
    status_code=201,
    summary="Create a product",
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Account or seller approval does not allow this action"},
        409: {"description": "Image reference is expired or already attached"},
        422: {"description": "Request, catalog reference, or image reference is invalid"},
        500: {"description": "Product could not be saved"},
        503: {"description": "Approval or private image storage is unavailable"},
    },
)
def create_product(
    body: CreateProductRequest,
    response: Response,
    current_user: User = Depends(require_approved_seller),
    db: Session = Depends(get_db),
):
    try:
        seller = db.scalar(select(User).where(User.id == current_user.id).with_for_update())
        if seller is None:
            raise product_error(403, "ACCOUNT_NOT_REGISTERED")
        require_approved_seller(current_user=seller, db=db)

        category = db.get(Category, body.category_id)
        brand = db.get(Brand, body.brand_id)
        missing = {}
        if category is None:
            missing["category_id"] = ["ไม่พบหมวดหมู่ที่ระบุ"]
        if brand is None:
            missing["brand_id"] = ["ไม่พบแบรนด์ที่ระบุ"]
        if missing:
            raise product_error(422, "INVALID_REFERENCE", missing)

        product = Product(
            user_id=seller.id,
            category_id=category.id,
            brand_id=brand.id,
            product_name=body.product_name,
            description=body.description,
            size=body.size,
            condition=body.condition,
            price=Decimal(body.price),
            sale_type=body.sale_type,
            status="AVAILABLE",
        )
        db.add(product)
        db.flush()

        images = bind_pending_uploads(
            db,
            seller_id=seller.id,
            product_id=product.id,
            upload_ids=[item.upload_id for item in body.images],
        )
        signed_urls = [run(sign_private_object, image.image_url) for image in images]
        urls_expire_at = datetime.now(timezone.utc) + timedelta(seconds=SIGNED_URL_SECONDS)
        category_data = {
            "id": category.id,
            "category_name": category.category_name,
            "parent_category_id": category.parent_category_id,
        }
        brand_data = {"id": brand.id, "brand_name": brand.brand_name}

        db.commit()
        db.refresh(product)
        for image in images:
            db.refresh(image)

        response.headers["Location"] = f"/products/{product.id}"
        response.headers["Cache-Control"] = "no-store"
        return {
            "data": {
                "id": product.id,
                "product_name": product.product_name,
                "description": product.description,
                "price": format(product.price, ".2f"),
                "category_id": product.category_id,
                "category": category_data,
                "brand_id": product.brand_id,
                "brand": brand_data,
                "size": product.size,
                "condition": product.condition,
                "sale_type": product.sale_type,
                "status": product.status,
                "images": [
                    {
                        "image_id": image.image_id,
                        "image_url": signed_url,
                        "url_expires_at": urls_expire_at,
                        "file_size": image.file_size,
                        "uploaded_at": image.uploaded_at,
                        "sort_order": image.sort_order,
                        "photo_type": image.photo_type,
                    }
                    for image, signed_url in zip(images, signed_urls, strict=True)
                ],
                "created_at": product.created_at,
                "updated_at": product.updated_at,
            }
        }
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        logger.info("PRODUCT-03 reference changed during create for user_id=%s", current_user.id)
        raise product_error(422, "INVALID_REFERENCE") from exc
    except Exception as exc:
        db.rollback()
        logger.exception("PRODUCT-03 create failed for user_id=%s", current_user.id)
        raise product_error(500, "PRODUCT_SAVE_FAILED") from exc
