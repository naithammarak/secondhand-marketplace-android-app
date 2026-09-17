"""FastAPI application entry point."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.product_images import router as product_images_router


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
# PRODUCT-02: เปิด API อัปโหลดรูปสินค้าใน /docs
app.include_router(product_images_router)


@app.get("/health")
def health_check():
    """Report that the API process is running."""
    return {"status": "ok"}
