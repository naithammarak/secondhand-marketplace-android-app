import os
import uuid
from functools import lru_cache
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import jwt

from app.database import get_db
from app.models.user import User, UserRole, UserStatus
from app.schemas.auth import GoogleLoginRequest, SetRoleRequest, UserResponse

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
SUPABASE_JWT_ALGORITHM = os.getenv("SUPABASE_JWT_ALGORITHM")
SUPPORTED_JWT_ALGORITHMS = {"HS256", "ES256", "RS256"}
# เผื่อเวลาเครื่องกับ Supabase ต่างกันเล็กน้อยระหว่างตรวจ token
JWT_CLOCK_SKEW_SECONDS = 30


@lru_cache(maxsize=4)
def get_jwks_client(issuer: str) -> jwt.PyJWKClient:
    """Reuse Supabase's public signing keys for asymmetric access tokens."""
    return jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json", timeout=5)


def verify_supabase_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
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

    configured_algorithm = SUPABASE_JWT_ALGORITHM or os.getenv("SUPABASE_JWT_ALGORITHM")
    if configured_algorithm and configured_algorithm not in SUPPORTED_JWT_ALGORITHMS:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_JWT_ALGORITHM is unsupported",
        )

    secret = SUPABASE_JWT_SECRET or os.getenv("SUPABASE_JWT_SECRET")
    if configured_algorithm == "HS256" and (
        not secret or secret.strip() in {
            "YOUR_SUPABASE_JWT_SECRET",
            "your_supabase_jwt_secret",
            "YOUR_SECRET",
            "CHANGE_ME",
        }
    ):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: SUPABASE_JWT_SECRET is missing or using placeholder",
        )

    token = credentials.credentials
    try:
        # เลือกคีย์จากแหล่งที่เชื่อถือได้ แล้วตรวจลายเซ็นและ claims ทุกครั้ง
        algorithm = jwt.get_unverified_header(token).get("alg")
        if algorithm not in SUPPORTED_JWT_ALGORITHMS or (
            configured_algorithm and algorithm != configured_algorithm
        ):
            raise jwt.InvalidAlgorithmError("The specified alg value is not allowed")
        if algorithm == "HS256":
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
            signing_key = secret
        else:
            signing_key = get_jwks_client(expected_iss).get_signing_key_from_jwt(token).key

        decode_options = {
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": True,
            "verify_iss": True,
        }
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["HS256"] if algorithm == "HS256" else ["ES256", "RS256"],
            audience=expected_aud,
            issuer=expected_iss,
            options=decode_options,
            leeway=JWT_CLOCK_SKEW_SECONDS,
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

        user = User(
            supabase_user_id=supabase_uid,
            full_name=full_name,
            email=email,
            # The legacy request field never grants permissions. Approval is the
            # only self-service path from a customer account to a seller.
            role=UserRole.BUYER,
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

    if user.role is None:
        db.execute(update(User).where(User.id == user.id, User.role.is_(None))
                   .values(role=UserRole.BUYER))
        db.commit()
        db.refresh(user)
    return user


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/role", response_model=UserResponse)
def set_role(
    body: SetRoleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Compatibility for old clients; seller selection is permanently closed."""
    if current_user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="Account is not active")
    if body.role.value != UserRole.BUYER.value:
        raise HTTPException(status_code=409, detail={"code": "role_selection_closed"})
    selected_role = UserRole(body.role.value)
    result = db.execute(
        update(User)
        .where(
            User.id == current_user.id,
            User.role.is_(None),
            User.status == UserStatus.ACTIVE,
        )
        .values(role=selected_role)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 1:
        db.commit()
        db.refresh(current_user)
        return current_user

    db.rollback()
    db.refresh(current_user)
    if current_user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active",
        )
    if current_user.role == selected_role:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "role_selection_closed"},
    )
