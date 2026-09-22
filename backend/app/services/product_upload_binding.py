"""Atomically attach pending image references within a product transaction."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.product_upload import ProductUpload


MAX_PRODUCT_IMAGES = 10


def bind_pending_uploads(
    db: Session,
    *,
    seller_id: int,
    product_id: int,
    upload_ids: list[int],
) -> list[ProductImage]:
    """Bind a new product's 1–10 uploads; caller commits or rolls back all rows."""
    if not 1 <= len(upload_ids) <= MAX_PRODUCT_IMAGES:
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_COUNT"})
    if any(type(upload_id) is not int or upload_id <= 0 for upload_id in upload_ids):
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
    if len(set(upload_ids)) != len(upload_ids):
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})

    product = db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if product is None or product.deleted_at is not None or product.user_id != seller_id:
        raise HTTPException(status_code=404, detail={"code": "PRODUCT_NOT_FOUND"})
    if product.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail={"code": "PRODUCT_NOT_EDITABLE"})
    if db.scalar(
        select(func.count(ProductImage.image_id)).where(ProductImage.product_id == product_id)
    ):
        raise HTTPException(status_code=409, detail={"code": "IMAGE_ALREADY_ATTACHED"})

    uploads = db.scalars(
        select(ProductUpload)
        .where(ProductUpload.id.in_(upload_ids))
        .order_by(ProductUpload.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    by_id = {upload.id: upload for upload in uploads}
    if len(by_id) != len(upload_ids):
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
    now = datetime.now(timezone.utc)
    for upload_id in upload_ids:
        upload = by_id[upload_id]
        if upload.user_id != seller_id:
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
        if upload.state == "ATTACHED" or upload.attached_product_id is not None:
            raise HTTPException(status_code=409, detail={"code": "IMAGE_ALREADY_ATTACHED"})
        if upload.state != "PENDING":
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
        expiry = upload.expires_at
        if expiry is None:
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry <= now:
            raise HTTPException(status_code=409, detail={"code": "UPLOAD_EXPIRED"})

    images = []
    for order, upload_id in enumerate(upload_ids):
        upload = by_id[upload_id]
        upload.state = "ATTACHED"
        upload.attached_product_id = product_id
        image = ProductImage(
            product_id=product_id,
            image_id=upload.id,
            upload_id=upload.id,
            image_url=upload.object_key,
            file_size=upload.file_size,
            uploaded_at=upload.uploaded_at,
            photo_type="MAIN" if order == 0 else "GALLERY",
            sort_order=order,
        )
        db.add(image)
        images.append(image)
    db.flush()
    return images
