"""บันทึกการเข้าถึงข้อมูลส่วนบุคคลโดยผู้ดูแลระบบ (NFR-04)

ตารางนี้เป็นหลักฐานว่าใครเปิดดูข้อมูลอะไร เมื่อไร และด้วยเหตุผลอะไร
ออกแบบให้ใช้ได้กับทุกงานที่ต้องบันทึกการเข้าถึง ไม่ผูกกับงานสั่งซื้ออย่างเดียว
(เช่น สำเนาบัตรประชาชนของผู้ขาย และประวัติแชทเมื่อมีข้อพิพาท จะมาใช้ตารางเดียวกันนี้)

แถวในตารางนี้เป็น append-only ไม่มีเส้นทางใดในระบบที่แก้หรือลบแถวเดิม
"""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# ชนิดของการเข้าถึงที่บันทึกได้ เพิ่มค่าใหม่ต้องมาพร้อม migration ที่แก้ CHECK
ADMIN_ACCESS_ACTIONS = ("ORDER_CONTACT_REVEAL",)

# ชนิดของเป้าหมาย ใช้คู่กับ target_id เพราะข้ามหลายตาราง จึงไม่ผูก foreign key
ADMIN_ACCESS_TARGETS = ("ORDER",)

MAX_REASON_LENGTH = 500


class AdminAccessLog(Base):
    __tablename__ = "admin_access_logs"
    __table_args__ = (
        CheckConstraint(
            "action IN (" + ", ".join(repr(value) for value in ADMIN_ACCESS_ACTIONS) + ")",
            name="ck_admin_access_logs_action",
        ),
        CheckConstraint(
            "target_type IN (" + ", ".join(repr(value) for value in ADMIN_ACCESS_TARGETS) + ")",
            name="ck_admin_access_logs_target_type",
        ),
        # เหตุผลว่างไม่นับเป็นเหตุผล บังคับที่ฐานข้อมูลด้วยไม่ใช่แค่ใน API
        CheckConstraint("length(trim(reason)) >= 10", name="ck_admin_access_logs_reason"),
        Index("ix_admin_access_logs_target", "target_type", "target_id", "created_at"),
        Index("ix_admin_access_logs_admin", "admin_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(MAX_REASON_LENGTH), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
