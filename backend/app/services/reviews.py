from datetime import timezone
from decimal import Decimal, ROUND_HALF_UP
from sqlalchemy import case, func, select, true
from sqlalchemy.orm import Session

from app.api.orders import api_error, key_reused, request_fingerprint
from app.api.product_reads import latest_approval_status
from app.models.fulfillment import FulfillmentCommand, OrderSettlement
from app.models.order import Order, Escrow
from app.models.review import Review
from app.models.user import User, UserRole, UserStatus
from app.models.verification import Verification
from app.schemas.review import PrivateReview, ReviewCreate


def buyer_allowed(db, actor):
    if actor.status != UserStatus.ACTIVE:
        return False
    if actor.role == UserRole.BUYER:
        return True
    if actor.role == UserRole.SELLER:
        return db.scalar(select(Verification.verification_status).where(Verification.user_id == actor.id)
                         .order_by(Verification.created_at.desc(), Verification.id.desc()).limit(1)) == 'APPROVED'
    return False


def own_order(db, order_id, actor, *, lock=False):
    query = select(Order).where(Order.id == order_id, Order.buyer_id == actor.id).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    order = db.scalar(query)
    if order is None:
        raise api_error(404, 'order_not_found', 'Order not found')
    return order


def reviewable(db, order, actor):
    return (buyer_allowed(db, actor) and order.status == 'COMPLETED'
            and db.scalar(select(Escrow.id).where(Escrow.order_id == order.id, Escrow.status == 'RELEASED')) is not None
            and db.scalar(select(OrderSettlement.id).where(OrderSettlement.order_id == order.id, OrderSettlement.kind == 'RELEASE')) is not None)


def review_status(db, order_id, actor):
    order = own_order(db, order_id, actor)
    review = db.scalar(select(Review).where(Review.order_id == order.id))
    return {'order_id': order.id, 'can_review': review is None and reviewable(db, order, actor),
            'review': PrivateReview.model_validate(review) if review is not None else None}


def create_review(db: Session, order_id: int, actor: User, body: ReviewCreate, key: str):
    try:
        order = own_order(db, order_id, actor, lock=True)
        actor = db.scalar(select(User).where(User.id == actor.id).execution_options(populate_existing=True).with_for_update())
        if actor is None or actor.status != UserStatus.ACTIVE:
            raise api_error(403, 'account_inactive', 'Account inactive')
        if not buyer_allowed(db, actor):
            raise api_error(403, 'buyer_role_required', 'Buyer access required')
        fingerprint = request_fingerprint(body.model_dump())
        scope = f'USER:{actor.id}'
        previous = db.scalar(select(FulfillmentCommand).where(FulfillmentCommand.actor_scope == scope,
            FulfillmentCommand.action == 'CREATE_REVIEW', FulfillmentCommand.resource_type == 'ORDER',
            FulfillmentCommand.resource_id == order.id, FulfillmentCommand.idempotency_key == key))
        if previous is not None:
            if previous.request_hash != fingerprint:
                raise key_reused()
            result = previous.result
            db.rollback()
            return result, True
        if db.scalar(select(Review.id).where(Review.order_id == order.id)) is not None:
            raise api_error(409, 'review_already_exists', 'Order already reviewed')
        if not reviewable(db, order, actor):
            raise api_error(409, 'order_not_reviewable', 'Completed released Order required')
        review = Review(order_id=order.id, buyer_id=order.buyer_id, seller_id=order.seller_id,
                        product_id=order.product_id, rating=body.rating, comment=body.comment)
        db.add(review); db.flush(); db.refresh(review)
        result = PrivateReview.model_validate(review).model_dump(mode='json')
        db.add(FulfillmentCommand(actor_scope=scope, actor_id=actor.id, action='CREATE_REVIEW', resource_type='ORDER',
            resource_id=order.id, idempotency_key=key, request_hash=fingerprint, response_status=201, result=result))
        db.commit()
        return result, False
    except Exception:
        db.rollback()
        raise


def public_reviews(db, seller_id, limit, offset):
    # One SQL statement supplies eligibility, all-review aggregates and the page:
    # PostgreSQL READ COMMITTED gives them one consistent MVCC snapshot.
    seller = select(User.id.label('seller_id')).where(User.id == seller_id, User.role == UserRole.SELLER,
        User.status == UserStatus.ACTIVE, latest_approval_status() == 'APPROVED').subquery()
    metrics = select(func.count(Review.id).label('count'), func.avg(Review.rating).label('average'),
        *[func.coalesce(func.sum(case((Review.rating == n, 1), else_=0)), 0).label(f'star_{n}') for n in range(1,6)]
        ).where(Review.seller_id == seller_id).subquery()
    page = select(Review.id, Review.rating, Review.comment, Review.created_at, Order.product_name).join(Order, Order.id == Review.order_id
        ).where(Review.seller_id == seller_id).order_by(Review.created_at.desc(), Review.id.desc()).limit(limit).offset(offset).subquery()
    rows = db.execute(select(seller, metrics, page).select_from(seller.join(metrics, true()).outerjoin(page, true()))
                      .order_by(page.c.created_at.desc(), page.c.id.desc())).mappings().all()
    if not rows:
        raise api_error(404, 'seller_not_found', 'Seller not found')
    first = rows[0]
    summary = {'count': first['count'], 'average_rating': float(Decimal(str(first['average'])).quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)) if first['count'] else None,
               'distribution': {str(n): first[f'star_{n}'] for n in range(1,6)}}
    items = [{'id': row['id'], 'rating': row['rating'], 'comment': row['comment'],
              'created_at': row['created_at'].astimezone(timezone.utc).isoformat(),
              'reviewer_label': 'ผู้ซื้อที่ยืนยันการซื้อ', 'product_name': row['product_name']}
             for row in rows if row['id'] is not None]
    return {'seller_id': seller_id, 'summary': summary, 'items': items, 'total': first['count'], 'limit': limit, 'offset': offset}
