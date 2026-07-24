/**
 * Component-render coverage for `<DistributionStrip>` (Refs #80, wave 3).
 *
 * Catalog-driven; covers the wave-1 DESIGN §3.3 rendering rules:
 *   - `ok` row renders with peer coloring driven by the catalog's
 *     `higher_is_better`.
 *   - `schema_status='error'` rows collapse peer coloring to neutral —
 *     the strip shows "no peer data" / suppresses the positioned chip.
 *   - Missing-id (no catalog entry) collapses to neutral with the same
 *     UX as schema_error.
 */

import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authStore } from "@/auth/auth-store";

vi.mock("@/api/catalog-client", async () => {
  const actual = await vi.importActual<typeof import("@/api/catalog-client")>(
    "@/api/catalog-client",
  );
  return { ...actual, fetchCatalog: vi.fn() };
});

import * as catalogClient from "@/api/catalog-client";
import {
  buildCatalogResponse,
  renderWithCatalogClient,
} from "@/test/catalog-test-utils";
import { DistributionStrip } from "./distribution-strip";
import type { PeerStats } from "@/lib/peers";
import type { BulletMetric, PeriodValue } from "@/types/insight";
import { makeSession } from "@/test/session";

const fetchCatalog = catalogClient.fetchCatalog as ReturnType<typeof vi.fn>;

function makeBullet(overrides: Partial<BulletMetric> = {}): BulletMetric {
  return {
    period: "month" as PeriodValue,
    section: "task_delivery",
    metric_key: "tasks_completed",
    label: "Tasks Closed",
    value: "12",
    unit: "tasks",
    range_min: "0",
    range_max: "20",
    median: "5",
    median_label: "Median: 5 tasks",
    bar_left_pct: 0,
    bar_width_pct: 60,
    median_left_pct: 25,
    status: "good",
    drill_id: "",
    ...overrides,
  };
}

const STATS: PeerStats = { p25: 3, p50: 5, p75: 10, min: 1, max: 15, n: 12 };

describe("<DistributionStrip>", () => {
  beforeEach(() => {
    authStore.reset();
    authStore.setAuthenticated(makeSession());
    fetchCatalog.mockReset();
  });
  afterEach(() => {
    authStore.reset();
  });

  it("renders peer-position text for an ok row above p75", async () => {
    fetchCatalog.mockResolvedValue(
      buildCatalogResponse([
        {
          metric_key: "task_delivery_bullet_rows.tasks_completed",
          higher_is_better: true,
          schema_status: "ok",
        },
      ]),
    );
    renderWithCatalogClient(
      <DistributionStrip
        row={makeBullet({ value: "12", peer: STATS })}
        cohortLabel="team"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/top 25% in team/i)).toBeInTheDocument();
    });
  });

  it("collapses peer coloring to 'no peer data' for schema_error rows", async () => {
    fetchCatalog.mockResolvedValue(
      buildCatalogResponse([
        {
          metric_key: "task_delivery_bullet_rows.tasks_completed",
          higher_is_better: true,
          schema_status: "error",
        },
      ]),
    );
    renderWithCatalogClient(
      <DistributionStrip
        row={makeBullet({ value: "12", schema_error: true, peer: STATS })}
        cohortLabel="team"
      />,
    );
    // schema_error rows: peer chip is 'neutral' which renders as "no
    // peer data" per `positionText` in distribution-strip.
    await waitFor(() => {
      expect(screen.getByText(/no peer data/i)).toBeInTheDocument();
      expect(screen.queryByText(/top 25% in team/i)).not.toBeInTheDocument();
    });
  });

  it("collapses to 'no peer data' when the catalog has no row for this metric", async () => {
    fetchCatalog.mockResolvedValue(buildCatalogResponse([]));
    renderWithCatalogClient(
      <DistributionStrip
        row={makeBullet({ value: "12", peer: STATS })}
        cohortLabel="team"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/no peer data/i)).toBeInTheDocument();
      expect(screen.queryByText(/top 25% in team/i)).not.toBeInTheDocument();
    });
  });
});
