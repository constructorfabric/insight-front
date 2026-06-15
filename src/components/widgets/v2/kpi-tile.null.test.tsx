/**
 * Component-layer guard for the null-vs-zero bug (Refs #1337).
 *
 * The transform emits `value: null` for a not-ingested metric (see
 * transforms.null-vs-zero.test.ts). This pins that <KpiTile> then renders the
 * not-ingested affordance ("—") and NEVER a literal "0" — the user-visible
 * symptom we hit: a blank metric showing a confident, wrong zero.
 */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { KpiTile } from "./kpi-tile";
import type { IcKpi, PeriodValue } from "@/types/insight";

const fetchCatalog = catalogClient.fetchCatalog as ReturnType<typeof vi.fn>;

function nullKpi(): IcKpi {
  return {
    period: "month" as PeriodValue,
    metric_key: "prs_merged",
    label: "PRs Merged",
    value: null, // not ingested → transform emitted null
    raw_value: null,
    unit: "",
    sublabel: "GitHub",
    description: "Pull requests merged in the selected period.",
    delta: "",
    delta_type: "neutral",
  };
}

describe("<KpiTile> — not-ingested (null) rendering (Refs #1337)", () => {
  beforeEach(() => {
    authStore.reset();
    authStore.setTenantId("t-1");
    fetchCatalog.mockReset();
  });

  it("renders '—' for a null value and never a literal 0", async () => {
    fetchCatalog.mockResolvedValue(
      buildCatalogResponse([
        {
          metric_key: "ic_kpis.prs_merged",
          higher_is_better: true,
          schema_status: "ok",
        },
      ]),
    );
    renderWithCatalogClient(
      <KpiTile kpi={nullKpi()} median={{ p50: 6, n: 4 }} />,
    );

    expect(await screen.findByText("—")).toBeTruthy();
    // The bug: a not-ingested metric must not show a confident "0".
    expect(screen.queryByText("0")).toBeNull();
    // And no peer "vs median" bar when there's no value to compare.
    expect(screen.queryByText(/vs median/)).toBeNull();
  });
});
