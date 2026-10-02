"""Immutable completed-sale reviews; follows C07 on A02's single chain."""
from alembic import op
import sqlalchemy as sa

revision = "c08f20261002"
down_revision = "c07f20261002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("reviews",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("order_id", sa.Integer, nullable=False),
        sa.Column("buyer_id", sa.Integer, nullable=False),
        sa.Column("seller_id", sa.Integer, nullable=False),
        sa.Column("product_id", sa.Integer, sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("rating", sa.Integer, nullable=False),
        sa.Column("comment", sa.String(1000), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("clock_timestamp()")),
        sa.UniqueConstraint("order_id", name="uq_reviews_order"),
        sa.ForeignKeyConstraint(["order_id", "seller_id", "buyer_id"], ["orders.id", "orders.seller_id", "orders.buyer_id"], name="fk_reviews_order_parties", ondelete="RESTRICT"),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating"),
        sa.CheckConstraint("length(comment) <= 1000", name="ck_reviews_comment"))
    op.create_index("ix_reviews_seller_created", "reviews", ["seller_id", "created_at", "id"])
    op.execute("""CREATE FUNCTION guard_seller_review() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE original orders%ROWTYPE; actor users%ROWTYPE; approval varchar;
    BEGIN
      IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'review is immutable' USING ERRCODE='23514';
      END IF;
      SELECT * INTO original FROM orders WHERE id=NEW.order_id FOR UPDATE;
      IF NOT FOUND OR original.product_id <> NEW.product_id OR original.buyer_id <> NEW.buyer_id
         OR original.seller_id <> NEW.seller_id OR original.status <> 'COMPLETED'
         OR NOT EXISTS (SELECT 1 FROM escrows WHERE order_id=original.id AND status='RELEASED')
         OR NOT EXISTS (SELECT 1 FROM order_settlements WHERE order_id=original.id AND kind='RELEASE') THEN
        RAISE EXCEPTION 'review requires matching completed released Order' USING ERRCODE='23514';
      END IF;
      SELECT * INTO actor FROM users WHERE id=original.buyer_id FOR UPDATE;
      SELECT verification_status INTO approval FROM verifications WHERE user_id=actor.id ORDER BY created_at DESC,id DESC LIMIT 1;
      IF actor.status <> 'ACTIVE' OR actor.role IS NULL OR actor.role NOT IN ('BUYER','SELLER')
         OR (actor.role='SELLER' AND approval IS DISTINCT FROM 'APPROVED') THEN
        RAISE EXCEPTION 'review requires active Buyer' USING ERRCODE='23514';
      END IF;
      NEW.created_at := clock_timestamp();
      RETURN NEW;
    END $$""")
    op.execute("CREATE TRIGGER reviews_guard BEFORE INSERT OR UPDATE OR DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION guard_seller_review()")
    op.execute("ALTER TABLE reviews ENABLE ROW LEVEL SECURITY")


def downgrade():
    raise RuntimeError("REVIEW downgrade refused: preserve immutable reviews and audit")
