import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AnalyticsApiError,
  queryBatch,
  queryBatchWithRange,
  queryMetric,
  queryMetricRaw,
} from "./analytics-client";

const RANGE = { from: "2026-06-01", to: "2026-06-07" };
const DATE_FILTER =
  "metric_date ge '2026-06-01' and metric_date le '2026-06-07'";

const fetchMock = () => globalThis.fetch as ReturnType<typeof vi.fn>;

function lastCall(): { url: string; init: RequestInit } {
  const calls = fetchMock().mock.calls;
  const [url, init] = calls[calls.length - 1]!;
  return { url: String(url), init: (init ?? {}) as RequestInit };
}

function lastBody(): Record<string, unknown> {
  return JSON.parse(String(lastCall().init.body)) as Record<string, unknown>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("analytics-client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("queryMetric", () => {
    it("POSTs to the metric query endpoint with JSON headers", async () => {
      fetchMock().mockResolvedValue(jsonResponse({ items: [] }));
      const out = await queryMetric("m1", RANGE);
      expect(out).toEqual({ items: [] });
      const { url, init } = lastCall();
      expect(url).toContain("/metrics/m1/query");
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers).get("Content-Type")).toBe(
        "application/json",
      );
    });

    it("always injects the period filter", async () => {
      fetchMock().mockResolvedValue(jsonResponse({ items: [] }));
      await queryMetric("m1", RANGE);
      expect(lastBody().$filter).toBe(DATE_FILTER);
    });

    it("ANDs a caller-supplied $filter with the period filter", async () => {
      fetchMock().mockResolvedValue(jsonResponse({ items: [] }));
      await queryMetric("m1", RANGE, {
        $filter: "person_id eq 'p'",
        $top: 5,
      });
      const body = lastBody();
      expect(body.$filter).toBe(`${DATE_FILTER} and person_id eq 'p'`);
      expect(body.$top).toBe(5);
    });

    it("throws AnalyticsApiError with the parsed problem body on non-2xx", async () => {
      fetchMock().mockResolvedValue(
        jsonResponse({ title: "boom", status: 500 }, 500),
      );
      const err = await queryMetric("m1", RANGE).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AnalyticsApiError);
      expect((err as AnalyticsApiError).status).toBe(500);
      expect((err as AnalyticsApiError).body).toEqual({
        title: "boom",
        status: 500,
      });
      expect((err as AnalyticsApiError).message).toBe("Analytics API 500");
    });

    it("tolerates a non-JSON error body (body becomes null)", async () => {
      fetchMock().mockResolvedValue(new Response("oops", { status: 502 }));
      const err = await queryMetric("m1", RANGE).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AnalyticsApiError);
      expect((err as AnalyticsApiError).status).toBe(502);
      expect((err as AnalyticsApiError).body).toBeNull();
    });

    it("throws invalid_json when a 2xx body fails to parse", async () => {
      fetchMock().mockResolvedValue(new Response("not-json", { status: 200 }));
      const err = await queryMetric("m1", RANGE).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AnalyticsApiError);
      expect((err as AnalyticsApiError).status).toBe(200);
      expect((err as AnalyticsApiError).body).toEqual({
        error: "invalid_json",
      });
    });
  });

  describe("queryMetricRaw", () => {
    it("passes params through without a date filter", async () => {
      fetchMock().mockResolvedValue(jsonResponse({ items: [] }));
      await queryMetricRaw("m2", { $filter: "person_id eq 'p'" });
      const { url } = lastCall();
      expect(url).toContain("/metrics/m2/query");
      expect(lastBody()).toEqual({ $filter: "person_id eq 'p'" });
    });
  });

  describe("queryBatch", () => {
    it("POSTs the items under a queries envelope", async () => {
      fetchMock().mockResolvedValue(jsonResponse({ results: [] }));
      const out = await queryBatch([{ metric_id: "m1", id: "q1" }]);
      expect(out).toEqual({ results: [] });
      const { url } = lastCall();
      expect(url).toContain("/metrics/queries");
      expect(lastBody()).toEqual({
        queries: [{ metric_id: "m1", id: "q1" }],
      });
    });
  });

  describe("queryBatchWithRange", () => {
    it("ANDs the period filter into every item", async () => {
      fetchMock().mockResolvedValue(jsonResponse({ results: [] }));
      await queryBatchWithRange(RANGE, [
        { metric_id: "m1", id: "q1", $filter: "person_id eq 'p'" },
        { metric_id: "m2", id: "q2" },
      ]);
      const body = lastBody() as {
        queries: Array<{ id: string; $filter: string }>;
      };
      expect(body.queries[0]!.$filter).toBe(
        `${DATE_FILTER} and person_id eq 'p'`,
      );
      expect(body.queries[1]!.$filter).toBe(DATE_FILTER);
    });
  });
});
