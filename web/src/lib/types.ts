import type { HierarchyRectangularNode, Transition, BaseType } from "d3";

export type RectNode = HierarchyRectangularNode<TreeNode>;
export type GT = Transition<BaseType, unknown, null, undefined>;

export interface MultiLineDatum {
    x: number;
    y: number;
    series: string;
}

export interface MultiLineChartProps {
    data: MultiLineDatum[];
    seriesOrder?: string[];
    seriesColors?: Record<string, string>;
    xLabel?: string;
    yLabel?: string;
    formatX?: (v: number) => string;
    formatY?: (v: number) => string;
    scPeriods?: [number, number][];
    vscPeriods?: [number, number][];
}

export interface RaceSession {
    session_key: number;
    year: number;
    location: string;
    country_name: string;
    date_start: string;
    meeting_name?: string;
}

export interface RaceLapsResponse {
    laps: MultiLineDatum[];
    driverOrder: string[];
    driverColors: Record<string, string>;
    scPeriods?: [number, number][];
    vscPeriods?: [number, number][];
}

export interface ChartDimensions {
    W: number;
    H: number;
    mt: number;
    mb: number;
    ml: number;
    mr: number;
    itemsPerRow: number;
    itemW: number;
}

export interface Season {
    year: number;
    totalPitTime: number;
}

export interface Race {
    id: number;
    officialName: string;
    round: number;
    totalPitTime: number;
}

export interface DriverPitStop {
    driverId: string;
    constructorId: string;
    totalPitTime: number;
    stopCount: number;
}

export interface TreeNode {
    name: string;
    value?: number;
    children?: TreeNode[];
    type?: "season" | "race" | "driver";
    year?: number;
    id?: number;
    loaded?: boolean;
    constructorId?: string;
}