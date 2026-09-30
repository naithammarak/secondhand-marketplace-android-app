"""Buyer registration and unpaid orders; deliberately no payment/issuance routes."""

from functools import wraps

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.api.auth import router as auth_router
from app.api.catalog_only import router as catalog_router
from app.api.orders import list_orders, require_buyer, router as orders_router
from app.schemas.order import OrderDetail, OrderPage
from app.database import get_db
from app.models.order import Order
from app.models.user import User


def buyer_order_access(request: Request, user: User = Depends(require_buyer),
                       db: Session = Depends(get_db)):
    if request.query_params.get("role") == "seller":
        raise HTTPException(403, detail={"code": "buyer_orders_only"})
    order_id = request.path_params.get("order_id")
    if order_id is not None:
        try:
            order = db.get(Order, int(order_id))
        except ValueError:
            raise HTTPException(422, detail="Invalid order ID")
        if order is None or order.buyer_id != user.id:
            raise HTTPException(404, detail={"code": "order_not_found"})


def without_payment(endpoint):
    @wraps(endpoint)
    def wrapped(*args, **kwargs):
        result = endpoint(*args, **kwargs)
        if isinstance(result, OrderDetail):
            return result.model_copy(update={"can_pay": False})
        return result
    return wrapped


def create_app() -> FastAPI:
    application = FastAPI(title="Buyer orders API", version="1.0.0")
    application.add_middleware(CORSMiddleware, allow_origins=["*"],
                               allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"],
                               allow_headers=["*"])
    application.include_router(catalog_router)
    # Explicit allowlists protect the boundary when upstream routers gain routes.
    for source, allowed, dependencies in (
        (auth_router, {("/auth/google", "POST"), ("/auth/me", "GET")}, []),
        (orders_router, {("/orders/checkout-quote", "GET"), ("/orders", "POST"),
                         ("/orders/{order_id}", "GET"),
                         ("/orders/{order_id}/cancel", "POST"),
                         ("/orders/{order_id}/receipt", "GET")}, [Depends(buyer_order_access)]),
    ):
        selected = APIRouter()
        for route in source.routes:
            if any((route.path, method) in allowed for method in route.methods):
                if source is orders_router:
                    # Keep the full API's models intact while accurately reporting
                    # the buyer runtime's unavailable payment capability.
                    selected.add_api_route(route.path, without_payment(route.endpoint),
                        methods=list(route.methods), response_model=route.response_model,
                        status_code=route.status_code, tags=route.tags)
                else:
                    selected.routes.append(route)
        application.include_router(selected, dependencies=dependencies)

    @application.get("/orders", response_model=OrderPage,
                     dependencies=[Depends(buyer_order_access)])
    def buyer_orders(limit: int = Query(20, ge=1, le=100),
                     offset: int = Query(0, ge=0),
                     user: User = Depends(require_buyer), db: Session = Depends(get_db)):
        return list_orders(role="buyer", limit=limit, offset=offset, current_user=user, db=db)

    @application.middleware("http")
    async def private_headers(request, call_next):
        response = await call_next(request)
        if request.url.path.startswith(("/auth/", "/orders")):
            response.headers["Cache-Control"] = "no-store"
        return response

    @application.get("/health")
    def health():
        return {"status": "ok", "capabilities": {"buyer_orders": True, "payments": False}}

    return application


app = create_app()
