"""Private inspection images; never expose object keys to API clients."""

import hashlib
import logging
import os
import warnings
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.api.product_images import storage_headers


logger = logging.getLogger(__name__)
BUCKET = "inspection-evidence"
MAX_BYTES = 5 * 1024 * 1024
FORMATS = {"image/jpeg": ("JPEG", ".jpg"), "image/png": ("PNG", ".png"), "image/webp": ("WEBP", ".webp")}


def validate_image(file: UploadFile) -> tuple[bytes, str, str, str]:
    mime = (file.content_type or "").strip().lower()
    rule = FORMATS.get(mime)
    if rule is None:
        raise HTTPException(status_code=415, detail={"code": "unsupported_media_type", "message": "JPEG, PNG or WebP required"})
    content = file.file.read(MAX_BYTES + 1)
    if not content or len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail={"code": "file_too_large", "message": "Image must be 1–5 MiB"})
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                if image.format != rule[0] or getattr(image, "is_animated", False) or getattr(image, "n_frames", 1) > 1:
                    raise ValueError("Wrong image format or animated image")
                if image.width * image.height > 25_000_000 or max(image.size) > 10_000:
                    raise ValueError("Image dimensions exceed limit")
                image.verify()
            with Image.open(BytesIO(content)) as image:
                image.load()
                clean = ImageOps.exif_transpose(image)
                if rule[0] == "JPEG":
                    clean = clean.convert("RGB")
                output = BytesIO()
                clean.save(output, format=rule[0])
                content = output.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=415, detail={"code": "unsupported_media_type", "message": "Unreadable or mismatched image"}) from exc
    if not content or len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail={"code": "file_too_large", "message": "Image exceeds 5 MiB"})
    return content, mime, rule[1], hashlib.sha256(content).hexdigest()


def _config() -> tuple[str, dict[str, str]]:
    base = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        raise HTTPException(status_code=503, detail={"code": "storage_unavailable", "message": "Private storage is unavailable"})
    return base, storage_headers(key)


def _local_path(path: str) -> Path | None:
    """Optional private local storage for development and isolated integration tests."""
    root_value = os.getenv("INSPECT_PRIVATE_STORAGE_DIR")
    if not root_value:
        return None
    root = Path(root_value).resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Invalid private object path")
    return target


def upload_object(path: str, content: bytes, mime: str) -> None:
    local = _local_path(path)
    if local is not None:
        local.parent.mkdir(parents=True, exist_ok=True)
        with local.open("xb") as output:
            output.write(content)
        return
    base, headers = _config()
    try:
        with httpx.Client(timeout=20) as client:
            result = client.post(
                f"{base}/storage/v1/object/{BUCKET}/{quote(path, safe='/')}",
                content=content, headers={**headers, "Content-Type": mime, "x-upsert": "false"},
            )
            result.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail={"code": "storage_unavailable", "message": "Private upload failed"}) from exc


def download_object(path: str) -> bytes:
    local = _local_path(path)
    if local is not None:
        try:
            return local.read_bytes()
        except OSError as exc:
            raise HTTPException(status_code=503, detail={"code": "storage_unavailable", "message": "Private image is unavailable"}) from exc
    base, headers = _config()
    try:
        with httpx.Client(timeout=20) as client:
            result = client.get(f"{base}/storage/v1/object/{BUCKET}/{quote(path, safe='/')}", headers=headers)
            result.raise_for_status()
            return result.content
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail={"code": "storage_unavailable", "message": "Private image is unavailable"}) from exc


def cleanup_object(path: str) -> None:
    try:
        local = _local_path(path)
        if local is not None:
            local.unlink(missing_ok=True)
            return
        base, headers = _config()
        with httpx.Client(timeout=10) as client:
            result = client.request("DELETE", f"{base}/storage/v1/object/{BUCKET}", json={"prefixes": [path]}, headers=headers)
            result.raise_for_status()
    except Exception:
        logger.exception("INSPECT orphan storage object requires cleanup: %s", path)
