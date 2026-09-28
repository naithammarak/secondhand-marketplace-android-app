"""Public catalog and seller-owned product reads (PRODUCT-05)."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.products import ProductCreateRoute, product_error, product_result, sign_images
from app.database import get_db
from app.models.brand import Brand
from app.models.category import Category
from app.models.product import Product
from app.models.product_image import ProductImage
from app.models.order import Order
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from app.services.order_expiry import sweep_if_needed


logger = logging.getLogger(__name__)
router = APIRouter(tags=["Products"], route_class=ProductCreateRoute)
OWNER_STATUSES = {"AVAILABLE", "RESERVED", "SOLD", "CANCELLED"}


def owner_seller(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> User:
    # The authentication dependency can have loaded this row into the identity map.
    user = db.scalar(
        select(User)
        .where(User.id == current_user.id)
        .execution_options(populate_existing=True)
    )
    if user is None:
        raise product_error(403, "ACCOUNT_NOT_REGISTERED")
    if user.status != UserStatus.ACTIVE:
        raise product_error(403, "ACCOUNT_INACTIVE")
    if user.role != UserRole.SELLER:
        raise product_error(403, "SELLER_ONLY")
    return user


def latest_approval_status():
    return (
        select(Verification.verification_status)
        .where(Verification.user_id == User.id)
        .order_by(Verification.created_at.desc(), Verification.id.desc())
        .limit(1)
        .correlate(User)
        .scalar_subquery()
    )


def public_sellers(db: Session, user_ids: set[int]) -> dict[int, dict]:
    """One batched lookup; use the same latest record as catalog eligibility.

    Explicit projection intentionally excludes all identity/banking/evidence data.
    """
    latest_id = (select(Verification.id).where(Verification.user_id == User.id)
                 .order_by(Verification.created_at.desc(), Verification.id.desc())
                 .limit(1).correlate(User).scalar_subquery())
    rows = db.execute(select(User.id, Verification.shop_name)
                      .join(Verification, Verification.id == latest_id)
                      .where(User.id.in_(user_ids), Verification.verification_status == "APPROVED"))
    return {user_id: {"display_name": shop_name or "ร้านค้าที่ได้รับอนุมัติ", "verified": True}
            for user_id, shop_name in rows}


def release_expired_reservations(
    db: Session, product_id: int | None = None, *, seller_id: int | None = None
) -> None:
    """ปล่อยสินค้าที่การจองหมดเวลาก่อนอ่านแคตตาล็อก (D-05)

    แคตตาล็อกคืนเฉพาะสินค้า `AVAILABLE` ถ้าไม่กวาดตรงนี้ สินค้าที่ผู้ซื้อคนก่อนจองไว้แล้วไม่จ่าย
    จะหายจากรายการถาวร เพราะไม่มีเส้นทางไหนให้ผู้ซื้อคนอื่นไปแตะ Order นั้นได้อีก

    ปกติไม่มีอะไรให้กวาด จึงถามด้วยคำสั่งอ่านที่ราคาถูกก่อนแล้วค่อยเขียนเมื่อจำเป็นจริง
    การกวาดล้มเหลวต้องไม่ทำให้การเปิดดูสินค้าพัง จึงบันทึก log แล้วอ่านข้อมูลต่อ
    """
    conditions = []
    if product_id is not None:
        conditions.append(Order.product_id == product_id)
    if seller_id is not None:
        conditions.append(Order.seller_id == seller_id)
    try:
        sweep_if_needed(db, *conditions)
    except SQLAlchemyError:
        logger.exception("PRODUCT-05 expired reservation sweep failed")
        db.rollback()


def public_product_filter():
    return (
        Product.status == "AVAILABLE",
        Product.deleted_at.is_(None),
        User.status == UserStatus.ACTIVE,
        User.role == UserRole.SELLER,
        latest_approval_status() == "APPROVED",
    )


def check_catalog_approval(db: Session, *, product_id=None, term=None):
    """Fail closed for malformed approval data before returning a catalog result."""
    latest = latest_approval_status()
    pending_count = (
        select(func.count(Verification.id))
        .where(Verification.user_id == User.id, Verification.verification_status == "PENDING")
        .correlate(User).scalar_subquery()
    )
    invalid_time = (
        select(Verification.id)
        .where(Verification.user_id == User.id, Verification.created_at.is_(None))
        .correlate(User).exists()
    )
    query = select(Product.id).join(User, User.id == Product.user_id).where(
        Product.deleted_at.is_(None), Product.status == "AVAILABLE",
        User.status == UserStatus.ACTIVE, User.role == UserRole.SELLER,
        or_(latest.not_in(["APPROVED", "PENDING", "REJECTED"]), pending_count > 1, invalid_time),
    )
    if product_id is not None:
        query = query.where(Product.id == product_id)
    if term is not None:
        query = query.where(name_filter(term))
    if db.scalar(query.limit(1)) is not None:
        raise product_error(503, "APPROVAL_STATE_UNAVAILABLE")


def validate_query(request: Request, allowed: set[str]) -> None:
    unknown = set(request.query_params) - allowed
    if unknown:
        raise product_error(
            422,
            "FIELD_NOT_ALLOWED",
            {name: ["ไม่อนุญาตให้ใช้พารามิเตอร์นี้"] for name in sorted(unknown)},
        )
    duplicates = {name for name in allowed if len(request.query_params.getlist(name)) > 1}
    if duplicates:
        raise product_error(
            422,
            "VALIDATION_ERROR",
            {name: ["ส่งพารามิเตอร์ได้เพียงค่าเดียว"] for name in sorted(duplicates)},
        )


def search_term(q: str | None) -> str | None:
    term = q.strip() if q is not None else ""
    if len(term) > 255:
        raise product_error(422, "VALIDATION_ERROR", {"q": ["คำค้นต้องไม่เกิน 255 ตัวอักษร"]})
    return term or None


def name_filter(term: str):
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return Product.product_name.ilike(f"%{escaped}%", escape="\\")


def signed_product_images(images: list[ProductImage]):
    try:
        return sign_images(images)
    except Exception as exc:
        logger.exception("PRODUCT-05 could not sign product images")
        raise product_error(503, "STORAGE_UNAVAILABLE") from exc


def list_products(
    db: Session,
    *,
    page: int,
    page_size: int,
    term: str | None,
    seller_id: int | None = None,
    status: str | None = None,
    category_id: int | None = None,
) -> dict:
    filters = [Product.deleted_at.is_(None)]
    if seller_id is None:
        filters.extend(public_product_filter())
    else:
        filters.append(Product.user_id == seller_id)
        if status is not None:
            filters.append(Product.status == status)
    if term is not None:
        filters.append(name_filter(term))
    if category_id is not None:
        filters.append(Product.category_id == category_id)

    try:
        if seller_id is None:
            check_catalog_approval(db, term=term)
        count_query = select(func.count(Product.id)).select_from(Product)
        rows_query = select(Product).order_by(Product.created_at.desc(), Product.id.desc())
        if seller_id is None:
            count_query = count_query.join(User, User.id == Product.user_id)
            rows_query = rows_query.join(User, User.id == Product.user_id)
        total = db.scalar(count_query.where(*filters)) or 0
        products = db.scalars(
            rows_query.where(*filters).offset((page - 1) * page_size).limit(page_size)
        ).all()
        product_ids = [product.id for product in products]
        sellers = public_sellers(db, {p.user_id for p in products}) if seller_id is None else {}
        images = (
            db.scalars(
                select(ProductImage)
                .where(ProductImage.product_id.in_(product_ids))
                .order_by(
                    ProductImage.product_id,
                    ProductImage.sort_order,
                    ProductImage.image_id,
                )
            ).all()
            if product_ids
            else []
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PRODUCT-05 catalog lookup failed")
        raise product_error(503, "APPROVAL_STATE_UNAVAILABLE" if seller_id is None else "PRODUCT_SAVE_FAILED") from exc

    main_images: dict[int, ProductImage] = {}
    for image in images:
        main_images.setdefault(image.product_id, image)
    signed = signed_product_images(list(main_images.values()))
    signed_by_product = {
        image.product_id: (image, url, expires_at)
        for image, url, expires_at in signed
    }
    data = []
    for product in products:
        main = signed_by_product.get(product.id)
        data.append(
            {
                "id": product.id,
                "product_name": product.product_name,
                "price": format(product.price, ".2f"),
                "condition": product.condition,
                "status": product.status,
                **({"seller": sellers.get(product.user_id)} if seller_id is None else {}),
                "main_image": (
                    {
                        "image_id": main[0].image_id,
                        "image_url": main[1],
                        "url_expires_at": main[2],
                    }
                    if main
                    else None
                ),
            }
        )
    total_pages = (total + page_size - 1) // page_size
    return {
        "data": data,
        "meta": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
        },
    }


def detail(db: Session, product_id: int, seller_id: int | None = None) -> dict:
    try:
        if seller_id is None:
            check_catalog_approval(db, product_id=product_id)
        query = (
            select(Product, Category, Brand)
            .join(Category, Category.id == Product.category_id)
            .join(Brand, Brand.id == Product.brand_id)
            .where(Product.id == product_id, Product.deleted_at.is_(None))
        )
        if seller_id is None:
            query = query.join(User, User.id == Product.user_id).where(*public_product_filter())
        else:
            query = query.where(Product.user_id == seller_id)
        row = db.execute(query).one_or_none()
        if row is None:
            raise product_error(404, "PRODUCT_NOT_FOUND")
        product, category, brand = row
        images = db.scalars(
            select(ProductImage)
            .where(ProductImage.product_id == product_id)
            .order_by(ProductImage.sort_order, ProductImage.image_id)
        ).all()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("PRODUCT-05 detail lookup failed")
        raise product_error(503, "APPROVAL_STATE_UNAVAILABLE" if seller_id is None else "PRODUCT_SAVE_FAILED") from exc
    result = product_result(product, category, brand, signed_product_images(images))
    if seller_id is None:
        result["seller"] = public_sellers(db, {product.user_id}).get(product.user_id)
    return result


@router.get("/products/me", summary="ดูรายการสินค้าของฉัน", description="กด Authorize ด้วยบัญชีผู้ขายก่อน จากนั้นกด Try it out และ Execute เพื่อดูสินค้าของตนเอง")
def my_products(
    request: Request,
    response: Response,
    q: str | None = Query(None, description="คำค้นจากชื่อสินค้า เช่น เสื้อ — ไม่จำเป็นต้องกรอก ปล่อยว่างเพื่อดูทั้งหมด ตัว q สีจางเป็นข้อความตัวอย่างในช่อง"),
    page: int = Query(1, ge=1, description="หน้าที่ต้องการดู เริ่มจาก 1 — ทดลองครั้งแรกใช้ 1 ตามเดิม"),
    page_size: int = Query(20, ge=1, le=50, description="จำนวนสินค้าต่อหน้า ตั้งแต่ 1–50 — ใช้ 20 ตามเดิมได้"),
    status: str | None = Query(None, description="สถานะที่ต้องการดู: AVAILABLE = พร้อมขาย, RESERVED = จองแล้ว, SOLD = ขายแล้ว, CANCELLED = ยกเลิก — ปล่อยว่างเพื่อดูทุกสถานะ"),
    user: User = Depends(owner_seller),
    db: Session = Depends(get_db),
):
    validate_query(request, {"q", "page", "page_size", "status"})
    if status is not None and status not in OWNER_STATUSES:
        raise product_error(422, "VALIDATION_ERROR", {"status": ["สถานะสินค้าไม่ถูกต้อง"]})
    response.headers["Cache-Control"] = "no-store"
    # ผู้ขายก็ต้องไม่เห็นสินค้าของตัวเองค้างสถานะถูกจองทั้งที่การจองหมดอายุไปแล้ว
    release_expired_reservations(db, seller_id=user.id)
    return list_products(db, page=page, page_size=page_size, term=search_term(q), seller_id=user.id, status=status)


@router.get("/products/me/{product_id}", summary="ดูรายละเอียดสินค้าของฉัน", description="กด Authorize ด้วยบัญชีผู้ขาย แล้วใส่ product_id จากช่อง id ในผลลัพธ์ GET /products/me เพื่อดูรายละเอียดสินค้าของตนเอง")
def my_product_detail(
    product_id: int,
    request: Request,
    response: Response,
    user: User = Depends(owner_seller),
    db: Session = Depends(get_db),
):
    validate_query(request, set())
    if product_id < 1:
        raise product_error(422, "VALIDATION_ERROR", {"product_id": ["ID ต้องมากกว่า 0"]})
    response.headers["Cache-Control"] = "no-store"
    return detail(db, product_id, seller_id=user.id)


@router.get("/products", summary="ดูรายการและค้นหาสินค้าที่พร้อมขาย", description="ไม่ต้องเข้าสู่ระบบ กด Try it out แล้วกรอกคำค้น หรือปล่อยว่างเพื่อดูสินค้าทั้งหมดที่พร้อมขาย จากนั้นกด Execute การเรียกนี้เป็นการดูข้อมูลสินค้า")
def public_products(
    request: Request,
    response: Response,
    q: str | None = Query(None, description="คำค้นจากชื่อสินค้า เช่น เสื้อ — ไม่จำเป็นต้องกรอก ปล่อยว่างเพื่อดูทั้งหมด ตัว q สีจางเป็นข้อความตัวอย่างในช่อง"),
    page: int = Query(1, ge=1, description="หน้าที่ต้องการดู เริ่มจาก 1 — ทดลองครั้งแรกใช้ 1 ตามเดิม"),
    page_size: int = Query(20, ge=1, le=50, description="จำนวนสินค้าต่อหน้า ตั้งแต่ 1–50 — ใช้ 20 ตามเดิมได้"),
    category_id: int | None = Query(None, ge=1, description="กรองตาม ID หมวดหมู่จาก GET /categories"),
    db: Session = Depends(get_db),
):
    validate_query(request, {"q", "page", "page_size", "category_id"})
    response.headers["Cache-Control"] = "no-store"
    release_expired_reservations(db)
    return list_products(db, page=page, page_size=page_size, term=search_term(q), category_id=category_id)


@router.get("/products/{product_id}", summary="ดูรายละเอียดสินค้าที่พร้อมขาย", description="ไม่ต้องเข้าสู่ระบบ ใส่ product_id จากช่อง id ในผลลัพธ์ GET /products แล้วกด Execute เพื่อดูข้อมูลและรูปทั้งหมดของสินค้านั้น")
def public_product_detail(
    product_id: int, request: Request, response: Response, db: Session = Depends(get_db)
):
    validate_query(request, set())
    if product_id < 1:
        raise product_error(422, "VALIDATION_ERROR", {"product_id": ["ID ต้องมากกว่า 0"]})
    response.headers["Cache-Control"] = "no-store"
    release_expired_reservations(db, product_id)
    return detail(db, product_id)


@router.get("/categories", tags=["Product options"], summary="ดูหมวดหมู่สินค้า", description="ไม่ต้องกรอกข้อมูล กด Try it out แล้ว Execute ใช้ค่า id ที่ได้เป็น category_id ตอนสร้างหรือแก้ไขสินค้า")
def categories(request: Request, response: Response, db: Session = Depends(get_db)):
    validate_query(request, set())
    try:
        rows = db.scalars(select(Category).order_by(Category.id)).all()
    except SQLAlchemyError as exc:
        raise product_error(503, "PRODUCT_READ_UNAVAILABLE") from exc
    response.headers["Cache-Control"] = "no-store"
    return {
        "data": [
            {"id": row.id, "category_name": row.category_name, "parent_category_id": row.parent_category_id}
            for row in rows
        ]
    }


@router.get("/brands", tags=["Product options"], summary="ดูแบรนด์สินค้า", description="ไม่ต้องกรอกข้อมูล กด Try it out แล้ว Execute ใช้ค่า id ที่ได้เป็น brand_id ตอนสร้างหรือแก้ไขสินค้า")
def brands(request: Request, response: Response, db: Session = Depends(get_db)):
    validate_query(request, set())
    try:
        rows = db.scalars(select(Brand).order_by(Brand.id)).all()
    except SQLAlchemyError as exc:
        raise product_error(503, "PRODUCT_READ_UNAVAILABLE") from exc
    response.headers["Cache-Control"] = "no-store"
    return {
        "data": [
            {"id": row.id, "brand_name": row.brand_name}
            for row in rows
        ]
    }
