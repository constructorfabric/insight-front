---
cypilot: true
type: project-rule
topic: patterns
generated-by: auto-config
version: 1.0
---
# Patterns

<!-- toc -->

- [State Management](#state-management)
  - [Slice Pattern](#slice-pattern)
  - [Selector Pattern](#selector-pattern)
  - [Slice Registration](#slice-registration)
  - [Server vs UI State Split](#server-vs-ui-state-split)
- [Event-Driven Flow](#event-driven-flow)
  - [Action → Event → Effect → Slice](#action--event--effect--slice)
  - [Event Declaration](#event-declaration)
  - [Effects Initialization](#effects-initialization)
- [API Services](#api-services)
  - [Service Pattern](#service-pattern)
  - [Service Registration](#service-registration)
  - [Mock Pattern](#mock-pattern)
- [Server Data Fetching](#server-data-fetching)
  - [Query Layer (TanStack React Query)](#query-layer-tanstack-react-query)
  - [Consumer Hooks Hide React Query](#consumer-hooks-hide-react-query)
  - [Query Key Factories](#query-key-factories)
  - [Cache Config](#cache-config)
- [Plugins](#plugins)
  - [REST Plugin Pattern](#rest-plugin-pattern)
- [Hooks](#hooks)
  - [Custom Hook Pattern](#custom-hook-pattern)

<!-- /toc -->

## State Management

### Slice Pattern
Use `createSlice()` with: SLICE_KEY constant, typed State interface, explicit initialState, reducers object. Export destructured actions and default slice. Add `RootState` module augmentation.
Evidence: `src/app/slices/authSlice.ts:10-47`

### Selector Pattern
Export selector functions from slice file with default fallback values for safety.
Evidence: `src/app/slices/authSlice.ts:49-56`

### Slice Registration
Register via `registerSlice(slice, initEffectsFn)` — ties slice to its effects initializer.
Evidence: `src/app/main.tsx:13`, `src/screensets/insight/insightScreenset.tsx:86-103`

### Server vs UI State Split
React Query owns server cache (members, bullets, etc.). Redux slices own UI-only state (drill modals, period selection, view mode, current user, identity tree). Slices that hold server data are legacy and should migrate to the query layer.
Evidence: `src/screensets/insight/slices/teamViewSlice.ts:13-22`, `src/screensets/insight/queries/team.ts`

## Event-Driven Flow

### Action → Event → Effect → Slice
Actions emit events via eventBus. Effects listen to events and dispatch to slices. Slices are pure reducers. No direct slice dispatch from components.
Evidence: `src/screensets/insight/actions/executiveViewActions.ts:15-22`, `src/screensets/insight/effects/executiveViewEffects.ts:15-29`

### Event Declaration
Declare events as const object with `${SCOPE}/${DOMAIN}/eventName` keys. Augment `EventPayloadMap` for type-safe payloads.
Evidence: `src/screensets/insight/events/executiveViewEvents.ts:10-29`

### Effects Initialization
Export `initialize{Domain}Effects(dispatch: AppDispatch)` function. Subscribe to events via `eventBus.on()`, dispatch reducers inside callbacks.
Evidence: `src/screensets/insight/effects/executiveViewEffects.ts:15-29`

## API Services

### Service Pattern
Extend `BaseApiService`. Constructor: pass baseURL + `new RestProtocol()`. Register `RestMockPlugin` with mockMap. Add `AuthPlugin` to protocol.
Evidence: `src/screensets/insight/api/insightApiService.ts:15-31`

### Service Registration
App-level services: register in `main.tsx` via `apiRegistry.register()`. Screenset services: register during screenset initialization.
Evidence: `src/app/main.tsx:25-30`

### Mock Pattern
Mock maps keyed by `'METHOD /path'` returning response objects. Controlled via HAI3 Studio panel.
Evidence: `src/screensets/insight/api/insightApiService.ts:22-28`

## Server Data Fetching

### Query Layer (TanStack React Query)
All server data for analytics screens is fetched via TanStack React Query. Each domain owns a `src/screensets/{name}/queries/{domain}.ts` file exporting `queryOptions(...)` factories under a `{domain}Queries` object (`teamQueries`, `crmQueries`, `identityQueries`). The factories wrap the `InsightApiService.queryMetric(...)` call but never call it directly from components.
Evidence: `src/screensets/insight/queries/team.ts:75-150`, `src/screensets/insight/queries/crm.ts:63-122`, `src/screensets/insight/queries/identity.ts:19-26`

### Consumer Hooks Hide React Query
Components/screens import `use{Domain}{Resource}` hooks from `queries/{domain}.ts` and read ready-to-render data + a status enum (`'loading' | 'revalidating' | 'loaded' | 'errored'`) from the return value. Components MUST NOT import `useQuery`, `useQueries`, `useSuspenseQuery`, or `queryOptions` from `@tanstack/react-query` — that import is allowed only inside `queries/**`. Rationale: keeps cache mechanics swappable and the consumer surface RTK-Query-shaped.
Evidence: `src/screensets/insight/queries/team.ts:180-330`, `src/screensets/insight/screens/team-view/TeamViewScreen.tsx:120-138`

### Query Key Factories
Centralised key factories live in `src/screensets/insight/queries/keys.ts` under a `{domain}Keys` object. Components and hooks never construct queryKey tuples inline — they call `teamKeys.member(...)`, `crmKeys.kpis(...)`, etc. so partial-key invalidation stays type-safe.
Evidence: `src/screensets/insight/queries/keys.ts:19-40`

### Cache Config
Each query factory sets cache semantics explicitly via `staleTime` / `gcTime` / `placeholderData`. Analytics queries currently use `staleTime: Infinity, gcTime: 0` (cache lives only while a screen is mounted — clears on navigation). The app-wide queryClient default (`staleTime: 5 min`) applies to anything that does not override.
Evidence: `src/screensets/insight/queries/team.ts:63-67`, `src/app/queryClient.ts:19-27`

## Plugins

### REST Plugin Pattern
Extend `RestPlugin`. Override `onRequest()` for request modification, `onError()` for error handling. Add to `restProtocol.plugins.add()`.
Evidence: `src/app/plugins/AuthPlugin.ts:18-39`

## Hooks

### Custom Hook Pattern
Thin wrappers around selectors or composed state. Place in `hooks/` directory within screenset.
Evidence: `src/screensets/insight/hooks/usePeriod.ts:10`
