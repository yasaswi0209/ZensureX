from sqlalchemy import Column, Integer, String, Float
from app.db.session import Base
from sqlalchemy import Column, Float, DateTime


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    place = Column(String, nullable=True)   # readable area name from GPS, e.g. "Adyar"
    platform = Column(String, nullable=False)
    location = Column(String, nullable=False)
    weekly_income = Column(Integer, nullable=False)
    phone = Column(String)
    upi = Column(String)
    bank_name = Column(String)
    # Add inside your existing User class
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    location_updated_at = Column(DateTime(timezone=True), nullable=True)
    # last known GPS position and the pool zone it maps to
    last_lat = Column(Float, nullable=True)
    last_lon = Column(Float, nullable=True)
    zone = Column(String, nullable=True)
