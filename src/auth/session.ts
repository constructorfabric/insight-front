import { authStore } from "./auth-store";
import type { AuthStatus } from "./types";

/**
 * Probe `GET /auth/me` once and populate the store. The browser sends the
 * `__Host-sid` cookie (same-origin, credentials included); the authenticator
 * returns the session summary or 401. Any non-200 fails closed to
 * `unauthenticated` so the app redirects to login rather than rendering
 * half-authenticated. Called once at boot (main.tsx) before the router mounts.
 */
export async function loadSession(): Promise<AuthStatus> {
  try {
    const res = await fetch("/auth/me", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      authStore.setUnauthenticated();
      return "unauthenticated";
    }
    const body = (await res.json()) as {
      user?: string;
      email?: string;
      tenant_id?: string;
      roles?: string[];
      csrf_token?: string;
    };
    authStore.setAuthenticated({
      personId: body.user ?? "",
      email: body.email ?? "",
      tenantId: body.tenant_id ?? "",
      roles: body.roles ?? [],
      csrfToken: body.csrf_token ?? "",
    });
    return "authenticated";
  } catch {
    // Network error reaching the authenticator — fail closed.
    authStore.setUnauthenticated();
    return "unauthenticated";
  }
}
