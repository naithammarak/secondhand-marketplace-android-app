"""PRODUCT-02 preview: validate an image without persisting it."""

from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile

from app.api.auth import get_current_user
from app.models.user import User, UserRole, UserStatus


router = APIRouter(tags=["Product images"])

# PRODUCT-02: กติกาไฟล์ชั่วคราว รอทีมยืนยันชนิดและขนาดรูป
# Temporary policy until the team confirms PRODUCT-01 and image storage details.
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGES = {
    "image/jpeg": ((".jpg", ".jpeg"), lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": ((".png",), lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/webp": (
        (".webp",),
        lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    ),
}


# PRODUCT-02: รับรูปเพื่อตรวจสอบเท่านั้น ยังไม่ส่งไปที่เก็บรูปจริง
@router.post(
    "/products/{product_id}/images/preview",
    summary="Validate a product image without saving it",
)
async def preview_product_image(
    product_id: int = Path(gt=0),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Check one file for an active seller; PRODUCT-01 lookup comes later."""
    try:
        # ตรวจสิทธิ์: เฉพาะผู้ขายที่สถานะยังใช้งานได้
        if current_user.role != UserRole.SELLER or current_user.status != UserStatus.ACTIVE:
            raise HTTPException(status_code=403, detail="Only active sellers can upload product images")

        # ตรวจชนิดไฟล์ นามสกุล ขนาด และข้อมูลจริงในไฟล์
        content_type = (file.content_type or "").lower().strip()
        rule = ALLOWED_IMAGES.get(content_type)
        if rule is None:
            raise HTTPException(status_code=415, detail="Allowed types: JPEG, PNG, WebP")

        extensions, has_signature = rule
        filename = (file.filename or "").lower()
        if not filename.endswith(extensions):
            raise HTTPException(status_code=415, detail="File extension does not match image type")

        content = await file.read(MAX_IMAGE_BYTES + 1)
        if not content:
            raise HTTPException(status_code=400, detail="Image is empty")
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Image exceeds the provisional 5 MiB limit")
        if not has_signature(content):
            raise HTTPException(status_code=415, detail="File content does not match image type")

        # ส่งผลตรวจกลับเท่านั้น โดยไม่มีการบันทึกรูปหรือฐานข้อมูล
        return {
            "product_id": product_id,
            "content_type": content_type,
            "size_bytes": len(content),
            "stored": False,
            "status": "validated_only",
        }
    finally:
        await file.close()
