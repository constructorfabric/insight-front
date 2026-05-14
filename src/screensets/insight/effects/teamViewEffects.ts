/**
 * Team View Effects
 *
 * Post-migration: section / availability / load events were removed when
 * server data moved to TanStack React Query (`queries/team.ts`). This
 * module only routes drill-open/close events into the slice.
 */

import { type AppDispatch, eventBus } from '@hai3/react';
import { TeamViewEvents } from '../events/teamViewEvents';
import { setDrillState, clearDrill } from '../slices/teamViewSlice';

export const initializeTeamViewEffects = (appDispatch: AppDispatch): void => {
  const dispatch = appDispatch;

  eventBus.on(TeamViewEvents.DrillOpened, (payload) => {
    dispatch(setDrillState(payload));
  });

  eventBus.on(TeamViewEvents.DrillClosed, () => {
    dispatch(clearDrill());
  });
};
