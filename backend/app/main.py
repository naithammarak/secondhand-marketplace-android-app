"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_orders import router as admin_orders_router
from app.api.admin_verifications import router as admin_verifications_router
from app.api.auth import router as auth_router
from app.api.product_uploads import router as product_uploads_router
from app.api.product_reads import router as product_reads_router
from app.api.products import router as products_router
from app.api.orders import router as orders_router
from app.api.return_addresses import router as return_address_router
from app.api.inspections import router as inspections_router
from app.api.fulfillment import router as fulfillment_router
from app.api.finish import router as finish_router
from app.api.verifications import router as verifications_router
from app.services.certificate_urls import public_certificate_base_url


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Fail at startup before a positive inspection can commit without a usable URL.
    public_certificate_base_url()
    yield


app = FastAPI(
    title="Project API",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def sensitive_result_headers(request: Request, call_next):
    """Keep private results and public token lookups out of shared caches."""
    path = request.scope["path"]
    root_path = request.scope.get("root_path", "").rstrip("/")
    if root_path and path.startswith(root_path + "/"):
        path = path[len(root_path):]
    parts = path.strip("/").split("/")
    private = (len(parts) in {3, 4} and parts[0] == "orders" and parts[2] == "inspection"
               and (len(parts) == 3 or parts[3] == "decision"))
    certificate = len(parts) in {2, 3} and parts[0] == "certificates"
    response = await call_next(request)
    private = private or (len(parts) == 3 and parts[0] == "orders" and parts[2] == "return-address")
    private = private or (parts[0] in {"courier", "shipment-delivery-proofs"} or
        parts[:2] in [["admin", "delivery-cases"], ["admin", "inspection-overdue"]] or
        (len(parts) >= 3 and parts[0] == "orders" and parts[2] in {
            "delivery", "history", "fulfillment", "confirm-receipt", "report-not-received"}) or
        (len(parts) >= 4 and parts[:2] == ["admin", "orders"] and parts[3] in {
            "delivery-review", "resolve-delivery", "delivery-proofs"}))
    if private or certificate:
        response.headers["Cache-Control"] = "no-store"
    if certificate:
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Robots-Tag"] = "noindex"
    return response

# Allow the Expo mobile app to call the API during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers.
app.include_router(auth_router)
# PRODUCT-02: เปิด API อัปโหลดรูปก่อนสร้างสินค้าใน /docs
app.include_router(product_uploads_router)
app.include_router(products_router)
app.include_router(product_reads_router)
app.include_router(verifications_router)
app.include_router(admin_verifications_router)
app.include_router(orders_router)
app.include_router(return_address_router)
app.include_router(inspections_router)
app.include_router(fulfillment_router)
app.include_router(finish_router)
# ORDER-09: มุมมอง Order ของผู้ดูแล (ปิดบังข้อมูลส่วนบุคคลเป็นค่าตั้งต้น)
app.include_router(admin_orders_router)


@app.get("/health")
def health_check():
    """Report that the API process is running."""
    return {"status": "ok"}
