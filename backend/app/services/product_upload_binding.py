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


def replace_product_images(
    db: Session,
    *,
    seller_id: int,
    product: Product,
    references: list[tuple[str, int]],
) -> tuple[list[ProductImage], list[str]]:
    """Replace an AVAILABLE product's full image set in the caller's transaction."""
    if not 1 <= len(references) <= MAX_PRODUCT_IMAGES:
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_COUNT"})

    existing = db.scalars(
        select(ProductImage)
        .where(ProductImage.product_id == product.id)
        .order_by(ProductImage.sort_order, ProductImage.image_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    existing_by_id = {image.image_id: image for image in existing}
    kept_ids = [value for kind, value in references if kind == "image"]
    if len(set(kept_ids)) != len(kept_ids) or any(
        image_id not in existing_by_id for image_id in kept_ids
    ):
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})

    new_upload_ids = [value for kind, value in references if kind == "upload"]
    uploads = (
        db.scalars(
            select(ProductUpload)
            .where(ProductUpload.id.in_(new_upload_ids))
            .order_by(ProductUpload.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).all()
        if new_upload_ids
        else []
    )
    uploads_by_id = {upload.id: upload for upload in uploads}
    if len(uploads_by_id) != len(new_upload_ids):
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})

    now = datetime.now(timezone.utc)
    for upload_id in new_upload_ids:
        upload = uploads_by_id[upload_id]
        expiry = upload.expires_at
        if expiry is None:
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if upload.user_id != seller_id:
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
        if upload.state == "ATTACHED" or upload.attached_product_id is not None:
            raise HTTPException(status_code=409, detail={"code": "IMAGE_ALREADY_ATTACHED"})
        if upload.state != "PENDING":
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
        if expiry <= now:
            raise HTTPException(status_code=409, detail={"code": "UPLOAD_EXPIRED"})

    removed = [image for image in existing if image.image_id not in set(kept_ids)]
    removed_upload_ids = [image.upload_id for image in removed if image.upload_id is not None]
    removed_uploads = (
        db.scalars(
            select(ProductUpload)
            .where(ProductUpload.id.in_(removed_upload_ids))
            .with_for_update()
            .execution_options(populate_existing=True)
        ).all()
        if removed_upload_ids
        else []
    )
    removed_uploads_by_id = {upload.id: upload for upload in removed_uploads}
    if len(removed_uploads_by_id) != len(removed_upload_ids):
        raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})

    detached_paths = []
    for image in removed:
        if image.upload_id is None:
            # Legacy URLs have no upload registry entry. Keep their Storage
            # objects for the separate audited migration/cleanup process.
            db.delete(image)
            continue
        upload = removed_uploads_by_id.get(image.upload_id)
        if (
            upload is None
            or upload.user_id != seller_id
            or upload.state != "ATTACHED"
            or upload.attached_product_id != product.id
        ):
            raise HTTPException(status_code=422, detail={"code": "INVALID_IMAGE_REFERENCE"})
        upload.state = "DETACHED"
        upload.attached_product_id = None
        detached_paths.append(upload.object_key)
        db.delete(image)

    # Delete kept images before re-inserting with new sort_order/photo_type to avoid
    # violating partial unique index or the NOT NULL constraint on sort_order.
    for image in existing:
        if image.image_id in set(kept_ids):
            db.delete(image)
    db.flush()

    final_images = []
    for order, (kind, reference_id) in enumerate(references):
        if kind == "image":
            old_image = existing_by_id[reference_id]
            image = ProductImage(
                product_id=product.id,
                image_id=old_image.image_id,
                upload_id=old_image.upload_id,
                image_url=old_image.image_url,
                file_size=old_image.file_size,
                uploaded_at=old_image.uploaded_at,
                sort_order=order,
                photo_type="MAIN" if order == 0 else "GALLERY",
            )
            db.add(image)
        else:
            upload = uploads_by_id[reference_id]
            upload.state = "ATTACHED"
            upload.attached_product_id = product.id
            image = ProductImage(
                product_id=product.id,
                image_id=upload.id,
                upload_id=upload.id,
                image_url=upload.object_key,
                file_size=upload.file_size,
                uploaded_at=upload.uploaded_at,
                sort_order=order,
                photo_type="MAIN" if order == 0 else "GALLERY",
            )
            db.add(image)
        final_images.append(image)

    db.flush()
    return final_images, detached_paths
