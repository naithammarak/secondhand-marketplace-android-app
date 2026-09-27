"""รูปแบบข้อมูลของมุมมอง Order สำหรับผู้ดูแลระบบ (ORDER-09)

กติกา: ทุกฟิลด์ในไฟล์นี้เป็นค่าที่ปิดบังแล้ว ยกเว้น `AdminOrderContact` ซึ่งเป็น Response
ของ Endpoint เปิดดูข้อมูลเต็มที่ต้องมีเหตุผลและถูกบันทึกลง Audit Log ทุกครั้ง
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.schemas.order import (
    CancelReason,
    OrderStatus,
    PaymentStatus,
    ProductSnapshot,
    ShippingAddress,
)


class AdminParty(BaseModel):
    """คู่กรณีของ Order เท่าที่ผู้ดูแลต้องใช้ติดตามเรื่อง"""

    id: int
    name: str
    email_masked: str


class AdminMaskedAddress(BaseModel):
    """ที่อยู่แบบปิดบัง: พอให้ประเมินค่าส่งและเขตพื้นที่ ไม่พอให้ไปถึงหน้าบ้านใคร"""

    province: str
    postal_code: str
    phone_masked: str


class AdminOrderAmounts(BaseModel):
    currency: str
    item_price: Decimal
    shipping_fee: Decimal
    inspection_fee: Decimal
    total_amount: Decimal
    commission_fee: Decimal
    seller_payout: Decimal


class AdminOrderListItem(BaseModel):
    id: int
    status: OrderStatus
    payment_status: PaymentStatus
    product: ProductSnapshot
    buyer: AdminParty
    seller: AdminParty
    currency: str
    total_amount: Decimal
    expires_at: datetime | None
    cancel_reason: CancelReason | None
    created_at: datetime | None
    paid_at: datetime | None


class AdminOrderPage(BaseModel):
    items: list[AdminOrderListItem]
    total: int
    limit: int
    offset: int


class AdminOrderDetail(BaseModel):
    id: int
    status: OrderStatus
    payment_status: PaymentStatus
    product: ProductSnapshot
    buyer: AdminParty
    seller: AdminParty
    amounts: AdminOrderAmounts
    shipping_address_masked: AdminMaskedAddress
    receipt_no: str | None
    paid_at: datetime | None
    expires_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: CancelReason | None
    created_at: datetime | None
    updated_at: datetime | None
    # บอกหน้าจอว่ามีทางขอดูข้อมูลเต็มอยู่ ถ้า Endpoint ถูกปิดค่านี้เป็น false และปุ่มต้องหายไป
    contact_reveal_available: bool


class AdminRevealRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = None


class AdminOrderContact(BaseModel):
    """ข้อมูลเต็มที่เปิดดูได้ครั้งละหนึ่งคำขอ พร้อมเลขอ้างอิงของ Audit Log ที่บันทึกไว้"""

    order_id: int
    buyer_email: str
    shipping_address: ShippingAddress
    reason: str
    revealed_at: datetime
    audit_log_id: int
