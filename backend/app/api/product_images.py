"""Validate and store product images for their seller."""

import os
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.user import User, UserRole, UserStatus


router = APIRouter(tags=["Product images"])

# PRODUCT-02: รับเฉพาะ JPEG/PNG ขนาดไม่เกิน 5 MiB ต่อรูป
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGES = {
    "image/jpeg": ((".jpg", ".jpeg"), lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": ((".png",), lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
}
BUCKET = "product-images"


async def validate_image(file: UploadFile) -> tuple[bytes, str, str]:
    """Return validated bytes, MIME type and a safe file extension."""
    content_type = (file.content_type or "").lower().strip()
    rule = ALLOWED_IMAGES.get(content_type)
    if rule is None:
        raise HTTPException(status_code=415, detail="Allowed types: JPEG, PNG")

    extensions, has_signature = rule
    filename = (file.filename or "").lower()
    if not filename.endswith(extensions):
        raise HTTPException(status_code=415, detail="File extension does not match image type")

    content = await file.read(MAX_IMAGE_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Image is empty")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 5 MiB limit")
    if not has_signature(content):
        raise HTTPException(status_code=415, detail="File content does not match image type")
    return content, content_type, ".jpg" if content_type == "image/jpeg" else ".png"


def storage_config() -> tuple[str, str]:
    base_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    storage_key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not base_url or not storage_key:
        raise HTTPException(status_code=503, detail="Product image storage is not configured")
    return base_url, storage_key


def storage_headers(storage_key: str) -> dict[str, str]:
    # คีย์ใหม่ส่งผ่าน apikey; service_role แบบเดิมต้องส่ง Authorization ด้วย
    headers = {"apikey": storage_key}
    if not storage_key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {storage_key}"
    return headers


async def upload_object(path: str, content: bytes, content_type: str) -> str:
    """Store bytes in the public bucket and return their public URL."""
    base_url, storage_key = storage_config()
    headers = storage_headers(storage_key) | {"Content-Type": content_type, "x-upsert": "false"}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{base_url}/storage/v1/object/{BUCKET}/{path}",
                content=content,
                headers=headers,
            )
        response.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        raise HTTPException(status_code=502, detail="Could not upload product image") from exc
    return f"{base_url}/storage/v1/object/public/{BUCKET}/{path}"


async def delete_object(path: str) -> None:
    """Remove an uploaded object if its database row could not be saved."""
    base_url, storage_key = storage_config()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.delete(
                f"{base_url}/storage/v1/object/{BUCKET}",
                json={"prefixes": [path]},
                headers=storage_headers(storage_key),
            )
    except httpx.HTTPError:
        pass


# PRODUCT-02: อัปโหลดเฉพาะรูปของสินค้าที่ผู้ขายเป็นเจ้าของ แล้วบันทึก URL ลงฐานข้อมูล
@router.post(
    "/products/{product_id}/images",
    status_code=status.HTTP_201_CREATED,
    summary="Upload and save a product image",
)
async def create_product_image(
    product_id: int = Path(gt=0),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        if current_user.role != UserRole.SELLER or current_user.status != UserStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Only active sellers can upload product images")

        product = db.get(Product, product_id)
        if product is None or product.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Product not found")
        if product.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="This product belongs to another seller")

        content, content_type, extension = await validate_image(file)
        path = f"{product_id}/{uuid4().hex}{extension}"
        image_url = await upload_object(path, content, content_type)
        image = ProductImage(
            product_id=product_id,
            image_url=image_url,
            file_size=len(content),
            uploaded_at=datetime.now(timezone.utc),
            photo_type=content_type,
        )
        try:
            db.add(image)
            db.commit()
            db.refresh(image)
        except Exception:
            db.rollback()
            await delete_object(path)
            raise HTTPException(status_code=500, detail="Could not save product image")

        return {
            "product_id": image.product_id,
            "image_id": image.image_id,
            "image_url": image.image_url,
            "file_size": image.file_size,
            "photo_type": image.photo_type,
            "uploaded_at": image.uploaded_at,
        }
    finally:
        await file.close()
