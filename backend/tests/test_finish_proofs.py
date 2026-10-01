"""Actual decoded bytes through deterministic private Storage; no HTTP claims."""

from dataclasses import replace
import hashlib

import pytest

from app.services.finish_policy import FinishPolicyError
from app.services.finish_proofs import verify_selected_proofs
from tests.finish_helpers import PrivateStorage, proof


def verify(storage, rows, ids):
    return verify_selected_proofs(shipment_id=17, courier_id=8, selected_ids=ids,
                                 rows=rows, download=storage.download)


@pytest.mark.parametrize("count", [1, 3])
@pytest.mark.parametrize("image_format", ["JPEG", "PNG"])
def test_one_or_three_real_readable_images(count, image_format):
    storage = PrivateStorage()
    rows = [proof(storage, proof_id=21 + offset, image_format=image_format) for offset in range(count)]
    assert verify(storage, rows, [row.id for row in reversed(rows)]) == tuple(row.id for row in rows)
    assert len(storage.reads) == count


@pytest.mark.parametrize("ids", [[], [21, 21], [21, 22, 23, 24], [True], [0]])
def test_invalid_selection_does_not_touch_storage(ids):
    storage = PrivateStorage()
    row = proof(storage)
    with pytest.raises(FinishPolicyError, match="invalid_proof_selection"):
        verify(storage, [row], ids)
    assert not storage.reads


@pytest.mark.parametrize("changes", [{"shipment_id": 18}, {"uploaded_by": 9}])
def test_foreign_shipment_and_courier_denied_before_bytes(changes):
    storage = PrivateStorage()
    row = proof(storage)
    with pytest.raises(FinishPolicyError, match="proof_not_found"):
        verify(storage, [replace(row, **changes)], [row.id])
    assert not storage.reads


def test_unselected_and_nonexistent_proof_cannot_confirm():
    storage = PrivateStorage()
    row = proof(storage)
    with pytest.raises(FinishPolicyError, match="proof_not_found"):
        verify(storage, [row], [22])


@pytest.mark.parametrize("changes", [{"size_bytes": 0}, {"size_bytes": 5242881}, {"mime_type": "image/webp"}])
def test_invalid_metadata_rejected_without_io(changes):
    storage = PrivateStorage()
    row = proof(storage)
    with pytest.raises(FinishPolicyError, match="invalid_proof_selection"):
        verify(storage, [replace(row, **changes)], [row.id])
    assert not storage.reads


def test_storage_outage_removed_object_and_recovery_remain_failures_until_readable():
    storage = PrivateStorage()
    row = proof(storage)
    original = storage.objects[row.object_key]
    storage.unavailable = True
    with pytest.raises(OSError):
        verify(storage, [row], [row.id])
    storage.unavailable = False
    del storage.objects[row.object_key]
    with pytest.raises(OSError):
        verify(storage, [row], [row.id])
    storage.objects[row.object_key] = original
    assert verify(storage, [row], [row.id]) == (row.id,)


@pytest.mark.parametrize("mutation", ["size", "hash", "mime", "undecodable"])
def test_stored_bytes_are_verified_not_just_client_mime(mutation):
    storage = PrivateStorage()
    row = proof(storage)
    if mutation == "size":
        row = replace(row, size_bytes=row.size_bytes + 1)
    elif mutation == "hash":
        row = replace(row, sha256="0" * 64)
    elif mutation == "mime":
        row = replace(row, mime_type="image/jpeg")
    else:
        content = b"These are not image bytes"
        storage.objects[row.object_key] = content
        row = replace(row, size_bytes=len(content), sha256=hashlib.sha256(content).hexdigest())
    with pytest.raises(FinishPolicyError, match="storage_unavailable"):
        verify(storage, [row], [row.id])
