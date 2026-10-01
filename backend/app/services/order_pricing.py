"""กติกาเงินและสถานะของงานสั่งซื้อ (ORDER-00) รวมไว้ที่เดียว

ทุกจำนวนเงินเป็น Decimal ห้ามผ่าน float ไม่ว่าขั้นตอนใด
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

CURRENCY = "THB"
CENT = Decimal("0.01")

SHIPPING_FEE = Decimal("50.00")
INSPECTION_FEE = Decimal("100.00")
COMMISSION_RATE = Decimal("0.05")

# สถานะสินค้าที่งานสั่งซื้อใช้ ตรงกับ ck_products_status ใน app/models/product.py (ดู D-01)
PRODUCT_AVAILABLE = "AVAILABLE"
PRODUCT_RESERVED = "RESERVED"

# รอบนี้ซื้อได้เฉพาะสินค้าราคาปกติ การประมูลอยู่นอกขอบเขต Prototype (ดู D-20)
# ปัจจุบัน ck_products_sale_type ยอมรับค่านี้ค่าเดียวอยู่แล้ว ฝั่ง Order จึงเป็นด่านที่สอง
# ที่ทำให้ระบบยังปฏิเสธการประมูลได้เอง ถ้าวันหนึ่งมีการผ่อนเงื่อนไขที่ตารางสินค้า
SALE_TYPE_FIXED_PRICE = "FIXED_PRICE"

ORDER_WAITING_PAYMENT = "WAITING_PAYMENT"
ORDER_WAITING_SELLER_SHIP = "WAITING_SELLER_SHIP"
ORDER_CANCELLED = "CANCELLED"

# Final states are installed by FINISH-01; transitions remain downstream work.
ORDER_STATUSES_RESERVED: tuple[str, ...] = ()  # FINISH states are now active schema values.

# ชุดสถานะที่อนุญาตให้ทำสิ่งนั้นได้ ระบุเป็น "ชุดของสถานะ" ไม่ใช่เงื่อนไขสองทาง
# เพราะการเพิ่มสถานะหลังการจัดส่งต้องไม่ทำให้ Order กลับมาจ่ายหรือยกเลิกได้อีก
PAYABLE_ORDER_STATUSES = frozenset({ORDER_WAITING_PAYMENT})
CANCELLABLE_ORDER_STATUSES = frozenset({ORDER_WAITING_PAYMENT})

# เหตุผลที่ Order ถูกยกเลิก เก็บแยกจากสถานะเพื่อให้หน้าจอบอกผู้ใช้ได้ว่าใครเป็นคนยกเลิก
CANCEL_REASON_BUYER = "BUYER"
CANCEL_REASON_EXPIRED = "EXPIRED"

# ผู้ซื้อมีเวลาจ่าย 30 นาทีนับจากสร้าง Order หมดแล้วสินค้าต้องกลับไปขายต่อได้ (D-05)
PAYMENT_WINDOW = timedelta(minutes=30)

ATTEMPT_SUCCEEDED = "SUCCEEDED"
ATTEMPT_FAILED = "FAILED"
ESCROW_HELD = "HELD"
PAYMENT_METHOD_SIMULATED = "SIMULATED"


@dataclass(frozen=True)
class OrderAmounts:
    item_price: Decimal
    shipping_fee: Decimal
    inspection_fee: Decimal
    commission_fee: Decimal
    total_amount: Decimal
    seller_payout: Decimal
    currency: str = CURRENCY


def to_money(value: Decimal | int | str) -> Decimal:
    if isinstance(value, float):
        raise TypeError("money must not be a float")
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def calculate_amounts(item_price: Decimal) -> OrderAmounts:
    price = to_money(item_price)
    if price < 0:
        raise ValueError("item price must not be negative")
    commission = (price * COMMISSION_RATE).quantize(CENT, rounding=ROUND_HALF_UP)
    return OrderAmounts(
        item_price=price,
        shipping_fee=SHIPPING_FEE,
        inspection_fee=INSPECTION_FEE,
        commission_fee=commission,
        total_amount=price + SHIPPING_FEE + INSPECTION_FEE,
        seller_payout=price - commission,
    )


def receipt_number(order_id: int) -> str:
    return f"RC-{order_id:06d}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime | None) -> datetime | None:
    """ฐานข้อมูลบางตัว (เช่น SQLite) คืนเวลาแบบไม่มี timezone ให้ถือว่าเป็น UTC เสมอ"""
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def payment_deadline(created_at: datetime) -> datetime:
    return created_at + PAYMENT_WINDOW
