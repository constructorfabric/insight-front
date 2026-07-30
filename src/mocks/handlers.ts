import { http, HttpResponse } from "msw";

import type { MetricResultsRequest } from "@/api/metric-results-client";

import { buildMetricResultsResponse } from "./metric-results-factory";
import { buildIdentityTree, PEOPLE } from "./registry";

const defaultPersonId = PEOPLE[0]?.person_id ?? "bob.park@example.com";

// Stable synthetic session for mock/Storybook runs. The old in-code
// MOCKS_ENABLED viewer path is gone; an authenticated viewer now comes from
// the same `/auth/me` probe the real app uses, so the boot `loadSession()`
// call resolves to `authenticated` against these handlers.
const MOCK_SESSION = {
  user: "00000000-0000-0000-0000-0000000000bb",
  email: defaultPersonId,
  tenant_id: "00000000-0000-0000-0000-000000000001",
  roles: ["user"],
  // Required by loadSession's fail-closed guard (a live session always has one).
  csrf_token: "mock-csrf-token",
};

// Session timing for the refresh driver: mirror the backend defaults
// (ttl 600 s, refresh ~90 s before expiry) relative to "now".
function mockSessionTiming(): { expires_at: number; refresh_at: number } {
  const now = Math.floor(Date.now() / 1000);
  return { expires_at: now + 600, refresh_at: now + 510 };
}

export const handlers = [
  http.get("/auth/me", () =>
    HttpResponse.json({ ...MOCK_SESSION, ...mockSessionTiming() }),
  ),
  http.post("/auth/refresh", () => HttpResponse.json(mockSessionTiming())),
  http.post("/auth/logout", () => HttpResponse.json({ rp_logout_url: null })),
  http.post("/api/analytics/v1/metric-results", async ({ request }) => {
    const body = (await request
      .json()
      .catch(() => null)) as MetricResultsRequest | null;
    if (
      !body ||
      !Array.isArray(body.entity?.ids) ||
      !Array.isArray(body.metrics)
    ) {
      return HttpResponse.json({ error: "invalid_argument" }, { status: 400 });
    }
    return HttpResponse.json(buildMetricResultsResponse(body));
  }),
  http.post(
    "/api/identity/v1/profiles",
    async ({ request }) => {
      const body = (await request.json().catch(() => null)) as
        | { value_type?: string; value?: string }
        | null;
      const email = body?.value ?? "";
      const tree = buildIdentityTree(email);
      if (!tree) {
        return HttpResponse.json(
          { type: "urn:insight:error:person_not_found" },
          { status: 404 },
        );
      }
      return HttpResponse.json(tree);
    },
  ),
];
