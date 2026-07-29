# Security

This document covers the frontend's security posture and the deployment
checklist for exposing Insight to the public internet (without VPN).

## Threat model

The frontend is a public-facing SPA. Authentication is a server-side
cookie/BFF flow: the gateway and authenticator own the provider handshake and
set a `__Host-sid` session cookie; the SPA calls `/api/*` and `/auth/*`
same-origin. Trust boundary: the FE itself is untrusted — all authorization
decisions live on the backend, and the FE supplies no credentials of its own
beyond the cookie the browser sends automatically.

## Session handling

The SPA stores no tokens. The session is an HttpOnly, `Secure`, `__Host-`
prefixed cookie set by the authenticator; the gateway exchanges it for a
downstream JWT server-side.

- Not readable from JavaScript, so XSS cannot exfiltrate a long-lived
  credential. The CSP below remains the primary XSS mitigation.
- State-changing `/auth/*` calls carry the session's CSRF token, which arrives
  with `/auth/me` at boot.
- The session is non-sliding: `src/auth/refresh.ts` drives `POST /auth/refresh`
  on the server-supplied `refresh_at`, so an idle tab's session dies on the
  server's schedule rather than the client's.

## Headers shipped by nginx

Defined in `Dockerfile`:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see Dockerfile | Restrict script/style/connect sources, block inline scripts, prevent framing |
| `X-Frame-Options` | `DENY` | Clickjacking defense for legacy browsers (CSP `frame-ancestors` covers modern ones) |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-sniffing attacks on uploaded/static content |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Don't leak full URLs (with query params) to third parties |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS once a client has connected once |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disable powerful APIs the app doesn't use |
| `Cross-Origin-Opener-Policy` | `same-origin` | Isolate browsing context — defense against cross-window leaks (Spectre, tab-napping) |
| `Cross-Origin-Resource-Policy` | `same-origin` | Block other origins from embedding our resources |

### CSP notes

- `style-src 'unsafe-inline'` is required for React inline styles and recharts.
  Tightening this requires a nonce-based pipeline — tracked as a follow-up.
- `connect-src` and `frame-src` stay at `'self'`: the SPA is same-origin only,
  reaching `/api/*` and `/auth/*` through the gateway that fronts it. The nginx
  config ships with no runtime placeholders.

## Build hygiene

- `build.sourcemap: false` — production bundles never ship source maps.
- `esbuild.drop: ['debugger']` — `debugger` statements are stripped.
- `console.*` calls are gated behind `import.meta.env.DEV` and tree-shaken in
  production. After `pnpm build`, verify with:
  ```sh
  ls dist/assets/*.map 2>/dev/null
  # Expect: nothing
  ```

## Pre-deployment checklist (no-VPN exposure)

- [ ] `.env` on the build host does NOT contain `VITE_ENABLE_MOCKS=true`. It is
      dev-only and tree-shaken in prod, but double-check there's no DEV build
      going to production.
- [ ] Container is served behind HTTPS-terminating reverse proxy. HSTS only
      makes sense over TLS.
- [ ] Backend (`api-gateway`, `analytics-api`, `identity-resolution`) derives
      tenant scoping from the session/gateway JWT only, never from a
      client-supplied header. The FE sends no tenant header.
- [ ] Backend rate-limits unauthenticated and authenticated endpoints
      separately. The FE has no rate-limiting and shouldn't.
- [ ] Verify session refresh works in staging for ≥10 minutes of idle session
      (`POST /auth/refresh` fires before the server-supplied `refresh_at`).
- [ ] Confirm CSP doesn't break recharts / shadcn / @base-ui styling on every screen.
- [ ] Run `npm audit --omit=dev` — no high-severity findings.

## Reporting

Security issues: contact the Insight team lead. Do not file public GitHub
issues for vulnerabilities.
