"""Integration interface proposal for A/task02 and B/tasks03-05.

There is intentionally no implementation returning simulated success. Bind this
protocol to order_settlement only after A supplies accepted models/mapping.
"""

from typing import Literal, Protocol

from sqlalchemy.orm import Session


class SettlementService(Protocol):
    def settle(self, db: Session, *, order_id: int,
               kind: Literal["RELEASE", "REFUND"],
               source: str, reason: str,
               actor_id: int | None, worker_name: str | None,
               idempotency_key: str,
               admin_reason: str | None = None,
               evidence_refs: tuple[str, ...] = ()) -> dict:
        """Caller-owned transaction; no implicit commit or cached authorization.

        Acquire Order -> Shipment -> Escrow -> Product; revalidate actor/replay,
        original paid Payment/Receipt, pricing/parties, proof and fresh DB clock.
        Receipt, resolution, settlement, history and replay are one transaction.
        HTTP/worker wrappers commit or roll back once. Return delivery commits
        first, then calls this interface in a distinct session/transaction.
        Exactly one of actor_id and a recognized worker_name is permitted.
        """
        ...
