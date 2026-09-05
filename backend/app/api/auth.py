import os
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
import jwt  # ใช้ PyJWT ที่มีอยู่ในโปรเจกต์

from app.core.database import get_db

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()

# ดึง Supabase JWT Secret จาก .env (หรือใส่ค่าจริงตรงนี้)
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "YOUR_SUPABASE_JWT_SECRET")

@router.post("/google")
async def google_login(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
):
    token = credentials.credentials
    try:
        # ถอดรหัสและตรวจสอบความถูกต้องของ Token ที่ส่งมาจาก Supabase
        payload = jwt.decode(
            token, 
            SUPABASE_JWT_SECRET, 
            algorithms=["HS256"], 
            options={"verify_aud": False}
        )

        # ดึงข้อมูลผู้ใช้จาก Token ของ Supabase
        user_email = payload.get("email")
        user_name = payload.get("user_metadata", {}).get("full_name", "")

        # TODO: นำ email ไปบันทึกหรือเช็คในฐานข้อมูล AsyncSession ของคุณตรงนี้

        return {
            "success": True,
            "message": "Supabase token verified successfully",
            "email": user_email,
            "name": user_name
        }

    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Supabase Token: {str(e)}"
        )