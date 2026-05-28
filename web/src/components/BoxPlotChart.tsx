"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { computeYCap } from "@/lib/multiline/capOutliers";
import { computeBoxStats } from "@/lib/boxplot/computeStats";
import type { BoxStats, BoxPlotChartProps } from "@/lib/boxplot/types";

export function BoxPlotChart({ data, seriesOrder, seriesColors, formatY, yLabel }: BoxPlotChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || data.length === 0) return;

        const fmtY = formatY ?? String;

        const cap = computeYCap(data);
        const cappedData = data.map(d => ({ ...d, y: Math.min(d.y, cap) }));

        const stats = computeBoxStats(cappedData, seriesOrder);

        const keys = stats.map(s => s.key);

        const W = containerRef.current.clientWidth;
        const H = 420;
        const mt = 20, mb = 50, ml = 70, mr = 20;

        const color = (key: string): string =>
            seriesColors?.[key] ?? d3.schemeTableau10[keys.indexOf(key) % d3.schemeTableau10.length] ?? "#888";

        const allY = stats.flatMap(s => [s.lo, s.q1, s.q2, s.q3, s.hi, ...s.outliers]);
        const yMin = d3.min(allY) ?? 0;
        const yMax = d3.max(allY) ?? 0;
        const yPad = (yMax - yMin) * 0.06;

        const x = d3.scaleBand().domain(keys).range([ml, W - mr]).padding(0.4);
        const y = d3.scaleLinear().domain([yMin - yPad, yMax + yPad]).range([H - mb, mt]);

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();
        svg.attr("width", W).attr("height", H)
            .attr("viewBox", `0 0 ${W} ${H}`)
            .style("font", "13px Jost, sans-serif")
            .style("fill", "#0b121e")
            .style("overflow", "visible");

        svg.append("g").attr("transform", `translate(${ml},0)`)
            .call(d3.axisLeft(y).ticks(6).tickFormat(v => fmtY(v as number)))
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick line").clone()
                .attr("x2", W - ml - mr)
                .attr("stroke-opacity", 0.1));

        svg.append("g").attr("transform", `translate(0,${H - mb})`)
            .call(d3.axisBottom(x))
            .call(g => g.select(".domain").remove())
            .selectAll("text")
            .attr("font-size", 11);

        if (yLabel) {
            svg.append("text")
                .attr("transform", `translate(14,${(mt + H - mb) / 2}) rotate(-90)`)
                .attr("text-anchor", "middle").attr("font-size", 11)
                .attr("fill", "#888").text(yLabel);
        }

        const bw = x.bandwidth();
        const g = svg.append("g");

        for (const s of stats) {
            const xPos = x(s.key) ?? 0;
            const cx = xPos + bw / 2;
            const c = color(s.key);
            const capW = bw * 0.3;

            // Whisker stem
            g.append("line")
                .attr("x1", cx).attr("x2", cx)
                .attr("y1", y(s.lo)).attr("y2", y(s.hi))
                .attr("stroke", c).attr("stroke-width", 1.5);

            // Whisker caps
            for (const end of [s.lo, s.hi]) {
                g.append("line")
                    .attr("x1", cx - capW / 2).attr("x2", cx + capW / 2)
                    .attr("y1", y(end)).attr("y2", y(end))
                    .attr("stroke", c).attr("stroke-width", 1.5);
            }

            // IQR box
            g.append("rect")
                .attr("x", xPos)
                .attr("y", y(s.q3))
                .attr("width", bw)
                .attr("height", Math.max(1, y(s.q1) - y(s.q3)))
                .attr("fill", c).attr("fill-opacity", 0.2)
                .attr("stroke", c).attr("stroke-width", 1.5);

            // Median line
            g.append("line")
                .attr("x1", xPos).attr("x2", xPos + bw)
                .attr("y1", y(s.q2)).attr("y2", y(s.q2))
                .attr("stroke", c).attr("stroke-width", 2.5);

            // Outlier dots
            for (const ov of s.outliers) {
                g.append("circle")
                    .attr("cx", cx).attr("cy", y(ov))
                    .attr("r", 2.5)
                    .attr("fill", c).attr("fill-opacity", 0.7)
                    .attr("stroke", "none");
            }
        }

        const tooltipG = svg.append("g").attr("pointer-events", "none").style("display", "none");

        function showTooltip(s: BoxStats) {
            tooltipG.style("display", null).selectAll("*").remove();

            const c = color(s.key);
            const cx = (x(s.key) ?? 0) + bw / 2;
            const lines = s.outliers.length > 0
                ? ["Max", "75th percentile", "Median", "25th percentile", "Min", "Outliers"]
                : ["Max", "75th percentile", "Median", "25th percentile", "Min"];
            const vals: Record<string, string> = {
                Max: fmtY(s.hi),
                "75th percentile": fmtY(s.q3),
                Median: fmtY(s.q2),
                "25th percentile": fmtY(s.q1),
                Min: fmtY(s.lo),
                Outliers: String(s.outliers.length),
            };

            const lh = 16, pad = 8, bw2 = 190;
            const bh = lines.length * lh + pad * 2 + 18;
            let tx = cx + bw / 2 + 8;
            if (tx + bw2 > W - mr) tx = cx - bw / 2 - bw2 - 8;
            const ty = mt + 4;

            tooltipG.append("rect")
                .attr("x", tx).attr("y", ty)
                .attr("width", bw2).attr("height", bh).attr("rx", 4)
                .attr("fill", "white").attr("stroke", "#ddd")
                .attr("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.12))");

            tooltipG.append("circle").attr("r", 5)
                .attr("cx", tx + pad + 5).attr("cy", ty + pad + 8)
                .attr("fill", c);
            tooltipG.append("text")
                .attr("x", tx + pad + 14).attr("y", ty + pad + 12)
                .attr("font-size", 11).attr("font-weight", "bold")
                .text(s.key);

            lines.forEach((label, i) => {
                const rowG = tooltipG.append("g")
                    .attr("transform", `translate(${tx + pad},${ty + pad + 24 + i * lh})`);
                rowG.append("text").attr("font-size", 10).attr("fill", "#888").text(label);
                rowG.append("text").attr("x", bw2 - pad * 2).attr("text-anchor", "end")
                    .attr("font-size", 10).text(vals[label] ?? "");
            });
        }

        // Invisible hit areas per column
        for (const s of stats) {
            svg.append("rect")
                .attr("x", (x(s.key) ?? 0) - (x.step() - bw) / 2)
                .attr("y", mt)
                .attr("width", x.step())
                .attr("height", H - mt - mb)
                .attr("fill", "none")
                .attr("pointer-events", "all")
                .style("cursor", "default")
                .on("pointerenter", () => showTooltip(s))
                .on("pointerleave", () => tooltipG.style("display", "none"));
        }

    }, [data, seriesOrder, seriesColors, formatY, yLabel]);

    return (
        <div ref={containerRef} className="w-full overflow-x-auto">
            <svg ref={svgRef} />
        </div>
    );
}
