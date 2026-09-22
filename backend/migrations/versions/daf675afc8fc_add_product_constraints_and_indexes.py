"""add product constraints and indexes

Revision ID: daf675afc8fc
Revises: f3862bffea77
Create Date: 2026-09-20 13:31:13.936035

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "daf675afc8fc"
down_revision: Union[str, Sequence[str], None] = "f3862bffea77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    bind = op.get_bind()

    # 1. Normalize known aliases with matching meanings:
    op.execute(
        """
        UPDATE products
        SET sale_type = 'FIXED_PRICE'
        WHERE sale_type IN ('FIXED_PRICE', 'fixed_price', 'ราคาคงที่');
        """
    )

    op.execute(
        """
        UPDATE products
        SET condition = CASE
            WHEN condition IN ('NEW', 'new', 'ใหม่', 'ของใหม่') THEN 'NEW'
            WHEN condition IN ('LIKE_NEW', 'like_new', 'เหมือนใหม่', 'สภาพเหมือนใหม่') THEN 'LIKE_NEW'
            WHEN condition IN ('GOOD', 'good', 'ดี', 'สภาพดี') THEN 'GOOD'
            WHEN condition IN ('FAIR', 'fair', 'พอใช้', 'สภาพพอใช้', 'มีตำหนิ') THEN 'FAIR'
            ELSE condition
        END
        WHERE condition IS NOT NULL;
        """
    )

    op.execute(
        """
        UPDATE products
        SET status = CASE
            WHEN status IN ('AVAILABLE', 'available', 'พร้อมขาย') THEN 'AVAILABLE'
            WHEN status IN ('RESERVED', 'reserved', 'จองแล้ว', 'ติดจอง') THEN 'RESERVED'
            WHEN status IN ('SOLD', 'sold', 'ขายแล้ว') THEN 'SOLD'
            WHEN status IN ('CANCELLED', 'cancelled', 'CANCELED', 'canceled', 'ยกเลิก') THEN 'CANCELLED'
            ELSE status
        END
        WHERE status IS NOT NULL;
        """
    )

    # 2. Stop migration if unmapped sale_type (e.g. AUCTION) or NULL is present
    unmapped_sale_type_rows = bind.execute(
        sa.text(
            """
            SELECT id, sale_type
            FROM products
            WHERE sale_type != 'FIXED_PRICE' OR sale_type IS NULL
            ORDER BY id
            """
        )
    ).all()

    if unmapped_sale_type_rows:
        sample = ", ".join(f"id={row[0]} (sale_type={row[1]!r})" for row in unmapped_sale_type_rows[:10])
        total = len(unmapped_sale_type_rows)
        more = f" and {total - 10} more" if total > 10 else ""
        raise RuntimeError(
            f"Migration daf675afc8fc aborted: found {total} product(s) with unmapped/unsupported sale_type ({sample}{more}). "
            f"sale_type must be 'FIXED_PRICE'. Auction or unmapped products must not be automatically converted to 'FIXED_PRICE'."
        )

    # 3. Stop migration if unmapped condition (e.g. BROKEN) or NULL is present
    unmapped_condition_rows = bind.execute(
        sa.text(
            """
            SELECT id, condition
            FROM products
            WHERE condition NOT IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR') OR condition IS NULL
            ORDER BY id
            """
        )
    ).all()

    if unmapped_condition_rows:
        sample = ", ".join(f"id={row[0]} (condition={row[1]!r})" for row in unmapped_condition_rows[:10])
        total = len(unmapped_condition_rows)
        more = f" and {total - 10} more" if total > 10 else ""
        raise RuntimeError(
            f"Migration daf675afc8fc aborted: found {total} product(s) with unmapped/unknown condition ({sample}{more}). "
            f"condition must be one of 'NEW', 'LIKE_NEW', 'GOOD', 'FAIR'. Unknown conditions must not be automatically guessed or promoted to 'GOOD'."
        )

    # 4. Stop migration if unmapped status (e.g. DRAFT, HIDDEN) or NULL is present
    unmapped_status_rows = bind.execute(
        sa.text(
            """
            SELECT id, status
            FROM products
            WHERE status NOT IN ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED') OR status IS NULL
            ORDER BY id
            """
        )
    ).all()

    if unmapped_status_rows:
        sample = ", ".join(f"id={row[0]} (status={row[1]!r})" for row in unmapped_status_rows[:10])
        total = len(unmapped_status_rows)
        more = f" and {total - 10} more" if total > 10 else ""
        raise RuntimeError(
            f"Migration daf675afc8fc aborted: found {total} product(s) with unmapped/unknown status ({sample}{more}). "
            f"status must be one of 'AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED'. Draft or hidden products must not be automatically converted to 'AVAILABLE' to prevent unintended listing."
        )

    op.create_check_constraint(
        "ck_products_price_positive",
        "products",
        "price > 0",
    )

    op.create_check_constraint(
        "ck_products_sale_type",
        "products",
        "sale_type = 'FIXED_PRICE'",
    )

    op.create_check_constraint(
        "ck_products_condition",
        "products",
        "condition IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR')",
    )

    op.create_check_constraint(
        "ck_products_status",
        "products",
        "status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'CANCELLED')",
    )

    op.create_index(
        "ix_products_public_status_created_id",
        "products",
        ["status", "created_at", "id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_index(
        "ix_products_owner_user_created_id",
        "products",
        ["user_id", "created_at", "id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_index(
        "ix_products_owner_user_created_id",
        table_name="products",
    )

    op.drop_index(
        "ix_products_public_status_created_id",
        table_name="products",
    )

    op.drop_constraint(
        "ck_products_status",
        "products",
        type_="check",
    )

    op.drop_constraint(
        "ck_products_condition",
        "products",
        type_="check",
    )

    op.drop_constraint(
        "ck_products_sale_type",
        "products",
        type_="check",
    )

    op.drop_constraint(
        "ck_products_price_positive",
        "products",
        type_="check",
    )