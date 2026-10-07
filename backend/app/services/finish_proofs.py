"""Readability checks against existing private Courier proof metadata.

Use the existing inspection_storage.download_object adapter. The caller must
authorize access and load selected rows under the current Shipment lock. This
module owns no table, Storage bucket, upload pipeline or delivery transition.
"""

import hashlib
import warnings
from io import BytesIO
from typing import Callable, Protocol, Sequence

from PIL import Image, UnidentifiedImageError

from app.services.finish_policy import FinishPolicyError


class ProofMetadata(Protocol):
    id: int
    shipment_id: int
    uploaded_by: int
    object_key: str
    mime_type: str
    size_bytes: int
    sha256: str


def verify_selected_proofs(*, shipment_id: int, courier_id: int,
                           selected_ids: Sequence[int], rows: Sequence[ProofMetadata],
                           download: Callable[[str], bytes]) -> tuple[int, ...]:
    if (not 1 <= len(selected_ids) <= 3 or len(set(selected_ids)) != len(selected_ids)
            or any(type(value) is not int or value <= 0 for value in selected_ids)):
        raise FinishPolicyError("invalid_proof_selection")
    by_id = {row.id: row for row in rows}
    selected = tuple(sorted(selected_ids))
    for proof_id in selected:
        row = by_id.get(proof_id)
        if row is None or row.shipment_id != shipment_id or row.uploaded_by != courier_id:
            raise FinishPolicyError("proof_not_found")
        if row.mime_type not in {"image/jpeg", "image/png"} or not 1 <= row.size_bytes <= 5 * 1024 * 1024:
            raise FinishPolicyError("invalid_proof_selection")
        content = download(row.object_key)  # existing adapter bounds network I/O
        if len(content) != row.size_bytes or hashlib.sha256(content).hexdigest() != row.sha256:
            raise FinishPolicyError("storage_unavailable")
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(content)) as photo:
                    expected = "JPEG" if row.mime_type == "image/jpeg" else "PNG"
                    if (photo.format != expected or getattr(photo, "is_animated", False)
                            or getattr(photo, "n_frames", 1) != 1
                            or photo.width * photo.height > 25_000_000 or max(photo.size) > 10_000):
                        raise ValueError("Invalid stored proof")
                    photo.verify()
                with Image.open(BytesIO(content)) as photo:
                    photo.load()
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError,
                Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
            raise FinishPolicyError("storage_unavailable") from exc
    return selected
