"""Minimal application exposing the public read-only product catalog."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.catalog_only import router as catalog_router


def create_app() -> FastAPI:
    application = FastAPI(title="Public product catalog", version="1.0.0")
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
    )
    application.include_router(catalog_router)

    @application.get("/health")
    def health_check():
        return {"status": "ok"}

    return application


app = create_app()
