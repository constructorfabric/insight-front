import { useSyncExternalStore } from "react";

/**
 * Portal shell state (Phase 1, feature-flagged behind `insight.portal`).
 *
 * `enabled` and `role` persist to localStorage (mirrors the metrics-v2 flag
 * pattern in feature-flags.ts). `zone` is in-memory navigation state: `null`
 * means "follow the route" (the entity lenses — Person / People — render the
 * existing dashboard `<Outlet/>`); a zone id means an org-level lens is
 * selected and the content area shows its scaffold.
 */

export type PortalRole = "exec" | "em" | "backend" | "sales" | "support";

const ENABLED_KEY = "insight.portal";
const ROLE_KEY = "insight.portal-role";
const VALID_ROLES: ReadonlySet<PortalRole> = new Set([
  "exec",
  "em",
  "backend",
  "sales",
  "support",
]);

interface PortalState {
  enabled: boolean;
  role: PortalRole;
  zone: string | null;
  /** Selected section item within a theme/manage zone. */
  item: string | null;
  /** Expanded direction + active lens within the Directions zone. */
  dir: string;
  lens: string;
  /** "Less relevant" directions group expanded. */
  moreOpen: boolean;
  /**
   * Active slice — the person-attribute that groups rosters and defines peer
   * cohorts everywhere. Empty string = the whole roster as one cohort (default,
   * no grouping). A key like "division"/"title" groups + compares within it.
   */
  slice: string;
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ENABLED_KEY) === "true";
}

function readRole(): PortalRole {
  if (typeof window === "undefined") return "exec";
  const raw = window.localStorage.getItem(ROLE_KEY);
  return raw && VALID_ROLES.has(raw as PortalRole) ? (raw as PortalRole) : "exec";
}

let state: PortalState = {
  enabled: readEnabled(),
  role: readRole(),
  // `null` = follow the route (Person/People). The initial landing is pinned
  // once by PortalLayout based on whether the viewer manages anyone: a manager
  // lands on the Overview org rollup, an IC stays route-driven on their own
  // Person page (their subtree is empty, so org zones are meaningless).
  zone: null,
  item: null,
  dir: "dev",
  lens: "Delivery",
  moreOpen: false,
  slice: "",
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function persist(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable — in-memory state still updated.
  }
}

export function setPortalEnabled(enabled: boolean): void {
  state = { ...state, enabled };
  persist(ENABLED_KEY, enabled ? "true" : "false");
  emit();
}

export function setPortalRole(role: PortalRole): void {
  state = { ...state, role };
  persist(ROLE_KEY, role);
  emit();
}

export function setPortalZone(zone: string | null): void {
  state = { ...state, zone };
  emit();
}

export function setPortalItem(item: string | null): void {
  state = { ...state, item };
  emit();
}

export function setPortalDir(dir: string): void {
  state = { ...state, dir };
  emit();
}

export function setPortalLens(lens: string): void {
  state = { ...state, lens };
  emit();
}

export function togglePortalMore(): void {
  state = { ...state, moreOpen: !state.moreOpen };
  emit();
}

export function setPortalSlice(slice: string): void {
  state = { ...state, slice };
  emit();
}

export function usePortalEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.enabled,
    () => false,
  );
}

export function usePortalRole(): PortalRole {
  return useSyncExternalStore(
    subscribe,
    () => state.role,
    () => "exec" as PortalRole,
  );
}

export function usePortalZone(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => state.zone,
    () => null,
  );
}

export function usePortalItem(): string | null {
  return useSyncExternalStore(subscribe, () => state.item, () => null);
}

export function usePortalDir(): string {
  return useSyncExternalStore(subscribe, () => state.dir, () => "dev");
}

export function usePortalLens(): string {
  return useSyncExternalStore(subscribe, () => state.lens, () => "Delivery");
}

export function usePortalMore(): boolean {
  return useSyncExternalStore(subscribe, () => state.moreOpen, () => false);
}

export function usePortalSlice(): string {
  return useSyncExternalStore(subscribe, () => state.slice, () => "");
}
