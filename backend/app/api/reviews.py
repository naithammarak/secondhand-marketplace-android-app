from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.api.auth import get_current_user
from app.api.orders import require_idempotency_key, validation_error
from app.database import get_db
from app.models.user import User
from app.schemas.review import ReviewCreate
from app.services.reviews import create_review, public_reviews, review_status

router = APIRouter(tags=['Seller reviews'])


async def parse_review(request: Request):
    try:
        return ReviewCreate.model_validate(await request.json())
    except (ValidationError, ValueError, TypeError):
        raise validation_error({'review': 'Only integer rating 1-5 and optional comment up to 1000 characters are allowed'})


@router.get('/orders/{order_id}/review')
def get_order_review(order_id: int, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return review_status(db, order_id, actor)


@router.post('/orders/{order_id}/review', status_code=201)
def post_order_review(order_id: int, response: Response, body: ReviewCreate = Depends(parse_review),
    key: str = Depends(require_idempotency_key), actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result, replayed = create_review(db, order_id, actor, body, key)
    if replayed:
        response.headers['Idempotent-Replayed'] = 'true'
    return result


@router.get('/sellers/{seller_id}/reviews')
def get_seller_reviews(seller_id: int, response: Response, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), db: Session = Depends(get_db)):
    response.headers['Cache-Control'] = 'no-store'
    return public_reviews(db, seller_id, limit, offset)
