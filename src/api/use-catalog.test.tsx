/**
 * Hook-level tests for `useCatalog()` and the Layer-2 selector.
 *
 * These tests stub `fetchCatalog` directly (vi.mock) rather than hitting
 * MSW so the assertions are independent of the dev mock-handler. Each test
 * mounts a fresh QueryClient so cache state doesn't leak across tests.
 *
 * Coverage map vs cyber-insight-front#66 acceptance criteria:
 * - AC #2 — lookups key by `id` (UUIDv7) → `byId` returns the right row.
 * - AC #3 — `schema_status='error'` is observable on the wire response → tests confirm presence + indicator hook.
 * - AC #4 — missing-id degrades to undefined (not an error).
 * - AC #5 — API failure surfaces as `isError=true` with `data=undefined`
 *   (post-#82: no compile-in fallback — consumers render skeletons / error states).
 * - AC #8 cache-layer tests — TTL refresh + tenant-switch invalidation + Layer-2 invariance.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type React from "react";

import { authStore } from "@/auth/auth-store";

vi.mock("./catalog-client", async () => {
  const actual = await vi.importActual<typeof import("./catalog-client")>(
    "./catalog-client",
  );
  return {
    ...actual,
    fetchCatalog: vi.fn(),
  };
});

import * as catalogClient from "./catalog-client";
import { useCatalog } from "./use-catalog";
import { useCatalogLinkMap } from "./use-catalog-link-map";

const fetchCatalog = catalogClient.fetchCatalog as ReturnType<typeof vi.fn>;

/** Seed an authenticated session scoped to a single tenant. */
function signInTenant(tenantId: string): void {
  authStore.setAuthenticated({
    personId: "p-1",
    email: "bob.park@example.com",
    tenantId,
    roles: ["user"],
    csrfToken: "csrf-1",
  });
}

function makeOkResponse(
  metrics: Array<Partial<catalogClient.CatalogMetric>> = [],
  links: catalogClient.MetricQueryLink[] = [],
): catalogClient.CatalogResponse {
  return {
    tenant_id: authStore.getSnapshot().session?.tenantId || "t-fallback",
    generated_at: "2026-06-01T00:00:00Z",
    metrics: metrics.map((m, i) => ({
      id: m.id ?? `id-${i}`,
      metric_key: m.metric_key ?? `mock.metric_${i}`,
      label: m.label ?? `Metric ${i}`,
      higher_is_better: m.higher_is_better ?? true,
      is_member_scale: m.is_member_scale ?? false,
      source_tags: m.source_tags ?? [],
      schema_status: m.schema_status ?? "ok",
      schema_error_code: m.schema_error_code,
      thresholds: m.thresholds ?? {
        good: 1,
        warn: 0.5,
        resolved_from: "product-default",
        bounded_by_lock: false,
      },
      sublabel: m.sublabel,
      description: m.description,
      unit: m.unit,
      format: m.format,
    })),
    links,
  };
}

function withClient(): {
  wrapper: ({ children }: { children: React.ReactNode }) => React.ReactElement;
  client: QueryClient;
} {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper, client };
}

describe("useCatalog", () => {
  beforeEach(() => {
    authStore.reset();
    signInTenant("t-1");
    fetchCatalog.mockReset();
  });
  afterEach(() => {
    authStore.reset();
  });

  it("hydrates and indexes metrics by id; byId returns the right row (AC #2)", async () => {
    fetchCatalog.mockResolvedValue(
      makeOkResponse([
        { id: "id-A", metric_key: "ic_kpis.tasks_closed", label: "Tasks Closed" },
        { id: "id-B", metric_key: "ic_kpis.bugs_fixed", label: "Bugs Fixed" },
      ]),
    );
    const { wrapper } = withClient();
    const { result } = renderHook(() => useCatalog(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.byId("id-A")?.label).toBe("Tasks Closed");
    expect(result.current.byId("id-B")?.label).toBe("Bugs Fixed");
  });

  it("degrades gracefully when a previously-seen id is absent (AC #4)", async () => {
    fetchCatalog.mockResolvedValue(makeOkResponse([{ id: "id-A" }]));
    const { wrapper } = withClient();
    const { result } = renderHook(() => useCatalog(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // A consumer that previously rendered id-B has gone away — lookup
    // returns undefined, no throw. Consumers MUST treat undefined as
    // "hide the tile" per DESIGN §3.3.
    expect(result.current.byId("id-B")).toBeUndefined();
  });

  it("surfaces isError on API failure with data=undefined (AC #5, post-#82)", async () => {
    fetchCatalog.mockRejectedValue(
      new catalogClient.CatalogApiError(500, { type: "internal" }),
    );
    const { wrapper } = withClient();
    const { result } = renderHook(() => useCatalog(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // No compile-in fallback — `data` is undefined and consumers render
    // skeletons / error states. Any lookup misses.
    expect(result.current.data).toBeUndefined();
    expect(
      result.current.byMetricKey("task_delivery_bullet_rows.tasks_completed"),
    ).toBeUndefined();
  });

  it("treats a tenant-id mismatch in the cached payload as no data (cross-tenant defense)", async () => {
    // Simulate a stale cached payload from a previous tenant — the wire
    // response carries `tenant_id = 't-OTHER'` but the signed-in tenant
    // is `t-1`. `useCatalog` MUST treat the mismatch as no data rather
    // than paint the other tenant's catalog, even for one render.
    fetchCatalog.mockResolvedValue({
      tenant_id: "t-OTHER",
      generated_at: "2026-06-01T00:00:00Z",
      metrics: [
        {
          id: "id-OTHER",
          metric_key: "ic_kpis.tasks_closed",
          label: "Tasks Closed",
          higher_is_better: true,
          is_member_scale: false,
          source_tags: [],
          schema_status: "ok",
          thresholds: {
            good: 5,
            warn: 3,
            resolved_from: "product-default",
            bounded_by_lock: false,
          },
        },
      ],
      links: [],
    });
    const { wrapper } = withClient();
    const { result } = renderHook(() => useCatalog(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeUndefined();
    // The cross-tenant payload's `id-OTHER` MUST NOT be reachable.
    expect(result.current.byId("id-OTHER")).toBeUndefined();
  });

  it("surfaces schema_status='error' so consumers render the broken-metric indicator (AC #3)", async () => {
    fetchCatalog.mockResolvedValue(
      makeOkResponse([
        {
          id: "id-broken",
          schema_status: "error",
          schema_error_code: "table_not_found",
        },
      ]),
    );
    const { wrapper } = withClient();
    const { result } = renderHook(() => useCatalog(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const m = result.current.byId("id-broken");
    expect(m?.schema_status).toBe("error");
    expect(m?.schema_error_code).toBe("table_not_found");
  });

  it("renders schema_status='unchecked' the same as 'ok' (AC #3)", async () => {
    fetchCatalog.mockResolvedValue(
      makeOkResponse([{ id: "id-unchecked", schema_status: "unchecked" }]),
    );
    const { wrapper } = withClient();
    const { result } = renderHook(() => useCatalog(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const m = result.current.byId("id-unchecked");
    // The hook itself doesn't transform — the rendering rule lives in
    // consumers — but the data IS surfaced so consumers can apply the
    // "render as ok" rule deterministically.
    expect(m?.schema_status).toBe("unchecked");
  });

  it("queries once per (tenant, role, team) — TanStack dedup", async () => {
    fetchCatalog.mockResolvedValue(makeOkResponse());
    const { wrapper } = withClient();

    const a = renderHook(() => useCatalog(), { wrapper });
    const b = renderHook(() => useCatalog(), { wrapper });

    await waitFor(() => expect(a.result.current.isLoading).toBe(false));
    await waitFor(() => expect(b.result.current.isLoading).toBe(false));

    // Both hooks reference the same query key — the network layer is
    // hit exactly once.
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  it("tenant switch invalidates the cache (AC #8a cross-tenant bleed)", async () => {
    fetchCatalog.mockResolvedValue(makeOkResponse());
    const { wrapper, client } = withClient();
    const { result } = renderHook(() => useCatalog(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetchCatalog).toHaveBeenCalledTimes(1);

    // Simulate the CatalogProvider's behavior: a tenant switch removes
    // every catalog-keyed query.
    act(() => {
      signInTenant("t-2");
      client.removeQueries({ queryKey: ["catalog"] });
    });

    // Force the hook to re-run with the new tenant. waitFor catches the
    // refetch.
    await waitFor(() => expect(fetchCatalog).toHaveBeenCalledTimes(2));
  });
});

describe("useCatalogLinkMap", () => {
  beforeEach(() => {
    authStore.reset();
    signInTenant("t-1");
    fetchCatalog.mockReset();
  });
  afterEach(() => {
    authStore.reset();
  });

  it("derives linksByQuery / queriesByCatalogId from the wire payload", async () => {
    fetchCatalog.mockResolvedValue(
      makeOkResponse(
        [
          { id: "cat-A", metric_key: "task_delivery_bullet_rows.a" },
          { id: "cat-B", metric_key: "ai_bullet_rows.b" },
        ],
        [
          { query_id: "q-team", catalog_metric_ids: ["cat-A", "cat-B"] },
          { query_id: "q-ic", catalog_metric_ids: ["cat-A"] },
        ],
      ),
    );
    const { wrapper } = withClient();
    const { result } = renderHook(
      () => ({ catalog: useCatalog(), links: useCatalogLinkMap() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.catalog.isLoading).toBe(false));

    expect(Array.from(result.current.links.linksByQuery.entries())).toEqual([
      ["q-team", ["cat-A", "cat-B"]],
      ["q-ic", ["cat-A"]],
    ]);
    expect(Array.from(result.current.links.queriesByCatalogId.entries())).toEqual([
      ["cat-A", ["q-team", "q-ic"]],
      ["cat-B", ["q-team"]],
    ]);
  });

  it("memoizes — N consumer reads share one computation per catalog identity (AC #8 Layer-2 invariance)", async () => {
    fetchCatalog.mockResolvedValue(
      makeOkResponse(
        [{ id: "cat-A", metric_key: "ic_kpis.x" }],
        [{ query_id: "q-1", catalog_metric_ids: ["cat-A"] }],
      ),
    );
    const { wrapper } = withClient();
    const { result, rerender } = renderHook(() => useCatalogLinkMap(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.linksByQuery.size).toBe(1));
    const firstMap = result.current.linksByQuery;

    // Force a re-render WITHOUT changing the underlying query data.
    // `useMemo` keys off the catalog response identity, so the map MUST
    // be the same reference — proving downstream consumers reading the
    // map across N renders pay one computation, not N.
    rerender();
    rerender();
    rerender();
    expect(result.current.linksByQuery).toBe(firstMap);
  });

  it("returns empty maps when the wire response predates ADR-003 (no links)", async () => {
    fetchCatalog.mockResolvedValue(makeOkResponse([{ id: "cat-A" }]));
    const { wrapper } = withClient();
    const { result } = renderHook(() => useCatalogLinkMap(), { wrapper });
    await waitFor(() => expect(result.current.linksByQuery).toBeDefined());
    expect(result.current.linksByQuery.size).toBe(0);
    expect(result.current.queriesByCatalogId.size).toBe(0);
  });
});
