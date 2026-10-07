"""FINISH foundation only: durable replay, evidence binding and terminal records.

Business transitions belong to downstream services. All amounts are simulated.
"""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint,
                        Integer, JSON, String, UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.order import MONEY, ORDER_STATUSES, _in_list


class FulfillmentCommand(Base):
    __tablename__ = "fulfillment_commands"
    __table_args__ = (
        UniqueConstraint("actor_scope", "action", "resource_type", "resource_id", "idempotency_key", name="uq_fulfillment_command_scope"),
        CheckConstraint("length(actor_scope) BETWEEN 1 AND 100 AND length(action) BETWEEN 1 AND 50 AND resource_id > 0", name="ck_commands_scope"),
        CheckConstraint("length(idempotency_key) BETWEEN 8 AND 100 AND length(request_hash) = 64", name="ck_commands_fingerprint"),
        CheckConstraint("response_status BETWEEN 200 AND 299", name="ck_commands_response"),
        CheckConstraint("json_typeof(result) = 'object'", name="ck_commands_result_object").ddl_if(dialect="postgresql"),
        CheckConstraint("(actor_id IS NOT NULL AND actor_scope = 'USER:' || cast(actor_id AS varchar)) OR (actor_id IS NULL AND actor_scope LIKE 'SYSTEM:%' AND length(actor_scope) > 7)", name="ck_commands_actor"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_scope: Mapped[str] = mapped_column(String(100), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False)
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class OrderSettlement(Base):
    __tablename__ = "order_settlements"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_settlements_order"),
        UniqueConstraint("id", "order_id", "kind", name="uq_settlements_resolution_tuple"),
        UniqueConstraint("escrow_id", name="uq_settlements_escrow"),
        UniqueConstraint("command_id", name="uq_settlements_command"),
        ForeignKeyConstraint(["escrow_id", "order_id", "payment_id", "held_amount"], ["escrows.id", "escrows.order_id", "escrows.payment_id", "escrows.amount"], name="fk_settlements_escrow_tuple", ondelete="RESTRICT"),
        ForeignKeyConstraint(["payment_id", "order_id", "held_amount"], ["payments.id", "payments.order_id", "payments.amount"], name="fk_settlements_payment_tuple", ondelete="RESTRICT"),
        ForeignKeyConstraint(["order_id", "held_amount", "currency"], ["orders.id", "orders.total_amount", "orders.currency"], name="fk_settlements_order_money", ondelete="RESTRICT"),
        ForeignKeyConstraint(["order_id", "seller_id", "buyer_id"], ["orders.id", "orders.seller_id", "orders.buyer_id"], name="fk_settlements_order_parties", ondelete="RESTRICT"),
        CheckConstraint("held_amount > 0 AND seller_payout >= 0 AND buyer_refund >= 0 AND commission_amount >= 0 AND inspection_amount >= 0 AND shipping_amount >= 0", name="ck_settlements_nonnegative"),
        CheckConstraint("(kind = 'RELEASE' AND buyer_refund = 0 AND held_amount = seller_payout + commission_amount + inspection_amount + shipping_amount) OR (kind = 'REFUND' AND seller_payout = 0 AND commission_amount = 0 AND held_amount = buyer_refund + inspection_amount + shipping_amount AND ((fulfillment_policy = 'EXTERNAL_V2' AND source = 'RETURN_DELIVERY' AND reason IN ('BUYER_REJECTED_INSPECTION','RESULT_DECISION_TIMEOUT')) OR (buyer_refund = held_amount AND inspection_amount = 0 AND shipping_amount = 0)))", name="ck_settlements_allocation"),
        CheckConstraint("(kind = 'RELEASE' AND ((source = 'BUYER_RECEIPT' AND reason = 'RECEIPT_CONFIRMED') OR (source = 'AUTO_RECEIPT' AND reason = 'RECEIPT_TIMEOUT') OR (source = 'ADMIN_RESOLUTION' AND reason = 'DELIVERY_REVIEW_RELEASE'))) OR (kind = 'REFUND' AND ((source = 'RETURN_DELIVERY' AND reason IN ('BUYER_REJECTED_INSPECTION','RESULT_DECISION_TIMEOUT','INSPECTION_NOT_AS_DESCRIBED','INSPECTION_FAKE')) OR (source = 'SELLER_NO_SHIP' AND reason = 'SELLER_NO_SHIP') OR (source = 'ADMIN_RESOLUTION' AND reason = 'DELIVERY_REVIEW_REFUND')))", name="ck_settlements_codes"),
    )
    fulfillment_policy: Mapped[str] = mapped_column(String(24), nullable=False, server_default="LEGACY_V1")
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, nullable=False)
    escrow_id: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_id: Mapped[int] = mapped_column(Integer, nullable=False)
    seller_id: Mapped[int] = mapped_column(Integer, nullable=False)
    buyer_id: Mapped[int] = mapped_column(Integer, nullable=False)
    command_id: Mapped[int] = mapped_column(ForeignKey("fulfillment_commands.id", ondelete="RESTRICT"), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    reason: Mapped[str] = mapped_column(String(40), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    held_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    seller_payout: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    buyer_refund: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    commission_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    inspection_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    shipping_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    settled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ShipmentConfirmedProof(Base):
    __tablename__ = "shipment_confirmed_proofs"
    __table_args__ = (
        ForeignKeyConstraint(["proof_id", "shipment_id", "courier_id"], ["shipment_delivery_proofs.id", "shipment_delivery_proofs.shipment_id", "shipment_delivery_proofs.uploaded_by"], name="fk_confirmed_proof_tuple", ondelete="RESTRICT"),
        ForeignKeyConstraint(["shipment_id", "courier_id"], ["shipments.id", "shipments.courier_id"], name="fk_confirmed_proof_courier", ondelete="RESTRICT"),
        ForeignKeyConstraint(["shipment_id", "confirmed_at"], ["shipments.id", "shipments.courier_delivered_at"], name="fk_confirmed_proof_time", ondelete="RESTRICT"),
    )
    proof_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    shipment_id: Mapped[int] = mapped_column(Integer, nullable=False)
    courier_id: Mapped[int] = mapped_column(Integer, nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"
    __table_args__ = (
        UniqueConstraint("command_id", "event", name="uq_history_command_event"),
        CheckConstraint(_in_list("from_status", ORDER_STATUSES), name="ck_history_from_status"),
        CheckConstraint(_in_list("to_status", ORDER_STATUSES), name="ck_history_to_status"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    command_id: Mapped[int] = mapped_column(ForeignKey("fulfillment_commands.id", ondelete="RESTRICT"), nullable=False)
    from_status: Mapped[str] = mapped_column(String(32), nullable=False)
    to_status: Mapped[str] = mapped_column(String(32), nullable=False)
    event: Mapped[str] = mapped_column(String(50), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DeliveryResolution(Base):
    __tablename__ = "delivery_resolutions"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_delivery_resolution_order"),
        ForeignKeyConstraint(["settlement_id", "order_id", "kind"], ["order_settlements.id", "order_settlements.order_id", "order_settlements.kind"], name="fk_resolution_settlement_tuple", ondelete="RESTRICT"),
        UniqueConstraint("settlement_id", name="uq_delivery_resolution_settlement"),
        CheckConstraint("kind IN ('RELEASE','REFUND') AND length(trim(reason)) BETWEEN 10 AND 2000", name="ck_resolution_reason"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    settlement_id: Mapped[int] = mapped_column(ForeignKey("order_settlements.id", ondelete="RESTRICT"), nullable=False)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    reason: Mapped[str] = mapped_column(String(2000), nullable=False)
    evidence_references: Mapped[list] = mapped_column(JSON, nullable=False)
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DeliveryEvidenceAccess(Base):
    __tablename__ = "delivery_evidence_access"
    __table_args__ = (CheckConstraint("length(trim(reason)) BETWEEN 10 AND 2000", name="ck_evidence_access_reason"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    reason: Mapped[str] = mapped_column(String(2000), nullable=False)
    accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ShippingEvent(Base):
    """Trusted explicitly simulated transport fact, distinct from physical receipt."""
    __tablename__ = "shipping_events"
    __table_args__ = (
        UniqueConstraint("source", "event_id", name="uq_shipping_event_identity"),
        UniqueConstraint("shipment_id", name="uq_shipping_event_delivered"),
        UniqueConstraint("command_id", name="uq_shipping_event_command"),
        ForeignKeyConstraint(["shipment_id", "order_id", "leg"], ["shipments.id", "shipments.order_id", "shipments.leg"], name="fk_shipping_event_shipment", ondelete="RESTRICT"),
        CheckConstraint("source = 'ADMIN_DEMO' AND event = 'DELIVERED' AND length(event_id) BETWEEN 8 AND 100", name="ck_shipping_event_source"),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, nullable=False)
    shipment_id: Mapped[int] = mapped_column(Integer, nullable=False)
    leg: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    event: Mapped[str] = mapped_column(String(16), nullable=False)
    event_id: Mapped[str] = mapped_column(String(100), nullable=False)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    command_id: Mapped[int] = mapped_column(ForeignKey("fulfillment_commands.id", ondelete="RESTRICT"), nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
