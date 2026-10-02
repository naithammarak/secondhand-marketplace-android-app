"""Final leg creation on A's existing Shipment and snapshot models."""
from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.orders import api_error, order_address, require_idempotency_key
from app.database import get_db
from app.models.order import Escrow
from app.models.shipment import Shipment
from app.models.user import User, UserRole
from app.schemas.finish import FulfillmentRequest
from app.services.finish_core import command, final_inputs, fresh_actor, history, locked_order, replay, shipments_locked
from app.services.fulfillment_guard import require_fulfillment_simulation
from app.services.transaction_clock import database_now

router = APIRouter(tags=["Fulfillment"])


@router.post("/orders/{order_id}/fulfillment", status_code=201)
def create_fulfillment(order_id: int, body: FulfillmentRequest, response: Response,
    actor: User = Depends(get_current_user), key: str = Depends(require_idempotency_key),
    db: Session = Depends(get_db)):
    require_fulfillment_simulation()
    order = locked_order(db, order_id)
    fresh_actor(db, actor.id, {UserRole.INSPECTOR})
    shipments = shipments_locked(db, order.id)
    work, decision, leg = final_inputs(db, order, shipments)
    if work.inspector_id != actor.id:
        raise api_error(404, "order_not_found", "Order not found")
    payload = body.model_dump()
    old = replay(db, order.id, f"USER:{actor.id}", "CREATE_FULFILLMENT", key, payload)
    if old:
        response.headers["Idempotent-Replayed"] = "true"
        return old.result
    escrow = db.scalar(select(Escrow).where(Escrow.order_id == order.id).with_for_update())
    if order.status != "RESULT_NOTIFIED" or escrow is None or escrow.status != "HELD":
        raise api_error(409, "invalid_state", "Final shipment cannot start now")
    if any(s.leg != "TO_CENTER" for s in shipments):
        raise api_error(409, "fulfillment_already_created", "Only one final direction is allowed")
    destination = order_address(order).model_dump() if leg == "TO_BUYER" else order.return_address
    if destination is None:
        raise api_error(409, "fulfillment_destination_missing", "Frozen return snapshot missing; audited repair required")
    at = database_now(db)
    row = Shipment(order_id=order.id, leg=leg, status="IN_TRANSIT", carrier=body.carrier,
        tracking_number=body.tracking_number, shipped_at=at, destination_address=destination)
    db.add(row)
    # Return dispatch retains RESULT_NOTIFIED; the leg identifies its progress.
    previous = order.status
    if leg == "TO_BUYER":
        order.status = "SHIPPING_TO_BUYER"
    db.flush()
    result = {"shipment": {"id": row.id, "leg": leg, "status": row.status,
        "carrier": row.carrier, "tracking_number": row.tracking_number}, "order_status": order.status}
    cmd = command(db, order.id, f"USER:{actor.id}", actor.id, "CREATE_FULFILLMENT", key,
                  payload, result, at, 201)
    history(db, order, cmd, previous, "FULFILLMENT_CREATED", "INSPECTOR", at)
    db.commit()
    return cmd.result
