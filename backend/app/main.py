"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.admin_orders import router as admin_orders_router
from app.api.admin_certificates import router as admin_certificates_router
from app.api.admin_verifications import router as admin_verifications_router
from app.api.auth import router as auth_router
from app.api.profile import router as profile_router
from app.api.reviews import router as reviews_router
from app.api.product_uploads import router as product_uploads_router
from app.api.product_reads import router as product_reads_router
from app.api.products import router as products_router
from app.api.orders import router as orders_router
from app.api.return_addresses import router as return_address_router
from app.api.inspections import router as inspections_router
from app.api.fulfillment import router as fulfillment_router
from app.api.finish import router as finish_router
from app.api.external_shipping import router as external_shipping_router
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


@app.exception_handler(RequestValidationError)
async def safe_validation_error(request: Request, exc: RequestValidationError):
    # Untrusted input (including escaped lone surrogates) must not be echoed
    # into an error response. Keep the usual location/type/message envelope.
    errors = [{key: error[key] for key in ("loc", "msg", "type") if key in error}
              for error in exc.errors()]
    safe = jsonable_encoder(errors)
    # Field names/locations and validation messages can also contain input.
    def sanitize(value):
        if isinstance(value, str):
            return value.encode("utf-8", errors="replace").decode("utf-8")
        if isinstance(value, list):
            return [sanitize(item) for item in value]
        if isinstance(value, dict):
            return {sanitize(key): sanitize(item) for key, item in value.items()}
        return value
    return JSONResponse(status_code=422, content={"detail": sanitize(safe)})


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
    admin_certificate = len(parts) >= 2 and parts[:2] == ["admin", "certificates"]
    response = await call_next(request)
    private = private or (len(parts) == 3 and parts[0] == "orders" and parts[2] == "return-address")
    private = private or (parts[0] in {"courier", "shipment-delivery-proofs"} or
        parts[:2] in [["admin", "delivery-cases"], ["admin", "inspection-overdue"]] or
        (len(parts) >= 3 and parts[0] == "orders" and parts[2] in {
            "delivery", "history", "fulfillment", "confirm-receipt", "report-not-received", "confirm-return"}) or
        (len(parts) >= 4 and parts[:2] == ["admin", "orders"] and parts[3] in {
            "delivery-review", "resolve-delivery", "delivery-proofs", "return-review", "confirm-return"}))
    private = private or parts[:2] == ["admin", "shipments"]
    private = private or parts[0] == "profile"
    private = private or (len(parts) == 3 and parts[0] == "orders" and parts[2] == "review")
    if private or certificate or admin_certificate:
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
app.include_router(profile_router)
app.include_router(reviews_router)
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
app.include_router(external_shipping_router)
# ORDER-09: มุมมอง Order ของผู้ดูแล (ปิดบังข้อมูลส่วนบุคคลเป็นค่าตั้งต้น)
app.include_router(admin_orders_router)
app.include_router(admin_certificates_router)


@app.get("/health")
def health_check():
    """Report that the API process is running."""
    return {"status": "ok"}
