import strawberry
from typing import Optional

@strawberry.type
class DriverType:
    id: str
    name: str
    abbreviation: Optional[str]
    nationality_country_id: Optional[str]

@strawberry.type
class PitStopType:
    race_id: int
    driver_id: str
    stop: int
    lap: int
    time: Optional[str]
    time_millis: Optional[int]
    constructor_id: Optional[str]