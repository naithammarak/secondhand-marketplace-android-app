"""Private seller return destination. Historical missing addresses are never guessed."""
from fastapi import APIRouter, Depends, Request, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.orders import (api_error, clean_address, key_reused, load_order_for,
                            request_fingerprint, require_idempotency_key, validation_error)
from app.database import get_db
from app.models.fulfillment import FulfillmentCommand
from app.models.shipment import Shipment
from app.models.user import User, UserRole, UserStatus
from app.schemas.order import ShippingAddressInput
from app.services.transaction_clock import database_now
from app.services.fulfillment_guard import require_fulfillment_simulation

router = APIRouter(prefix="/orders", tags=["Return address"])


async def parse_address(request: Request) -> ShippingAddressInput:
    try:
        return ShippingAddressInput.model_validate(await request.json())
    except (ValidationError, ValueError, TypeError):
        raise validation_error({"return_address": "Only the seven shipping address fields are allowed"})


def seller_order(db, order_id, actor, *, lock=False):
    order, role = load_order_for(db, order_id, actor, lock=lock)
    # Populate from current authorization even on replay; Order is acquired first.
    fresh = db.scalar(select(User).where(User.id == actor.id).execution_options(populate_existing=True).with_for_update()) if lock else actor
    if fresh is None or fresh.status != UserStatus.ACTIVE:
        raise api_error(403, "account_inactive", "Account inactive")
    if fresh.role != UserRole.SELLER or role.value != "seller":
        raise api_error(403, "seller_role_required", "Order seller required")
    return order


@router.get("/{order_id}/return-address")
def get_return_address(order_id: int, response: Response, actor: User = Depends(get_current_user), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    order = seller_order(db, order_id, actor)
    frozen = db.scalar(select(Shipment.id).where(Shipment.order_id == order.id).limit(1)) is not None
    return {"order_id": order.id, "return_address": order.return_address, "saved_at": order.return_address_saved_at, "frozen": frozen}


@router.put("/{order_id}/return-address")
def save_return_address(order_id: int, response: Response, body: ShippingAddressInput = Depends(parse_address), actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key), _enabled: None = Depends(require_fulfillment_simulation), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    try:
        order = seller_order(db, order_id, actor, lock=True)
        address, errors = clean_address(body)
        if errors:
            raise validation_error(errors)
        value = address.model_dump()
        fingerprint = request_fingerprint(value)
        scope = f"USER:{actor.id}"
        previous = db.scalar(select(FulfillmentCommand).where(
            FulfillmentCommand.actor_scope == scope, FulfillmentCommand.action == "SAVE_RETURN_ADDRESS",
            FulfillmentCommand.resource_type == "ORDER", FulfillmentCommand.resource_id == order.id,
            FulfillmentCommand.idempotency_key == key))
        if previous is not None:
            if previous.request_hash != fingerprint:
                raise key_reused()
            response.headers["Idempotent-Replayed"] = "true"
            result = previous.result
            db.rollback()
            return result
        shipment = db.scalar(select(Shipment).where(Shipment.order_id == order.id).order_by(Shipment.id).with_for_update())
        if shipment is not None:
            raise api_error(409, "return_address_locked", "Shipment has started; return destination is frozen")
        if order.status != "WAITING_SELLER_SHIP" or order.paid_at is None:
            raise api_error(409, "invalid_state", "A paid unshipped Order is required")
        if order.return_address != value:
            order.return_address = value
            order.return_address_saved_at = database_now(db)
        result = {"order_id": order.id, "return_address": value, "saved_at": order.return_address_saved_at.isoformat()}
        db.add(FulfillmentCommand(actor_scope=scope, actor_id=actor.id, action="SAVE_RETURN_ADDRESS", resource_type="ORDER", resource_id=order.id, idempotency_key=key, request_hash=fingerprint, response_status=200, result=result))
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
