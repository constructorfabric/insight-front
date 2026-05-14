/**
 * Team View Slice
 *
 * Post-migration: server cache (members, bullets, status) lives in
 * TanStack React Query (`queries/team.ts`). This slice only owns
 * UI-driven state — currently the drill modal payload.
 *
 * The drill flow stays event-bus + Redux for now because it's triggered
 * imperatively from action handlers (cell click → openTeamDrill) rather
 * than declaratively from the screen.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@hai3/react';
import { INSIGHT_SCREENSET_ID } from '../ids';
import type { DrillData } from '../types';
import { selectActiveTeam } from './userContextSlice';

const SLICE_KEY = `${INSIGHT_SCREENSET_ID}/teamView` as const;

export interface TeamViewState {
  drillId: string | null;
  drillData: DrillData | null;
}

const initialState: TeamViewState = {
  drillId: null,
  drillData: null,
};

export const teamViewSlice = createSlice({
  name: SLICE_KEY,
  initialState,
  reducers: {
    setDrillState: (
      state,
      action: PayloadAction<{ drillId: string; drillData: DrillData }>,
    ) => {
      state.drillId = action.payload.drillId;
      state.drillData = action.payload.drillData;
    },
    clearDrill: (state) => {
      state.drillId = null;
      state.drillData = null;
    },
  },
});

export const { setDrillState, clearDrill } = teamViewSlice.actions;
export default teamViewSlice;

declare module '@hai3/react' {
  interface RootState {
    [SLICE_KEY]: TeamViewState;
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Effective team identifier for analytics queries — collapses the active
 * TeamRef to the single string the backend currently understands
 * (`org_unit_name` or a subordinate email). Returns '' when no team context
 * is established; callers should render an empty state rather than fire a
 * filter against the empty string.
 */
export const selectSelectedTeamId = (state: RootState): string => {
  const ref = selectActiveTeam(state);
  if (!ref) return '';
  return ref.kind === 'org_unit_name' ? ref.value : ref.email;
};

export const selectTeamDrillId = (state: RootState): string | null => {
  return state[SLICE_KEY]?.drillId ?? null;
};

export const selectTeamDrillData = (state: RootState): DrillData | null => {
  return state[SLICE_KEY]?.drillData ?? null;
};
