import strawberry
from strawberry.fastapi import GraphQLRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from strawberry.fastapi import BaseContext
from fastapi import Depends
from typing import List

from app.database import get_session
from app.models import Driver, PitStop
from app.schema import DriverType, PitStopType


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


schema = strawberry.Schema(query=Query)
graphql_app = GraphQLRouter(schema, context_getter=get_context)