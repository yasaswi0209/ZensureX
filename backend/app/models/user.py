from sqlalchemy import Column, Integer, String, Float
from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)

    platform = Column(String, nullable=False)
    location = Column(String, nullable=False)
    weekly_income = Column(Integer, nullable=False)
    phone = Column(String)
    upi = Column(String)
    bank_name = Column(String)

    # last known GPS position and the pool zone it maps to
    last_lat = Column(Float, nullable=True)
    last_lon = Column(Float, nullable=True)
    zone = Column(String, nullable=True)
