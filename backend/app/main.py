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
from fastapi import Depends, FastAPI, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from app.models.test_message import TestMessage


app = FastAPI(
    title="Project API",
    version="1.0.0",
)


class TestMessageCreate(BaseModel):
    message: str


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post(
    "/api/test-messages",
    status_code=status.HTTP_201_CREATED,
)
def create_test_message(
    payload: TestMessageCreate,
    db: Session = Depends(get_db),
):
    test_message = TestMessage(message=payload.message)

    db.add(test_message)
    db.commit()
    db.refresh(test_message)

    return {
        "id": test_message.id,
        "message": test_message.message,
    }
@app.get("/api/test-messages")
def list_test_messages(
    db: Session = Depends(get_db),
):
    test_messages = db.scalars(
        select(TestMessage).order_by(TestMessage.id)
    ).all()

    return [
        {
            "id": test_message.id,
            "message": test_message.message,
        }
        for test_message in test_messages
    ]
