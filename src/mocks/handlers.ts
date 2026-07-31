import { http, HttpResponse } from "msw";

import type { MetricResultsRequest } from "@/api/metric-results-client";
import { isPersonId } from "@/lib/metrics/entity";

import { buildMetricResultsResponse } from "./metric-results-factory";
import { buildIdentityTree, PEOPLE, PEOPLE_BY_EMAIL } from "./registry";

const defaultPerson = PEOPLE[0];

// Stable synthetic session for mock/Storybook runs. The old in-code
// MOCKS_ENABLED viewer path is gone; an authenticated viewer now comes from
// the same `/auth/me` probe the real app uses, so the boot `loadSession()`
// call resolves to `authenticated` against these handlers.
const MOCK_SESSION = {
  // `user` is the person id the SPA keys on (the gateway JWT `sub`).
  user: defaultPerson?.person_id ?? "00000000-0000-0000-0000-0000000000bb",
  email: defaultPerson?.email ?? "bob.park@example.com",
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
    // Mirror the real endpoint since the identity cutover: entity ids are
    // person UUIDs and an email is a 400. Without this the mock would happily
    // answer a stale email fixture and hide the very regression it exists to
    // catch.
    if (!body.entity.ids.every((id) => typeof id === "string" && isPersonId(id))) {
      return HttpResponse.json(
        { error: "invalid_argument", field: "entity.ids" },
        { status: 400 },
      );
    }
    return HttpResponse.json(buildMetricResultsResponse(body));
  }),
  http.post(
    "/api/identity/v1/profiles",
    async ({ request }) => {
      const body = (await request.json().catch(() => null)) as
        | { value_type?: string; value?: string }
        | null;
      const value = (body?.value ?? "").trim();
      // The service resolves `person_id` (the SPA's key) and `email` (legacy
      // URL migration only); anything else is a client error.
      if (body?.value_type !== "email" && body?.value_type !== "person_id") {
        return HttpResponse.json(
          { type: "urn:insight:error:invalid_argument" },
          { status: 400 },
        );
      }
      // A malformed person_id is a 400, not a 404 — matching the service, where
      // "does not parse" and "resolves to nobody" are different answers.
      if (body.value_type === "person_id" && !isPersonId(value)) {
        return HttpResponse.json(
          { type: "urn:insight:error:invalid_argument" },
          { status: 400 },
        );
      }
      const personId =
        body.value_type === "email"
          ? PEOPLE_BY_EMAIL[value.toLowerCase()]?.person_id
          : value.toLowerCase();
      if (!personId) {
        return HttpResponse.json(
          { type: "urn:insight:error:person_not_found" },
          { status: 404 },
        );
      }
      const tree = buildIdentityTree(personId);
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
