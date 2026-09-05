from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TestMessage(Base):
    __tablename__ = "test_messages"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
    )

    message: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )