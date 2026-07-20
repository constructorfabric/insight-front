/**
 * Component-render coverage for `<MembersHeatmap>`.
 *
 * The heatmap runs entirely on unified `/v1/metric-results` data: each cell's
 * value is the member's period value and its colour is the member's standing vs
 * THEIR OWN department cohort (the peer view), derived once by
 * `derivePeerStanding`. Covers:
 *   - a bottom-quartile cell renders the value coloured "Bottom 25%".
 *   - a member with no usable peer stats renders "No peer data" (neutral).
 *   - the "N issues" chip + issues sort come from `metricBelowByMember`
 *     (across all groups), not the heatmap's own columns.
 *   - clicking a column header sorts by that column honouring its direction.
 *   - the details sheet renders the member's full peer-story, bucketed.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The member popup renders a router `<Link>` to the IC page; these tests
// don't exercise navigation, so stub Link to a plain anchor (with the
// `$person` param interpolated so the href is assertable).
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      ...rest
    }: {
      to?: string;
      params?: Record<string, string>;
      children?: React.ReactNode;
    }) => (
      <a
        href={(to ?? "").replace(
          "$person",
          encodeURIComponent(params?.person ?? ""),
        )}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

import type {
  MetricDirection,
  MetricFormat,
} from "@/api/metric-results-client";
import type {
  NormalizedMetricResult,
  PeerEntityStats,
} from "@/lib/metrics/collection";
import type { PeerStoryEntry } from "@/lib/metrics/peer-story";
import type { PeerStatusWithNeutral } from "@/lib/peers";
import { MembersHeatmap } from "./index";
import type { PeriodValue, TeamMember } from "@/types/insight";

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    person_id: "alice@example.com",
    period: "month" as PeriodValue,
    name: "Alice",
    seniority: "Senior",
    supervisor_email: null,
    org_unit_id: "Engineering",
    tasks_closed: 8,
    bugs_fixed: 2,
    dev_time_h: null,
    prs_merged: 3,
    build_success_pct: null,
    focus_time_pct: null,
    ai_tools: [],
    ai_loc_share_pct: null,
    ...overrides,
  };
}

function peerRow(
  id: string,
  s: Partial<Omit<PeerEntityStats, "entity_id">> = {},
): PeerEntityStats {
  return {
    entity_id: id,
    target_value: s.target_value ?? 1,
    p25: s.p25 ?? null,
    median: s.median ?? null,
    p75: s.p75 ?? null,
    min: s.min ?? null,
    max: s.max ?? null,
    n: s.n ?? 12,
  };
}

function metric(cfg: {
  key: string;
  label: string;
  direction?: MetricDirection;
  format?: MetricFormat;
  unit?: string | null;
  period: Array<{ id: string; value: number | null }>;
  peer?: PeerEntityStats[];
}): NormalizedMetricResult {
  return {
    metric_key: cfg.key,
    label: cfg.label,
    unit: cfg.unit ?? null,
    computation: "sum",
    format: cfg.format ?? "integer",
    direction: cfg.direction ?? "higher_is_better",
    period: {
      view: "period",
      values: cfg.period.map((p) => ({ entity_id: p.id, value: p.value })),
    },
    peer: cfg.peer ? { view: "peer", values: cfg.peer } : undefined,
  };
}

function makeEntry(overrides: Partial<PeerStoryEntry> = {}): PeerStoryEntry {
  return {
    key: "git.commits",
    label: "Commits",
    value: 12,
    unit: null,
    format: "integer",
    higherIsBetter: true,
    neutral: false,
    observed: true,
    stats: { p25: 5, p50: 8, p75: 10, min: 2, max: 14, n: 10 },
    status: "top",
    gapPct: 0.5,
    gapDelta: 4,
    severity: 0.5,
    ...overrides,
  };
}

const NO_PREV = new Map<string, NormalizedMetricResult>();
const NO_BELOW = new Map<string, number>();
const NO_ENTRIES = new Map<string, PeerStoryEntry[]>();

describe("<MembersHeatmap>", () => {
  it("colours a bottom-quartile cell against the member's peer cohort", async () => {
    // Alice's resolution time (30, lower = better) sits above her cohort p75
    // (6) ⇒ bottom quartile. The cell shows the value and reads "Bottom 25%".
    const heatmapByKey = new Map<string, NormalizedMetricResult>([
      [
        "tasks.resolution_time",
        metric({
          key: "tasks.resolution_time",
          label: "Resolution time",
          direction: "lower_is_better",
          unit: "d",
          period: [{ id: "alice@example.com", value: 30 }],
          peer: [
            peerRow("alice@example.com", {
              target_value: 30,
              p25: 4,
              median: 5,
              p75: 6,
              min: 2,
              max: 10,
            }),
          ],
        }),
      ],
    ]);
    render(
      <MembersHeatmap
        members={[makeMember()]}
        heatmapByKey={heatmapByKey}
        previousHeatmapByKey={NO_PREV}
        metricBelowByMember={NO_BELOW}
        metricEntriesByPerson={NO_ENTRIES}
      />,
    );
    expect(
      await screen.findByRole("button", {
        name: "Alice — Resolution time: 30 d — Bottom 25%",
      }),
    ).toBeInTheDocument();
  });

  it("renders 'No peer data' when the metric has no usable cohort stats", () => {
    const heatmapByKey = new Map<string, NormalizedMetricResult>([
      [
        "tasks.closed",
        metric({
          key: "tasks.closed",
          label: "Tasks closed",
          period: [{ id: "alice@example.com", value: 8 }],
          // Peer row present but percentiles null ⇒ suppressed ⇒ neutral.
          peer: [peerRow("alice@example.com", { target_value: 8 })],
        }),
      ],
    ]);
    render(
      <MembersHeatmap
        members={[makeMember()]}
        heatmapByKey={heatmapByKey}
        previousHeatmapByKey={NO_PREV}
        metricBelowByMember={NO_BELOW}
        metricEntriesByPerson={NO_ENTRIES}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Alice — Tasks closed: 8 — No peer data",
      }),
    ).toBeInTheDocument();
  });

  it("drives the 'N issues' chip from metricBelowByMember (all groups)", () => {
    const heatmapByKey = new Map<string, NormalizedMetricResult>([
      [
        "tasks.closed",
        metric({
          key: "tasks.closed",
          label: "Tasks closed",
          period: [{ id: "alice@example.com", value: 8 }],
        }),
      ],
    ]);
    // Two below-peer standings across all groups — not from this one column.
    const metricBelowByMember = new Map([["alice@example.com", 2]]);
    render(
      <MembersHeatmap
        members={[makeMember()]}
        heatmapByKey={heatmapByKey}
        previousHeatmapByKey={NO_PREV}
        metricBelowByMember={metricBelowByMember}
        metricEntriesByPerson={NO_ENTRIES}
      />,
    );
    // Rendered once in the desktop grid, once in the mobile triage list.
    expect(screen.getAllByText("2 issues").length).toBeGreaterThan(0);
  });

  it("clicking a column header sorts rows by that column's value and direction", async () => {
    const user = userEvent.setup();
    const heatmapByKey = new Map<string, NormalizedMetricResult>([
      [
        "tasks.resolution_time",
        metric({
          key: "tasks.resolution_time",
          label: "Resolution time",
          direction: "lower_is_better",
          unit: "d",
          period: [
            { id: "alice@example.com", value: 30 },
            { id: "bob@example.com", value: 5 },
          ],
        }),
      ],
    ]);
    render(
      <MembersHeatmap
        members={[
          makeMember({ person_id: "alice@example.com", name: "Alice" }),
          makeMember({ person_id: "bob@example.com", name: "Bob" }),
        ]}
        heatmapByKey={heatmapByKey}
        previousHeatmapByKey={NO_PREV}
        metricBelowByMember={NO_BELOW}
        metricEntriesByPerson={NO_ENTRIES}
      />,
    );
    const memberNameOrder = () =>
      screen
        .getAllByRole("button")
        .map((b) => b.textContent?.trim())
        .filter((t) => t === "Alice" || t === "Bob");

    // Default "issues" sort; none present ⇒ tie broken by name → Alice first.
    expect(memberNameOrder()[0]).toBe("Alice");

    // Resolution time is lower-is-better → Bob (5) sorts above Alice (30).
    await user.click(
      screen.getByRole("button", {
        name: "Resolution time — sort by this column",
      }),
    );
    expect(memberNameOrder()[0]).toBe("Bob");
  });

  it("sorts by name on demand", async () => {
    const user = userEvent.setup();
    render(
      <MembersHeatmap
        members={[
          makeMember({ person_id: "bob@example.com", name: "Bob" }),
          makeMember({ person_id: "alice@example.com", name: "Alice" }),
        ]}
        heatmapByKey={new Map()}
        previousHeatmapByKey={NO_PREV}
        metricBelowByMember={NO_BELOW}
        metricEntriesByPerson={NO_ENTRIES}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Name" }));
    const order = screen
      .getAllByRole("button")
      .map((b) => b.textContent?.trim())
      .filter((t) => t === "Alice" || t === "Bob");
    expect(order[0]).toBe("Alice");
  });

  it("renders the details sheet from the member's peer-story, bucketed", async () => {
    const user = userEvent.setup();
    const metricBelowByMember = new Map([["alice@example.com", 1]]);
    const metricEntriesByPerson = new Map<string, PeerStoryEntry[]>([
      [
        "alice@example.com",
        [
          makeEntry({
            key: "tasks.resolution_time",
            label: "Resolution time",
            value: 30,
            unit: "d",
            higherIsBetter: false,
            status: "bottom" as PeerStatusWithNeutral,
            severity: 2,
            stats: { p25: 4, p50: 5, p75: 6, min: 2, max: 10, n: 10 },
          }),
          makeEntry({ key: "git.commits", label: "Commits", status: "top" }),
          makeEntry({
            key: "wiki.edits",
            label: "Wiki edits",
            status: "in_pack" as PeerStatusWithNeutral,
          }),
        ],
      ],
    ]);
    render(
      <MembersHeatmap
        members={[makeMember()]}
        heatmapByKey={new Map()}
        previousHeatmapByKey={NO_PREV}
        metricBelowByMember={metricBelowByMember}
        metricEntriesByPerson={metricEntriesByPerson}
      />,
    );

    // "worst" headline is the bottom entry with the highest severity.
    expect(screen.getAllByText("worst: Resolution time").length).toBeGreaterThan(
      0,
    );

    await user.click(await screen.findByRole("button", { name: "Alice" }));
    expect(
      await screen.findByRole("link", { name: "Open in IC view" }),
    ).toHaveAttribute("href", "/ic/alice%40example.com/personal");
    await user.click(screen.getByRole("button", { name: "Expand details" }));

    const sheet = within(await screen.findByRole("dialog", { name: "Alice" }));
    expect(sheet.getByText("Needs attention")).toBeInTheDocument();
    expect(sheet.getByText("Strong points")).toBeInTheDocument();
    // Bucket title and the in-pack row's status label share this text.
    expect(sheet.getAllByText("On par").length).toBeGreaterThan(0);
    expect(sheet.getByText("Resolution time")).toBeInTheDocument();
    expect(sheet.getByText("Commits")).toBeInTheDocument();
    // Unified entry carries its own cohort median, server-formatted.
    expect(sheet.getAllByText("median 8").length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(sheet.getByText("Wiki edits")).toBeInTheDocument();
    });
  });
});
