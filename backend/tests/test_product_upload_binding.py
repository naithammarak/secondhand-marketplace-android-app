"""Pending refs are checked before any product-image binding is written."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.product_image import ProductImage
from app.services.product_upload_binding import bind_pending_uploads


class FakeDb:
    def __init__(self, uploads):
        self.product = SimpleNamespace(id=3, user_id=7, status="AVAILABLE", deleted_at=None)
        self.uploads = uploads
        self.images = []
        self.scalar_calls = 0

    def scalar(self, _statement):
        self.scalar_calls += 1
        return self.product if self.scalar_calls == 1 else 0

    def scalars(self, _statement):
        return SimpleNamespace(all=lambda: sorted(self.uploads, key=lambda row: row.id))

    def add(self, image):
        self.images.append(image)

    def flush(self):
        for image in self.images:
            image.image_id = image.upload_id


def upload(upload_id, *, user_id=7, state="PENDING", expires_at=None):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=upload_id,
        user_id=user_id,
        state=state,
        attached_product_id=None,
        object_key=f"pending/{upload_id}.png",
        file_size=200,
        uploaded_at=now,
        expires_at=expires_at or now + timedelta(hours=24),
    )


def denial(db, ids, expected_code):
    with pytest.raises(HTTPException) as error:
        bind_pending_uploads(db, seller_id=7, product_id=3, upload_ids=ids)
    assert error.value.detail == {"code": expected_code}
    assert db.images == []


def test_valid_refs_bind_in_requested_order():
    first = upload(11)
    second = upload(12)
    db = FakeDb([second, first])
    images = bind_pending_uploads(db, seller_id=7, product_id=3, upload_ids=[12, 11])
    assert [image.upload_id for image in images] == [12, 11]
    assert [image.sort_order for image in images] == [0, 1]
    assert [image.photo_type for image in images] == ["MAIN", "GALLERY"]
    assert all(isinstance(image, ProductImage) for image in images)
    assert [first.state, second.state] == ["ATTACHED", "ATTACHED"]
    assert first.attached_product_id == second.attached_product_id == 3


@pytest.mark.parametrize(
    "ids,expected_code",
    [([], "INVALID_IMAGE_COUNT"), (list(range(1, 12)), "INVALID_IMAGE_COUNT"),
     ([11, 11], "INVALID_IMAGE_REFERENCE"), ([11, 99], "INVALID_IMAGE_REFERENCE")],
)
def test_bad_counts_or_refs_cannot_create_partial_images(ids, expected_code):
    db = FakeDb([upload(11)])
    denial(db, ids, expected_code)


@pytest.mark.parametrize(
    "bad_upload,expected_code",
    [
        (upload(12, user_id=8), "INVALID_IMAGE_REFERENCE"),
        (upload(12, state="ATTACHED"), "INVALID_IMAGE_REFERENCE"),
        (upload(12, expires_at=datetime(2000, 1, 1, tzinfo=timezone.utc)), "UPLOAD_EXPIRED"),
    ],
)
def test_other_owner_used_or_expired_ref_rejects_whole_set(bad_upload, expected_code):
    db = FakeDb([upload(11), bad_upload])
    denial(db, [11, 12], expected_code)
    assert db.uploads[0].state == "PENDING"


def test_reserved_product_cannot_bind_image():
    db = FakeDb([upload(11)])
    db.product.status = "RESERVED"
    denial(db, [11], "PRODUCT_NOT_EDITABLE")
