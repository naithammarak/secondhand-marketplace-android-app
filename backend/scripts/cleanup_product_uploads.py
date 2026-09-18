"""Manually audit or remove expired, detached, and orphan product uploads.

Run from backend: python -m scripts.cleanup_product_uploads [--apply]
Default is read-only. This command never removes an attached product image.
"""

import argparse
import asyncio
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_, select, text

from app.database import SessionLocal
from app.models.product_image import ProductImage
from app.models.product_upload import ProductUpload
from app.api.product_images import delete_object


ORPHAN_AGE = timedelta(hours=24)
SAFE_PENDING_KEY = r"^pending/[0-9a-f]{32}\.(jpg|png)$"


def referenced(db, record: ProductUpload) -> bool:
    return db.scalar(
        select(ProductImage.image_id).where(
            or_(
                ProductImage.upload_id == record.id,
                ProductImage.image_url == record.object_key,
            )
        ).limit(1)
    ) is not None


def candidates(db, now: datetime, limit: int):
    registry = db.scalars(
        select(ProductUpload)
        .where(
            or_(
                (ProductUpload.state == "PENDING") & (ProductUpload.expires_at <= now),
                ProductUpload.state == "DETACHED",
            )
        )
        .order_by(ProductUpload.id)
        .limit(limit)
    ).all()
    orphans = db.execute(
        text(
            """
            SELECT o.name FROM storage.objects AS o
            WHERE o.bucket_id = 'product-images'
              AND o.created_at < :cutoff
              AND o.name ~ :safe_key
              AND NOT EXISTS (
                  SELECT 1 FROM product_uploads AS u WHERE u.object_key = o.name
              )
              AND NOT EXISTS (
                  SELECT 1 FROM product_images AS i WHERE i.image_url = o.name
              )
            ORDER BY o.created_at, o.name
            LIMIT :limit
            """
        ),
        {"cutoff": now - ORPHAN_AGE, "safe_key": SAFE_PENDING_KEY, "limit": limit},
    ).scalars().all()
    return [row.id for row in registry if not referenced(db, row)], orphans


def remove_registry_upload(record_id: int, now: datetime) -> bool:
    with SessionLocal() as db:
        record = db.scalar(
            select(ProductUpload)
            .where(ProductUpload.id == record_id)
            .with_for_update(skip_locked=True)
        )
        if record is None or referenced(db, record):
            return False
        if re.fullmatch(SAFE_PENDING_KEY, record.object_key) is None:
            return False
        if not (
            record.state == "DETACHED"
            or record.state == "PENDING" and record.expires_at <= now
        ):
            return False
        asyncio.run(delete_object(record.object_key))
        db.delete(record)
        db.commit()
        return True


def remove_orphan(path: str, now: datetime) -> bool:
    with SessionLocal() as db:
        still_orphan = db.execute(
            text(
                """
                SELECT 1 FROM storage.objects AS o
                WHERE o.bucket_id = 'product-images'
                  AND o.name = :path
                  AND o.created_at < :cutoff
                  AND o.name ~ :safe_key
                  AND NOT EXISTS (
                      SELECT 1 FROM product_uploads AS u WHERE u.object_key = o.name
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM product_images AS i WHERE i.image_url = o.name
                  )
                """
            ),
            {"path": path, "cutoff": now - ORPHAN_AGE, "safe_key": SAFE_PENDING_KEY},
        ).first()
        if still_orphan is None:
            return False
        asyncio.run(delete_object(path))
        return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="remove verified candidates")
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 1000:
        parser.error("--limit must be between 1 and 1000")
    if SessionLocal is None:
        parser.error("DATABASE_URL is not configured")

    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        registry_ids, orphan_paths = candidates(db, now, args.limit)
    print(f"expired_or_detached={len(registry_ids)} orphan_objects={len(orphan_paths)}")
    if not args.apply:
        print("dry-run: no changes made")
        return

    removed = failed = 0
    for record_id in registry_ids:
        try:
            removed += bool(remove_registry_upload(record_id, now))
        except Exception:
            failed += 1
    for path in orphan_paths:
        try:
            removed += bool(remove_orphan(path, now))
        except Exception:
            failed += 1
    print(f"removed={removed} failed={failed}")


if __name__ == "__main__":
    main()
