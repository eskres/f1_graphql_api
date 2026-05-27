"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { MultiLineDatum, MultiLineChartProps } from "../lib/types";
import { computeYCap, buildRawLookup } from "../lib/multiline/capOutliers";
import { groupSeries } from "../lib/multiline/groupSeries";
import { computeChartDimensions } from "../lib/multiline/computeDimensions";
import { highlightSeries, restoreSeries } from "../lib/multiline/highlight";

export type { MultiLineDatum };

export function MultiLineChart({ data, seriesOrder, seriesColors, xLabel, yLabel, formatX, formatY, scPeriods, vscPeriods }: MultiLineChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current || data.length === 0) return;

        const containerWidth = containerRef.current.clientWidth;

        const cap = computeYCap(data);
        const rawLookup = buildRawLookup(data);
        const displayData = data.map(d => ({ ...d, y: Math.min(d.y, cap) }));

        const { seriesKeys, sortedGrouped } = groupSeries(displayData, seriesOrder);

        const xExtent = d3.extent(displayData, d => d.x) as [number, number];
        const { W, H, mt, mb, ml, mr, itemsPerRow, itemW } = computeChartDimensions(containerWidth, xExtent, seriesKeys.length);

        const fmtX = formatX ?? String;
        const fmtY = formatY ?? String;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove();
        svg.attr("width", W).attr("height", H)
            .attr("viewBox", `0 0 ${W} ${H}`)
            .style("font", "13px Jost, sans-serif")
            .style("fill", "#0b121e")
            .style("overflow", "visible");

        const x = d3.scaleLinear().domain(xExtent).range([ml, W - mr]);
        const yVals = displayData.map(d => d.y).sort(d3.ascending);
        const yMin = d3.min(yVals) ?? 0;
        const yMax = d3.max(yVals) ?? 0;
        const yPad = (yMax - yMin) * 0.05;
        const y = d3.scaleLinear()
            .domain([yMin - yPad, yMax + yPad])
            .range([H - mb, mt]);
        const color = (key: string): string =>
            seriesColors?.[key] ?? d3.schemeTableau10[seriesKeys.indexOf(key) % d3.schemeTableau10.length] ?? "#888";

        // Y axis with gridlines
        svg.append("g").attr("transform", `translate(${ml},0)`)
            .call(d3.axisLeft(y).ticks(6).tickFormat(v => fmtY(v as number)))
            .call(g => g.select(".domain").remove())
            .call(g => g.selectAll(".tick line").clone()
                .attr("x2", W - ml - mr)
                .attr("stroke-opacity", 0.1));

        // X axis
        svg.append("g").attr("transform", `translate(0,${H - mb})`)
            .call(d3.axisBottom(x)
                .ticks(Math.min(xExtent[1] - xExtent[0], 24))
                .tickFormat(v => fmtX(v as number)))
            .call(g => g.select(".domain").remove());

        if (xLabel) {
            svg.append("text")
                .attr("x", (ml + W - mr) / 2).attr("y", H - 6)
                .attr("text-anchor", "middle").attr("font-size", 11)
                .attr("fill", "#888").text(xLabel);
        }
        if (yLabel) {
            svg.append("text")
                .attr("transform", `translate(14,${(mt + H - mb) / 2}) rotate(-90)`)
                .attr("text-anchor", "middle").attr("font-size", 11)
                .attr("fill", "#888").text(yLabel);
        }

        // SC / VSC shading
        const periods: { range: [number, number]; label: string }[] = [
            ...(scPeriods ?? []).map(r => ({ range: r, label: "SC" })),
            ...(vscPeriods ?? []).map(r => ({ range: r, label: "VSC" })),
        ];
        const shadingG = svg.append("g").attr("pointer-events", "none");
        for (const { range, label } of periods) {
            const x0 = x(range[0] - 0.5);
            const x1 = x(range[1] + 0.5);
            shadingG.append("rect")
                .attr("x", x0).attr("y", mt)
                .attr("width", x1 - x0).attr("height", H - mt - mb)
                .attr("fill", "#ffd60a").attr("opacity", 0.18);
            shadingG.append("text")
                .attr("transform", `translate(${x0 - 2},${H - mb - 6}) rotate(-90)`)
                .attr("text-anchor", "start").attr("font-size", "0.75rem")
                .attr("fill", "#0b121e")
                .text(label);
        }

        // Lines
        const line = d3.line<MultiLineDatum>()
            .defined(d => isFinite(d.y) && d.y > 0)
            .x(d => x(d.x))
            .y(d => y(d.y))
            .curve(d3.curveMonotoneX);

        const paths = svg.append("g")
            .attr("fill", "none").attr("stroke-width", 1)
            .attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
            .selectAll<SVGPathElement, string>("path")
            .data(seriesKeys).join("path")
            .classed("series-line", true)
            .attr("stroke", d => color(d))
            .attr("d", d => line(sortedGrouped.get(d) ?? []));

        // Draw animation
        paths.each(function() {
            const len = this.getTotalLength();
            d3.select(this)
                .attr("stroke-dasharray", `${len},${len}`)
                .attr("stroke-dashoffset", len)
                .transition().duration(1200).ease(d3.easeLinear)
                .attr("stroke-dashoffset", 0);
        });

        const legendItems = svg.append("g")
            .attr("font-size", 11)
            .attr("transform", `translate(${ml},8)`)
            .selectAll<SVGGElement, string>("g")
            .data(seriesKeys).join("g")
            .classed("series-legend", true)
            .attr("transform", (_, i) => `translate(${(i % itemsPerRow) * itemW},${Math.floor(i / itemsPerRow) * 18})`);

        legendItems.append("line").attr("x2", 14).attr("stroke", d => color(d)).attr("stroke-width", 2);
        legendItems.append("text").attr("x", 18).attr("dy", "0.32em").text(d => d);

        // Fastest lap marker
        const validPoints = displayData.filter(d => isFinite(d.y) && d.y > 0);
        const fastest = validPoints.length > 0
            ? validPoints.reduce((min, d) => d.y < min.y ? d : min)
            : null;

        if (fastest) {
            svg.append("line")
                .attr("x1", x(fastest.x)).attr("x2", x(fastest.x))
                .attr("y1", mt).attr("y2", H - mb)
                .attr("stroke", "#bf00ff").attr("stroke-width", 1)
                .attr("pointer-events", "none");
        }

        legendItems
            .style("cursor", "pointer")
            .on("pointerenter", (_, d) => highlightSeries(svg, d))
            .on("pointerleave", () => restoreSeries(svg));

        // Hover elements
        const bisect = d3.bisector<MultiLineDatum, number>(d => d.x).center;

        const hoverLine = svg.append("line")
            .attr("y1", mt).attr("y2", H - mb)
            .attr("stroke", "#555").attr("stroke-width", 1)
            .attr("stroke-dasharray", "4,3")
            .attr("pointer-events", "none")
            .style("display", "none");

        const hoverDots = svg.append("g").attr("pointer-events", "none").style("display", "none");
        const tooltipG = svg.append("g").attr("pointer-events", "none").style("display", "none");

        function onMove(event: PointerEvent) {
            const [xm, ym] = d3.pointer(event, svg.node());
            const xVal = x.invert(xm);

            const nearestX = Math.round(xVal);
            if (nearestX < xExtent[0] || nearestX > xExtent[1]) return;

            hoverLine.style("display", null)
                .attr("x1", x(nearestX)).attr("x2", x(nearestX));
            hoverDots.style("display", null).selectAll("*").remove();
            tooltipG.style("display", null).selectAll("*").remove();

            const entries: { key: string; val: number }[] = [];
            let nearestKey = "";
            let nearestDist = Infinity;

            seriesKeys.forEach(key => {
                const pts = sortedGrouped.get(key) ?? [];
                const ptIdx = bisect(pts, nearestX, 0, pts.length);
                const pt = pts[ptIdx];
                if (!pt || pt.x !== nearestX) return;
                const dist = Math.abs(y(pt.y) - ym);
                if (dist < nearestDist) { nearestDist = dist; nearestKey = key; }
                entries.push({ key, val: pt.y });
            });

            highlightSeries(svg, nearestKey);

            const isFastestLap = (key: string) =>
                fastest !== null && key === fastest.series && nearestX === fastest.x;

            // Grey dots first so active dot renders on top
            entries.filter(({ key }) => key !== nearestKey).forEach(({ key, val }) => {
                hoverDots.append("circle")
                    .attr("cx", x(nearestX)).attr("cy", y(val))
                    .attr("r", 3)
                    .attr("fill", isFastestLap(key) ? "#bf00ff" : "#ccc")
                    .attr("stroke", "white").attr("stroke-width", 1.5);
            });
            entries.filter(({ key }) => key === nearestKey).forEach(({ val }) => {
                hoverDots.append("circle")
                    .attr("cx", x(nearestX)).attr("cy", y(val))
                    .attr("r", 5)
                    .attr("fill", isFastestLap(nearestKey) ? "#bf00ff" : color(nearestKey))
                    .attr("stroke", "white").attr("stroke-width", 1.5);
            });
            if (!entries.length) return;

            const lh = 16, pad = 6, bw = 155;
            const bh = entries.length * lh + pad * 2 + 20;
            let tx = x(nearestX) + 14;
            if (tx + bw > W - mr) tx = x(nearestX) - bw - 14;
            const ty = mt + 4;

            tooltipG.append("rect")
                .attr("x", tx).attr("y", ty)
                .attr("width", bw).attr("height", bh).attr("rx", 4)
                .attr("fill", "white").attr("stroke", "#ddd")
                .attr("filter", "drop-shadow(0 1px 3px rgba(0,0,0,0.12))");

            tooltipG.append("text")
                .attr("x", tx + pad).attr("y", ty + pad + 10)
                .attr("font-size", 11).attr("font-weight", "bold")
                .text(fmtX(nearestX));

            entries.sort((a, b) => a.val - b.val).forEach(({ key, val }, i) => {
                const rowG = tooltipG.append("g")
                    .attr("transform", `translate(${tx + pad},${ty + pad + 26 + i * lh})`);
                rowG.append("circle").attr("r", 4).attr("cx", 4).attr("cy", -3)
                    .attr("fill", isFastestLap(key) ? "#bf00ff" : color(key));
                rowG.append("text").attr("x", 12).attr("font-size", 10).text(`${key}: ${fmtY(rawLookup.get(key)?.get(nearestX) ?? val)}`);
            });
        }

        function onLeave() {
            hoverLine.style("display", "none");
            hoverDots.style("display", "none");
            tooltipG.style("display", "none");
            restoreSeries(svg);
        }

        svg.append("rect")
            .attr("x", ml).attr("y", mt)
            .attr("width", W - ml - mr).attr("height", H - mt - mb)
            .attr("fill", "none").attr("pointer-events", "all")
            .on("pointermove", onMove)
            .on("pointerleave", onLeave);

    }, [data, seriesOrder, seriesColors, xLabel, yLabel, formatX, formatY, scPeriods, vscPeriods]);

    return (
        <div ref={containerRef} className="w-full overflow-x-auto">
            <svg ref={svgRef} />
        </div>
    );
}
