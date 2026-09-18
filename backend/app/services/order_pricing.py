"""กติกาเงินและสถานะของงานสั่งซื้อ (ORDER-00) รวมไว้ที่เดียว

ทุกจำนวนเงินเป็น Decimal ห้ามผ่าน float ไม่ว่าขั้นตอนใด
"""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

CURRENCY = "THB"
CENT = Decimal("0.01")

SHIPPING_FEE = Decimal("50.00")
INSPECTION_FEE = Decimal("100.00")
COMMISSION_RATE = Decimal("0.05")

# สถานะสินค้าที่งานสั่งซื้อใช้ (PRODUCT ยังไม่มีค่าที่ตกลงกัน ดู Decision Log D-01)
PRODUCT_AVAILABLE = "AVAILABLE"
PRODUCT_RESERVED = "RESERVED"

ORDER_WAITING_PAYMENT = "WAITING_PAYMENT"
ORDER_WAITING_SELLER_SHIP = "WAITING_SELLER_SHIP"

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
