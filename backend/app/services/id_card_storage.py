"""อัปโหลดรูปบัตรประชาชนไปเก็บใน Supabase Storage bucket แบบ private

Mobile ส่งไฟล์เข้ามาที่ backend เท่านั้น เพื่อไม่ต้องแจก key ของ storage ให้เครื่องผู้ใช้
และเก็บเฉพาะ path ของ object ลงฐานข้อมูล ไม่เก็บ URL สาธารณะ
"""

import os
import uuid
from datetime import datetime, timezone

import httpx


ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

MAX_IMAGE_BYTES = 5 * 1024 * 1024

# ลายเซ็นไบต์ต้นไฟล์ กันการส่ง content type ปลอมจากเครื่องผู้ใช้
_MAGIC_PREFIXES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}

DEFAULT_BUCKET = "seller-verifications"


class StorageNotConfiguredError(RuntimeError):
    """ยังไม่ได้ตั้งค่า Supabase Storage สำหรับเก็บรูปบัตรประชาชน"""


class StorageUploadError(RuntimeError):
    """อัปโหลดไปยัง Supabase Storage ไม่สำเร็จ"""


def content_type_matches_bytes(content_type: str, content: bytes) -> bool:
    prefixes = _MAGIC_PREFIXES.get(content_type)
    if not prefixes:
        return False
    if content_type == "image/webp":
        return content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    return any(content.startswith(prefix) for prefix in prefixes)


class SupabaseIdCardStorage:
    def __init__(
        self,
        base_url: str,
        service_key: str,
        bucket: str,
        client_factory=httpx.Client,
        timeout: float = 20.0,
    ):
        self._base_url = base_url.rstrip("/")
        self._service_key = service_key
        self._bucket = bucket
        self._client_factory = client_factory
        self._timeout = timeout

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._service_key}",
            "apikey": self._service_key,
        }

    def upload(self, user_id: int, content: bytes, content_type: str) -> str:
        extension = ALLOWED_IMAGE_TYPES[content_type]
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        path = f"{user_id}/{stamp}-{uuid.uuid4().hex}.{extension}"
        try:
            with self._client_factory(timeout=self._timeout) as client:
                response = client.post(
                    f"{self._base_url}/storage/v1/object/{self._bucket}/{path}",
                    content=content,
                    headers={
                        **self._headers(),
                        "Content-Type": content_type,
                        "x-upsert": "false",
                        "cache-control": "no-store",
                    },
                )
        except httpx.HTTPError as error:
            raise StorageUploadError("upload transport failed") from error
        if response.status_code >= 400:
            # ไม่ส่งข้อความจาก storage ต่อให้ผู้ใช้ กันข้อมูลการตั้งค่ารั่ว
            raise StorageUploadError(f"upload rejected with status {response.status_code}")
        return f"{self._bucket}/{path}"

    def remove(self, stored_path: str) -> None:
        """ลบไฟล์ที่อัปโหลดค้างไว้เมื่อบันทึกคำขอลงฐานข้อมูลไม่สำเร็จ"""
        bucket, _, path = stored_path.partition("/")
        if not path:
            return
        try:
            with self._client_factory(timeout=self._timeout) as client:
                client.delete(
                    f"{self._base_url}/storage/v1/object/{bucket}/{path}",
                    headers=self._headers(),
                )
        except httpx.HTTPError:
            # ไฟล์ค้างถูกเก็บกวาดด้วย purge_at อยู่แล้ว จึงไม่ทำให้คำขอล้มเหลวซ้ำ
            pass


def get_id_card_storage() -> SupabaseIdCardStorage:
    base_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    bucket = os.getenv("SUPABASE_VERIFICATION_BUCKET", DEFAULT_BUCKET)
    if not base_url or not service_key:
        raise StorageNotConfiguredError(
            "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing"
        )
    return SupabaseIdCardStorage(base_url=base_url, service_key=service_key, bucket=bucket)
