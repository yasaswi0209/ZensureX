from datetime import datetime

from sqlalchemy import Column, Integer, Float, String, DateTime

from app.db.session import Base


class PoolLedger(Base):
    """
    Every money movement of a zone pool.
    kind: "seed" (starting demo funds), "premium" (worker paid), "payout" (worker paid out)
    Pool balance = seed + premium - payout.
    """
    __tablename__ = "pool_ledger"

    id = Column(Integer, primary_key=True, index=True)
    zone = Column(String, index=True, nullable=False)
    user_id = Column(Integer, index=True, nullable=True)
    kind = Column(String, nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
