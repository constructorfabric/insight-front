---
cypilot: true
type: project-rule
topic: conventions
generated-by: auto-config
version: 1.0
---
# Conventions

<!-- toc -->

- [Naming](#naming)
  - [File Naming](#file-naming)
  - [Screenset Discovery](#screenset-discovery)
  - [ID Constants](#id-constants)
  - [Slice Keys](#slice-keys)
  - [Event Keys](#event-keys)
  - [Query Files & Hook Names](#query-files--hook-names)
- [Imports](#imports)
  - [Import Order](#import-order)
  - [Type Imports](#type-imports)
  - [Cross-Screenset Prohibition](#cross-screenset-prohibition)
- [i18n](#i18n)
  - [Screenset-level Keys](#screenset-level-keys)
  - [Screen-level Keys](#screen-level-keys)
  - [Language Coverage](#language-coverage)

<!-- /toc -->

## Naming

### File Naming
Use PascalCase for components (`ExecutiveViewScreen.tsx`), camelCase for logic files (`authSlice.ts`, `authEffects.ts`, `authEvents.ts`), and kebab-case for screen directories (`executive-view/`, `team-view/`).
Evidence: `src/screensets/insight/screens/executive-view/ExecutiveViewScreen.tsx:1`

### Screenset Discovery
Screenset entry files MUST end with `Screenset.tsx` or `screenset.tsx` — Vite glob `./*/*[Ss]creenset.tsx` auto-discovers them.
Evidence: `src/screensets/screensetRegistry.tsx:36`

### ID Constants
Define all screenset/screen IDs in a central `ids.ts` as CONST_CASE exports. Screen IDs use kebab-case strings.
Evidence: `src/screensets/insight/ids.ts:9-26`

### Slice Keys
Slice keys use template literal `${SCREENSET_ID}/domainName` for screenset slices, plain string for app slices.
Evidence: `src/screensets/insight/slices/executiveViewSlice.ts:12`, `src/app/slices/authSlice.ts:10`

### Event Keys
Event keys follow `${APP_OR_SCREENSET_ID}/${DOMAIN_ID}/eventName` pattern. Declare as const object, not enum.
Evidence: `src/app/events/authEvents.ts:11-15`, `src/screensets/insight/events/executiveViewEvents.ts:15-19`

### Query Files & Hook Names
Server query factories and consumer hooks live in `src/screensets/{name}/queries/{domain}.ts`. Key factories go in `queries/keys.ts`. Consumer hook naming: `use{Domain}{Resource}` in camelCase (`useTeamMembers`, `useTeamBullets`, `useIdentityByEmail`). The `{domain}Queries` factory object stays in the same file.
Evidence: `src/screensets/insight/queries/team.ts:75-180`, `src/screensets/insight/queries/keys.ts:19-40`

## Imports

### Import Order
Framework imports (`@hai3/react`, `@hai3/uikit`) first, then cross-branch (`@/app/...`), then relative.
Evidence: `src/screensets/insight/screens/executive-view/ExecutiveViewScreen.tsx:6-12`

### Type Imports
Use `import type` keyword for type-only imports.
Evidence: `src/screensets/insight/screens/executive-view/ExecutiveViewScreen.tsx:19`

### Cross-Screenset Prohibition
No imports between screensets — enforced by dependency-cruiser rule `no-cross-screenset-imports`.
Evidence: `.dependency-cruiser.cjs:31-39`

## i18n

### Screenset-level Keys
Menu item labels in `i18n/en.json` as `menu_items.{screen-id}.label`.
Evidence: `src/screensets/insight/i18n/en.json:2-27`

### Screen-level Keys
Per-screen translations in `screens/{name}/i18n/en.json`, nested by feature area.
Evidence: `src/screensets/insight/screens/executive-view/i18n/en.json:2-31`

### Language Coverage
All 36 languages MUST have corresponding JSON files for new screensets and screens.
Evidence: `src/screensets/insight/insightScreenset.tsx:41-81`
