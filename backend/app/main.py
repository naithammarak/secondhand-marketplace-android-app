from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.auth import router as auth_router
app = FastAPI(
    title="Project API",
    version="1.0.0",
)

# เพิ่มตัวนี้เข้าไปเพื่อให้แอป Android ยิง API เข้ามาได้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ลงทะเบียน auth router เข้ากับแอปหลัก
app.include_router(auth_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}