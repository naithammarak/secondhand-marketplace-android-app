import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import jwt

from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import GoogleLoginRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])
security = HTTPBearer()


def get_jwt_issuer() -> str | None:
    issuer = os.getenv("SUPABASE_JWT_ISSUER")
    if issuer:
        return issuer.rstrip("/")
    supabase_url = os.getenv("SUPABASE_URL")
    if supabase_url:
        return f"{supabase_url.rstrip('/')}/auth/v1"
    project_ref = os.getenv("SUPABASE_PROJECT_REF")
    if project_ref:
        return f"https://{project_ref}.supabase.co/auth/v1"
    return None


SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_JWT_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
SUPABASE_JWT_ISSUER = get_jwt_issuer()
SUPABASE_JWT_ALGORITHM = os.getenv("SUPABASE_JWT_ALGORITHM", "HS256")


def verify_supabase_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    secret = SUPABASE_JWT_SECRET or os.getenv("SUPABASE_JWT_SECRET")
    if not secret or secret.strip() in {
        "YOUR_SUPABASE_JWT_SECRET",
        "your_supabase_jwt_secret",
        "YOUR_SECRET",
        "CHANGE_ME",
    }:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_JWT_SECRET is missing or using placeholder",
        )

    expected_iss = SUPABASE_JWT_ISSUER if SUPABASE_JWT_ISSUER is not None else get_jwt_issuer()
    if not expected_iss:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_JWT_ISSUER or SUPABASE_URL is missing",
        )

    expected_aud = (
        SUPABASE_JWT_AUDIENCE
        if SUPABASE_JWT_AUDIENCE is not None
        else os.getenv("SUPABASE_JWT_AUDIENCE")
    )
    if not expected_aud:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_JWT_AUDIENCE is missing",
        )

    algorithm = SUPABASE_JWT_ALGORITHM or os.getenv("SUPABASE_JWT_ALGORITHM", "HS256")
    if not algorithm:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_JWT_ALGORITHM is missing",
        )

    token = credentials.credentials
    try:
        decode_options = {
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": True,
            "verify_iss": True,
        }
        payload = jwt.decode(
            token,
            secret,
            algorithms=[algorithm],
            audience=expected_aud,
            issuer=expected_iss,
            options=decode_options,
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
        email = payload.get("email") or ""
        metadata = payload.get("user_metadata", {})
        full_name = metadata.get("full_name") or metadata.get("name") or (email.split("@")[0] if email else "User")

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
        try:
            db.commit()
            db.refresh(user)
        except IntegrityError:
            db.rollback()
            user = db.query(User).filter(User.supabase_user_id == supabase_uid).first()
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Database error during concurrent user creation",
                )

    return user


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user