"""ปิดบังข้อมูลส่วนบุคคลก่อนส่งออกจาก API (ORDER-09)

หลักการเดียวของไฟล์นี้: ค่าที่ปิดบังแล้วต้องไม่บอกความยาวของค่าจริง
จึงใช้จำนวนดอกจันคงที่เสมอ ไม่ว่าค่าจริงจะสั้นหรือยาว
"""

MASK = "***"


def mask_email(email: str | None) -> str:
    """`somebody@gmail.com` -> `s***@gmail.com`

    ค่าที่ไม่ใช่อีเมล (ไม่มี `@` หรือว่าง) ถูกปิดบังทั้งค่า ไม่คืนค่าดิบออกไปเด็ดขาด
    """
    value = (email or "").strip()
    local, separator, domain = value.partition("@")
    if not separator or not local or not domain:
        return MASK
    return f"{local[0]}{MASK}@{domain}"


def mask_phone(phone: str | None) -> str:
    """`0812345678` -> `***5678` เก็บเลขท้าย 4 ตัวพอให้ยืนยันตัวตนทางโทรศัพท์ได้"""
    digits = "".join(character for character in (phone or "") if character.isdigit())
    if len(digits) < 4:
        return MASK
    return f"{MASK}{digits[-4:]}"
