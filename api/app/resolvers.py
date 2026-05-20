import strawberry
from strawberry.fastapi import GraphQLRouter
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import BaseContext
from fastapi import Depends
from typing import List

from app.database import get_session
from app.models import Driver, PitStop, Race
from app.schema import DriverType, PitStopType, DriverPitStopType, SeasonRaceType, SeasonType

class Context(BaseContext):
    def __init__(self, session: AsyncSession = Depends(get_session)):
        self.session = session


async def get_context(session: AsyncSession = Depends(get_session)):
    return Context(session)


@strawberry.type
class Query:

    @strawberry.field
    async def drivers(self, info: strawberry.types.Info) -> List[DriverType]:
        session = info.context.session
        result = await session.execute(select(Driver))
        drivers = result.scalars().all()
        return [
            DriverType(
                id=d.id,
                name=d.name,
                abbreviation=d.abbreviation,
                nationality_country_id=d.nationality_country_id
            )
            for d in drivers
        ]

    @strawberry.field
    async def pit_stops(
        self,
        info: strawberry.types.Info,
        race_id: int
    ) -> List[PitStopType]:
        session = info.context.session
        result = await session.execute(
            select(PitStop).where(PitStop.race_id == race_id)
        )
        stops = result.scalars().all()
        return [
            PitStopType(
                race_id=s.race_id,
                driver_id=s.driver_id,
                stop=s.stop,
                lap=s.lap,
                time=s.time,
                time_millis=s.time_millis,
                constructor_id=s.constructor_id
            )
            for s in stops
        ]

    @strawberry.field
    async def seasons(self, info: strawberry.types.Info) -> List[SeasonType]:
        session = info.context.session
        result = await session.execute(
            text("""
                SELECT r.year, SUM(ps.time_millis) AS total_pit_time
                FROM pit_stop ps
                JOIN race r ON ps.race_id = r.id
                WHERE ps.time_millis < 120000
                GROUP BY r.year
                ORDER BY r.year DESC
            """)
        )
        return [
            SeasonType(year=row.year, total_pit_time=row.total_pit_time)
            for row in result.all()
        ]

    @strawberry.field
    async def races_by_season(
        self,
        info: strawberry.types.Info,
        year: int
    ) -> List[SeasonRaceType]:
        session = info.context.session
        result = await session.execute(
            text("""
                SELECT r.id, r.official_name, r.round,
                       SUM(ps.time_millis) AS total_pit_time
                FROM pit_stop ps
                JOIN race r ON ps.race_id = r.id
                WHERE ps.time_millis < 120000
                AND r.year = :year
                GROUP BY r.id, r.official_name, r.round
                ORDER BY r.round
            """),
            {"year": year}
        )
        return [
            SeasonRaceType(
                id=row.id,
                official_name=row.official_name,
                round=row.round,
                total_pit_time=row.total_pit_time
            )
            for row in result.all()
        ]

    @strawberry.field
    async def race_pit_stops(
        self,
        info: strawberry.types.Info,
        race_id: int
    ) -> List[DriverPitStopType]:
        session = info.context.session
        result = await session.execute(
            text("""
                SELECT
                    driver_id,
                    constructor_id,
                    SUM(time_millis) AS total_pit_time,
                    COUNT(*) AS stop_count
                FROM pit_stop
                WHERE race_id = :race_id
                AND time_millis < 120000
                GROUP BY driver_id, constructor_id
                ORDER BY total_pit_time DESC
            """),
            {"race_id": race_id}
        )
        rows = result.all()
        return [
            DriverPitStopType(
                driver_id=row.driver_id,
                constructor_id=row.constructor_id,
                total_pit_time=row.total_pit_time,
                stop_count=row.stop_count
            )
            for row in rows
        ]


schema = strawberry.Schema(query=Query)
graphql_app = GraphQLRouter(schema, context_getter=get_context)