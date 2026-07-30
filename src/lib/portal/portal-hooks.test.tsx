// @vitest-environment jsdom
/**
 * Hook-level tests for the small portal hooks that glue viewer identity,
 * router state and the portal store together: useActiveZone,
 * useViewerIsManager, usePersonCohort and the useOrgScope wrapper.
 * Identity/auth/router dependencies are stubbed at the module boundary;
 * assertions are about the derived semantics, not the wiring.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IdentityPerson } from "@/types/insight";
import { portalRouter } from "@/test/portal-router";

const mocks = vi.hoisted(() => ({
  email: "boss@x" as string | null,
  pathname: "/" as string,
  ic: {
    data: undefined as IdentityPerson | undefined,
    isPending: false,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({ useViewer: () => ({ email: mocks.email }) }));
vi.mock("@/queries/ic-dashboard", () => ({ useIcPerson: () => mocks.ic }));
vi.mock("@tanstack/react-router", async () => {
  const { portalRouterMock } = await import("@/test/portal-router");
  return portalRouterMock();
});

import { useActiveZone } from "./use-active-zone";
import { useOrgScope } from "./use-org-scope";
import { usePersonCohort } from "./use-person-cohort";
import { useViewerIsManager } from "./use-viewer-is-manager";

const person = (
  email: string,
  over: Partial<IdentityPerson> = {},
  subordinates: IdentityPerson[] = [],
): IdentityPerson =>
  ({
    email,
    display_name: email.split("@")[0],
    subordinates,
    ...over,
  }) as unknown as IdentityPerson;

const TREE = person("boss@x", { division: "R&D" }, [
  person("a@x", { division: "R&D" }),
  person("b@x", { division: "Sales" }),
  person("c@x", { division: "R&D" }),
]);

beforeEach(() => {
  mocks.email = "boss@x";
  portalRouter.go("/");
  mocks.ic.data = TREE;
  mocks.ic.isPending = false;
  mocks.ic.isLoading = false;
  mocks.ic.isError = false;
  act(() => {
    portalRouter.reset();
  });
});

afterEach(() => vi.clearAllMocks());

describe("useActiveZone", () => {
  it("follows the route when no zone is pinned: /personal → person", () => {
    portalRouter.go("/ic/some.one%40x/personal");
    const { result } = renderHook(() => useActiveZone());
    expect(result.current).toEqual({
      activeZone: "person",
      activePerson: "some.one@x",
    });
  });

  it("maps /team routes to the people zone", () => {
    portalRouter.go("/ic/some.one%40x/team");
    expect(renderHook(() => useActiveZone()).result.current.activeZone).toBe("people");
  });

  it("only the /team segment means People — an email starting with 'team' does not", () => {
    // The email lives in the path, so a substring check would hijack the
    // dashboards of team@, teamlead@, … into the People zone.
    portalRouter.go("/ic/teamlead%40x/personal");
    expect(renderHook(() => useActiveZone()).result.current).toEqual({
      activeZone: "person",
      activePerson: "teamlead@x",
    });
  });

  it("tolerates a trailing slash on the team route", () => {
    portalRouter.go("/ic/some.one%40x/team/");
    expect(renderHook(() => useActiveZone()).result.current.activeZone).toBe("people");
  });

  it("the path wins over a stale ?zone= — the URL cannot contradict itself", () => {
    // The old shell let a pinned zone override the route, so a person link
    // could navigate while the screen stayed on Overview. With the URL as the
    // source of truth that state is unrepresentable: on a person path the zone
    // IS person, whatever an older param says.
    portalRouter.go("/ic/some.one%40x/personal");
    act(() => portalRouter.set({ zone: "overview" }));
    expect(renderHook(() => useActiveZone()).result.current.activeZone).toBe("person");
  });

  it("uses ?zone= when the path names no zone", () => {
    portalRouter.go("/portal");
    act(() => portalRouter.set({ zone: "overview" }));
    expect(renderHook(() => useActiveZone()).result.current.activeZone).toBe("overview");
  });

  it("falls back to the viewer for a non-person route", () => {
    portalRouter.go("/metrics");
    expect(renderHook(() => useActiveZone()).result.current.activePerson).toBe("boss@x");
  });
});

describe("useViewerIsManager", () => {
  it("is a manager when the viewer's node has subordinates", () => {
    expect(renderHook(() => useViewerIsManager()).result.current).toEqual({
      isManager: true,
      isPending: false,
    });
  });

  it("is not a manager for a leaf node (IC shell)", () => {
    mocks.email = "a@x";
    expect(renderHook(() => useViewerIsManager()).result.current.isManager).toBe(false);
  });

  it("reports pending while identity resolves (callers assume manager)", () => {
    mocks.ic.data = undefined;
    mocks.ic.isPending = true;
    const { result } = renderHook(() => useViewerIsManager());
    expect(result.current).toEqual({ isManager: false, isPending: true });
  });
});

describe("usePersonCohort", () => {
  it("is empty when no slice is active", () => {
    expect(renderHook(() => usePersonCohort("a@x")).result.current).toEqual([]);
  });

  it("returns everyone sharing the person's slice value", () => {
    act(() => portalRouter.set({ slice: "division" }));
    const { result } = renderHook(() => usePersonCohort("a@x"));
    expect(result.current.sort()).toEqual(["a@x", "boss@x", "c@x"]);
  });

  it("is empty when the person has no value for the slice attribute", () => {
    act(() => portalRouter.set({ slice: "title" }));
    expect(renderHook(() => usePersonCohort("a@x")).result.current).toEqual([]);
  });
});

describe("useOrgScope", () => {
  it("resolves the viewer's subtree with counts and pivot email", () => {
    const { result } = renderHook(() => useOrgScope());
    // count = people under the pivot, the pivot itself excluded
    expect(result.current.count).toBe(3);
    expect(result.current.pivotEmail).toBe("boss@x");
    expect(result.current.isLoading).toBe(false);
  });

  it("narrows to a scoped root inside the subtree", () => {
    act(() => portalRouter.set({ scope: "b@x" }));
    const { result } = renderHook(() => useOrgScope());
    expect(result.current.pivotEmail).toBe("b@x");
    // a leaf has no reports — org zones will gate on the empty roster
    expect(result.current.count).toBe(0);
  });

  it("surfaces identity errors and delegates refetch", () => {
    mocks.ic.data = undefined;
    mocks.ic.isError = true;
    const { result } = renderHook(() => useOrgScope());
    expect(result.current.isError).toBe(true);
    expect(result.current.pivot).toBeNull();
    result.current.refetch();
    expect(mocks.ic.refetch).toHaveBeenCalledOnce();
  });
});
