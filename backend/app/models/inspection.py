"""Inspection work, private evidence and successful request replay storage."""

from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index,
    Integer, JSON, PrimaryKeyConstraint, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Inspection(Base):
    __tablename__ = "inspections"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_inspections_order_id"),
        UniqueConstraint("id", "order_id", name="uq_inspections_id_order_id"),
        UniqueConstraint("id", "order_id", "result", name="uq_inspections_id_order_result"),
        CheckConstraint("(inspector_id IS NULL AND started_at IS NULL) OR (inspector_id IS NOT NULL AND started_at IS NOT NULL)", name="ck_inspections_assignment"),
        CheckConstraint("result IS NULL OR result IN ('PASS', 'MINOR_ISSUE', 'NOT_AS_DESCRIBED', 'FAKE')", name="ck_inspections_result"),
        CheckConstraint("(result IS NULL AND summary IS NULL AND inspected_at IS NULL) OR (result IS NOT NULL AND summary IS NOT NULL AND inspected_at IS NOT NULL AND inspector_id IS NOT NULL AND started_at IS NOT NULL AND inspected_at >= started_at AND length(summary) BETWEEN 10 AND 2000 AND summary = trim(summary))", name="ck_inspections_final_result"),
        Index("ix_inspections_inspector_created", "inspector_id", "created_at", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    inspector_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[str | None] = mapped_column(String(32))
    summary: Mapped[str | None] = mapped_column(String(2000))
    inspected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class InspectionEvidence(Base):
    __tablename__ = "inspection_evidence"
    __table_args__ = (
        UniqueConstraint("object_key", name="uq_inspection_evidence_object_key"),
        UniqueConstraint("id", "inspection_id", name="uq_inspection_evidence_id_inspection_id"),
        CheckConstraint("mime_type IN ('image/jpeg', 'image/png', 'image/webp')", name="ck_inspection_evidence_mime_type"),
        CheckConstraint("size_bytes BETWEEN 1 AND 5242880", name="ck_inspection_evidence_size_bytes"),
        CheckConstraint("length(sha256) = 64 AND sha256 !~ '[^0-9a-f]'", name="ck_inspection_evidence_sha256").ddl_if(dialect="postgresql"),
        CheckConstraint("length(object_key) BETWEEN 1 AND 500 AND object_key = trim(object_key)", name="ck_inspection_evidence_object_key"),
        Index("ix_inspection_evidence_inspection_id", "inspection_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    inspection_id: Mapped[int] = mapped_column(Integer, ForeignKey("inspections.id", ondelete="RESTRICT"), nullable=False)
    object_key: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(32), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class InspectionResultEvidence(Base):
    __tablename__ = "inspection_result_evidence"
    __table_args__ = (
        PrimaryKeyConstraint("inspection_id", "evidence_id", name="pk_inspection_result_evidence"),
        ForeignKeyConstraint(["inspection_id"], ["inspections.id"], ondelete="RESTRICT", name="fk_inspection_result_evidence_inspection"),
        ForeignKeyConstraint(["evidence_id", "inspection_id"], ["inspection_evidence.id", "inspection_evidence.inspection_id"], ondelete="RESTRICT", name="fk_inspection_result_evidence_same_inspection"),
    )

    inspection_id: Mapped[int] = mapped_column(Integer, nullable=False)
    evidence_id: Mapped[int] = mapped_column(Integer, nullable=False)


class InspectionIdempotency(Base):
    __tablename__ = "inspection_idempotency"
    __table_args__ = (
        UniqueConstraint("order_id", "actor_id", "operation", "idempotency_key", name="uq_inspection_idempotency_scope"),
        CheckConstraint("length(idempotency_key) BETWEEN 8 AND 100 AND idempotency_key !~ '[^A-Za-z0-9_-]'", name="ck_inspection_idempotency_key").ddl_if(dialect="postgresql"),
        CheckConstraint("length(request_hash) = 64 AND request_hash !~ '[^0-9a-f]'", name="ck_inspection_idempotency_request_hash").ddl_if(dialect="postgresql"),
        CheckConstraint("response_status BETWEEN 200 AND 299", name="ck_inspection_idempotency_response_status"),
        CheckConstraint("length(operation) BETWEEN 1 AND 50 AND operation = trim(operation)", name="ck_inspection_idempotency_operation"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id", ondelete="RESTRICT"), nullable=False)
    actor_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    operation: Mapped[str] = mapped_column(String(50), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response_status: Mapped[int] = mapped_column(Integer, nullable=False)
    response_body: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
