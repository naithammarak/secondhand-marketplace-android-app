"""สั่งซื้อ จองสินค้า และจ่ายเงินจำลอง (ORDER-02, ORDER-03, ORDER-07)

กติกาที่ต้องไม่หลุด
- ผู้ซื้อ/ผู้ขายมาจาก token เสมอ ยอดเงินคำนวณที่ server จาก snapshot ใน Order
- การจองสินค้าใช้ conditional update (AVAILABLE -> RESERVED) คู่กับ unique index ของ orders
- การจ่ายเงินล็อกแถว Order ก่อนตรวจสถานะ และ unique constraint กันเงินซ้ำอีกชั้น
"""

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.order import Escrow, Order, Payment, PaymentAttempt, Receipt
from app.models.product import Product
from app.models.user import User, UserRole, UserStatus
from app.schemas.order import (
    CheckoutQuote,
    CreateOrderRequest,
    OrderAmountsView,
    OrderDetail,
    OrderListItem,
    OrderPage,
    OrderStatus,
    PaymentAttemptView,
    PaymentStatus,
    ProductSnapshot,
    ReceiptView,
    ShippingAddress,
    ShippingAddressInput,
    SimulatedOutcome,
    SimulatePaymentRequest,
    SimulatePaymentResponse,
    ViewerRole,
)
from app.services.order_pricing import (
    ATTEMPT_FAILED,
    ATTEMPT_SUCCEEDED,
    CURRENCY,
    ESCROW_HELD,
    ORDER_WAITING_PAYMENT,
    ORDER_WAITING_SELLER_SHIP,
    PAYMENT_METHOD_SIMULATED,
    PRODUCT_AVAILABLE,
    PRODUCT_RESERVED,
    calculate_amounts,
    receipt_number,
)

router = APIRouter(prefix="/orders", tags=["Orders"])

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,100}$")
PHONE_PATTERN = re.compile(r"^0\d{8,9}$")
POSTAL_CODE_PATTERN = re.compile(r"^\d{5}$")
REPLAY_HEADER = "Idempotent-Replayed"

# (ชื่อช่อง, ชื่อที่แสดง, ความยาวต่ำสุด, ความยาวสูงสุด)
ADDRESS_TEXT_FIELDS = (
    ("recipient_name", "ชื่อผู้รับ", 2, 100),
    ("address_line", "ที่อยู่", 5, 255),
    ("subdistrict", "ตำบล/แขวง", 2, 100),
    ("district", "อำเภอ/เขต", 2, 100),
    ("province", "จังหวัด", 2, 100),
)


# ---------------------------------------------------------------- errors


def api_error(status_code: int, code: str, message: str, **extra) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "message": message, **extra})


def validation_error(fields: dict[str, str]) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": "validation_error", "fields": fields},
    )


def order_not_found() -> HTTPException:
    return api_error(status.HTTP_404_NOT_FOUND, "order_not_found", "ไม่พบคำสั่งซื้อ")


def not_order_buyer() -> HTTPException:
    return api_error(
        status.HTTP_403_FORBIDDEN, "not_order_buyer", "เฉพาะผู้ซื้อของคำสั่งซื้อนี้เท่านั้น"
    )


def already_paid() -> HTTPException:
    return api_error(status.HTTP_409_CONFLICT, "order_already_paid", "คำสั่งซื้อนี้ชำระเงินแล้ว")


def key_reused() -> HTTPException:
    return api_error(
        status.HTTP_409_CONFLICT,
        "idempotency_key_reused",
        "Idempotency-Key นี้ถูกใช้กับคำขออื่นแล้ว",
    )


# ---------------------------------------------------------------- dependencies


def require_idempotency_key(
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> str:
    key = (idempotency_key or "").strip()
    if not IDEMPOTENCY_KEY_PATTERN.fullmatch(key):
        raise validation_error(
            {"Idempotency-Key": "ต้องส่ง Idempotency-Key 8-100 ตัว (A-Z, a-z, 0-9, -, _)"}
        )
    return key


def require_buyer(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.BUYER:
        raise api_error(
            status.HTTP_403_FORBIDDEN, "buyer_role_required", "เฉพาะบัญชีผู้ซื้อเท่านั้นที่สั่งซื้อได้"
        )
    ensure_active(current_user)
    return current_user


def ensure_active(user: User) -> None:
    if user.status != UserStatus.ACTIVE:
        raise api_error(status.HTTP_403_FORBIDDEN, "account_inactive", "บัญชีนี้ถูกระงับการใช้งาน")


def payment_simulation_enabled() -> bool:
    """ปิดเป็นค่าเริ่มต้น เปิดได้เฉพาะเมื่อตั้งค่าชัดเจนและไม่ใช่ production"""
    app_env = os.getenv("APP_ENV", "").strip().lower()
    if app_env in {"production", "prod"}:
        return False
    return os.getenv("PAYMENT_SIMULATION_ENABLED", "").strip().lower() in {"1", "true", "yes"}


def require_payment_simulation() -> None:
    if not payment_simulation_enabled():
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "payment_simulation_disabled",
            "ระบบจ่ายเงินจำลองปิดอยู่ในสภาพแวดล้อมนี้",
        )


# ---------------------------------------------------------------- helpers


def request_fingerprint(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def clean_address(raw: ShippingAddressInput | None) -> tuple[ShippingAddress | None, dict[str, str]]:
    raw = raw or ShippingAddressInput()
    fields: dict[str, str] = {}
    values: dict[str, str] = {}

    for name, label, minimum, maximum in ADDRESS_TEXT_FIELDS:
        text = " ".join((getattr(raw, name) or "").split())
        if not text:
            fields[name] = f"กรุณากรอก{label}"
        elif len(text) < minimum:
            fields[name] = f"{label}สั้นเกินไป"
        elif len(text) > maximum:
            fields[name] = f"{label}ยาวเกิน {maximum} ตัวอักษร"
        values[name] = text

    phone = re.sub(r"[\s-]", "", raw.phone or "")
    if not phone:
        fields["phone"] = "กรุณากรอกเบอร์โทรศัพท์"
    elif not PHONE_PATTERN.fullmatch(phone):
        fields["phone"] = "เบอร์โทรศัพท์ต้องเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0"
    values["phone"] = phone

    postal_code = (raw.postal_code or "").strip()
    if not postal_code:
        fields["postal_code"] = "กรุณากรอกรหัสไปรษณีย์"
    elif not POSTAL_CODE_PATTERN.fullmatch(postal_code):
        fields["postal_code"] = "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก"
    values["postal_code"] = postal_code

    if fields:
        return None, fields
    return ShippingAddress(**values), {}


def viewer_role_for(order: Order, user: User) -> ViewerRole | None:
    if order.buyer_id == user.id:
        return ViewerRole.BUYER
    if order.seller_id == user.id:
        return ViewerRole.SELLER
    return None


def load_order_for(db: Session, order_id: int, user: User, lock: bool = False) -> tuple[Order, ViewerRole]:
    query = select(Order).where(Order.id == order_id)
    if lock:
        # ล็อกแถว Order ไว้จนจบ transaction ให้คำขอจ่ายเงินของ Order เดียวกันเข้าแถวทีละคำขอ
        query = query.with_for_update()
    order = db.scalars(query).first()
    role = viewer_role_for(order, user) if order is not None else None
    if order is None or role is None:
        # ไม่บอกว่าเป็นเพราะไม่มีหรือไม่มีสิทธิ์ กันการเดา ID
        raise order_not_found()
    return order, role


def is_paid(order: Order) -> bool:
    return order.status != ORDER_WAITING_PAYMENT


def attempt_view(attempt: PaymentAttempt) -> PaymentAttemptView:
    return PaymentAttemptView(
        id=attempt.id, outcome=attempt.outcome, amount=attempt.amount, created_at=attempt.created_at
    )


def product_snapshot(order: Order) -> ProductSnapshot:
    return ProductSnapshot(
        id=order.product_id,
        name=order.product_name,
        condition=order.product_condition,
        size=order.product_size,
    )


def order_address(order: Order) -> ShippingAddress:
    return ShippingAddress(
        recipient_name=order.ship_recipient_name,
        phone=order.ship_phone,
        address_line=order.ship_address_line,
        subdistrict=order.ship_subdistrict,
        district=order.ship_district,
        province=order.ship_province,
        postal_code=order.ship_postal_code,
    )


def to_detail(db: Session, order: Order, role: ViewerRole, viewer: User) -> OrderDetail:
    paid = is_paid(order)
    if role == ViewerRole.BUYER:
        last_attempt = db.scalars(
            select(PaymentAttempt)
            .where(PaymentAttempt.order_id == order.id)
            .order_by(PaymentAttempt.id.desc())
            .limit(1)
        ).first()
        receipt_no = (
            db.scalar(select(Receipt.receipt_no).where(Receipt.order_id == order.id)) if paid else None
        )
        return OrderDetail(
            id=order.id,
            status=OrderStatus(order.status),
            payment_status=PaymentStatus.PAID if paid else PaymentStatus.UNPAID,
            viewer_role=role,
            product=product_snapshot(order),
            amounts=OrderAmountsView(
                currency=order.currency,
                item_price=order.item_price,
                shipping_fee=order.shipping_fee,
                inspection_fee=order.inspection_fee,
                total_amount=order.total_amount,
                commission_fee=None,
                seller_payout=None,
            ),
            shipping_address=order_address(order),
            last_payment_attempt=attempt_view(last_attempt) if last_attempt else None,
            paid_at=order.paid_at,
            receipt_no=receipt_no,
            can_pay=not paid and viewer.status == UserStatus.ACTIVE,
            created_at=order.created_at,
            updated_at=order.updated_at,
        )

    # มุมมองผู้ขาย: เห็นยอดที่จะได้รับ และเห็นที่อยู่เมื่อถึงขั้นต้องส่งของเท่านั้น
    return OrderDetail(
        id=order.id,
        status=OrderStatus(order.status),
        payment_status=PaymentStatus.PAID if paid else PaymentStatus.UNPAID,
        viewer_role=role,
        product=product_snapshot(order),
        amounts=OrderAmountsView(
            currency=order.currency,
            item_price=order.item_price,
            shipping_fee=None,
            inspection_fee=None,
            total_amount=None,
            commission_fee=order.commission_fee,
            seller_payout=order.seller_payout,
        ),
        shipping_address=order_address(order) if order.status == ORDER_WAITING_SELLER_SHIP else None,
        last_payment_attempt=None,
        paid_at=order.paid_at,
        receipt_no=None,
        can_pay=False,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


def active_order_of_buyer(db: Session, buyer_id: int, product_id: int) -> Order | None:
    return db.scalars(
        select(Order).where(Order.buyer_id == buyer_id, Order.product_id == product_id)
    ).first()


def unavailable_conflict(db: Session, buyer: User, product_id: int) -> HTTPException:
    mine = active_order_of_buyer(db, buyer.id, product_id)
    if mine is not None:
        return api_error(
            status.HTTP_409_CONFLICT,
            "already_ordered",
            "คุณสั่งซื้อสินค้านี้ไว้แล้ว",
            order_id=mine.id,
        )
    return api_error(
        status.HTTP_409_CONFLICT, "product_unavailable", "สินค้านี้ไม่พร้อมขายหรือถูกจองไปแล้ว"
    )


def load_purchasable_product(db: Session, buyer: User, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None or product.deleted_at is not None:
        raise api_error(status.HTTP_404_NOT_FOUND, "product_not_found", "ไม่พบสินค้า")
    if product.user_id == buyer.id:
        raise api_error(status.HTTP_409_CONFLICT, "self_purchase", "ไม่สามารถซื้อสินค้าของตัวเองได้")
    if product.status != PRODUCT_AVAILABLE:
        raise unavailable_conflict(db, buyer, product_id)
    return product


def replay_order(
    db: Session, order: Order, fingerprint: str, buyer: User, response: Response
) -> OrderDetail:
    if order.request_hash != fingerprint:
        raise key_reused()
    response.headers[REPLAY_HEADER] = "true"
    return to_detail(db, order, ViewerRole.BUYER, buyer)


def find_order_by_key(db: Session, buyer_id: int, key: str) -> Order | None:
    return db.scalars(
        select(Order).where(Order.buyer_id == buyer_id, Order.idempotency_key == key)
    ).first()


def find_attempt_by_key(db: Session, order_id: int, key: str) -> PaymentAttempt | None:
    return db.scalars(
        select(PaymentAttempt).where(
            PaymentAttempt.order_id == order_id, PaymentAttempt.idempotency_key == key
        )
    ).first()


# ---------------------------------------------------------------- routes
# ลำดับสำคัญ: เส้นทางคงที่ต้องมาก่อน /{order_id}


@router.get("/checkout-quote", response_model=CheckoutQuote)
def checkout_quote(
    product_id: int = Query(ge=1),
    buyer: User = Depends(require_buyer),
    db: Session = Depends(get_db),
):
    product = load_purchasable_product(db, buyer, product_id)
    amounts = calculate_amounts(product.price)
    return CheckoutQuote(
        product=ProductSnapshot(
            id=product.id, name=product.product_name, condition=product.condition, size=product.size
        ),
        currency=CURRENCY,
        item_price=amounts.item_price,
        shipping_fee=amounts.shipping_fee,
        inspection_fee=amounts.inspection_fee,
        total_amount=amounts.total_amount,
    )


@router.post("", response_model=OrderDetail, status_code=status.HTTP_201_CREATED)
def create_order(
    body: CreateOrderRequest,
    response: Response,
    buyer: User = Depends(require_buyer),
    idempotency_key: str = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    fields: dict[str, str] = {}
    if body.product_id is None or body.product_id < 1:
        fields["product_id"] = "กรุณาเลือกสินค้า"
    address, address_errors = clean_address(body.shipping_address)
    fields.update(address_errors)
    if fields:
        raise validation_error(fields)

    fingerprint = request_fingerprint(
        {"product_id": body.product_id, "shipping_address": address.model_dump()}
    )

    existing = find_order_by_key(db, buyer.id, idempotency_key)
    if existing is not None:
        return replay_order(db, existing, fingerprint, buyer, response)

    load_purchasable_product(db, buyer, body.product_id)

    try:
        # ใครเปลี่ยน AVAILABLE -> RESERVED ได้ก่อนคือผู้ชนะ คำขอที่แข่งกันจะรอ row lock
        # แล้วเห็นว่าสถานะไม่ใช่ AVAILABLE จึงได้ 0 แถว; RETURNING ให้ snapshot จากแถวที่ล็อกไว้
        reserved = db.execute(
            update(Product)
            .where(
                Product.id == body.product_id,
                Product.status == PRODUCT_AVAILABLE,
                Product.deleted_at.is_(None),
                Product.user_id != buyer.id,
            )
            .values(status=PRODUCT_RESERVED)
            .returning(
                Product.user_id,
                Product.product_name,
                Product.condition,
                Product.size,
                Product.price,
            )
            .execution_options(synchronize_session=False)
        ).first()
        if reserved is None:
            db.rollback()
            replay = find_order_by_key(db, buyer.id, idempotency_key)
            if replay is not None:
                return replay_order(db, replay, fingerprint, buyer, response)
            raise unavailable_conflict(db, buyer, body.product_id)

        amounts = calculate_amounts(reserved.price)
        order = Order(
            buyer_id=buyer.id,
            seller_id=reserved.user_id,
            product_id=body.product_id,
            status=ORDER_WAITING_PAYMENT,
            product_name=reserved.product_name,
            product_condition=reserved.condition,
            product_size=reserved.size,
            currency=amounts.currency,
            item_price=amounts.item_price,
            shipping_fee=amounts.shipping_fee,
            inspection_fee=amounts.inspection_fee,
            commission_fee=amounts.commission_fee,
            total_amount=amounts.total_amount,
            seller_payout=amounts.seller_payout,
            ship_recipient_name=address.recipient_name,
            ship_phone=address.phone,
            ship_address_line=address.address_line,
            ship_subdistrict=address.subdistrict,
            ship_district=address.district,
            ship_province=address.province,
            ship_postal_code=address.postal_code,
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
        )
        db.add(order)
        db.commit()
    except IntegrityError:
        # key เดียวกันถูกใช้พร้อมกัน หรือ unique index ของสินค้ากันไว้ ทั้งการจองและ Order ถูก rollback
        db.rollback()
        replay = find_order_by_key(db, buyer.id, idempotency_key)
        if replay is not None:
            return replay_order(db, replay, fingerprint, buyer, response)
        raise unavailable_conflict(db, buyer, body.product_id)
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    return to_detail(db, order, ViewerRole.BUYER, buyer)


@router.get("", response_model=OrderPage)
def list_orders(
    role: Literal["buyer", "seller"] | None = Query(default=None),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if role is None:
        role = {UserRole.BUYER: "buyer", UserRole.SELLER: "seller"}.get(current_user.role)
    if role is None:
        return OrderPage(items=[], total=0, limit=limit, offset=offset)

    viewer_role = ViewerRole(role)
    # role เป็นแค่มุมมอง เงื่อนไขเจ้าของมาจาก token เสมอ
    owner_column = Order.buyer_id if viewer_role == ViewerRole.BUYER else Order.seller_id
    condition = owner_column == current_user.id

    total = db.scalar(select(func.count()).select_from(Order).where(condition)) or 0
    orders = db.scalars(
        select(Order)
        .where(condition)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    return OrderPage(
        items=[
            OrderListItem(
                id=order.id,
                status=OrderStatus(order.status),
                payment_status=PaymentStatus.PAID if is_paid(order) else PaymentStatus.UNPAID,
                viewer_role=viewer_role,
                product=product_snapshot(order),
                total_amount=order.total_amount if viewer_role == ViewerRole.BUYER else None,
                seller_payout=order.seller_payout if viewer_role == ViewerRole.SELLER else None,
                currency=order.currency,
                created_at=order.created_at,
                paid_at=order.paid_at,
            )
            for order in orders
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{order_id}", response_model=OrderDetail)
def get_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order, role = load_order_for(db, order_id, current_user)
    return to_detail(db, order, role, current_user)


@router.post("/{order_id}/payments/simulate", response_model=SimulatePaymentResponse)
def simulate_payment(
    order_id: int,
    body: SimulatePaymentRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    _enabled: None = Depends(require_payment_simulation),
    idempotency_key: str = Depends(require_idempotency_key),
    db: Session = Depends(get_db),
):
    fingerprint = request_fingerprint({"order_id": order_id, "outcome": body.outcome.value})

    try:
        order, role = load_order_for(db, order_id, current_user, lock=True)
        if role != ViewerRole.BUYER:
            raise not_order_buyer()

        previous = find_attempt_by_key(db, order.id, idempotency_key)
        if previous is not None:
            if previous.request_hash != fingerprint:
                raise key_reused()
            response.headers[REPLAY_HEADER] = "true"
            return SimulatePaymentResponse(
                attempt=attempt_view(previous), order=to_detail(db, order, role, current_user)
            )

        ensure_active(current_user)
        if is_paid(order):
            # key ใหม่หลังจ่ายแล้ว ไม่บันทึก attempt และไม่สร้างเงินซ้ำ
            raise already_paid()

        attempt = PaymentAttempt(
            order_id=order.id,
            outcome=ATTEMPT_SUCCEEDED if body.outcome == SimulatedOutcome.SUCCESS else ATTEMPT_FAILED,
            amount=order.total_amount,
            idempotency_key=idempotency_key,
            request_hash=fingerprint,
        )
        db.add(attempt)
        db.flush()

        if attempt.outcome == ATTEMPT_SUCCEEDED:
            paid_at = datetime.now(timezone.utc)
            payment = Payment(
                order_id=order.id,
                attempt_id=attempt.id,
                amount=order.total_amount,
                method=PAYMENT_METHOD_SIMULATED,
                paid_at=paid_at,
            )
            db.add(payment)
            db.flush()
            db.add_all(
                [
                    Escrow(
                        order_id=order.id,
                        payment_id=payment.id,
                        amount=order.total_amount,
                        status=ESCROW_HELD,
                        held_at=paid_at,
                    ),
                    Receipt(
                        order_id=order.id,
                        payment_id=payment.id,
                        receipt_no=receipt_number(order.id),
                        product_name=order.product_name,
                        currency=order.currency,
                        item_price=order.item_price,
                        shipping_fee=order.shipping_fee,
                        inspection_fee=order.inspection_fee,
                        total_amount=order.total_amount,
                        issued_at=paid_at,
                    ),
                ]
            )
            db.flush()
            # เปลี่ยนสถานะแบบมีเงื่อนไข สถานะที่จ่ายแล้วจะไม่ถูกเขียนทับหรือถอยกลับ
            moved = db.execute(
                update(Order)
                .where(Order.id == order.id, Order.status == ORDER_WAITING_PAYMENT)
                .values(status=ORDER_WAITING_SELLER_SHIP, paid_at=paid_at)
                .execution_options(synchronize_session=False)
            )
            if moved.rowcount != 1:
                db.rollback()
                raise already_paid()

        db.commit()
    except IntegrityError:
        # คำขอพร้อมกันอีกรายการชนะไปก่อน (key ซ้ำ หรือ payment/escrow/receipt ซ้ำ)
        db.rollback()
        order, role = load_order_for(db, order_id, current_user)
        previous = find_attempt_by_key(db, order.id, idempotency_key)
        if previous is not None and previous.request_hash == fingerprint:
            response.headers[REPLAY_HEADER] = "true"
            return SimulatePaymentResponse(
                attempt=attempt_view(previous), order=to_detail(db, order, role, current_user)
            )
        if previous is not None:
            raise key_reused()
        raise already_paid()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    db.refresh(order)
    db.refresh(attempt)
    return SimulatePaymentResponse(
        attempt=attempt_view(attempt), order=to_detail(db, order, role, current_user)
    )


@router.get("/{order_id}/receipt", response_model=ReceiptView)
def get_receipt(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order, role = load_order_for(db, order_id, current_user)
    if role != ViewerRole.BUYER:
        raise not_order_buyer()
    receipt = db.scalars(select(Receipt).where(Receipt.order_id == order.id)).first()
    if receipt is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "receipt_not_found", "ยังไม่มีใบเสร็จสำหรับคำสั่งซื้อนี้")
    return ReceiptView(
        receipt_no=receipt.receipt_no,
        order_id=order.id,
        issued_at=receipt.issued_at,
        payment_method=PAYMENT_METHOD_SIMULATED,
        currency=receipt.currency,
        product_name=receipt.product_name,
        item_price=receipt.item_price,
        shipping_fee=receipt.shipping_fee,
        inspection_fee=receipt.inspection_fee,
        total_amount=receipt.total_amount,
    )
