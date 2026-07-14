import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { useCatalog } from "@/api/use-catalog";
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
import {
  bulletCatalogKey,
  type CatalogByKey,
} from "@/lib/insight/v2/peer-status";
import type { MetricFormat } from "@/api/metric-results-client";
import type { PeerStoryEntry } from "@/lib/metrics/peer-story";
import { MIN_DEPT_COHORT_N } from "@/lib/insight/v2/team-member-status";
import {
  applyFocus,
  PEER_CELL,
  PEER_FILL,
  PEER_LABEL,
  PEER_TEXT,
  peerStatusVsQuartiles,
  type DeptCohorts,
  type DeptStatsMap,
  type FocusMode,
  type PeerStats,
  type PeerStatusWithNeutral,
} from "@/lib/peers";
import { cn } from "@/lib/utils";
import type { BulletMetric, TeamMember } from "@/types/insight";

import {
  MemberDetailsSheet,
  type MemberDetailRow,
} from "./member-details-sheet";
import { TriageList, type TriageRow } from "./triage-list";

const WOW_THRESHOLD = 0.05;

/**
 * Per-member-department lookup of a metric's distribution. Returns null when
 * the member has no department, the department has no row for the metric, or
 * the cohort is degenerate (`n < MIN_DEPT_COHORT_N`) — all of which collapse
 * the cell to a neutral "No peer data" status.
 */
function deptStatsFor(
  statsMap: DeptStatsMap,
  orgUnitId: string | null,
  metricKey: string,
): PeerStats | null {
  if (!orgUnitId) return null;
  const stats = statsMap.get(orgUnitId)?.get(metricKey);
  if (!stats || stats.n < MIN_DEPT_COHORT_N) return null;
  return stats;
}

const EMPTY_DEPT_COHORTS: DeptCohorts = { kpi: new Map(), bullet: new Map() };

function computeWowPct(
  current: number | null,
  previous: number | null,
): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (Math.abs(previous) < 1e-9) return null;
  return (current - previous) / previous;
}

type TeamRowKey =
  | "tasks_closed"
  | "prs_merged"
  | "bugs_fixed"
  | "focus_time_pct"
  | "ai_loc_share_pct";

interface BaseColumn {
  key: string;
  label: string;
  short: string;
  unit: string;
  higher_is_better: boolean;
  mobile: boolean;
}

interface TeamRowColumn extends BaseColumn {
  source: "team_row";
  teamRowField: TeamRowKey;
}

interface BulletColumn extends BaseColumn {
  source: "bullet";
  metricKey: string;
}

interface MetricColumn extends BaseColumn {
  source: "metric";
  entryKey: string;
  format: MetricFormat;
}

type ColumnDef = TeamRowColumn | BulletColumn | MetricColumn;

// FE-controlled column layout: `label`/`short`/`unit`/`mobile`/`source`
// are display concerns the wire response doesn't carry, and the
// `team_row` source columns reference `TeamMember` wire fields with no
// matching catalog row (e.g. `tasks_closed` from `RawTeamMemberRow`).
// `higher_is_better` is therefore left compile-in here even though
// bullet-source widgets (#80, wave 3) source it from `useCatalog`.
// A future wave can fold the bullet-source `higher_is_better` entries
// into a catalog lookup once team_row policy thresholds also move to
// the wire.
//
// These are only the CURATED core columns (stable order, mobile flags,
// hand-picked short labels). The full column set is derived at render
// time: every legacy bullet and unified-path (git/ai) entry present in
// the roster's data becomes an additional column (#1729).
const CORE_COLUMNS: ColumnDef[] = [
  {
    key: "tasks_closed",
    label: "Tasks closed",
    short: "Tasks",
    unit: "",
    higher_is_better: true,
    mobile: true,
    source: "team_row",
    teamRowField: "tasks_closed",
  },
  {
    key: "mean_time_to_resolution",
    label: "Mean time to resolution",
    short: "MTTR",
    unit: "d",
    higher_is_better: false,
    mobile: true,
    source: "bullet",
    metricKey: "mean_time_to_resolution",
  },
  {
    key: "prs_merged",
    label: "PRs merged",
    short: "PRs",
    unit: "",
    higher_is_better: true,
    mobile: true,
    source: "team_row",
    teamRowField: "prs_merged",
  },
  {
    key: "bugs_fixed",
    label: "Bugs fixed",
    short: "Bugs",
    unit: "",
    higher_is_better: true,
    mobile: false,
    source: "team_row",
    teamRowField: "bugs_fixed",
  },
  {
    key: "focus_time_pct",
    label: "Focus time",
    short: "Focus %",
    unit: "%",
    higher_is_better: true,
    mobile: false,
    source: "team_row",
    teamRowField: "focus_time_pct",
  },
  {
    key: "ai_loc_share_pct",
    label: "AI lines share",
    short: "AI %",
    unit: "%",
    higher_is_better: true,
    mobile: false,
    source: "team_row",
    teamRowField: "ai_loc_share_pct",
  },
  {
    key: "meeting_hours",
    label: "Meeting hours",
    short: "Mtg h",
    unit: "h",
    higher_is_better: false,
    mobile: false,
    source: "bullet",
    metricKey: "meeting_hours",
  },
];

/**
 * Compact one-letter units ("d", "h", "%") glue to the number the way the
 * curated columns always rendered; word units from bullet rows ("meetings",
 * "files") get a separating space.
 */
function unitSuffix(unit: string | undefined | null): string {
  if (!unit) return "";
  return unit.length > 1 ? ` ${unit}` : unit;
}

function getNumericTeamRow(m: TeamMember, key: TeamRowKey): number | null {
  const raw = m[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function getNumericBullet(
  rows: BulletMetric[] | undefined,
  metricKey: string,
): number | null {
  const r = rows?.find((b) => b.metric_key === metricKey);
  if (!r) return null;
  const n = Number(r.value);
  return Number.isFinite(n) ? n : null;
}

function valueForColumn(
  col: TeamRowColumn | BulletColumn,
  member: TeamMember,
  bullets: BulletMetric[] | undefined,
): number | null {
  if (col.source === "team_row") {
    return getNumericTeamRow(member, col.teamRowField);
  }
  return getNumericBullet(bullets, col.metricKey);
}

/** The `metric_key` a heatmap column is identified / colored by. */
function metricKeyForColumn(col: ColumnDef): string {
  switch (col.source) {
    case "team_row":
      return col.teamRowField;
    case "bullet":
      return col.metricKey;
    case "metric":
      return col.entryKey;
  }
}

/**
 * Peer status of a bullet against the member's OWN department distribution,
 * oriented by the catalog's `higher_is_better`. Mirrors `peerStatusForRow`
 * but reads the member-department cohort map instead of the row's own `peer`,
 * so each member is judged against department peers (not the displayed roster).
 */
function deptBulletStatus(
  b: BulletMetric,
  bulletStats: DeptStatsMap,
  orgUnitId: string | null,
  byMetricKey: CatalogByKey,
): PeerStatusWithNeutral {
  if (b.schema_error) return "neutral";
  const value = Number(b.value);
  if (!Number.isFinite(value)) return "neutral";
  const raw = deptStatsFor(bulletStats, orgUnitId, b.metric_key);
  if (!raw) return "neutral";
  const m = byMetricKey(bulletCatalogKey(b));
  if (!m) return "neutral";
  // Cohort and bullet share the catalog unit (no FE rescaling) → compare raw.
  return peerStatusVsQuartiles(value, raw, m.higher_is_better);
}

type SortKey = "name" | "issues" | string;

export interface MembersHeatmapProps {
  members: TeamMember[];
  bulletsByPerson?: Map<string, BulletMetric[]>;
  previousBulletsByPerson?: Map<string, BulletMetric[]>;
  previousMembers?: Map<string, TeamMember>;
  /**
   * Per-person entries from the unified-metrics groups (git/ai), keyed by
   * lowercase `person_id`. Sheet-only: these groups carry their own cohort
   * (each entry's status is vs the person's own org unit, resolved by the
   * peer view), so they don't ride the dept-cohort maps the grid colors from.
   */
  metricEntriesByPerson?: Map<string, PeerStoryEntry[]>;
  /**
   * Per-department metric distributions, split by source family (`kpi` for
   * the team_row columns, `bullet` for member bullet comparisons). Each
   * member is colored against THEIR OWN department's distribution; a member
   * whose department is absent or degenerate (`n < MIN_DEPT_COHORT_N`)
   * renders neutral.
   */
  deptCohorts?: DeptCohorts;
}

export function MembersHeatmap({
  members,
  bulletsByPerson,
  previousBulletsByPerson,
  previousMembers,
  deptCohorts,
  metricEntriesByPerson,
}: MembersHeatmapProps) {
  const { focusMode } = useSettings();
  const { byMetricKey } = useCatalog();
  const [sortKey, setSortKey] = useState<SortKey>("issues");
  const [sheetMember, setSheetMember] = useState<TeamMember | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Cohort = each member's OWN department distribution (per-(org_unit_id,
  // metric_key) quartiles fetched by the screen). A member's cell colour =
  // their position vs department peers, not vs the displayed roster.
  const cohorts: DeptCohorts = deptCohorts ?? EMPTY_DEPT_COHORTS;

  // Full column set (#1729): the curated core columns first, then a column
  // for every legacy bullet and unified-path (git/ai) entry seen anywhere in
  // the roster. Deduped by metric key; unified entries additionally dedupe
  // against earlier columns by dot-suffix key and display label (the
  // `git.prs_merged` ≈ `prs_merged` overlap). Members missing a metric
  // render "—" in that cell.
  const columns = useMemo(() => {
    const cols: ColumnDef[] = [...CORE_COLUMNS];
    const seenKeys = new Set(cols.map(metricKeyForColumn));
    const seenLabels = new Set(cols.map((c) => c.label.toLowerCase()));
    for (const m of members) {
      const bullets = bulletsByPerson?.get(m.person_id.toLowerCase()) ?? [];
      for (const b of bullets) {
        if (seenKeys.has(b.metric_key)) continue;
        seenKeys.add(b.metric_key);
        seenLabels.add(b.label.toLowerCase());
        cols.push({
          key: b.metric_key,
          label: b.label,
          short: b.label,
          unit: b.unit ?? "",
          higher_is_better:
            byMetricKey(bulletCatalogKey(b))?.higher_is_better ?? true,
          mobile: false,
          source: "bullet",
          metricKey: b.metric_key,
        });
      }
    }
    for (const m of members) {
      const entries =
        metricEntriesByPerson?.get(m.person_id.toLowerCase()) ?? [];
      for (const e of entries) {
        const suffix = e.key.split(".").pop() ?? e.key;
        if (
          seenKeys.has(e.key) ||
          seenKeys.has(suffix) ||
          seenLabels.has(e.label.toLowerCase())
        ) {
          continue;
        }
        seenKeys.add(e.key);
        seenLabels.add(e.label.toLowerCase());
        cols.push({
          key: e.key,
          label: e.label,
          short: e.label,
          unit: e.unit ?? "",
          higher_is_better: e.higherIsBetter,
          mobile: false,
          source: "metric",
          entryKey: e.key,
          format: e.format,
        });
      }
    }
    return cols;
  }, [members, bulletsByPerson, metricEntriesByPerson, byMetricKey]);

  const rows = useMemo(() => {
    const built = members.map((m) => {
      const personIdKey = m.person_id.toLowerCase();
      const bullets = bulletsByPerson?.get(personIdKey);
      const prevBullets = previousBulletsByPerson?.get(personIdKey);
      const prevMember = previousMembers?.get(personIdKey);
      const entries = metricEntriesByPerson?.get(personIdKey) ?? [];
      const cells = columns.map((col): CellShape => {
        // Unified-path columns carry their own cohort: the entry's status is
        // already resolved vs the person's own org unit by the peer view.
        if (col.source === "metric") {
          const entry = entries.find((e) => e.key === col.entryKey);
          return {
            col,
            value: entry?.value ?? null,
            previous: null,
            status: entry?.status ?? "neutral",
            median: entry?.stats?.p50 ?? null,
            unit: entry?.unit ?? col.unit,
            format: col.format,
          };
        }
        const value = valueForColumn(col, m, bullets);
        const previous = prevMember
          ? valueForColumn(col, prevMember, prevBullets)
          : null;
        // Bullet-source columns honor the wave-1 schema_status='error'
        // contract: a broken-catalog bullet's heatmap cell renders the
        // value but suppresses peer coloring (status → 'neutral'). The
        // belowCount/topCount chips therefore don't count broken
        // metrics, matching the same rule applied to the bullet-derived
        // attention surfaces above.
        const sourceBullet =
          col.source === "bullet"
            ? (bullets ?? []).find((b) => b.metric_key === col.metricKey)
            : null;
        const rawStats = deptStatsFor(
          col.source === "team_row" ? cohorts.kpi : cohorts.bullet,
          m.org_unit_id,
          metricKeyForColumn(col),
        );
        const colSchemaError = sourceBullet?.schema_error === true;
        const status: PeerStatusWithNeutral =
          !colSchemaError && value !== null && rawStats
            ? peerStatusVsQuartiles(value, rawStats, col.higher_is_better)
            : "neutral";
        return {
          col,
          value,
          previous,
          status,
          median: rawStats?.p50 ?? null,
          unit: sourceBullet?.unit ?? col.unit,
        };
      });
      const belowCount = cells.filter((c) => c.status === "bottom").length;
      const topCount = cells.filter((c) => c.status === "top").length;
      const worstBullet =
        (bullets ?? [])
          .map((b) => {
            const value = Number(b.value);
            const rawStats = deptStatsFor(
              cohorts.bullet,
              m.org_unit_id,
              b.metric_key,
            );
            const catalogRow = byMetricKey(bulletCatalogKey(b));
            const higherIsBetter = catalogRow?.higher_is_better ?? true;
            let gap = 0;
            if (
              !b.schema_error &&
              catalogRow &&
              rawStats &&
              Number.isFinite(value) &&
              Math.abs(rawStats.p50) > 1e-9
            ) {
              const raw = (value - rawStats.p50) / Math.abs(rawStats.p50);
              gap = higherIsBetter ? raw : -raw;
            }
            return {
              bullet: b,
              ps: deptBulletStatus(
                b,
                cohorts.bullet,
                m.org_unit_id,
                byMetricKey,
              ),
              gap,
            };
          })
          .filter((e) => e.ps === "bottom")
          .sort((a, b) => a.gap - b.gap)[0]?.bullet ?? null;
      return {
        member: m,
        bullets: bullets ?? [],
        orgUnitId: m.org_unit_id,
        cells,
        belowCount,
        topCount,
        worstMetricLabel: worstBullet?.label ?? null,
      };
    });
    return built;
  }, [members, bulletsByPerson, previousBulletsByPerson, previousMembers, metricEntriesByPerson, columns, cohorts, byMetricKey]);

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
          const av = a.cells[colIdx]?.value ?? Number.POSITIVE_INFINITY;
          const bv = b.cells[colIdx]?.value ?? Number.POSITIVE_INFINITY;
          return col.higher_is_better ? bv - av : av - bv;
        });
      }
    }
    return copy;
  }, [rows, sortKey, columns]);

  const gridStyle = {
    gridTemplateColumns: `minmax(140px, max-content) repeat(${columns.length}, minmax(56px, max-content))`,
  };

  const triageRows: TriageRow[] = sortedRows.map((r) => ({
    member: r.member,
    cells: r.cells.map((c) => ({
      label: c.col.label,
      short: c.col.short,
      value: c.value,
      status: c.status,
    })),
    belowCount: r.belowCount,
    topCount: r.topCount,
  }));

  // The sheet shows the member's FULL metric set (#1729). The grid columns
  // now cover that set themselves, so the sheet is mostly a linear read of
  // the row's cells; the bullet/entry passes below only catch stragglers the
  // column dedup dropped (e.g. a label collision with a curated column).
  const sheetRows: MemberDetailRow[] = useMemo(() => {
    if (!sheetMember) return [];
    const row = rows.find((r) => r.member.person_id === sheetMember.person_id);
    if (!row) return [];
    const columnKeys = new Set(columns.map(metricKeyForColumn));
    const columnLabels = new Set(columns.map((c) => c.label.toLowerCase()));
    const fromCells: MemberDetailRow[] = row.cells.map((c) => ({
      key: c.col.key,
      label: c.col.label,
      display:
        c.value == null
          ? "—"
          : c.format
            ? formatMetricValue(c.value, c.format, c.unit || null)
            : `${Math.round(c.value)}${unitSuffix(c.unit)}`,
      medianDisplay:
        c.median == null
          ? null
          : c.format
            ? formatMetricValue(c.median, c.format, c.unit || null)
            : `${Math.round(c.median)}${unitSuffix(c.unit)}`,
      status: c.status,
    }));
    const fromBullets: MemberDetailRow[] = row.bullets
      .filter((b) => !columnKeys.has(b.metric_key))
      .map((b) => {
        const stats = deptStatsFor(cohorts.bullet, row.orgUnitId, b.metric_key);
        const unitSuffix = b.unit ? ` ${b.unit}` : "";
        return {
          key: b.metric_key,
          label: b.label,
          display: `${b.value}${unitSuffix}`,
          medianDisplay:
            stats != null
              ? `${Math.round(stats.p50 * 10) / 10}${unitSuffix}`
              : null,
          status: deptBulletStatus(b, cohorts.bullet, row.orgUnitId, byMetricKey),
        };
      });
    const fromMetrics: MemberDetailRow[] = (
      metricEntriesByPerson?.get(row.member.person_id.toLowerCase()) ?? []
    )
      .filter(
        (e) =>
          !columnKeys.has(e.key) &&
          !columnKeys.has(e.key.split(".").pop() ?? e.key) &&
          !columnLabels.has(e.label.toLowerCase()),
      )
      .map((e) => ({
        key: e.key,
        label: e.label,
        display: formatMetricValue(e.value, e.format, e.unit),
        medianDisplay: e.stats
          ? formatMetricValue(e.stats.p50, e.format, e.unit)
          : null,
        status: e.status,
      }));
    return [...fromCells, ...fromBullets, ...fromMetrics];
  }, [rows, columns, sheetMember, cohorts.bullet, byMetricKey, metricEntriesByPerson]);

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
                bulletStats={cohorts.bullet}
                byMetricKey={byMetricKey}
                expanded={expandedId === row.member.person_id}
                onToggleExpand={() =>
                  setExpandedId((cur) =>
                    cur === row.member.person_id ? null : row.member.person_id,
                  )
                }
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
  col: ColumnDef;
  value: number | null;
  previous: number | null;
  status: PeerStatusWithNeutral;
  median: number | null;
  unit: string;
  /** Set on unified-path cells — display goes through `formatMetricValue`. */
  format?: MetricFormat;
}

interface RowShape {
  member: TeamMember;
  bullets: BulletMetric[];
  orgUnitId: string | null;
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
  const { col, value, previous, median, unit, format } = cell;
  const wowPct = computeWowPct(value, previous);
  const showWow = wowPct != null && Math.abs(wowPct) >= WOW_THRESHOLD;
  const wowUp = wowPct != null && wowPct > 0;
  const improving = showWow && wowUp === col.higher_is_better;
  const WowIcon = wowUp ? ArrowUp : ArrowDown;
  const wowTint = improving
    ? PEER_TEXT[applyFocus("top", focusMode)]
    : PEER_TEXT[applyFocus("bottom", focusMode)];
  const display =
    value == null
      ? "—"
      : format
        ? formatMetricValue(value, format, unit || null)
        : `${Math.round(value)}${unitSuffix(unit)}`;
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
            {median == null
              ? "No peer data"
              : format
                ? `Cohort median: ${formatMetricValue(median, format, unit || null)}`
                : `Dept median: ${Math.round(median * 10) / 10}${unitSuffix(unit)}`}
          </p>
          <p className={cn("mt-1 text-xs font-medium", PEER_TEXT[focused])}>
            {PEER_LABEL[focused]}
          </p>
          {showWow && previous != null ? (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              week-over-week:{" "}
              <span className={cn("font-medium", wowTint)}>
                {wowUp ? "+" : ""}
                {Math.round((wowPct ?? 0) * 100)}%
              </span>{" "}
              (was {Math.round(previous)}
              {unit ?? ""})
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
  bulletStats,
  byMetricKey,
  expanded,
  onToggleExpand,
  onOpenSheet,
}: {
  row: RowShape;
  focusMode: FocusMode;
  bulletStats: DeptStatsMap;
  byMetricKey: CatalogByKey;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenSheet: () => void;
}) {
  const { member, cells, belowCount, topCount, worstMetricLabel, bullets, orgUnitId } =
    row;
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
                  aria-expanded={expanded}
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
                <Button size="sm" onClick={onOpenSheet}>
                  Open in IC view
                </Button>
                <Button size="sm" variant="outline" onClick={onToggleExpand}>
                  {expanded ? "Collapse details" : "Expand details"}
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
      {expanded ? (
        <ExpandedBullets
          bullets={bullets}
          columnCount={cells.length}
          focusMode={focusMode}
          bulletStats={bulletStats}
          orgUnitId={orgUnitId}
          byMetricKey={byMetricKey}
        />
      ) : null}
    </>
  );
}

function ExpandedBullets({
  bullets,
  columnCount,
  focusMode,
  bulletStats,
  orgUnitId,
  byMetricKey,
}: {
  bullets: BulletMetric[];
  columnCount: number;
  focusMode: FocusMode;
  bulletStats: DeptStatsMap;
  orgUnitId: string | null;
  byMetricKey: CatalogByKey;
}) {
  const RANK: Record<PeerStatusWithNeutral, number> = {
    bottom: 0,
    in_pack: 1,
    top: 2,
    neutral: 3,
  };
  const annotated = bullets.map((b) => ({
    bullet: b,
    status: deptBulletStatus(b, bulletStats, orgUnitId, byMetricKey),
  }));
  annotated.sort((a, b) => RANK[a.status] - RANK[b.status]);
  return (
    <div
      className="border-t border-border/60 px-3 py-3"
      style={{ gridColumn: `1 / span ${columnCount + 1}` }}
    >
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        All metrics
      </p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {annotated.map(({ bullet: b, status }) => {
          const focused = applyFocus(status, focusMode);
          return (
            <span
              key={b.metric_key}
              className={cn(
                "flex items-center justify-between gap-2 rounded-sm border border-border/40 px-2 py-1.5 text-xs",
                PEER_CELL[focused],
              )}
            >
              <span className="truncate font-medium" title={b.label}>
                {b.label}
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {b.value}
                {b.unit ? ` ${b.unit}` : ""}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ColumnHeader({
  col,
  active,
  onClick,
}: {
  col: ColumnDef;
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
            className={cn(
              "flex h-9 cursor-pointer items-center justify-center text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground",
              active && "text-foreground underline underline-offset-4",
            )}
            aria-label={`${col.label} — sort by this column`}
          >
            <span className="truncate">{col.short}</span>
          </button>
        }
      />
      <TooltipContent side="top" className="max-w-56">
        <span className="flex flex-col gap-0.5 leading-snug">
          <span className="font-medium">{col.label}</span>
          <span className="text-background/70">
            {col.unit ? `${col.unit} · ` : ""}
            {col.higher_is_better ? "higher is better" : "lower is better"} ·
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

