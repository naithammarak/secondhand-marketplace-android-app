"""Validate and store product images for their seller."""

import logging
import os
import warnings
from datetime import datetime, timezone
from io import BytesIO
from uuid import uuid4

import httpx
from anyio.from_thread import run
from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import database
from app.database import get_db
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.user import User
from app.services.seller_access import ensure_active_seller
from app.services.product_seller_access import require_approved_seller


router = APIRouter(tags=["Product images"])
logger = logging.getLogger(__name__)

# PRODUCT-02: Validate the entire image and limit each product to ten images.
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
MAX_IMAGE_DIMENSION = 10_000
MAX_PRODUCT_IMAGES = 10
ALLOWED_IMAGES = {
    "image/jpeg": ((".jpg", ".jpeg"), "JPEG", ".jpg"),
    "image/png": ((".png",), "PNG", ".png"),
}
BUCKET = "product-images"


async def validate_image(file: UploadFile) -> tuple[bytes, str, str]:
    """Return decoded JPEG/PNG bytes, MIME type and a safe extension."""
    content_type = (file.content_type or "").lower().strip()
    rule = ALLOWED_IMAGES.get(content_type)
    if rule is None:
        raise HTTPException(status_code=415, detail="Allowed types: JPEG, PNG")

    extensions, image_format, safe_extension = rule
    if not (file.filename or "").lower().endswith(extensions):
        raise HTTPException(status_code=415, detail="File extension does not match image type")

    content = await file.read(MAX_IMAGE_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Image is empty")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 5 MiB limit")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                if image.format != image_format:
                    raise ValueError("Unexpected image format or dimensions")
                if (
                    image.width * image.height > MAX_IMAGE_PIXELS
                    or max(image.size) > MAX_IMAGE_DIMENSION
                ):
                    raise HTTPException(status_code=422, detail="Invalid image dimensions")
                if getattr(image, "is_animated", False) or getattr(image, "n_frames", 1) > 1:
                    raise ValueError("Animated images are not allowed")
                image.verify()
            with Image.open(BytesIO(content)) as image:
                image.load()
                clean_image = ImageOps.exif_transpose(image)
                if image_format == "JPEG":
                    clean_image = clean_image.convert("RGB")
                output = BytesIO()
                clean_image.save(output, format=image_format)
                content = output.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError,
            Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=415, detail="File is not a readable JPEG or PNG image") from exc

    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 5 MiB limit")
    return content, content_type, safe_extension


def storage_config() -> tuple[str, str]:
    base_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    storage_key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not base_url or not storage_key:
        raise HTTPException(status_code=503, detail="Product image storage is not configured")
    return base_url, storage_key


def storage_headers(storage_key: str) -> dict[str, str]:
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
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not upload product image") from exc
    return f"{base_url}/storage/v1/object/public/{BUCKET}/{path}"


async def delete_object(path: str) -> None:
    """Remove a possible object after an upload or database failure."""
    base_url, storage_key = storage_config()
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.request(
            "DELETE",
            f"{base_url}/storage/v1/object/{BUCKET}",
            json={"prefixes": [path]},
            headers=storage_headers(storage_key),
        )
    response.raise_for_status()


async def compensate_upload(path: str) -> None:
    try:
        await delete_object(path)
    except Exception:
        logger.exception("PRODUCT-02 orphan cleanup failed for bucket=%s path=%s", BUCKET, path)


def rollback_safely(db: Session) -> None:
    try:
        db.rollback()
    except Exception:
        logger.exception("PRODUCT-02 database rollback failed")


def committed_image_exists(product_id: int, image_id: int, image_url: str) -> bool:
    """Inspect an uncertain commit through a fresh database session."""
    if database.SessionLocal is None:
        raise RuntimeError("Database session factory is unavailable")
    with database.SessionLocal() as inspection_db:
        image = inspection_db.get(ProductImage, (product_id, image_id))
        return image is not None and image.image_url == image_url


def reconcile_commit(product_id: int, result: dict, path: str) -> bool:
    try:
        if committed_image_exists(product_id, result["image_id"], result["image_url"]):
            logger.warning(
                "PRODUCT-02 commit acknowledgement lost but image row exists for product_id=%s image_id=%s",
                product_id,
                result["image_id"],
            )
            return True
    except Exception:
        logger.exception(
            "PRODUCT-02 commit outcome check failed for product_id=%s path=%s",
            product_id,
            path,
        )
    logger.error(
        "PRODUCT-02 commit outcome uncertain; inspect image row and Storage object for product_id=%s path=%s",
        product_id,
        path,
    )
    return False


# PRODUCT-02: Lock the product row across the count, Storage upload and DB commit.
@router.post(
    "/products/{product_id}/images",
    status_code=status.HTTP_201_CREATED,
    summary="Upload and save a product image",
)
def create_product_image(
    product_id: int = Path(gt=0),
    file: UploadFile = File(...),
    current_user: User = Depends(require_approved_seller),
    db: Session = Depends(get_db),
):
    path = None
    storage_attempted = False
    commit_attempted = False
    try:
        ensure_active_seller(current_user, detail="Only active sellers can upload product images")

        product = db.get(Product, product_id)
        if product is None or product.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Product not found")
        if product.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="This product belongs to another seller")

        content, content_type, extension = run(validate_image, file)
        product = (
            db.query(Product)
            .filter(Product.id == product_id)
            .with_for_update()
            .populate_existing()
            .one_or_none()
        )
        if product is None or product.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Product not found")
        if product.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="This product belongs to another seller")

        image_count = (
            db.query(func.count(ProductImage.image_id))
            .filter(ProductImage.product_id == product_id)
            .scalar()
        )
        if image_count >= MAX_PRODUCT_IMAGES:
            raise HTTPException(status_code=409, detail="Product already has 10 images")

        path = f"{product_id}/{uuid4().hex}{extension}"
        storage_attempted = True
        image_url = run(upload_object, path, content, content_type)
        image = ProductImage(
            product_id=product_id,
            image_url=image_url,
            file_size=len(content),
            uploaded_at=datetime.now(timezone.utc),
            photo_type=content_type,
        )
        db.add(image)
        db.flush()
        result = {
            "product_id": image.product_id,
            "image_id": image.image_id,
            "image_url": image.image_url,
            "file_size": image.file_size,
            "photo_type": image.photo_type,
            "uploaded_at": image.uploaded_at,
        }
        commit_attempted = True
        db.commit()
        return result
    except HTTPException as exc:
        rollback_safely(db)
        if commit_attempted:
            if reconcile_commit(product_id, result, path):
                return result
            raise HTTPException(status_code=500, detail="Could not save product image") from exc
        if storage_attempted and exc.status_code == 502:
            run(compensate_upload, path)
        raise
    except Exception as exc:
        rollback_safely(db)
        if commit_attempted:
            if reconcile_commit(product_id, result, path):
                return result
        elif storage_attempted:
            run(compensate_upload, path)
        logger.exception("PRODUCT-02 image upload failed for product_id=%s", product_id)
        raise HTTPException(status_code=500, detail="Could not save product image") from exc
    finally:
        run(file.close)
