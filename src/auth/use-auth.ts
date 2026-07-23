import { useSyncExternalStore } from "react";

import { authStore } from "./auth-store";
import type { AuthSnapshot } from "./types";

let redirecting = false;

/** Sanitize a return-to into a site-relative path (mirrors the backend guard). */
function safeReturnTo(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

/**
 * Redirect the whole page into the login flow. The gateway + authenticator own
 * the OIDC dance; we only hand them a `return_to`. Guarded so multiple 401s in
 * flight don't stack redirects.
 */
export function signIn(returnTo?: string): void {
  if (redirecting) return;
  redirecting = true;
  const dest = safeReturnTo(returnTo ?? window.location.pathname + window.location.search);
  window.location.assign(`/auth/login?return_to=${encodeURIComponent(dest)}`);
}

/**
 * Revoke the session server-side, then follow the RP-initiated logout URL the
 * authenticator returns (or fall back to the app root).
 */
export async function signOut(): Promise<void> {
  let dest = "/";
  try {
    // State-changing /auth/* requires the session's CSRF token (fail closed
    // server-side); it arrived with /auth/me at boot.
    const csrfToken = authStore.getSnapshot().session?.csrfToken ?? "";
    const res = await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as { rp_logout_url?: string | null };
    if (body.rp_logout_url) dest = body.rp_logout_url;
  } catch {
    // ignore — best-effort logout; still bounce the browser.
  }
  authStore.setUnauthenticated();
  window.location.assign(dest);
}

export type UseAuthResult = AuthSnapshot & {
  signIn: (returnTo?: string) => void;
  signOut: () => Promise<void>;
};

export function useAuth(): UseAuthResult {
  const snap = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getSnapshot,
  );
  return { ...snap, signIn, signOut };
}
