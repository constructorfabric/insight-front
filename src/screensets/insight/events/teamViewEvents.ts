/**
 * Team View Events
 *
 * Post-migration: section-level Loading / Loaded / Failed events were
 * removed when server data moved to TanStack React Query (`queries/team.ts`).
 * Only the drill modal flow remains event-driven — it's triggered
 * imperatively from cell-click handlers, not declaratively from the screen.
 */

import '@hai3/react';
import { INSIGHT_SCREENSET_ID } from '../ids';
import type { DrillData } from '../types';

const DOMAIN_ID = 'teamView';

export enum TeamViewEvents {
  DrillOpened = `${INSIGHT_SCREENSET_ID}/${DOMAIN_ID}/drillOpened`,
  DrillClosed = `${INSIGHT_SCREENSET_ID}/${DOMAIN_ID}/drillClosed`,
}

declare module '@hai3/react' {
  interface EventPayloadMap {
    [TeamViewEvents.DrillOpened]: { drillId: string; drillData: DrillData };
    [TeamViewEvents.DrillClosed]: void;
  }
}
