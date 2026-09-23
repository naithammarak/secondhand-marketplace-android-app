"""รูปแบบข้อมูลของ API สั่งซื้อและจ่ายเงินจำลอง ตาม doc/orders/contract.md

เงินทุกช่องเป็น Decimal และออกไปเป็น string ใน JSON
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict


class OrderStatus(str, Enum):
    WAITING_PAYMENT = "WAITING_PAYMENT"
    WAITING_SELLER_SHIP = "WAITING_SELLER_SHIP"
    CANCELLED = "CANCELLED"


class CancelReason(str, Enum):
    BUYER = "BUYER"
    EXPIRED = "EXPIRED"


class PaymentStatus(str, Enum):
    UNPAID = "UNPAID"
    PAID = "PAID"


class ViewerRole(str, Enum):
    BUYER = "buyer"
    SELLER = "seller"


class SimulatedOutcome(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class ShippingAddressInput(BaseModel):
    """ค่าดิบจากผู้ใช้ ตรวจละเอียดใน service เพื่อส่งข้อความรายช่องเป็นภาษาไทย"""

    model_config = ConfigDict(extra="forbid")

    recipient_name: str | None = None
    phone: str | None = None
    address_line: str | None = None
    subdistrict: str | None = None
    district: str | None = None
    province: str | None = None
    postal_code: str | None = None


class CreateOrderRequest(BaseModel):
    # ไม่รับ buyer_id / seller_id / ยอดเงิน จาก Client เด็ดขาด
    model_config = ConfigDict(extra="forbid")

    product_id: int | None = None
    shipping_address: ShippingAddressInput | None = None


class SimulatePaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome: SimulatedOutcome


class ShippingAddress(BaseModel):
    recipient_name: str
    phone: str
    address_line: str
    subdistrict: str
    district: str
    province: str
    postal_code: str


class ProductSnapshot(BaseModel):
    id: int
    name: str
    condition: str
    size: str


class OrderAmountsView(BaseModel):
    currency: str
    item_price: Decimal
    shipping_fee: Decimal | None
    inspection_fee: Decimal | None
    total_amount: Decimal | None
    commission_fee: Decimal | None
    seller_payout: Decimal | None


class PaymentAttemptView(BaseModel):
    id: int
    outcome: Literal["SUCCEEDED", "FAILED"]
    amount: Decimal
    created_at: datetime | None


class OrderDetail(BaseModel):
    id: int
    status: OrderStatus
    payment_status: PaymentStatus
    viewer_role: ViewerRole
    product: ProductSnapshot
    amounts: OrderAmountsView
    shipping_address: ShippingAddress | None
    last_payment_attempt: PaymentAttemptView | None
    paid_at: datetime | None
    receipt_no: str | None
    can_pay: bool
    can_cancel: bool
    # เส้นตายการจ่ายเงินจาก server หน้าจอนับถอยหลังตามค่านี้ ห้ามคำนวณเส้นตายเอง
    expires_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: CancelReason | None
    created_at: datetime | None
    updated_at: datetime | None


class OrderListItem(BaseModel):
    id: int
    status: OrderStatus
    payment_status: PaymentStatus
    viewer_role: ViewerRole
    product: ProductSnapshot
    total_amount: Decimal | None
    seller_payout: Decimal | None
    currency: str
    expires_at: datetime | None
    cancel_reason: CancelReason | None
    created_at: datetime | None
    paid_at: datetime | None


class OrderPage(BaseModel):
    items: list[OrderListItem]
    total: int
    limit: int
    offset: int


class SimulatePaymentResponse(BaseModel):
    attempt: PaymentAttemptView
    order: OrderDetail


class ReceiptView(BaseModel):
    receipt_no: str
    order_id: int
    issued_at: datetime | None
    payment_method: str
    currency: str
    product_name: str
    item_price: Decimal
    shipping_fee: Decimal
    inspection_fee: Decimal
    total_amount: Decimal


class CheckoutQuote(BaseModel):
    """ยอดที่ Server คำนวณให้ก่อนสร้าง Order ใช้แสดงในหน้า Checkout เท่านั้น"""

    product: ProductSnapshot
    currency: str
    item_price: Decimal
    shipping_fee: Decimal
    inspection_fee: Decimal
    total_amount: Decimal
