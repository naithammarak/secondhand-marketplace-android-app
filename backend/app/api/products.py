"""Create, update, and cancel products for approved sellers (PRODUCT-03/04)."""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from anyio.from_thread import run
from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.product_images import compensate_upload
from app.api.product_uploads import SIGNED_URL_SECONDS, sign_private_object
from app.database import get_db
from app.models.brand import Brand
from app.models.category import Category
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.product_upload import ProductUpload
from app.models.user import User
from app.schemas.product import CreateProductRequest, UpdateProductRequest
from app.services.product_seller_access import require_approved_seller
from app.services.product_upload_binding import bind_pending_uploads, replace_product_images


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
    "PRODUCT_NOT_FOUND": "ไม่พบสินค้าที่สามารถแสดงได้",
    "PRODUCT_NOT_EDITABLE": "สถานะปัจจุบันไม่อนุญาตให้แก้ไขสินค้า",
    "PRODUCT_NOT_CANCELLABLE": "สถานะปัจจุบันไม่อนุญาตให้ยกเลิกสินค้า",
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


def validate_update_body(raw_body: dict) -> UpdateProductRequest:
    try:
        return UpdateProductRequest.model_validate(raw_body)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


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
                            or "image_id" in error["loc"]
                            or any(
                                marker in str(error.get("ctx", {}).get("error", ""))
                                for marker in ("ซ้ำ", "image_id", "upload_id")
                            )
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


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def committed_product_matches(bind, seller_id: int, result: dict) -> bool:
    """Confirm a create/update result after an uncertain commit."""
    expected = result["data"]
    product_id = expected["id"]
    with Session(bind=bind) as inspection_db:
        product = inspection_db.get(Product, product_id)
        if (
            product is None
            or product.user_id != seller_id
            or product.product_name != expected["product_name"]
            or product.description != expected["description"]
            or format(product.price, ".2f") != expected["price"]
            or product.category_id != expected["category_id"]
            or product.brand_id != expected["brand_id"]
            or product.size != expected["size"]
            or product.condition != expected["condition"]
            or product.sale_type != expected["sale_type"]
            or product.status != expected["status"]
        ):
            return False
        images = inspection_db.scalars(
            select(ProductImage)
            .where(ProductImage.product_id == product_id)
            .order_by(ProductImage.sort_order, ProductImage.image_id)
        ).all()
        expected_images = expected["images"]
        if [
            (image.image_id, image.sort_order, image.photo_type)
            for image in images
        ] != [
            (image["image_id"], image["sort_order"], image["photo_type"])
            for image in expected_images
        ]:
            return False
        image_ids = [image.image_id for image in images]
        uploads = inspection_db.scalars(
            select(ProductUpload)
            .where(ProductUpload.id.in_(image_ids))
            .order_by(ProductUpload.id)
        ).all()
        return (
            len(uploads) == len(image_ids)
            and all(
                upload.state == "ATTACHED" and upload.attached_product_id == product_id
                for upload in uploads
            )
        )


def committed_cancel_matches(bind, product_id: int, seller_id: int, result: dict) -> bool:
    with Session(bind=bind) as inspection_db:
        product = inspection_db.get(Product, product_id)
        return (
            product is not None
            and product.user_id == seller_id
            and product.deleted_at is None
            and product.status == "CANCELLED"
            and as_utc(product.updated_at) == as_utc(result["data"]["updated_at"])
        )


def product_result(product, category, brand, signed_images) -> dict:
    return {
        "data": {
            "id": product.id,
            "product_name": product.product_name,
            "description": product.description,
            "price": format(product.price, ".2f"),
            "category_id": product.category_id,
            "category": {
                "id": category.id,
                "category_name": category.category_name,
                "parent_category_id": category.parent_category_id,
            },
            "brand_id": product.brand_id,
            "brand": {"id": brand.id, "brand_name": brand.brand_name},
            "size": product.size,
            "condition": product.condition,
            "sale_type": product.sale_type,
            "status": product.status,
            "images": [
                {
                    "image_id": image.image_id,
                    "image_url": signed_url,
                    "url_expires_at": url_expires_at,
                    "file_size": image.file_size,
                    "uploaded_at": image.uploaded_at,
                    "sort_order": image.sort_order,
                    "photo_type": image.photo_type,
                }
                for image, signed_url, url_expires_at in signed_images
            ],
            "created_at": as_utc(product.created_at),
            "updated_at": as_utc(product.updated_at),
        }
    }


def sign_images(images: list[ProductImage]) -> list[tuple[ProductImage, str, datetime]]:
    signed_images = []
    for image in images:
        signing_started_at = datetime.now(timezone.utc)
        signed_images.append(
            (
                image,
                run(sign_private_object, image.image_url),
                signing_started_at + timedelta(seconds=SIGNED_URL_SECONDS),
            )
        )
    return signed_images


def cleanup_detached_objects(bind, seller_id: int, paths: list[str]) -> None:
    """Best-effort cleanup after the database has committed detached images."""
    for path in paths:
        try:
            with Session(bind=bind) as inspection_db:
                upload = inspection_db.scalar(
                    select(ProductUpload).where(ProductUpload.object_key == path)
                )
                references = inspection_db.scalar(
                    select(func.count(ProductImage.image_id)).where(
                        ProductImage.image_url == path
                    )
                )
                safe = (
                    upload is not None
                    and upload.user_id == seller_id
                    and upload.state == "DETACHED"
                    and upload.attached_product_id is None
                    and references == 0
                )
            if safe:
                run(compensate_upload, path)
        except Exception:
            logger.exception("PRODUCT-04 detached image cleanup failed for path=%s", path)


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
    commit_attempted = False
    result = None
    product_id = None
    seller_id = current_user.id
    upload_ids = [item.upload_id for item in body.images]
    bind = db.get_bind()
    try:
        seller = db.scalar(
            select(User)
            .where(User.id == current_user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
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
            upload_ids=upload_ids,
        )
        signed_images = sign_images(images)
        product_id = product.id
        result = product_result(product, category, brand, signed_images)
        commit_attempted = True
        db.commit()
        response.headers["Location"] = f"/products/{product_id}"
        response.headers["Cache-Control"] = "no-store"
        return result
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        logger.info("PRODUCT-03 reference changed during create for user_id=%s", current_user.id)
        raise product_error(422, "INVALID_REFERENCE") from exc
    except Exception as exc:
        db.rollback()
        if commit_attempted and result is not None and product_id is not None:
            try:
                if committed_product_matches(bind, seller_id, result):
                    response.headers["Location"] = f"/products/{product_id}"
                    response.headers["Cache-Control"] = "no-store"
                    return result
            except Exception:
                logger.exception(
                    "PRODUCT-03 uncertain commit check failed for product_id=%s",
                    product_id,
                )
            logger.error("PRODUCT-03 uncertain commit for product_id=%s", product_id)
        logger.exception("PRODUCT-03 create failed for user_id=%s", current_user.id)
        raise product_error(500, "PRODUCT_SAVE_FAILED") from exc


@router.patch(
    "/products/{product_id}",
    summary="Update an available product",
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Account or seller approval does not allow this action"},
        404: {"description": "Product not found for this owner"},
        409: {"description": "Product state or image reference conflicts"},
        422: {"description": "Request, catalog reference, or image reference is invalid"},
        500: {"description": "Product could not be saved"},
        503: {"description": "Approval or private image storage is unavailable"},
    },
)
def update_product(
    product_id: int,
    response: Response,
    raw_body: dict = Body(...),
    current_user: User = Depends(require_approved_seller),
    db: Session = Depends(get_db),
):
    commit_attempted = False
    result = None
    detached_paths = []
    bind = db.get_bind()
    try:
        seller = db.scalar(
            select(User)
            .where(User.id == current_user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if seller is None:
            raise product_error(403, "ACCOUNT_NOT_REGISTERED")
        require_approved_seller(current_user=seller, db=db)

        product = db.scalar(
            select(Product)
            .where(
                Product.id == product_id,
                Product.user_id == seller.id,
                Product.deleted_at.is_(None),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if product is None:
            raise product_error(404, "PRODUCT_NOT_FOUND")
        if product.status != "AVAILABLE":
            raise product_error(409, "PRODUCT_NOT_EDITABLE")

        body = validate_update_body(raw_body)
        fields = body.model_fields_set
        category = (
            db.get(Category, body.category_id)
            if "category_id" in fields
            else db.get(Category, product.category_id)
        )
        brand = (
            db.get(Brand, body.brand_id)
            if "brand_id" in fields
            else db.get(Brand, product.brand_id)
        )
        missing = {}
        if category is None:
            missing["category_id"] = ["ไม่พบหมวดหมู่ที่ระบุ"]
        if brand is None:
            missing["brand_id"] = ["ไม่พบแบรนด์ที่ระบุ"]
        if missing:
            raise product_error(422, "INVALID_REFERENCE", missing)

        for field in (
            "product_name",
            "description",
            "category_id",
            "brand_id",
            "size",
            "condition",
            "sale_type",
        ):
            if field in fields:
                setattr(product, field, getattr(body, field))
        if "price" in fields:
            product.price = Decimal(body.price)

        if "images" in fields:
            references = [
                ("image", item.image_id)
                if item.image_id is not None
                else ("upload", item.upload_id)
                for item in body.images
            ]
            images, detached_paths = replace_product_images(
                db,
                seller_id=seller.id,
                product=product,
                references=references,
            )
        else:
            images = db.scalars(
                select(ProductImage)
                .where(ProductImage.product_id == product.id)
                .order_by(ProductImage.sort_order, ProductImage.image_id)
            ).all()

        product.updated_at = datetime.now(timezone.utc)
        db.flush()
        result = product_result(product, category, brand, sign_images(images))
        commit_attempted = True
        db.commit()
        response.headers["Cache-Control"] = "no-store"
        cleanup_detached_objects(bind, seller.id, detached_paths)
        return result
    except (HTTPException, RequestValidationError):
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        logger.info("PRODUCT-04 reference changed during update for product_id=%s", product_id)
        raise product_error(422, "INVALID_IMAGE_REFERENCE") from exc
    except Exception as exc:
        db.rollback()
        if commit_attempted and result is not None:
            try:
                if committed_product_matches(bind, current_user.id, result):
                    response.headers["Cache-Control"] = "no-store"
                    cleanup_detached_objects(bind, current_user.id, detached_paths)
                    return result
            except Exception:
                logger.exception(
                    "PRODUCT-04 uncertain update check failed for product_id=%s", product_id
                )
            logger.error("PRODUCT-04 uncertain update for product_id=%s", product_id)
        logger.exception("PRODUCT-04 update failed for product_id=%s", product_id)
        raise product_error(500, "PRODUCT_SAVE_FAILED") from exc


@router.post(
    "/products/{product_id}/cancel",
    summary="Cancel an available product",
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Account or seller approval does not allow this action"},
        404: {"description": "Product not found for this owner"},
        409: {"description": "Product cannot be cancelled in its current state"},
        422: {"description": "Request body is invalid"},
        500: {"description": "Product could not be saved"},
        503: {"description": "Seller approval state is unavailable"},
    },
)
def cancel_product(
    product_id: int,
    response: Response,
    raw_body: dict | None = Body(default=None),
    current_user: User = Depends(require_approved_seller),
    db: Session = Depends(get_db),
):
    commit_attempted = False
    result = None
    bind = db.get_bind()
    try:
        seller = db.scalar(
            select(User)
            .where(User.id == current_user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if seller is None:
            raise product_error(403, "ACCOUNT_NOT_REGISTERED")
        require_approved_seller(current_user=seller, db=db)

        product = db.scalar(
            select(Product)
            .where(
                Product.id == product_id,
                Product.user_id == seller.id,
                Product.deleted_at.is_(None),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if product is None:
            raise product_error(404, "PRODUCT_NOT_FOUND")
        if raw_body not in (None, {}):
            raise product_error(422, "FIELD_NOT_ALLOWED")
        if product.status in {"RESERVED", "SOLD"}:
            raise product_error(409, "PRODUCT_NOT_CANCELLABLE")
        if product.status == "CANCELLED":
            response.headers["Cache-Control"] = "no-store"
            return {
                "data": {
                    "id": product.id,
                    "status": product.status,
                    "updated_at": as_utc(product.updated_at),
                }
            }
        if product.status != "AVAILABLE":
            raise product_error(409, "PRODUCT_NOT_CANCELLABLE")

        product.status = "CANCELLED"
        product.updated_at = datetime.now(timezone.utc)
        db.flush()
        result = {
            "data": {
                "id": product.id,
                "status": product.status,
                "updated_at": as_utc(product.updated_at),
            }
        }
        commit_attempted = True
        db.commit()
        response.headers["Cache-Control"] = "no-store"
        return result
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        if commit_attempted and result is not None:
            try:
                if committed_cancel_matches(bind, product_id, current_user.id, result):
                    response.headers["Cache-Control"] = "no-store"
                    return result
            except Exception:
                logger.exception(
                    "PRODUCT-04 uncertain cancel check failed for product_id=%s", product_id
                )
            logger.error("PRODUCT-04 uncertain cancel for product_id=%s", product_id)
        logger.exception("PRODUCT-04 cancel failed for product_id=%s", product_id)
        raise product_error(500, "PRODUCT_SAVE_FAILED") from exc
