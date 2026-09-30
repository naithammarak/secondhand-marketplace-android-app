"""Public, read-only catalog routes without lazy order expiry."""

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.product_reads import detail, list_products, search_term, validate_query
from app.api.products import ProductCreateRoute, product_error
from app.catalog_database import get_catalog_db
from app.models.brand import Brand
from app.models.category import Category


router = APIRouter(tags=["Public catalog"], route_class=ProductCreateRoute)


@router.get("/products", summary="Browse and search public products")
def public_products(
    request: Request,
    response: Response,
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    category_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_catalog_db),
):
    validate_query(request, {"q", "page", "page_size", "category_id"})
    response.headers["Cache-Control"] = "no-store"
    # Deliberately omit release_expired_reservations: a catalog read must not
    # update orders or products as a side effect.
    return list_products(
        db,
        page=page,
        page_size=page_size,
        term=search_term(q),
        category_id=category_id,
    )


@router.get("/products/{product_id}", summary="Read one public product")
def public_product_detail(
    product_id: int,
    request: Request,
    response: Response,
    db: Session = Depends(get_catalog_db),
):
    validate_query(request, set())
    if product_id < 1:
        raise product_error(422, "VALIDATION_ERROR", {"product_id": ["ID ต้องมากกว่า 0"]})
    response.headers["Cache-Control"] = "no-store"
    return detail(db, product_id)


@router.get("/categories", tags=["Product options"], summary="List product categories")
def categories(request: Request, response: Response, db: Session = Depends(get_catalog_db)):
    validate_query(request, set())
    try:
        rows = db.scalars(select(Category).order_by(Category.id)).all()
    except SQLAlchemyError as exc:
        raise product_error(503, "PRODUCT_READ_UNAVAILABLE") from exc
    response.headers["Cache-Control"] = "no-store"
    return {
        "data": [
            {
                "id": row.id,
                "category_name": row.category_name,
                "parent_category_id": row.parent_category_id,
            }
            for row in rows
        ]
    }


@router.get("/brands", tags=["Product options"], summary="List product brands")
def brands(request: Request, response: Response, db: Session = Depends(get_catalog_db)):
    validate_query(request, set())
    try:
        rows = db.scalars(select(Brand).order_by(Brand.id)).all()
    except SQLAlchemyError as exc:
        raise product_error(503, "PRODUCT_READ_UNAVAILABLE") from exc
    response.headers["Cache-Control"] = "no-store"
    return {"data": [{"id": row.id, "brand_name": row.brand_name} for row in rows]}
