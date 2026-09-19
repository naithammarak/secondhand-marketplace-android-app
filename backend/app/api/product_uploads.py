"""Upload a private product image before creating a product."""

import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
from anyio.from_thread import run
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app import database
from app.api.product_images import (
    BUCKET,
    compensate_upload,
    rollback_safely,
    storage_config,
    storage_headers,
    validate_image,
)
from app.database import get_db
from app.models.product_upload import ProductUpload
from app.models.user import User
from app.services.product_seller_access import require_approved_seller


ERROR_MESSAGES = {
    "AUTH_REQUIRED": "กรุณาเข้าสู่ระบบใหม่",
    "ACCOUNT_NOT_REGISTERED": "กรุณาเข้าสู่ระบบให้เสร็จก่อน",
    "ACCOUNT_INACTIVE": "บัญชีนี้ไม่สามารถทำรายการได้",
    "SELLER_ONLY": "เฉพาะผู้ขายเท่านั้นที่อัปโหลดรูปได้",
    "SELLER_NOT_APPROVED": "บัญชีผู้ขายยังไม่ได้รับอนุมัติ",
    "APPROVAL_STATE_UNAVAILABLE": "ไม่สามารถตรวจสถานะผู้ขายได้ในขณะนี้",
    "INVALID_IMAGE": "กรุณาเลือกไฟล์ JPEG หรือ PNG ที่ถูกต้อง",
    "INVALID_IMAGE_COUNT": "กรุณาแนบรูปหนึ่งไฟล์",
    "INVALID_IMAGE_DIMENSIONS": "ขนาดภาพไม่ถูกต้อง",
    "IMAGE_TOO_LARGE": "รูปต้องมีขนาดไม่เกิน 5 MiB",
    "UPLOAD_QUOTA_EXCEEDED": "มีรูปที่รอใช้งานครบจำนวนแล้ว",
    "STORAGE_UNAVAILABLE": "ไม่สามารถจัดเก็บรูปได้ในขณะนี้",
    "UPLOAD_SCHEMA_UNAVAILABLE": "ระบบอัปโหลดรูปยังไม่พร้อมใช้งาน",
    "UPLOAD_SAVE_FAILED": "ไม่สามารถบันทึกรูปได้ในขณะนี้",
}


class ProductUploadRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request: Request):
            try:
                return await original(request)
            except (HTTPException, RequestValidationError) as exc:
                if isinstance(exc, RequestValidationError):
                    status_code, code = 422, "INVALID_IMAGE_COUNT"
                else:
                    status_code = exc.status_code
                    if isinstance(exc.detail, dict) and isinstance(exc.detail.get("code"), str):
                        code = exc.detail["code"]
                    elif status_code == 401 or exc.detail == "Not authenticated":
                        status_code, code = 401, "AUTH_REQUIRED"
                    elif status_code == 404 and exc.detail == "User not found in system. Please perform initial login.":
                        status_code, code = 403, "ACCOUNT_NOT_REGISTERED"
                    elif status_code == 503:
                        code = "STORAGE_UNAVAILABLE"
                    else:
                        code = "INVALID_IMAGE"
                return JSONResponse(
                    status_code=status_code,
                    content={
                        "error": {
                            "code": code,
                            "message": ERROR_MESSAGES.get(code, "ไม่สามารถทำรายการได้"),
                            "fields": {},
                            "request_id": f"req-{uuid4().hex}",
                        }
                    },
                    headers={"Cache-Control": "no-store"},
                )

        return handler


router = APIRouter(tags=["Product images"], route_class=ProductUploadRoute)
logger = logging.getLogger(__name__)
PENDING_HOURS = 24
MAX_PENDING_UPLOADS = 16
SIGNED_URL_SECONDS = 300


def upload_error(status_code: int, code: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code})


async def require_private_bucket() -> None:
    base_url, key = storage_config()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{base_url}/storage/v1/bucket/{BUCKET}",
                headers=storage_headers(key),
            )
        response.raise_for_status()
        if response.json().get("public") is not False:
            raise upload_error(503, "STORAGE_UNAVAILABLE")
    except (httpx.HTTPError, ValueError, AttributeError) as exc:
        logger.warning("PRODUCT-02 private bucket check failed")
        raise upload_error(503, "STORAGE_UNAVAILABLE") from exc


async def upload_private_object(path: str, content: bytes, mime_type: str) -> None:
    base_url, key = storage_config()
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{base_url}/storage/v1/object/{BUCKET}/{path}",
                content=content,
                headers=storage_headers(key)
                | {"Content-Type": mime_type, "x-upsert": "false"},
            )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise upload_error(503, "STORAGE_UNAVAILABLE") from exc


async def sign_private_object(path: str) -> str:
    base_url, key = storage_config()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                f"{base_url}/storage/v1/object/sign/{BUCKET}/{path}",
                json={"expiresIn": SIGNED_URL_SECONDS},
                headers=storage_headers(key),
            )
        response.raise_for_status()
        signed_path = response.json().get("signedURL")
        if not isinstance(signed_path, str) or not signed_path.startswith(
            f"/object/sign/{BUCKET}/{path}?"
        ):
            raise ValueError("Storage returned an unexpected signed path")
    except (httpx.HTTPError, ValueError, AttributeError) as exc:
        raise upload_error(503, "STORAGE_UNAVAILABLE") from exc
    return f"{base_url}/storage/v1{signed_path}"


def committed_upload_exists(upload_id: int, object_key: str) -> bool:
    if database.SessionLocal is None:
        raise RuntimeError("Database session factory is unavailable")
    with database.SessionLocal() as inspection_db:
        record = inspection_db.get(ProductUpload, upload_id)
        return record is not None and record.object_key == object_key


# PRODUCT-02: Registry entry is created only after Storage upload and signing succeed.
@router.post("/products/images/upload", status_code=201, summary="Upload a pending product image")
def upload_pending_product_image(
    request: Request,
    response: Response,
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(require_approved_seller),
    db: Session = Depends(get_db),
):
    path = None
    storage_attempted = False
    commit_attempted = False
    result = None
    try:
        form = run(request.form)
        if set(form.keys()) != {"file"} or len(form.getlist("file")) != 1 or file is None:
            raise upload_error(422, "INVALID_IMAGE_COUNT")
        try:
            content, mime_type, extension = run(validate_image, file)
        except HTTPException as exc:
            if exc.status_code == 413:
                raise upload_error(413, "IMAGE_TOO_LARGE") from exc
            if exc.status_code == 422:
                raise upload_error(422, "INVALID_IMAGE_DIMENSIONS") from exc
            raise upload_error(422, "INVALID_IMAGE") from exc

        seller = db.scalar(
            select(User)
            .where(User.id == current_user.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if seller is None:
            raise upload_error(403, "ACCOUNT_NOT_REGISTERED")
        require_approved_seller(current_user=seller, db=db)
        now = datetime.now(timezone.utc)
        try:
            pending_count = db.scalar(
                select(func.count(ProductUpload.id)).where(
                    ProductUpload.user_id == seller.id,
                    ProductUpload.state == "PENDING",
                    ProductUpload.expires_at > now,
                )
            )
        except DBAPIError as exc:
            logger.exception("PRODUCT-02 upload registry query failed")
            raise upload_error(503, "UPLOAD_SCHEMA_UNAVAILABLE") from exc
        if pending_count >= MAX_PENDING_UPLOADS:
            raise upload_error(409, "UPLOAD_QUOTA_EXCEEDED")

        run(require_private_bucket)
        path = f"pending/{uuid4().hex}{extension}"
        storage_attempted = True
        run(upload_private_object, path, content, mime_type)
        signed_url = run(sign_private_object, path)

        record = ProductUpload(
            user_id=seller.id,
            object_key=path,
            mime_type=mime_type,
            file_size=len(content),
            uploaded_at=now,
            expires_at=now + timedelta(hours=PENDING_HOURS),
            state="PENDING",
        )
        db.add(record)
        db.flush()
        result = {
            "data": {
                "upload_id": record.id,
                "image_url": signed_url,
                "url_expires_at": now + timedelta(seconds=SIGNED_URL_SECONDS),
                "expires_at": record.expires_at,
                "mime_type": record.mime_type,
                "file_size": record.file_size,
                "uploaded_at": record.uploaded_at,
            }
        }
        commit_attempted = True
        db.commit()
        response.headers["Cache-Control"] = "no-store"
        return result
    except HTTPException as exc:
        rollback_safely(db)
        if commit_attempted:
            try:
                if committed_upload_exists(result["data"]["upload_id"], path):
                    response.headers["Cache-Control"] = "no-store"
                    return result
            except Exception:
                logger.exception("PRODUCT-02 uncertain commit check failed for path=%s", path)
            logger.error("PRODUCT-02 uncertain commit for path=%s", path)
            raise upload_error(500, "UPLOAD_SAVE_FAILED") from exc
        if storage_attempted:
            run(compensate_upload, path)
        raise
    except Exception as exc:
        rollback_safely(db)
        if commit_attempted:
            try:
                if committed_upload_exists(result["data"]["upload_id"], path):
                    response.headers["Cache-Control"] = "no-store"
                    return result
            except Exception:
                logger.exception("PRODUCT-02 uncertain commit check failed for path=%s", path)
            logger.error("PRODUCT-02 uncertain commit for path=%s", path)
        elif storage_attempted:
            run(compensate_upload, path)
        logger.exception("PRODUCT-02 pending upload failed for user_id=%s", current_user.id)
        raise upload_error(500, "UPLOAD_SAVE_FAILED") from exc
    finally:
        if file is not None:
            run(file.close)
