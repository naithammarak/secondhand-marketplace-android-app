import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import jwt

from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import GoogleLoginRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")


def verify_supabase_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_JWT_SECRET is missing",
        )

    token = credentials.credentials
    try:
        # ตรวจสอบ signature และ claims พื้นฐาน
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False,  # หากต้องการตรวจ aud ให้ระบุ audience="authenticated"
            },
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}",
        )


def get_current_user(
    payload: dict = Depends(verify_supabase_token),
    db: Session = Depends(get_db),
) -> User:
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )

    try:
        supabase_uid = uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user ID format in token",
        )

    user = db.query(User).filter(User.supabase_user_id == supabase_uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found in system. Please perform initial login.",
        )
    return user


@router.post("/google", response_model=UserResponse)
def google_login(
    body: GoogleLoginRequest = GoogleLoginRequest(),
    payload: dict = Depends(verify_supabase_token),
    db: Session = Depends(get_db),
):
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload missing sub",
        )

    try:
        supabase_uid = uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid UUID format",
        )

    user = db.query(User).filter(User.supabase_user_id == supabase_uid).first()

    if not user:
        # ดึงข้อมูลจาก claims ของ Supabase
        email = payload.get("email") or ""
        metadata = payload.get("user_metadata", {})
        full_name = metadata.get("full_name") or metadata.get("name") or email.split("@")[0]

        assigned_role = None
        if body.role:
            assigned_role = UserRole(body.role.value)

        user = User(
            supabase_user_id=supabase_uid,
            full_name=full_name,
            email=email,
            role=assigned_role,
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    return user


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user