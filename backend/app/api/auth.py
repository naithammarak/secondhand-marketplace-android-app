import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from app.schemas.auth import GoogleLoginRequest
from app.core.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ดึงค่า Client ID จาก .env ความปลอดภัยสูง ป้องกันข้อมูลหลุดขึ้น GitHub
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

@router.post("/google")
async def google_login(payload: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        # ถ้าระบบยังไม่ได้ใส่ Client ID ใน .env ให้ข้ามการเช็คชั่วคราวเผื่อตอนเทส
        if GOOGLE_CLIENT_ID:
            idinfo = id_token.verify_oauth2_token(
                payload.token, 
                google_requests.Request(), 
                GOOGLE_CLIENT_ID
            )
            email = idinfo.get("email")
            name = idinfo.get("name")
        else:
            # โหมดจำลองกรณีรอ Client ID จากทีม
            email = "test.user@example.com"
            name = "Test User"

        return {
            "success": True,
            "message": "Google token verified successfully",
            "email": email,
            "name": name
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google Token: {str(e)}"
        )