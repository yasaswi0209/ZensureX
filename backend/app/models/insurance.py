from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func

from app.db.session import Base


class Insurance(Base):
    """One row per policy purchase. Matches the alembic migration."""
    __tablename__ = "insurance"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_name = Column(String, nullable=False)
    premium = Column(Integer, nullable=False)
    coverage = Column(Integer, nullable=False)
    status = Column(String, default="ACTIVE")
    locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
