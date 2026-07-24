/**
 * Component-render coverage for `<CountersBlock>` (Refs #80, wave 3).
 *
 * Verifies the wave-1 DESIGN §3.3 rendering rules through the catalog
 * hook:
 *   - `ok` rows render with peer coloring driven by `higher_is_better`
 *     (top-quartile value surfaces as the "Top win" hero).
 *   - `schema_status='error'` rows (surfaced as `row.schema_error: true`
 *     by transforms.ts) collapse to neutral — never the hero callout.
 *   - Missing-id rows (no catalog entry for the row's metric_key)
 *     collapse to neutral.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
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
import { CountersBlock } from "./counters-block";
import type { PeerStats } from "@/lib/peers";
import type { BulletMetric, PeriodValue } from "@/types/insight";

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

describe("<CountersBlock>", () => {
  beforeEach(() => {
    authStore.reset();
    authStore.setAuthenticated({
      personId: "p-1",
      email: "bob.park@example.com",
      tenantId: "t-1",
      roles: ["user"],
      csrfToken: "csrf-1",
    });
    fetchCatalog.mockReset();
  });
  afterEach(() => {
    authStore.reset();
  });

  it("renders the 'Top win' hero for an ok-row with value above p75", async () => {
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
      <CountersBlock rows={[makeBullet({ value: "12", peer: STATS })]} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Top win")).toBeInTheDocument();
    });
    expect(screen.getByText("Tasks Closed")).toBeInTheDocument();
  });

  it("collapses a schema_error row to neutral — no hero callout", async () => {
    fetchCatalog.mockResolvedValue(
      buildCatalogResponse([
        {
          metric_key: "task_delivery_bullet_rows.tasks_completed",
          higher_is_better: true,
          schema_status: "error",
          schema_error_code: "table_not_found",
        },
      ]),
    );
    renderWithCatalogClient(
      <CountersBlock
        rows={[makeBullet({ value: "12", schema_error: true, peer: STATS })]}
      />,
    );
    // `waitFor` retries until the post-fetch render commits — without
    // it, the assertion can run against the initial loading-state
    // render (sourced from the compile-in fallback, which DOES contain
    // the metric_key).
    await waitFor(() => {
      expect(screen.queryByText("Top win")).not.toBeInTheDocument();
      expect(screen.queryByText("Top issue")).not.toBeInTheDocument();
    });
  });

  it("missing-id row collapses to neutral (no peer coloring)", async () => {
    fetchCatalog.mockResolvedValue(buildCatalogResponse([]));
    renderWithCatalogClient(
      <CountersBlock rows={[makeBullet({ value: "12", peer: STATS })]} />,
    );
    await waitFor(() => {
      expect(screen.queryByText("Top win")).not.toBeInTheDocument();
      expect(screen.queryByText("Top issue")).not.toBeInTheDocument();
    });
  });

  describe("list layout", () => {
    it("renders a flat value-vs-cohort row per metric", async () => {
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
        <CountersBlock
          rows={[makeBullet({ value: "12", peer: STATS })]}
          layout="list"
        />,
      );
      await waitFor(() => {
        // value 12 > p75 (10) → top quartile.
        expect(screen.getAllByText("top 25%").length).toBeGreaterThan(0);
      });
      // Mobile + desktop layouts both render the row.
      expect(screen.getAllByText("Tasks Closed").length).toBeGreaterThan(0);
      expect(screen.getAllByText("12").length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(/department median: 5 tasks/).length,
      ).toBeGreaterThan(0);
    });

    it("labels an in-pack value 'on par' with the cohort median", async () => {
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
        <CountersBlock
          rows={[makeBullet({ value: "5", peer: STATS })]}
          layout="list"
          cohortLabel="team"
        />,
      );
      await waitFor(() => {
        expect(screen.getAllByText("on par").length).toBeGreaterThan(0);
      });
      expect(
        screen.getAllByText(/team median: 5 tasks/).length,
      ).toBeGreaterThan(0);
    });

    it("shows an em-dash position and 'no peer data' without stats", async () => {
      fetchCatalog.mockResolvedValue(buildCatalogResponse([]));
      renderWithCatalogClient(
        <CountersBlock rows={[makeBullet({ value: "12" })]} layout="list" />,
      );
      await waitFor(() => {
        expect(screen.getAllByText("no peer data").length).toBeGreaterThan(0);
      });
      expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    });

    it("renders nothing when every row is valueless", async () => {
      fetchCatalog.mockResolvedValue(buildCatalogResponse([]));
      const { container } = renderList(
        <CountersBlock
          rows={[
            makeBullet({ metric_key: "a", value: "—" }),
            makeBullet({ metric_key: "b", value: "" }),
          ]}
          layout="list"
        />,
      );
      await waitFor(() => {
        expect(fetchCatalog).toHaveBeenCalled();
      });
      expect(container.textContent).toBe("");
    });
  });
});

// Local render helper that also exposes the container for empty-render
// assertions (renderWithCatalogClient only returns the query client).
function renderList(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
