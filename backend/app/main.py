"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.admin_verifications import router as admin_verifications_router
from app.api.auth import router as auth_router
from app.api.product_uploads import router as product_uploads_router
from app.api.product_reads import router as product_reads_router
from app.api.products import router as products_router
from app.api.orders import router as orders_router
from app.api.inspections import router as inspections_router
from app.api.verifications import router as verifications_router


app = FastAPI(
    title="Project API",
    version="1.0.0",
)

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
app.include_router(inspections_router)


@app.get("/health")
def health_check():
    """Report that the API process is running."""
    return {"status": "ok"}
