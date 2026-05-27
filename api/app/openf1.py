import asyncio
import json
import time
from datetime import date as Date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi_cache import FastAPICache
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import MONTH_TTL, RECENT_RACE_TTL, WEEK_TTL
from app.database import get_session
from app.queries import get_race_results, get_season_driver_map

router = APIRouter(prefix="/openf1")

OPENF1_BASE = "https://api.openf1.org/v1"
_MAX_RESPONSE_BYTES = 20 * 1024 * 1024


class _TokenBucket:
    def __init__(self, capacity: float, rate: float):
        self._capacity = capacity
        self._rate = rate
        self._tokens = float(capacity)
        self._last = time.monotonic()

    def consume(self, n: int = 1) -> bool:
        now = time.monotonic()
        self._tokens = min(self._capacity, self._tokens + (now - self._last) * self._rate)
        self._last = now
        if self._tokens >= n:
            self._tokens -= n
            return True
        return False


_openf1_bucket = _TokenBucket(capacity=30, rate=30 / 60)


def _check_bucket(n: int = 1) -> None:
    if not _openf1_bucket.consume(n):
        raise HTTPException(status_code=503, detail="OpenF1 rate limit reached, try again shortly")


def _safe_json(response: httpx.Response) -> list | dict:
    if not response.is_success:
        return []
    if len(response.content) > _MAX_RESPONSE_BYTES:
        return []
    try:
        result = response.json()
        return result if isinstance(result, (list, dict)) else []
    except Exception:
        return []


async def _cached_season_driver_map(db: AsyncSession, year: int) -> dict[int, str]:
    cache_key = f"openf1:driver_numbers:{year}"
    cached = await FastAPICache.get_backend().get(cache_key)
    if cached:
        return {int(k): v for k, v in json.loads(cached).items()}

    driver_map = await get_season_driver_map(db, year)
    if driver_map:
        await FastAPICache.get_backend().set(
            cache_key, json.dumps(driver_map), expire=MONTH_TTL
        )
    return driver_map


def _extract_colours(drivers: list) -> dict[str, str]:
    return {
        d["name_acronym"]: f"#{d['team_colour']}"
        for d in drivers
        if d.get("team_colour") and d.get("name_acronym")
    }


def _parse_sc_vsc(rc_data: list) -> tuple[list[list[int]], list[list[int]]]:
    sc_periods: list[list[int]] = []
    vsc_periods: list[list[int]] = []
    sc_start: int | None = None
    vsc_start: int | None = None

    for event in sorted(rc_data, key=lambda e: e.get("date", "")):
        if event.get("category") != "SafetyCar":
            continue
        msg = event.get("message", "")
        lap = event.get("lap_number")
        if lap is None:
            continue
        if msg == "SAFETY CAR DEPLOYED":
            sc_start = lap
        elif msg == "SAFETY CAR IN THIS LAP" and sc_start is not None:
            sc_periods.append([sc_start, lap])
            sc_start = None
        elif msg == "VSC DEPLOYED":
            vsc_start = lap
        elif msg == "VSC ENDING" and vsc_start is not None:
            vsc_periods.append([vsc_start, lap])
            vsc_start = None

    return sc_periods, vsc_periods


async def _get_race_control(session_key: int) -> tuple[list[list[int]], list[list[int]]]:
    cache_key = f"openf1:race_control:{session_key}"
    cached = await FastAPICache.get_backend().get(cache_key)
    if cached:
        data = json.loads(cached)
        return data["sc"], data["vsc"]

    _check_bucket(1)
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(f"{OPENF1_BASE}/race_control?session_key={session_key}")

    rc_data = _safe_json(res)
    if not isinstance(rc_data, list):
        return [], []

    sc_periods, vsc_periods = _parse_sc_vsc(rc_data)
    await FastAPICache.get_backend().set(
        cache_key,
        json.dumps({"sc": sc_periods, "vsc": vsc_periods}),
        expire=MONTH_TTL,
    )
    return sc_periods, vsc_periods


@router.get("/race-sessions")
async def race_sessions():
    cache_key = "openf1:race_sessions:v2"
    cached = await FastAPICache.get_backend().get(cache_key)
    if cached:
        return json.loads(cached)

    _check_bucket(2)
    async with httpx.AsyncClient(timeout=30.0) as client:
        sessions_res, meetings_res = await asyncio.gather(
            client.get(f"{OPENF1_BASE}/sessions?session_name=Race"),
            client.get(f"{OPENF1_BASE}/meetings"),
        )

    meeting_names: dict[int, str] = {
        m["meeting_key"]: m["meeting_name"]
        for m in _safe_json(meetings_res)
        if m.get("meeting_key") and m.get("meeting_name")
    }

    now = datetime.now(timezone.utc)
    races = []
    for s in _safe_json(sessions_res):
        if s.get("is_cancelled", False):
            continue
        date_end = s.get("date_end", "")
        if not date_end:
            continue
        try:
            if datetime.fromisoformat(date_end) + timedelta(minutes=30) > now:
                continue
        except ValueError:
            continue
        races.append({**s, "meeting_name": meeting_names.get(s.get("meeting_key"), s.get("location", ""))})

    races.sort(key=lambda s: s.get("date_start", ""), reverse=True)

    await FastAPICache.get_backend().set(cache_key, json.dumps(races), expire=WEEK_TTL)
    return races


@router.get("/race-laps")
async def race_laps(session_key: int, db: AsyncSession = Depends(get_session)):
    cache_key = f"openf1:race_laps:v4:{session_key}"
    cached = await FastAPICache.get_backend().get(cache_key)
    if cached:
        result = json.loads(cached)
        sc_periods, vsc_periods = await _get_race_control(session_key)
        result["scPeriods"] = sc_periods
        result["vscPeriods"] = vsc_periods
        return result

    current_year = datetime.now(timezone.utc).year
    session_year = current_year
    race_date: Date | None = None

    sessions_cached = await FastAPICache.get_backend().get("openf1:race_sessions:v2")
    if sessions_cached:
        sessions_list = json.loads(sessions_cached)
        entry = next((s for s in sessions_list if s.get("session_key") == session_key), None)
        if entry:
            session_year = entry.get("year", current_year)
            date_start = entry.get("date_start", "")
            if date_start:
                try:
                    race_date = Date.fromisoformat(date_start[:10])
                except ValueError:
                    pass

    season_driver_map = await _cached_season_driver_map(db, session_year)

    db_results = []
    if race_date:
        db_results = await get_race_results(db, session_year, race_date)

    colours_cache_key = f"openf1:team_colours:{session_year}"

    if db_results:
        driver_map: dict[int, str] = {row.driver_number: row.abbreviation for row in db_results}
        final_position: dict[int, int] = {row.driver_number: i + 1 for i, row in enumerate(db_results)}

        colours_raw = await FastAPICache.get_backend().get(colours_cache_key)

        async with httpx.AsyncClient(timeout=30.0) as client:
            if colours_raw:
                _check_bucket(1)
                laps_res = await client.get(f"{OPENF1_BASE}/laps?session_key={session_key}")
                driver_colors: dict[str, str] = json.loads(colours_raw)
            else:
                _check_bucket(2)
                laps_res, drivers_res = await asyncio.gather(
                    client.get(f"{OPENF1_BASE}/laps?session_key={session_key}"),
                    client.get(f"{OPENF1_BASE}/drivers?session_key={session_key}"),
                )
                of1_drivers = _safe_json(drivers_res)
                of1_drivers = of1_drivers if isinstance(of1_drivers, list) else []
                driver_colors = _extract_colours(of1_drivers)
                if driver_colors:
                    await FastAPICache.get_backend().set(
                        colours_cache_key, json.dumps(driver_colors), expire=MONTH_TTL
                    )

        result_ttl = MONTH_TTL

    else:
        _check_bucket(3)
        async with httpx.AsyncClient(timeout=30.0) as client:
            laps_res, drivers_res = await asyncio.gather(
                client.get(f"{OPENF1_BASE}/laps?session_key={session_key}"),
                client.get(f"{OPENF1_BASE}/drivers?session_key={session_key}"),
            )
            await asyncio.sleep(0.4)
            positions_res = await client.get(f"{OPENF1_BASE}/position?session_key={session_key}")

        of1_drivers = _safe_json(drivers_res)
        of1_drivers = of1_drivers if isinstance(of1_drivers, list) else []

        colours_raw = await FastAPICache.get_backend().get(colours_cache_key)
        if not colours_raw:
            driver_colors = _extract_colours(of1_drivers)
            if driver_colors:
                await FastAPICache.get_backend().set(
                    colours_cache_key, json.dumps(driver_colors), expire=MONTH_TTL
                )
        else:
            driver_colors = json.loads(colours_raw)

        driver_map = dict(season_driver_map)
        for d in of1_drivers:
            num = d.get("driver_number")
            if num and num not in driver_map and d.get("name_acronym"):
                driver_map[num] = d["name_acronym"]

        positions = _safe_json(positions_res)
        positions = positions if isinstance(positions, list) else []
        final_position = {}
        for p in positions:
            num = p.get("driver_number")
            pos = p.get("position")
            if num is not None and pos is not None:
                final_position[num] = pos

        result_ttl = RECENT_RACE_TTL

    driver_order = [
        driver_map.get(num, f"#{num}")
        for num, _ in sorted(final_position.items(), key=lambda x: x[1])
    ]

    laps_raw = _safe_json(laps_res)
    laps_raw = laps_raw if isinstance(laps_raw, list) else []
    laps_data = [
        {
            "x": lap["lap_number"],
            "y": lap["lap_duration"],
            "series": driver_map.get(lap["driver_number"], f"#{lap['driver_number']}"),
        }
        for lap in laps_raw
        if lap.get("lap_duration") is not None
        and lap.get("lap_number") is not None
        and lap.get("driver_number") is not None
        and not lap.get("is_pit_out_lap", False)
    ]

    if laps_data and driver_map:
        await FastAPICache.get_backend().set(
            cache_key,
            json.dumps({
                "laps": laps_data,
                "driverOrder": driver_order,
                "driverColors": driver_colors,
            }),
            expire=result_ttl,
        )

    sc_periods, vsc_periods = await _get_race_control(session_key)

    return {
        "laps": laps_data,
        "driverOrder": driver_order,
        "driverColors": driver_colors,
        "scPeriods": sc_periods,
        "vscPeriods": vsc_periods,
    }
