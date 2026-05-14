# API Services Guidelines (Standalone)

## AI WORKFLOW (REQUIRED)
1) Summarize 3-5 rules from this file before proposing changes.
2) For screenset API services, see SCREENSETS.md.

## CRITICAL RULES
- One domain service per backend domain (no entity-based services).
- Services self-register using apiRegistry.register(...).
- All calls go through typed service methods (no raw get("/url")).
- Mock data lives in the app layer and is wired via apiRegistry.initialize().
- All services extend BaseApiService and update ApiServicesMap via module augmentation.

## USAGE RULES
- Access only via apiRegistry.getService(DOMAIN).methodName().
- Type inference must originate from ApiServicesMap.
- No direct axios or fetch usage outside BaseApiService.

## MOCK DATA RULES
- REQUIRED: Use lodash for all string, array, and object operations in mock data factories.
- FORBIDDEN: Native JavaScript helpers where lodash provides an equivalent.

## SERVICE CREATION
- REQUIRED: Create services in src/screensets/*/api/. See SCREENSETS.md.
- REQUIRED: Domain constant unique per screenset.
- REQUIRED: Import API service in screenset root for registration.
- FORBIDDEN: Centralized src/api/ directory.
- FORBIDDEN: Sharing API services between screensets.

## REACT QUERY RULES
- REQUIRED: Analytics / server reads go through TanStack React Query, not ad-hoc effects-into-slice flows.
- REQUIRED: `queryOptions(...)` factories live in `src/screensets/{name}/queries/{domain}.ts` under a `{domain}Queries` object. Key factories live in `queries/keys.ts` under `{domain}Keys`.
- REQUIRED: Consumer hooks (`use{Domain}{Resource}`) wrap `useQuery` / `useQueries` and live in the same `queries/{domain}.ts` file.
- FORBIDDEN: Importing `useQuery`, `useQueries`, `useSuspenseQuery`, or `queryOptions` outside `src/screensets/**/queries/**`.
- FORBIDDEN: Inline `queryKey` literals — always go through `{domain}Keys.{name}(...)`.

## PRE-DIFF CHECKLIST
- [ ] Domain constant created.
- [ ] BaseApiService extended with baseURL.
- [ ] ApiServicesMap augmented.
- [ ] App mocks added and exported.
- [ ] No raw get("/url") calls.
- [ ] For server reads: `queryOptions` factory + `use{Domain}{Resource}` hook live together in `queries/{domain}.ts`; consumer imports the hook, not React Query primitives.
