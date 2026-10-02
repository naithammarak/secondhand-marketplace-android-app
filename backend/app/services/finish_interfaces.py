"""Caller-owned transaction interface implemented by OrderSettlementService."""

from typing import TYPE_CHECKING, Literal, Protocol
from datetime import datetime
from collections.abc import Callable

if TYPE_CHECKING:
    from app.services.order_settlement import SettlementOutcome

from sqlalchemy.orm import Session


class SettlementService(Protocol):
    def settle(self, db: Session, *, order_id: int,
               kind: Literal["RELEASE", "REFUND"],
               source: str, reason: str,
               actor_id: int | None, worker_name: str | None,
               idempotency_key: str,
               admin_reason: str | None = None,
               evidence_refs: tuple[str, ...] = (),
               clock: Callable[[], datetime] | None = None,
               dry_run: bool = False) -> "SettlementOutcome":
        """Caller-owned transaction; no implicit commit or cached authorization.

        Acquire Order -> Shipment -> Escrow -> Product; revalidate actor/replay,
        original paid Payment/Receipt, pricing/parties, proof and fresh DB clock.
        Receipt, resolution, settlement, history and replay are one transaction.
        HTTP/worker wrappers commit or roll back once. Return delivery commits
        first, then calls this interface in a distinct session/transaction.
        Exactly one of actor_id and a recognized worker_name is permitted.
        """
        ...
