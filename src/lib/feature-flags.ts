import { useSyncExternalStore } from "react";

// In-memory only by design: the toggle defaults to the new design on
// every page load and must not persist across reloads.
let state = true;
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot(): boolean {
  return state;
}

export function isMetricsV2Enabled(): boolean {
  return state;
}

export function setMetricsV2Enabled(enabled: boolean): void {
  state = enabled;
  for (const fn of listeners) fn();
}

export function useMetricsV2Enabled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
