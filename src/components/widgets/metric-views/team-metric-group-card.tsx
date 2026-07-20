import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { ComingSoon } from "@/components/widgets/coming-soon";
import { useSettings } from "@/hooks/use-settings";
import type { MetricGroup } from "@/lib/insight/groups";
import {
  teamMetricStandings,
  type TeamMetricStanding,
} from "@/lib/insight/team-metrics";
import {
  gradeSectionStanding,
  rankCounts,
  sectionStandingPhrase,
} from "@/lib/scoring";
import { PEER_FILL } from "@/lib/peers";
import {
  STATUS_BG_CLASS,
  STATUS_STRIPE_LEFT,
  STATUS_TEXT_CLASS,
  applyFocusStatus,
} from "@/lib/status";
import type { MetricCollectionResult } from "@/queries/metric-results";
import { cn } from "@/lib/utils";

/**
 * How the roster splits on one metric — each segment's width is its share of
 * the roster. `unmeasured` (roster minus those with a standing) rides the
 * track, so a mostly-unmeasured metric reads as a mostly-empty bar rather
 * than a confident verdict.
 */
function CompositionBar({
  top,
  inPack,
  bottom,
  unmeasured,
}: {
  top: number;
  inPack: number;
  bottom: number;
  unmeasured: number;
}) {
  const total = top + inPack + bottom + unmeasured;
  if (total === 0) return null;
  const seg = (n: number, className: string) =>
    n > 0 ? (
      <span className={className} style={{ width: `${(n / total) * 100}%` }} />
    ) : null;
  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full"
      role="img"
      aria-label={`${top} ahead, ${inPack} on par, ${bottom} trailing, ${unmeasured} unmeasured of ${total}`}
    >
      {seg(top, PEER_FILL.top)}
      {seg(inPack, PEER_FILL.in_pack)}
      {seg(bottom, PEER_FILL.bottom)}
      {seg(unmeasured, PEER_FILL.neutral)}
    </div>
  );
}

export interface TeamMetricGroupCardProps {
  def: MetricGroup;
  data: MetricCollectionResult;
  memberIds: string[];
  onOpen: () => void;
  subtitle?: string;
}

/**
 * Card for a metrics-backed group over a roster of people. No pooled team
 * value — the roster is a set of individuals, not a unit — so each preview
 * row shows how the members split against their OWN cohorts as a composition
 * bar plus the count trailing their peers.
 */
export function TeamMetricGroupCard({
  def,
  data,
  memberIds,
  onOpen,
  subtitle,
}: TeamMetricGroupCardProps) {
  const { focusMode } = useSettings();

  if (data.isPending) {
    // Keep the card's identity while it loads: the name in the header, a
    // spinner in the body. Not interactive — nothing to open yet.
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">{def.title}</CardTitle>
          {subtitle ? (
            <CardDescription className="text-xs text-muted-foreground">
              {subtitle}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex items-center justify-center py-6">
          <Spinner
            className="size-5 text-muted-foreground"
            aria-label={`Loading ${def.title}`}
          />
        </CardContent>
      </Card>
    );
  }
  if (data.isError) {
    return (
      <ComingSoon
        variant="card"
        state="error"
        label={def.title}
        onRetry={data.refetch}
      />
    );
  }

  const standings = teamMetricStandings(def, data.byKey, memberIds);
  const scored = standings.filter((s) => s.scored > 0);
  const counts = rankCounts(
    standings.map((standing) => ({ row: standing, rank: standing.verdict })),
  );
  const status = applyFocusStatus(gradeSectionStanding(counts), focusMode);
  const badgeText = sectionStandingPhrase(counts);

  const preview: TeamMetricStanding[] = def.card.preview
    .map((key) => scored.find((s) => s.metric.metric_key === key))
    .filter((s): s is TeamMetricStanding => s != null);
  const stripeClass = STATUS_STRIPE_LEFT[status];

  return (
    <Card
      render={
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${def.title} details`}
        />
      }
      className={cn(
        "text-left transition-colors hover:bg-accent/50",
        stripeClass,
      )}
    >
      <CardHeader>
        <CardTitle className="text-base font-semibold">{def.title}</CardTitle>
        <CardDescription className="flex flex-col gap-1 text-xs">
          {subtitle ? (
            <span className="text-muted-foreground">{subtitle}</span>
          ) : null}
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                STATUS_BG_CLASS[status],
              )}
              aria-hidden
            />
            <span className="tabular-nums">{badgeText}</span>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {scored.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No metrics with peer data for this period.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {(preview.length > 0 ? preview : scored.slice(0, 3)).map(
              (standing) => {
                const unmeasured = Math.max(
                  0,
                  memberIds.length - standing.scored,
                );
                return (
                  <li
                    key={standing.metric.metric_key}
                    className="flex flex-col gap-1 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {standing.metric.label}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs tabular-nums",
                          standing.bottom > 0
                            ? STATUS_TEXT_CLASS.bad
                            : "text-muted-foreground",
                        )}
                      >
                        {standing.bottom > 0
                          ? `${standing.bottom} trailing`
                          : "on par"}
                      </span>
                    </div>
                    <CompositionBar
                      top={standing.top}
                      inPack={standing.inPack}
                      bottom={standing.bottom}
                      unmeasured={unmeasured}
                    />
                  </li>
                );
              },
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
