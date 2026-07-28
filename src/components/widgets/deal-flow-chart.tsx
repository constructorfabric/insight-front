import { memo } from "react";
import {
  CartesianGrid,
  ChartLegend,
  ChartLine,
  ChartTooltip,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "@/components/ui/chart";

import type { CrmFlowPoint } from "@/types/insight";

import {
  CHART_BLUE,
  CHART_FONT_TICK,
  CHART_GRAY,
  CHART_GREEN,
  CHART_PURPLE,
  CHART_TRACK_BG,
} from "./chart-colors";
import { ComingSoon } from "./coming-soon";

export interface DealFlowChartProps {
  data: CrmFlowPoint[];
}

type ChartRow = {
  label: string;
  Opened: number;
  Closed: number;
  Won: number;
};

function DealFlowChartImpl({ data }: DealFlowChartProps) {
  if (data.length === 0) return <ComingSoon variant="card" />;

  const chartData: ChartRow[] = data.map((r) => ({
    label: r.label,
    Opened: r.opened,
    Closed: r.closed,
    Won: r.won,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_TRACK_BG} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: CHART_FONT_TICK, fill: CHART_GRAY }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          width={28}
          tick={{ fontSize: CHART_FONT_TICK, fill: CHART_GRAY }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <ChartTooltip />
        <ChartLegend wrapperStyle={{ fontSize: CHART_FONT_TICK, paddingTop: 8 }} />
        <ChartLine dataKey="Opened" stroke={CHART_BLUE} strokeWidth={2} />
        <ChartLine dataKey="Closed" stroke={CHART_PURPLE} strokeWidth={2} />
        <ChartLine dataKey="Won" stroke={CHART_GREEN} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export const DealFlowChart = memo(DealFlowChartImpl);
