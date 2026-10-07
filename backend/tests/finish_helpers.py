"""Deterministic private Storage fault adapter for future isolated FINISH tests."""

from dataclasses import dataclass
import hashlib
from io import BytesIO

from PIL import Image


@dataclass(frozen=True)
class Proof:
    id: int
    shipment_id: int
    uploaded_by: int
    object_key: str
    mime_type: str
    size_bytes: int
    sha256: str


class PrivateStorage:
    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.unavailable = False
        self.reads: list[str] = []

    def download(self, key: str) -> bytes:
        self.reads.append(key)
        if self.unavailable or key not in self.objects:
            raise OSError("Deterministic private storage outage")
        return self.objects[key]


def proof(storage: PrivateStorage, *, proof_id=21, shipment_id=17, courier_id=8, image_format="PNG") -> Proof:
    output = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(output, format=image_format)
    content = output.getvalue()
    key = f"synthetic/{shipment_id}/{proof_id}"
    storage.objects[key] = content
    mime = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}[image_format]
    return Proof(proof_id, shipment_id, courier_id, key, mime, len(content), hashlib.sha256(content).hexdigest())
