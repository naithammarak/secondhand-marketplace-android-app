"""ORDER-06: ทดสอบ Flow สั่งซื้อ/จ่ายเงิน/ยกเลิก/หมดเวลา และมุมมองผู้ดูแล ผ่าน HTTP จริง

ตรวจผลจากฐานข้อมูลจริงทุกกรณี (รวม ORDER-08 ยกเลิก/หมดเวลา และ ORDER-09 มุมมองผู้ดูแล)

ใช้กับฐานข้อมูลทดสอบในเครื่องเท่านั้น (ไม่แตะ Supabase กลาง) ข้อมูลทั้งหมดเป็นข้อมูลสมมติ

    # 1) PostgreSQL แยก และ migrate
    # 2) รัน API ด้วย env ทดสอบ:
    #    DATABASE_URL=<ORDER_TEST_DATABASE_URL> SUPABASE_JWT_SECRET=<ค่าทดสอบ> SUPABASE_JWT_ALGORITHM=HS256 \
    #    SUPABASE_JWT_ISSUER=https://example-project.supabase.co/auth/v1 PAYMENT_SIMULATION_ENABLED=true \
    #    uvicorn app.main:app --port 8765
    # 3) ORDER_TEST_DATABASE_URL=... ORDER_E2E_BASE_URL=http://127.0.0.1:8765 \
    #    ORDER_E2E_JWT_SECRET=<ค่าเดียวกับข้อ 2> python -m scripts.order_e2e_smoke

คืนค่า 0 เมื่อทุกกรณีผ่าน, 1 เมื่อมีกรณีล้มเหลว
"""

from datetime import timedelta
import os
import sys
import threading
import time
import uuid
from decimal import Decimal

import httpx
import jwt
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.models.audit import AdminAccessLog
from app.models.brand import Brand
from app.models.category import Category
from app.models.order import Escrow, Order, Payment, PaymentAttempt, Receipt
from app.models.product import Product
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from app.services.order_pricing import utcnow

ISSUER = os.getenv("ORDER_E2E_JWT_ISSUER", "https://example-project.supabase.co/auth/v1")
ADDRESS = {
    "recipient_name": "ผู้ซื้อ สมมติ",
    "phone": "0800000000",
    "address_line": "1 ถนนสมมติ",
    "subdistrict": "แขวงสมมติ",
    "district": "เขตสมมติ",
    "province": "กรุงเทพมหานคร",
    "postal_code": "10000",
}

results: list[tuple[str, str, str, bool]] = []


def check(case: str, expected, actual) -> None:
    ok = expected == actual
    results.append((case, str(expected), str(actual), ok))


def guard(url: str) -> None:
    parsed = make_url(url)
    if parsed.host not in {"localhost", "127.0.0.1", "::1"} or "test" not in (parsed.database or ""):
        raise SystemExit("refusing to run: ORDER_TEST_DATABASE_URL must be a local *test* database")


def main() -> int:
    db_url = os.environ["ORDER_TEST_DATABASE_URL"]
    guard(db_url)
    base = os.environ["ORDER_E2E_BASE_URL"].rstrip("/")
    secret = os.environ["ORDER_E2E_JWT_SECRET"]
    engine = create_engine(db_url)

    def token(uid: uuid.UUID) -> dict:
        encoded = jwt.encode(
            {"sub": str(uid), "aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 3600},
            secret,
            algorithm="HS256",
        )
        return {"Authorization": f"Bearer {encoded}"}

    def key() -> dict:
        return {"Idempotency-Key": str(uuid.uuid4())}

    def counts(session: Session, order_id: int) -> tuple[int, int, int, int]:
        session.expire_all()
        return tuple(
            session.scalar(select(func.count()).select_from(model).where(model.order_id == order_id))
            for model in (PaymentAttempt, Payment, Escrow, Receipt)
        )

    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE admin_access_logs, receipts, escrows, payments, payment_attempts, orders, "
                "products, brands, categories, verifications, users RESTART IDENTITY CASCADE"
            )
        )

    with Session(engine) as session:
        people = {}
        for alias, role in [
            ("buyer_a", UserRole.BUYER),
            ("buyer_b", UserRole.BUYER),
            ("seller_owner", UserRole.SELLER),
            ("seller_other", UserRole.SELLER),
            ("admin_one", UserRole.ADMIN),
        ]:
            uid = uuid.uuid4()
            user = User(supabase_user_id=uid, full_name=f"demo {alias}", email=f"{alias}@example.test",
                        role=role, status=UserStatus.ACTIVE)
            session.add(user)
            session.flush()
            people[alias] = (user.id, token(uid))
        session.add(
            Verification(
                user_id=people["seller_owner"][0],
                id_card_image_url="private/evidence.jpg",
                bank_account_name="demo seller",
                bank_account_number="1111111111",
                bank_name="ธนาคารสมมติ",
                verification_status="APPROVED",
            )
        )
        category = Category(category_name="สมมติ")
        brand = Brand(brand_name="สมมติ")
        session.add_all([category, brand])
        session.flush()

        def product(name, status="AVAILABLE", deleted=False, owner="seller_owner", price="1200.00"):
            item = Product(user_id=people[owner][0], category_id=category.id, brand_id=brand.id,
                           product_name=name, description="สมมติ", size="M", condition="GOOD",
                           price=Decimal(price), sale_type="FIXED_PRICE", status=status)
            if deleted:
                item.deleted_at = func.now()
            session.add(item)
            session.flush()
            return item.id

        p_happy = product("happy path")
        p_retry = product("failed then success")
        p_race = product("create race")
        p_reserved = product("reserved already", status="RESERVED")
        p_deleted = product("soft deleted", deleted=True)
        p_pay_race = product("pay race")
        p_cancel = product("buyer cancels", owner="seller_other")
        p_expire = product("payment window closes", owner="seller_other")
        p_catalog = product("catalog visibility")
        session.commit()

    a, b = people["buyer_a"][1], people["buyer_b"][1]
    owner, other = people["seller_owner"][1], people["seller_other"][1]
    admin = people["admin_one"][1]
    http = httpx.Client(base_url=base, timeout=30)

    # --- Happy path
    created = http.post("/orders", json={"product_id": p_happy, "shipping_address": ADDRESS}, headers={**a, **key()})
    check("happy: create 201", 201, created.status_code)
    oid = created.json()["id"]
    check("happy: status after create", "WAITING_PAYMENT", created.json()["status"])
    paid = http.post(f"/orders/{oid}/payments/simulate", json={"outcome": "SUCCESS"}, headers={**a, **key()})
    check("happy: status after pay", "WAITING_SELLER_SHIP", paid.json()["order"]["status"])
    with Session(engine) as session:
        check("happy: DB attempts/payments/escrows/receipts", (1, 1, 1, 1), counts(session, oid))
        escrow = session.scalars(select(Escrow).where(Escrow.order_id == oid)).one()
        check("happy: escrow HELD = order total", ("HELD", Decimal("1350.00")), (escrow.status, escrow.amount))
    check("happy: receipt for buyer", 200, http.get(f"/orders/{oid}/receipt", headers=a).status_code)

    # --- FAILED then retry
    created = http.post("/orders", json={"product_id": p_retry, "shipping_address": ADDRESS}, headers={**a, **key()})
    oid2 = created.json()["id"]
    failed = http.post(f"/orders/{oid2}/payments/simulate", json={"outcome": "FAILED"}, headers={**a, **key()})
    check("retry: FAILED keeps WAITING_PAYMENT", "WAITING_PAYMENT", failed.json()["order"]["status"])
    with Session(engine) as session:
        check("retry: FAILED creates no money (DB)", (1, 0, 0, 0), counts(session, oid2))
    ok = http.post(f"/orders/{oid2}/payments/simulate", json={"outcome": "SUCCESS"}, headers={**a, **key()})
    check("retry: new key SUCCESS", "WAITING_SELLER_SHIP", ok.json()["order"]["status"])
    with Session(engine) as session:
        check("retry: DB after success", (2, 1, 1, 1), counts(session, oid2))

    # --- Pay again: same key, new key
    same_key = key()
    http_first = http.post(f"/orders/{oid}/payments/simulate", json={"outcome": "SUCCESS"}, headers={**a, **same_key})
    check("dup pay: new key after paid -> 409", 409, http_first.status_code)
    with Session(engine) as session:
        check("dup pay: DB unchanged", (1, 1, 1, 1), counts(session, oid))

    # --- Create race A vs B
    race_results = [None, None]
    barrier = threading.Barrier(2)

    def race(index, headers):
        barrier.wait()
        race_results[index] = httpx.post(
            f"{base}/orders", json={"product_id": p_race, "shipping_address": ADDRESS},
            headers={**headers, **key()}, timeout=30,
        ).status_code

    threads = [threading.Thread(target=race, args=(0, a)), threading.Thread(target=race, args=(1, b))]
    [t.start() for t in threads]
    [t.join() for t in threads]
    check("race: one winner", [201, 409], sorted(race_results))
    with Session(engine) as session:
        check("race: DB orders for product", 1,
              session.scalar(select(func.count()).select_from(Order).where(Order.product_id == p_race)))

    # --- Pay race: 6 parallel requests with different keys
    oid3 = http.post("/orders", json={"product_id": p_pay_race, "shipping_address": ADDRESS},
                     headers={**a, **key()}).json()["id"]
    pay_codes = []
    barrier6 = threading.Barrier(6)

    def pay_race(outcome):
        barrier6.wait()
        pay_codes.append(httpx.post(f"{base}/orders/{oid3}/payments/simulate", json={"outcome": outcome},
                                    headers={**a, **key()}, timeout=30).status_code)

    threads = [threading.Thread(target=pay_race, args=(o,)) for o in
               ["SUCCESS", "SUCCESS", "FAILED", "SUCCESS", "FAILED", "SUCCESS"]]
    [t.start() for t in threads]
    [t.join() for t in threads]
    with Session(engine) as session:
        attempts, payments, escrows, receipts = counts(session, oid3)
        check("pay race: exactly one payment/escrow/receipt (DB)", (1, 1, 1), (payments, escrows, receipts))
        check("pay race: order not downgraded", "WAITING_SELLER_SHIP", session.get(Order, oid3).status)

    # --- Security / negative
    tampered = http.post("/orders", json={"product_id": p_happy, "shipping_address": ADDRESS, "total_amount": "1.00"},
                         headers={**b, **key()})
    check("tamper: client total rejected", 422, tampered.status_code)
    own = http.post("/orders", json={"product_id": p_happy, "shipping_address": ADDRESS}, headers={**owner, **key()})
    check("seller cannot buy (own product)", 403, own.status_code)
    check("reserved product", 409, http.post("/orders", json={"product_id": p_reserved, "shipping_address": ADDRESS},
                                             headers={**b, **key()}).status_code)
    check("soft-deleted product", 404, http.post("/orders", json={"product_id": p_deleted, "shipping_address": ADDRESS},
                                                 headers={**b, **key()}).status_code)
    check("no login", True, http.post("/orders", json={"product_id": p_retry, "shipping_address": ADDRESS},
                                      headers=key()).status_code in (401, 403))
    check("guess order of other buyer", 404, http.get(f"/orders/{oid}", headers=b).status_code)
    check("guess receipt of other buyer", 404, http.get(f"/orders/{oid}/receipt", headers=b).status_code)
    check("other seller guesses order", 404, http.get(f"/orders/{oid}", headers=other).status_code)
    check("owner seller reads receipt", 403, http.get(f"/orders/{oid}/receipt", headers=owner).status_code)
    with Session(engine) as session:
        b_orders = session.scalar(
            select(func.count()).select_from(Order).where(Order.buyer_id == people["buyer_b"][0])
        )
    b_list = http.get("/orders", headers=b).json()
    # B อาจเป็นผู้ชนะการแข่งจอง จึงเทียบกับจำนวนใน DB และต้องไม่มี Order ของ A ปนมา
    check("buyer B list = B's orders in DB only", (b_orders, set()),
          (b_list["total"], {item["id"] for item in b_list["items"]} & {oid, oid2, oid3}))
    check("seller list sees own sales", 4, http.get("/orders", headers=owner).json()["total"])


    # --- ORDER-08: ผู้ซื้อยกเลิกเอง
    oid_cancel = http.post("/orders", json={"product_id": p_cancel, "shipping_address": ADDRESS},
                           headers={**a, **key()}).json()["id"]
    cancelled = http.post(f"/orders/{oid_cancel}/cancel", headers=a)
    check("cancel: 200", 200, cancelled.status_code)
    check("cancel: status + reason", ("CANCELLED", "BUYER"),
          (cancelled.json()["status"], cancelled.json()["cancel_reason"]))
    check("cancel: ปุ่มจ่าย/ยกเลิกปิดแล้ว", (False, False),
          (cancelled.json()["can_pay"], cancelled.json()["can_cancel"]))
    again = http.post(f"/orders/{oid_cancel}/cancel", headers=a)
    check("cancel: ยกเลิกซ้ำได้ผลเดิม", (200, cancelled.json()["cancelled_at"]),
          (again.status_code, again.json()["cancelled_at"]))
    with Session(engine) as session:
        check("cancel: ไม่มีแถวเงินใด ๆ (DB)", (0, 0, 0, 0), counts(session, oid_cancel))
        check("cancel: สินค้ากลับไปขายต่อได้ (DB)", "AVAILABLE", session.get(Product, p_cancel).status)
    check("cancel: จ่ายเงิน Order ที่ยกเลิกแล้ว -> 409", 409,
          http.post(f"/orders/{oid_cancel}/payments/simulate", json={"outcome": "SUCCESS"},
                    headers={**a, **key()}).status_code)
    check("cancel: ผู้ซื้อคนเดิมสั่งสินค้าชิ้นเดิมใหม่ได้", 201,
          http.post("/orders", json={"product_id": p_cancel, "shipping_address": ADDRESS},
                    headers={**a, **key()}).status_code)

    # --- ORDER-08: หมดเวลาจ่ายเงิน (เลื่อนเส้นตายใน DB แทนการรอ 30 นาทีจริง)
    oid_expire = http.post("/orders", json={"product_id": p_expire, "shipping_address": ADDRESS},
                           headers={**a, **key()}).json()["id"]
    with Session(engine) as session:
        expiring = session.get(Order, oid_expire)
        expiring.expires_at = utcnow() - timedelta(minutes=1)
        session.commit()
    expired = http.post(f"/orders/{oid_expire}/payments/simulate", json={"outcome": "SUCCESS"},
                        headers={**a, **key()})
    check("expiry: จ่ายหลังหมดเวลา -> 409 order_expired", (409, "order_expired"),
          (expired.status_code, expired.json()["detail"]["code"]))
    with Session(engine) as session:
        row = session.get(Order, oid_expire)
        check("expiry: Order ถูกยกเลิกอัตโนมัติ (DB)", ("CANCELLED", "EXPIRED"),
              (row.status, row.cancel_reason))
        check("expiry: ไม่บันทึก attempt และไม่มีเงิน (DB)", (0, 0, 0, 0), counts(session, oid_expire))
        check("expiry: สินค้าถูกปล่อยคืน (DB)", "AVAILABLE", session.get(Product, p_expire).status)


    # --- ORDER-08: สินค้าที่การจองหมดเวลาต้องกลับมาอยู่ในแคตตาล็อกที่ผู้ซื้อเดินดูตามปกติ
    check("catalog: สินค้าพร้อมขายอยู่ในรายการ", True,
          p_catalog in [item["id"] for item in http.get("/products").json()["data"]])
    oid_catalog = http.post("/orders", json={"product_id": p_catalog, "shipping_address": ADDRESS},
                            headers={**b, **key()}).json()["id"]
    check("catalog: จองแล้วหายจากรายการ", False,
          p_catalog in [item["id"] for item in http.get("/products").json()["data"]])
    check("catalog: จองแล้วเปิดรายละเอียดไม่ได้", 404, http.get(f"/products/{p_catalog}").status_code)
    with Session(engine) as session:
        reserved = session.get(Order, oid_catalog)
        reserved.expires_at = utcnow() - timedelta(minutes=1)
        session.commit()
    check("catalog: หมดเวลาแล้วกลับมาอยู่ในรายการ", True,
          p_catalog in [item["id"] for item in http.get("/products").json()["data"]])
    check("catalog: หมดเวลาแล้วเปิดรายละเอียดได้", 200, http.get(f"/products/{p_catalog}").status_code)
    with Session(engine) as session:
        check("catalog: สินค้ากลับเป็น AVAILABLE (DB)", "AVAILABLE", session.get(Product, p_catalog).status)
        check("catalog: Order ถูกยกเลิกเพราะหมดเวลา (DB)", ("CANCELLED", "EXPIRED"),
              (session.get(Order, oid_catalog).status, session.get(Order, oid_catalog).cancel_reason))

    # --- ORDER-09: มุมมองผู้ดูแล
    admin_list = http.get("/admin/orders", headers=admin)
    check("admin: เปิดรายการได้", 200, admin_list.status_code)
    check("admin: อีเมลในรายการถูกปิดบัง", True,
          all("***@" in item["buyer"]["email_masked"] for item in admin_list.json()["items"]))
    check("admin: ไม่มีที่อยู่ในรายการ", True, "shipping" not in admin_list.text)
    admin_detail = http.get(f"/admin/orders/{oid}", headers=admin)
    check("admin: รายละเอียดปิดบังที่อยู่", {"province": ADDRESS["province"],
                                              "postal_code": ADDRESS["postal_code"],
                                              "phone_masked": "***0000"},
          admin_detail.json()["shipping_address_masked"])
    check("admin: ที่อยู่เต็มไม่หลุดในรายละเอียด", True,
          ADDRESS["address_line"] not in admin_detail.text and "buyer_a@example.test" not in admin_detail.text)
    check("admin: ขอดูข้อมูลเต็มโดยไม่มีเหตุผล -> 422", 422,
          http.post(f"/admin/orders/{oid}/contact", json={}, headers=admin).status_code)
    revealed = http.post(f"/admin/orders/{oid}/contact",
                         json={"reason": "ตรวจสอบข้อพิพาทการจัดส่งตามคำร้องของผู้ซื้อ"}, headers=admin)
    check("admin: เปิดดูข้อมูลเต็มพร้อมเหตุผล", (200, ADDRESS["address_line"], "buyer_a@example.test"),
          (revealed.status_code, revealed.json()["shipping_address"]["address_line"],
           revealed.json()["buyer_email"]))
    with Session(engine) as session:
        logs = session.scalars(select(AdminAccessLog)).all()
        check("admin: บันทึก Audit Log หนึ่งแถวต่อการเปิดดูหนึ่งครั้ง (DB)",
              (1, "ORDER_CONTACT_REVEAL", "ORDER", oid),
              (len(logs), logs[0].action, logs[0].target_type, logs[0].target_id) if logs else (0,))
    check("admin: ผู้ซื้อเรียก endpoint ผู้ดูแลไม่ได้", 403, http.get("/admin/orders", headers=a).status_code)
    check("admin: ผู้ขายเรียก endpoint ผู้ดูแลไม่ได้", 403, http.get("/admin/orders", headers=owner).status_code)
    check("admin: ผู้ดูแลยังเข้าหน้าผู้ซื้อไม่ได้", 404, http.get(f"/orders/{oid}", headers=admin).status_code)

    width = max(len(case) for case, *_ in results)
    print(f"{'CASE'.ljust(width)} | EXPECTED | ACTUAL | RESULT")
    for case, expected, actual, ok in results:
        print(f"{case.ljust(width)} | {expected} | {actual} | {'PASS' if ok else 'FAIL'}")
    failed_count = sum(1 for *_, ok in results if not ok)
    print(f"\n{len(results) - failed_count}/{len(results)} passed")
    return 1 if failed_count else 0


if __name__ == "__main__":
    sys.exit(main())
