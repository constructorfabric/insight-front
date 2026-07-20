import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettings } from "@/hooks/use-settings";
import { formatMetricValue } from "@/lib/format";
import { HEATMAP_METRIC_KEYS } from "@/lib/insight/groups";
import {
  forEntity,
  type NormalizedMetricResult,
} from "@/lib/metrics/collection";
import {
  computeDelta,
  deltaStatus,
  formatTileDelta,
  type MetricDelta,
} from "@/lib/metrics/delta";
import { normalizePersonId } from "@/lib/metrics/entity";
import { derivePeerStanding } from "@/lib/metrics/peer-standing";
import { worstEntry, type PeerStoryEntry } from "@/lib/metrics/peer-story";
import type { MetricDirection, MetricFormat } from "@/api/metric-results-client";
import {
  applyFocus,
  PEER_CELL,
  PEER_FILL,
  PEER_LABEL,
  PEER_TEXT,
  type FocusMode,
  type PeerStatusWithNeutral,
} from "@/lib/peers";
import { applyFocusStatus, STATUS_TEXT_CLASS } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/types/insight";

import {
  MemberDetailsSheet,
  type MemberDetailRow,
} from "./member-details-sheet";
import { TriageList, type TriageRow } from "./triage-list";

interface Column {
  /** Metric key — column identity + sort key. */
  key: string;
  label: string;
  unit: string | null;
  format: MetricFormat;
  direction: MetricDirection;
}

function columnFor(metric: NormalizedMetricResult): Column {
  return {
    key: metric.metric_key,
    label: metric.label,
    unit: metric.unit,
    format: metric.format,
    direction: metric.direction,
  };
}

/**
 * Which end of the scale reads as "better", or `null` for a neutral metric
 * that carries no better/worse judgment. Never collapse `direction` to a
 * boolean: a neutral metric is a fact, not a score, and must not be tinted
 * or ranked as if higher were good.
 */
function betterWhenHigher(direction: MetricDirection): boolean | null {
  if (direction === "higher_is_better") return true;
  if (direction === "lower_is_better") return false;
  return null;
}

function displayValue(value: number | null, col: Column): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatMetricValue(value, col.format, col.unit);
}

type SortKey = "name" | "issues" | string;

export interface MembersHeatmapProps {
  members: TeamMember[];
  /** Current-period value + peer standing per heatmap metric key. */
  heatmapByKey: Map<string, NormalizedMetricResult>;
  /** Previous-period value per heatmap metric key (period view only). */
  previousHeatmapByKey: Map<string, NormalizedMetricResult>;
  /**
   * Per-member below-peer counts across ALL group collections, keyed by
   * normalized person id. Drives the "N issues" chip and the issues sort — the
   * full standing, not just the heatmap's own columns.
   */
  metricBelowByMember: Map<string, number>;
  /**
   * Per-person peer-story entries across all groups, keyed by normalized person
   * id. Backs the details sheet and the "worst" headline; each entry's standing
   * is vs the person's own org unit (resolved by the peer view).
   */
  metricEntriesByPerson: Map<string, PeerStoryEntry[]>;
}

export function MembersHeatmap({
  members,
  heatmapByKey,
  previousHeatmapByKey,
  metricBelowByMember,
  metricEntriesByPerson,
}: MembersHeatmapProps) {
  const { focusMode } = useSettings();
  const [sortKey, setSortKey] = useState<SortKey>("issues");
  const [sheetMember, setSheetMember] = useState<TeamMember | null>(null);

  // FE owns the key list + order; each present metric contributes a column.
  const columns = useMemo(
    () =>
      HEATMAP_METRIC_KEYS.flatMap((key) => {
        const metric = heatmapByKey.get(key);
        return metric ? [columnFor(metric)] : [];
      }),
    [heatmapByKey],
  );

  const rows = useMemo(() => {
    return members.map((m) => {
      const entityId = normalizePersonId(m.person_id);
      const entries = metricEntriesByPerson.get(entityId) ?? [];
      const cells: CellShape[] = columns.map((col) => {
        const metric = heatmapByKey.get(col.key)!;
        const data = forEntity(metric, entityId);
        const standing = derivePeerStanding(metric.direction, {
          value: data.value,
          peer: data.peer,
        });
        const prevMetric = previousHeatmapByKey.get(col.key);
        const previous = prevMetric
          ? forEntity(prevMetric, entityId).value
          : null;
        // Period-over-period move via the shared, computation-aware delta
        // (percentage points for percent ratios, relative % otherwise) — the
        // same helper the KPI tiles use. Only meaningful for observed members.
        const delta = standing.observed
          ? computeDelta(
              data.value,
              previous,
              metric.computation,
              metric.format,
            )
          : null;
        return {
          col,
          value: data.value,
          previous,
          delta,
          status: standing.rank,
          median: standing.stats?.p50 ?? null,
          observed: standing.observed,
        };
      });
      const belowCount = metricBelowByMember.get(entityId) ?? 0;
      const topCount = entries.filter((e) => e.status === "top").length;
      return {
        member: m,
        entityId,
        cells,
        belowCount,
        topCount,
        worstMetricLabel: worstEntry(entries)?.label ?? null,
      };
    });
  }, [
    members,
    columns,
    heatmapByKey,
    previousHeatmapByKey,
    metricBelowByMember,
    metricEntriesByPerson,
  ]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    if (sortKey === "name") {
      copy.sort((a, b) => a.member.name.localeCompare(b.member.name));
    } else if (sortKey === "issues") {
      copy.sort(
        (a, b) =>
          b.belowCount - a.belowCount ||
          a.member.name.localeCompare(b.member.name),
      );
    } else {
      const colIdx = columns.findIndex((c) => c.key === sortKey);
      const col = columns[colIdx];
      if (col) {
        copy.sort((a, b) => {
          const ac = a.cells[colIdx];
          const bc = b.cells[colIdx];
          // Members the source never measured sort last in either direction —
          // an unmeasured cell (or a zero-filled sum with no observation) is
          // not a best or worst score. Mirrors the "—" the cell renders.
          const aMissing =
            !ac?.observed || ac.value == null || !Number.isFinite(ac.value);
          const bMissing =
            !bc?.observed || bc.value == null || !Number.isFinite(bc.value);
          if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);
          // lower-is-better ranks smallest first; higher-is-better and neutral
          // rank largest first (neutral's order is arbitrary but stable — it
          // implies no "best").
          return betterWhenHigher(col.direction) === false
            ? ac!.value! - bc!.value!
            : bc!.value! - ac!.value!;
        });
      }
    }
    return copy;
  }, [rows, sortKey, columns]);

  const gridStyle = {
    gridTemplateColumns: `minmax(140px, max-content) repeat(${columns.length}, minmax(56px, 1fr))`,
  };

  const triageRows: TriageRow[] = sortedRows.map((r) => ({
    member: r.member,
    belowCount: r.belowCount,
    topCount: r.topCount,
    worstMetricLabel: r.worstMetricLabel,
  }));

  // The sheet renders the member's FULL standing (every group), not just the
  // heatmap columns — the unified peer-story entries carry each metric's own
  // value, cohort median, and standing.
  const sheetRows: MemberDetailRow[] = useMemo(() => {
    if (!sheetMember) return [];
    const entries =
      metricEntriesByPerson.get(normalizePersonId(sheetMember.person_id)) ?? [];
    return entries.map((e) => ({
      key: e.key,
      label: e.label,
      display: formatMetricValue(e.value, e.format, e.unit),
      medianDisplay: e.stats
        ? formatMetricValue(e.stats.p50, e.format, e.unit)
        : null,
      status: e.status,
    }));
  }, [sheetMember, metricEntriesByPerson]);

  const handleMemberClick = (m: TeamMember) => {
    setSheetMember(m);
  };

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Members × metrics</CardTitle>
        <p className="text-xs text-muted-foreground">
          {members.length} members · cell colour = position vs department peers
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort:</span>
          <Button
            size="sm"
            variant={sortKey === "issues" ? "default" : "outline"}
            onClick={() => setSortKey("issues")}
          >
            Most issues
          </Button>
          <Button
            size="sm"
            variant={sortKey === "name" ? "default" : "outline"}
            onClick={() => setSortKey("name")}
          >
            Name
          </Button>
        </div>
        <div className="sm:hidden">
          <TriageList rows={triageRows} onMemberClick={handleMemberClick} />
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <div className="inline-grid min-w-full gap-1" style={gridStyle}>
            <div aria-hidden />
            {columns.map((c) => (
              <ColumnHeader
                key={c.key}
                col={c}
                active={sortKey === c.key}
                onClick={() => setSortKey(c.key)}
              />
            ))}
            {sortedRows.map((row) => (
              <MemberRow
                key={row.member.person_id}
                row={row}
                focusMode={focusMode}
                onOpenSheet={() => handleMemberClick(row.member)}
              />
            ))}
          </div>
          <Legend />
        </div>
      </CardContent>
      <MemberDetailsSheet
        member={sheetMember}
        rows={sheetRows}
        onOpenChange={(open) => {
          if (!open) setSheetMember(null);
        }}
      />
    </Card>
  );
}

interface CellShape {
  col: Column;
  value: number | null;
  previous: number | null;
  /** Period-over-period move (computation-aware); null when unobservable. */
  delta: MetricDelta | null;
  status: PeerStatusWithNeutral;
  median: number | null;
  /** False when the source never observed this member — a zero-filled sum
   *  reads 0, but an unmeasured member has no value to show. */
  observed: boolean;
}

interface RowShape {
  member: TeamMember;
  entityId: string;
  cells: CellShape[];
  belowCount: number;
  topCount: number;
  worstMetricLabel: string | null;
}

function HeatmapCell({
  cell,
  memberName,
  focusMode,
}: {
  cell: CellShape;
  memberName: string;
  focusMode: FocusMode;
}) {
  const focused = applyFocus(cell.status, focusMode);
  const { col, value, previous, delta, median, observed } = cell;
  // Show the trend arrow only when the delta rounds to a real change (the
  // KPI-tile suppression rule); direction from the sign, favorability from
  // the shared deltaStatus (neutral metric → muted, no good/bad).
  const deltaText = delta ? formatTileDelta(delta) : null;
  const showWow = deltaText != null;
  const wowUp = delta != null && delta.value > 0;
  const WowIcon = wowUp ? ArrowUp : ArrowDown;
  const wowTint = delta
    ? STATUS_TEXT_CLASS[applyFocusStatus(deltaStatus(delta, col.direction), focusMode)]
    : "text-muted-foreground";
  const display = observed ? displayValue(value, col) : "—";
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${memberName} — ${col.label}: ${display} — ${PEER_LABEL[focused]}`}
            className={cn(
              "flex h-12 items-center justify-center gap-1 rounded-sm text-sm font-medium tabular-nums transition hover:brightness-95",
              PEER_CELL[focused],
            )}
          >
            <span>{display}</span>
            {showWow && value != null ? (
              <WowIcon className={cn("size-3 shrink-0", wowTint)} aria-hidden />
            ) : null}
          </button>
        }
      />
      <PopoverContent className="w-64 p-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">{col.label}</p>
          <p className="text-xs text-muted-foreground">{memberName}</p>
          <p
            className={cn(
              "mt-2 text-2xl font-semibold tabular-nums",
              PEER_TEXT[focused],
            )}
          >
            {display}
          </p>
          <p className="text-xs text-muted-foreground">
            {median != null
              ? `Dept median: ${formatMetricValue(median, col.format, col.unit)}`
              : "No peer data"}
          </p>
          <p className={cn("mt-1 text-xs font-medium", PEER_TEXT[focused])}>
            {PEER_LABEL[focused]}
          </p>
          {showWow && previous != null ? (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              vs previous period:{" "}
              <span className={cn("font-medium", wowTint)}>{deltaText}</span>{" "}
              (was {formatMetricValue(previous, col.format, col.unit)})
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MemberRow({
  row,
  focusMode,
  onOpenSheet,
}: {
  row: RowShape;
  focusMode: FocusMode;
  onOpenSheet: () => void;
}) {
  const { member, cells, belowCount, topCount, worstMetricLabel } = row;
  const issueText =
    belowCount > 0
      ? `${belowCount} issue${belowCount === 1 ? "" : "s"}`
      : "on par";
  return (
    <>
      <div className="flex min-h-14 flex-col justify-center gap-0.5 px-2 py-1">
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="truncate text-left text-sm font-medium leading-tight hover:underline"
                >
                  {member.name}
                </button>
              }
            />
            <PopoverContent className="w-64 p-3">
              <p className="truncate text-sm font-semibold">{member.name}</p>
              {member.seniority ? (
                <p className="truncate text-xs text-muted-foreground">
                  {member.seniority}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {belowCount} below department peers · {topCount} in top
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                <Button
                  size="sm"
                  render={
                    <Link
                      to="/ic/$person/personal"
                      params={{ person: member.person_id }}
                    />
                  }
                >
                  Open in IC view
                </Button>
                <Button size="sm" variant="outline" onClick={onOpenSheet}>
                  Expand details
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <span
            className={cn(
              "rounded-sm px-1.5 py-0.5 text-xs font-medium",
              belowCount > 0
                ? PEER_CELL[applyFocus("bottom", focusMode)]
                : PEER_CELL[applyFocus("in_pack", focusMode)],
            )}
          >
            {issueText}
          </span>
        </div>
        {belowCount > 0 && worstMetricLabel ? (
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            worst: {worstMetricLabel}
          </p>
        ) : null}
      </div>
      {cells.map((cell) => (
        <HeatmapCell
          key={cell.col.key}
          cell={cell}
          memberName={member.name}
          focusMode={focusMode}
        />
      ))}
    </>
  );
}

function ColumnHeader({
  col,
  active,
  onClick,
}: {
  col: Column;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            title={col.label}
            className={cn(
              "flex h-9 cursor-pointer items-center justify-center px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
              active && "text-foreground underline underline-offset-4",
            )}
            aria-label={`${col.label} — sort by this column`}
          >
            <span className="truncate">{col.label}</span>
          </button>
        }
      />
      <TooltipContent side="top" className="max-w-56">
        <span className="flex flex-col gap-0.5 leading-snug">
          <span className="font-medium">{col.label}</span>
          <span className="text-background/70">
            {col.unit ? `${col.unit} · ` : ""}
            {betterWhenHigher(col.direction) === true
              ? "higher is better · "
              : betterWhenHigher(col.direction) === false
                ? "lower is better · "
                : ""}
            click to sort
          </span>
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <LegendSwatch className={PEER_FILL.top}>Top 25%</LegendSwatch>
      <LegendSwatch className={PEER_FILL.in_pack}>On par</LegendSwatch>
      <LegendSwatch className={PEER_FILL.bottom}>Bottom 25%</LegendSwatch>
      <LegendSwatch className={PEER_FILL.neutral}>No peer data</LegendSwatch>
    </div>
  );
}

function LegendSwatch({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-3 rounded-sm", className)} />
      {children}
    </span>
  );
}
