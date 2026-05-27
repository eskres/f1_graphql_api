"use client";

import { useEffect, useState } from "react";
import { MultiLineChart } from "@/components/MultiLineChart";
import { RetryCountdown } from "@/components/RetryCountdown";
import type { MultiLineDatum, RaceSession, RaceLapsResponse } from "@/lib/types";

export function LapTimeChart() {
    const [sessions, setSessions] = useState<RaceSession[]>([]);
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [selectedKey, setSelectedKey] = useState<number | null>(null);
    const [data, setData] = useState<MultiLineDatum[]>([]);
    const [driverOrder, setDriverOrder] = useState<string[]>([]);
    const [driverColors, setDriverColors] = useState<Record<string, string>>({});
    const [scPeriods, setScPeriods] = useState<[number, number][]>([]);
    const [vscPeriods, setVscPeriods] = useState<[number, number][]>([]);
    const [chartSession, setChartSession] = useState<RaceSession | null>(null);
    const [driverFilter, setDriverFilter] = useState<3 | 6 | null>(3);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<"generic" | "rate-limited" | false>(false);

    function loadRaceData(session: RaceSession) {
        setLoading(true);
        setError(false);
        fetch(`/api/race-laps?session_key=${session.session_key}`)
            .then(r => {
                if (!r.ok) {
                    const err = new Error() as Error & { status: number };
                    err.status = r.status;
                    throw err;
                }
                return r.json();
            })
            .then((d: RaceLapsResponse) => {
                setData(d.laps);
                setDriverOrder(d.driverOrder);
                setDriverColors(d.driverColors ?? {});
                setScPeriods(d.scPeriods ?? []);
                setVscPeriods(d.vscPeriods ?? []);
                setChartSession(session);
            })
            .catch((e: Error & { status?: number }) => setError(e.status === 503 ? "rate-limited" : "generic"))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        fetch("/api/race-sessions")
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then((s: RaceSession[]) => {
                setSessions(s);
                const [latest] = s;
                if (latest) {
                    setSelectedYear(latest.year);
                    setSelectedKey(latest.session_key);
                    loadRaceData(latest);
                }
            })
            .catch(() => {
                setError("generic");
                setLoading(false);
            });
    }, []);

    const years = [...new Set(sessions.map(s => s.year))].sort((a, b) => b - a);

    const racesForYear = sessions
        .filter(s => s.year === selectedYear)
        .sort((a, b) => new Date(a.date_start).getTime() - new Date(b.date_start).getTime());

    function handleYearChange(year: number) {
        setSelectedYear(year);
        const first = sessions
            .filter(s => s.year === year)
            .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime())[0];
        if (first) {
            setSelectedKey(first.session_key);
            loadRaceData(first);
        }
    }

    function handleRaceChange(key: number) {
        setSelectedKey(key);
        const session = sessions.find(s => s.session_key === key);
        if (session) loadRaceData(session);
    }

    const filteredDriverOrder = driverFilter ? driverOrder.slice(0, driverFilter) : driverOrder;

    const title = chartSession
        ? `${chartSession.year} ${chartSession.meeting_name ?? `${chartSession.year} ${chartSession.location} Grand Prix`} · Lap Times`
        : "Lap Times";

    return (
        <div>
            <h2 className="text-3xl font-bold">Race Pace Explorer</h2>
            <p className="text-sm text-gray-500 mt-1 mb-6">
                Lap time per driver · pit-out laps excluded · hover to compare
            </p>
            <div className="flex items-center gap-3 mb-2">
                <select
                    value={selectedYear ?? ""}
                    onChange={e => handleYearChange(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                    disabled={sessions.length === 0}
                >
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                    value={selectedKey ?? ""}
                    onChange={e => handleRaceChange(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                    disabled={sessions.length === 0}
                >
                    {racesForYear.map(s => (
                        <option key={s.session_key} value={s.session_key}>
                            {s.meeting_name ?? s.location}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex items-center gap-1 mb-4">
                {([3, 6, null] as const).map(f => (
                    <button
                        key={String(f)}
                        onClick={() => setDriverFilter(f)}
                        className={`px-2 py-1 text-sm rounded border ${driverFilter === f ? 'bg-[#0b121e] text-white border-[#0b121e]' : 'border-gray-300 bg-white'}`}
                    >
                        {f === null ? 'All' : `Top ${f}`}
                    </button>
                ))}
            </div>
            <h3 className="text-2xl font-bold mb-6">{title}</h3>

            {loading && (
                <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                    Loading lap times…
                </div>
            )}
            {error === "rate-limited" && (
                <RetryCountdown seconds={60} onRetry={() => { if (selectedKey !== null) { const s = sessions.find(x => x.session_key === selectedKey); if (s) loadRaceData(s); } }} />
            )}
            {error === "generic" && (
                <div className="h-64 flex items-center justify-center text-red-400 text-sm">
                    Failed to load lap time data.
                </div>
            )}
            {!loading && !error && data.length === 0 && (
                <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                    Lap time data not yet available for this session.
                </div>
            )}
            {!loading && !error && data.length > 0 && (
                <MultiLineChart
                    data={data}
                    seriesOrder={filteredDriverOrder}
                    seriesColors={driverColors}
                    xLabel="Lap"
                    yLabel="Lap time (s)"
                    formatX={v => String(Math.round(v))}
                    formatY={v => {
                        const mins = Math.floor(v / 60);
                        const secs = v % 60;
                        return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
                    }}
                    scPeriods={scPeriods}
                    vscPeriods={vscPeriods}
                />
            )}
        </div>
    );
}
