/**
 * Query-key factories.
 *
 * Centralizing keys here lets any module invalidate or read from the
 * cache without re-deriving them. The structure also enables partial
 * invalidation — e.g. `queryClient.invalidateQueries({ queryKey:
 * crmKeys.byRep(personId) })` blows away every CRM query for one rep.
 *
 * Conventions:
 * - First segment is the domain (`'crm'`, `'identity'`, …).
 * - Person/range params come AFTER the section name so partial keys can
 *   target whole sections (`['crm', 'kpis']`) when needed.
 * - `as const` everywhere so TypeScript treats keys as readonly tuples
 *   and TanStack's variadic key type stays narrow.
 */

import type { DateRange } from '../utils/periodToDateRange';

export const crmKeys = {
  all:      ['crm'] as const,
  byRep:    (personId: string)                       => [...crmKeys.all, { rep: personId }]                         as const,
  kpis:     (personId: string, range: DateRange)     => [...crmKeys.all, 'kpis',    personId, range]                as const,
  prevKpis: (personId: string, range: DateRange)     => [...crmKeys.all, 'kpis',    personId, range, 'prev']        as const,
  flow:     (personId: string, range: DateRange)     => [...crmKeys.all, 'flow',    personId, range]                as const,
  bullet:   (personId: string, range: DateRange,
             kind: 'quality' | 'activity')           => [...crmKeys.all, 'bullet',  personId, range, kind]          as const,
};

export const identityKeys = {
  all:     ['identity'] as const,
  byEmail: (email: string) => [...identityKeys.all, email] as const,
};

export const teamKeys = {
  all:          ['team'] as const,
  member:       (email: string, range: DateRange)               => [...teamKeys.all, 'member',  email, range]              as const,
  memberBulk:   (orgScope: string, range: DateRange)            => [...teamKeys.all, 'members', orgScope, range]           as const,
  bullet:       (sectionId: string, orgScope: string,
                 range: DateRange)                              => [...teamKeys.all, 'bullet',  sectionId, orgScope, range] as const,
  availability: ()                                              => [...teamKeys.all, 'availability']                       as const,
};
