import * as d3 from "d3";
import type { MultiLineDatum } from "@/lib/multiline/types";
import type { BoxStats } from "@/lib/boxplot/types";

export function computeBoxStats(data: MultiLineDatum[], seriesOrder?: string[]): BoxStats[] {
    const grouped = d3.group(data.filter(d => isFinite(d.y) && d.y > 0), d => d.series);

    const stats: BoxStats[] = [];
    grouped.forEach((pts, key) => {
        const vals = pts.map(d => d.y).sort(d3.ascending);
        const q1 = d3.quantile(vals, 0.25);
        const q2 = d3.quantile(vals, 0.5);
        const q3 = d3.quantile(vals, 0.75);
        if (q1 == null || q2 == null || q3 == null) return;
        const iqr = q3 - q1;
        const lo = Math.max(d3.min(vals) ?? q1, q1 - 1.5 * iqr);
        const hi = Math.min(d3.max(vals) ?? q3, q3 + 1.5 * iqr);
        const outliers = vals.filter(v => v < lo || v > hi);
        stats.push({ key, q1, q2, q3, lo, hi, outliers });
    });

    const orderMap = new Map((seriesOrder ?? []).map((k, i) => [k, i]));
    stats.sort((a, b) => {
        const ao = orderMap.get(a.key) ?? Infinity;
        const bo = orderMap.get(b.key) ?? Infinity;
        return ao !== bo ? ao - bo : a.q2 - b.q2;
    });

    return stats;
}