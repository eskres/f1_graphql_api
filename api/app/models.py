from sqlalchemy import Column, Integer, String, Date
from app.database import Base

class Driver(Base):
    __tablename__ = "driver"

    id = Column(String, primary_key=True)
    name = Column(String)
    abbreviation = Column(String)
    nationality_country_id = Column(String)
    date_of_birth = Column(Date)

class Race(Base):
    __tablename__ = "race"

    id = Column(Integer, primary_key=True)
    year = Column(Integer)
    round = Column(Integer)
    official_name = Column(String)
    date = Column(Date)
    circuit_id = Column(String)

class PitStop(Base):
    __tablename__ = "pit_stop"

    race_id = Column(Integer, primary_key=True)
    driver_id = Column(String, primary_key=True)
    stop = Column(Integer, primary_key=True)
    lap = Column(Integer)
    time = Column(String)
    time_millis = Column(Integer)
    constructor_id = Column(String)

    __table_args__ = {'info': {'is_view': True}}