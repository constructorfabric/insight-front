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

import {
  CHART_BLUE,
  CHART_FONT_TICK,
  CHART_GRAY,
  CHART_GREEN,
  CHART_PURPLE,
  CHART_TRACK_BG,
} from "./chart-colors";
import { ComingSoon } from "./coming-soon";

export interface DeliveryTrendsProps {
  data: Array<{
    label: string;
    commits: number;
    prsMerged: number | null;
    tasksDone: number;
  }>;
}

type ChartRow = {
  label: string;
  Commits: number;
  "PRs Merged": number | null;
  "Tasks Done": number;
};

function DeliveryTrendsImpl({ data }: DeliveryTrendsProps) {
  if (data.length === 0) return <ComingSoon variant="card" />;

  const hasPrs = data.some((r) => r.prsMerged !== null);

  const chartData: ChartRow[] = data.map((r) => ({
    label: r.label,
    Commits: r.commits,
    "PRs Merged": r.prsMerged,
    "Tasks Done": r.tasksDone,
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
        <ChartLine
          dataKey="Commits"
          stroke={CHART_BLUE}
          strokeWidth={2}
        />
        {hasPrs ? (
          <ChartLine
              dataKey="PRs Merged"
            stroke={CHART_PURPLE}
            strokeWidth={2}
                connectNulls={false}
          />
        ) : null}
        <ChartLine
          dataKey="Tasks Done"
          stroke={CHART_GREEN}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export const DeliveryTrends = memo(DeliveryTrendsImpl);
