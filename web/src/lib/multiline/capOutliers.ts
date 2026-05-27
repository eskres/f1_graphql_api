import * as d3 from "d3";
import type { MultiLineDatum } from "../types";

export function computeYCap(data: MultiLineDatum[], factor = 1.07): number {
    const validYVals = data.map(d => d.y).filter(v => isFinite(v) && v > 0).sort(d3.ascending);
    const median = d3.quantile(validYVals, 0.5) ?? 0;
    return median * factor;
}

export function buildRawLookup(data: MultiLineDatum[]): Map<string, Map<number, number>> {
    const rawLookup = new Map<string, Map<number, number>>();
    data.forEach(d => {
        if (!rawLookup.has(d.series)) rawLookup.set(d.series, new Map());
        rawLookup.get(d.series)?.set(d.x, d.y);
    });
    return rawLookup;
}
