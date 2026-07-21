import type { DateRange } from "@/api/period-to-date-range";
import { TeamMetricTimeseriesView } from "@/components/widgets/metric-views/team-metric-timeseries-view";
import type { TeamMemberRef } from "@/components/widgets/metric-views/team-member-timeseries-model";
import type { MetricGroup } from "@/lib/insight/groups";
import { cn } from "@/lib/utils";

export type { TeamMemberRef };

export interface TeamCollectionDrilldownProps {
  def: MetricGroup;
  members: TeamMemberRef[];
  range: DateRange;
  className?: string;
}

/**
 * Drilldown for a metrics-backed group over a roster of people: one
 * member-columns timeseries card per `teamDrilldown` metric. Every number is
 * a member's own weekly fact or period total — nothing is pooled and no peer
 * standing is drawn here; judgment lives on the section cards, heatmap, and
 * attention block.
 */
export function TeamCollectionDrilldown({
  def,
  members,
  range,
  className,
}: TeamCollectionDrilldownProps) {
  if (members.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No team members to display.
      </p>
    );
  }
  if (def.teamDrilldown.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No data for this group in the selected period.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid min-h-full grid-cols-1 content-start gap-4 p-4 sm:p-6 lg:grid-cols-2",
        className
      )}
    >
      {def.teamDrilldown.map((metricKey) => (
        <TeamMetricTimeseriesView
          key={metricKey}
          id={`team-${def.id}-${metricKey}`}
          members={members}
          range={range}
          metricKey={metricKey}
        />
      ))}
    </div>
  );
}
