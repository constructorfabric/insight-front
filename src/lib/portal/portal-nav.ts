import { useRouterState } from "@tanstack/react-router";

import type { OrgScope } from "@/lib/portal/portal-store";
import { usePortalSearch, useSetPortalSearch } from "@/lib/portal/portal-search";

/**
 * Portal navigation, read from and written to the URL.
 *
 * These replace the in-memory store the shell used to keep: reloading no
 * longer resets the view, a link reproduces it, and every zone/lens change is
 * a history entry, so Back goes where a reader expects. The one asymmetry is
 * deliberate — Person and People come from the PATH (`/ic/<email>/personal`,
 * `/ic/<email>/team`) because they are about a person, while theme zones ride
 * in `?zone=`. A path-driven zone therefore always wins over a stale param.
 */

/** Zone from the route when the path names one, else from `?zone=`. */
export function usePortalZone(): string | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { zone } = usePortalSearch();
  if (/^\/ic\/[^/]+\/team\/?$/.test(pathname)) return "people";
  if (/^\/ic\/[^/]+\/personal\/?$/.test(pathname)) return "person";
  return zone ?? null;
}

export function usePortalItem(): string | null {
  return usePortalSearch().item ?? null;
}

export function usePortalDir(): string {
  return usePortalSearch().dir ?? "";
}

export function usePortalLens(): string {
  return usePortalSearch().lens ?? "";
}

export function usePortalSlice(): string {
  return usePortalSearch().slice ?? "";
}

export function usePortalScope(): OrgScope {
  const { scope, direct } = usePortalSearch();
  return { root: scope ?? null, directOnly: direct ?? false };
}

export interface PortalNavActions {
  setZone: (zone: string | null) => void;
  setItem: (item: string | null) => void;
  setDir: (dir: string) => void;
  setLens: (lens: string) => void;
  setSlice: (slice: string) => void;
  setScope: (patch: Partial<OrgScope>) => void;
}

export function usePortalNavActions(): PortalNavActions {
  const setSearch = useSetPortalSearch();
  const current = usePortalSearch();
  return {
    // A zone change drops the item with it: `item` is per-zone, and carrying
    // it across renders a fallback view while the pane highlights nothing.
    setZone: (zone) => setSearch({ zone: zone ?? undefined, item: undefined }),
    setItem: (item) => setSearch({ item: item ?? undefined }),
    setDir: (dir) => setSearch({ dir: dir || undefined }),
    setLens: (lens) => setSearch({ lens: lens || undefined }),
    setSlice: (slice) => setSearch({ slice: slice || undefined }),
    setScope: (patch) =>
      setSearch({
        ...("root" in patch ? { scope: patch.root ?? undefined } : {}),
        ...("directOnly" in patch ? { direct: patch.directOnly } : {}),
        // A scope the reader cannot reach from the new root is worse than
        // none: reset direct-only when the root itself changes.
        ...("root" in patch && !("directOnly" in patch) && patch.root !== current.scope
          ? { direct: undefined }
          : {}),
      }),
  };
}
