/**
 * Current User Effects
 * On user change: update slice + rebuild menu for the new role.
 *
 * Menu is built from real Identity Resolution data (subordinates) when
 * available, falling back to mock registry for dev mode.
 */

import { type AppDispatch, eventBus, setMenuItems } from '@hai3/react';
import { CurrentUserEvents } from '../events/currentUserEvents';
import { setCurrentUser } from '../slices/currentUserSlice';
import { setViewer, clearSelection } from '../slices/userContextSlice';
import type { CurrentUser } from '../types';
import type { IdentityPerson } from '@/app/types/identity';
import {
  INSIGHT_SCREENSET_ID,
  TEAM_VIEW_SCREEN_ID,
  IC_DASHBOARD_SCREEN_ID,
  MY_DASHBOARD_SCREEN_ID,
} from '../ids';
import { encodeMenuItemId } from '../utils/menuItemId';

const menuKey = (key: string) => `screenset.${INSIGHT_SCREENSET_ID}:menu_items.${key}.label`;

// ---------------------------------------------------------------------------
// Menu builder — real identity data
// ---------------------------------------------------------------------------

function buildMenuFromIdentity(user: CurrentUser) {
  const { role, _identity: identity } = user;
  const myDashItem = { id: MY_DASHBOARD_SCREEN_ID, label: menuKey('my-dashboard'), icon: 'lucide:user-circle' };

  if (!identity) {
    return [myDashItem];
  }

  /**
   * Recursively build menu items from subordinate tree.
   *
   * Leaves (no subordinates) link directly to IC dashboard.
   * Managers become expandable groups whose root node links to their team
   * view, and the first child is a personal IC-dashboard link so the
   * individual remains reachable alongside their team.
   */
  const toMenuItems = (subs: IdentityPerson[]): object[] =>
    subs.map((sub) => {
      const nested = toMenuItems(sub.subordinates);
      if (nested.length === 0) {
        return {
          id: encodeMenuItemId(IC_DASHBOARD_SCREEN_ID, sub.email),
          label: sub.display_name,
          icon: 'lucide:user',
        };
      }
      return {
        id: encodeMenuItemId(TEAM_VIEW_SCREEN_ID, sub.email),
        label: sub.display_name,
        icon: 'lucide:users',
        children: [
          {
            id: encodeMenuItemId(IC_DASHBOARD_SCREEN_ID, sub.email),
            label: `${sub.display_name} \u2014 personal`,
            icon: 'lucide:user',
          },
          ...nested,
        ],
      };
    });

  const subordinateItems = toMenuItems(identity.subordinates);

  switch (role) {
    case 'executive': {
      // Encode the executive's department so clicking this group actually
      // emits a typed selection (org_unit_name) — otherwise a previously
      // selected subordinate team stays active after navigation.
      // Org overview (executive-view) intentionally hidden — see issue #359.
      const deptItemId = encodeMenuItemId(TEAM_VIEW_SCREEN_ID, identity.department);
      return [
        myDashItem,
        ...(subordinateItems.length > 0
          ? [{
              id: deptItemId,
              label: identity.department || menuKey('team-view'),
              icon: 'lucide:users',
              children: subordinateItems,
            }]
          : []),
      ];
    }

    case 'team_lead': {
      const deptItemId = encodeMenuItemId(TEAM_VIEW_SCREEN_ID, identity.department);
      return [
        myDashItem,
        ...(subordinateItems.length > 0
          ? [{
              id: deptItemId,
              label: identity.department || menuKey('team-view'),
              icon: 'lucide:users',
              children: subordinateItems,
            }]
          : [{ id: deptItemId, label: menuKey('team-view'), icon: 'lucide:users' }]),
      ];
    }

    case 'ic':
      return [myDashItem];
  }
}

// ---------------------------------------------------------------------------
// Effect initializer
// ---------------------------------------------------------------------------
export const initializeCurrentUserEffects = (dispatch: AppDispatch): void => {
  eventBus.on(CurrentUserEvents.UserChanged, (payload) => {
    const user: CurrentUser = payload;

    dispatch(setCurrentUser(user));
    dispatch(setMenuItems(buildMenuFromIdentity(user) as Parameters<typeof setMenuItems>[0]));
    dispatch(setViewer({
      id: user.personId,
      name: user.name,
      role: user.role,
      identity: user._identity ?? null,
    }));
    dispatch(clearSelection());
  });

  // Dev/mock bridge: bootstrap fetches identity and emits 'app/user/loaded'
  // (header consumer), but no path turns that into a typed CurrentUser
  // (role + teamId + identity tree) so menus/team-view never receive
  // scope. When mocks are on, resolve everything from the PEOPLE registry
  // by email and dispatch the same slice updates the UserChanged listener
  // does (effects cannot emit events — FLUX rule).
  //
  // Listener is registered SYNCHRONOUSLY (kick off the registry import in
  // parallel and `await` it inside the callback) so the startup
  // `app/user/loaded` emit cannot land before subscribe.
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true') {
    const registryPromise = import('../api/mocks/registry');
    eventBus.on('app/user/loaded' as never, (payload: unknown) => {
      void (async () => {
        const user = (payload as { user?: { email?: string } }).user;
        if (!user?.email) return;
        const { PEOPLE_BY_ID, buildIdentityTree } = await registryPromise;
        const person = PEOPLE_BY_ID[user.email];
        if (!person) return;
        const tree = buildIdentityTree(user.email) as IdentityPerson | null;
        // Top-level lead (no supervisor) → executive; lead with supervisor →
        // team_lead; everyone else → ic. Matches the demo's role hierarchy
        // so executives see the org-wide menu while sub-leads see their
        // team's drill.
        const role = person.is_lead
          ? (person.supervisor_email ? 'team_lead' : 'executive')
          : 'ic';
        const cu: CurrentUser = {
          personId: person.person_id,
          name: person.name,
          role,
          teamId: person.team_id,
          _identity: tree ?? undefined,
        };
        dispatch(setCurrentUser(cu));
        dispatch(setMenuItems(buildMenuFromIdentity(cu) as Parameters<typeof setMenuItems>[0]));
        dispatch(setViewer({ id: cu.personId, name: cu.name, role: cu.role, identity: tree }));
        dispatch(clearSelection());
      })();
    });
  }
};
