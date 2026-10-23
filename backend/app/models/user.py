from sqlalchemy import Column, Integer, String, Float, DateTime

from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)

    # Readable area name from GPS, e.g. "Adyar"
    place = Column(String, nullable=True)

    platform = Column(String, nullable=False)
    location = Column(String, nullable=False)
    weekly_income = Column(Integer, nullable=False)

    phone = Column(String, nullable=True)
    upi = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)

    # Current GPS position
    lat = Column(Float, nullable=True)
    lon = Column(Float, nullable=True)
    location_updated_at = Column(DateTime(timezone=True), nullable=True)

    # Last known GPS position and the pool zone it maps to
    last_lat = Column(Float, nullable=True)
    last_lon = Column(Float, nullable=True)
    zone = Column(String, nullable=True)

    # Password reset OTP
    reset_otp_hash = Column(String, nullable=True)
    reset_otp_expires = Column(DateTime(timezone=True), nullable=True)
```
