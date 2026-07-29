/**
 * Mock Data Registry — Single Source of Truth
 *
 * All mock data derives from these definitions. Every handler, factory,
 * and identity service must reference this registry instead of having
 * its own hardcoded lists.
 *
 * Org structure follows the real backend shape: supervisor_email forms a
 * recursive identity tree, no slug-based "team" grouping. A "team" is the
 * set of direct (or transitive) reports of a given supervisor.
 */

export type MockPerson = {
  person_id: string;
  name: string;
  department: string;
  role: string;
  seniority: string;
  is_lead: boolean;
  ai_tools: string[];
  supervisor_email: string | null;
};

export const PEOPLE: MockPerson[] = [
  { person_id: 'carol.chen@example.com',    name: 'Carol Chen',    department: 'Engineering', role: 'Tech Lead',                seniority: 'Staff',     is_lead: true,  ai_tools: ['Codex'],                 supervisor_email: null },
  { person_id: 'bob.park@example.com',      name: 'Bob Park',      department: 'Engineering', role: 'Tech Lead',                seniority: 'Staff',     is_lead: true,  ai_tools: ['Cursor'],                supervisor_email: 'carol.chen@example.com' },
  { person_id: 'alice.kim@example.com',     name: 'Alice Kim',     department: 'Engineering', role: 'Senior Software Engineer', seniority: 'Senior',    is_lead: false, ai_tools: ['Cursor', 'Claude Code'], supervisor_email: 'bob.park@example.com' },
  { person_id: 'david.liu@example.com',     name: 'David Liu',     department: 'Engineering', role: 'Junior Software Engineer', seniority: 'Junior',    is_lead: false, ai_tools: ['Cursor'],                supervisor_email: 'bob.park@example.com' },
  { person_id: 'eve.novak@example.com',     name: 'Eve Novak',     department: 'Engineering', role: 'Staff Software Engineer',  seniority: 'Staff',     is_lead: false, ai_tools: ['Cursor', 'Claude Code'], supervisor_email: 'bob.park@example.com' },
  { person_id: 'grace.wu@example.com',      name: 'Grace Wu',      department: 'Engineering', role: 'Software Engineer',        seniority: 'Mid',       is_lead: false, ai_tools: ['Cursor'],                supervisor_email: 'bob.park@example.com' },
  { person_id: 'iris.tan@example.com',      name: 'Iris Tan',      department: 'Engineering', role: 'Junior Software Engineer', seniority: 'Junior',    is_lead: false, ai_tools: [],                        supervisor_email: 'bob.park@example.com' },
  { person_id: 'leo.dunn@example.com',      name: 'Leo Dunn',      department: 'Engineering', role: 'Junior Software Engineer', seniority: 'Junior',    is_lead: false, ai_tools: ['Cursor'],                supervisor_email: 'bob.park@example.com' },
  { person_id: 'frank.moss@example.com',    name: 'Frank Moss',    department: 'Engineering', role: 'Tech Lead',                seniority: 'Principal', is_lead: true,  ai_tools: ['Claude Code'],           supervisor_email: 'carol.chen@example.com' },
  { person_id: 'hank.reed@example.com',     name: 'Hank Reed',     department: 'Engineering', role: 'Tech Lead',                seniority: 'Senior',    is_lead: true,  ai_tools: ['Cursor', 'Codex'],       supervisor_email: 'carol.chen@example.com' },
  { person_id: 'jake.fox@example.com',      name: 'Jake Fox',      department: 'Engineering', role: 'Tech Lead',                seniority: 'Mid',       is_lead: true,  ai_tools: ['Cursor'],                supervisor_email: 'carol.chen@example.com' },
  { person_id: 'kira.sato@example.com',     name: 'Kira Sato',     department: 'Engineering', role: 'Tech Lead',                seniority: 'Senior',    is_lead: true,  ai_tools: ['Claude Code', 'Codex'],  supervisor_email: 'carol.chen@example.com' },
  { person_id: 'noah.bell@example.com',     name: 'Noah Bell',     department: 'Engineering', role: 'Senior Software Engineer', seniority: 'Senior',    is_lead: false, ai_tools: ['Cursor', 'Claude Code'], supervisor_email: 'alice.kim@example.com' },
  { person_id: 'olivia.park@example.com',   name: 'Olivia Park',   department: 'Engineering', role: 'Software Engineer',        seniority: 'Mid',       is_lead: false, ai_tools: ['Claude Code'],           supervisor_email: 'alice.kim@example.com' },
  { person_id: 'priya.shah@example.com',    name: 'Priya Shah',    department: 'Engineering', role: 'Software Engineer',        seniority: 'Mid',       is_lead: false, ai_tools: ['Cursor'],                supervisor_email: 'frank.moss@example.com' },
  { person_id: 'quinn.lee@example.com',     name: 'Quinn Lee',     department: 'Engineering', role: 'Junior Software Engineer', seniority: 'Junior',    is_lead: false, ai_tools: [],                        supervisor_email: 'frank.moss@example.com' },
  { person_id: 'ravi.iyer@example.com',     name: 'Ravi Iyer',     department: 'Engineering', role: 'Senior Software Engineer', seniority: 'Senior',    is_lead: false, ai_tools: ['Codex'],                 supervisor_email: 'hank.reed@example.com' },
  { person_id: 'sara.bishop@example.com',   name: 'Sara Bishop',   department: 'Engineering', role: 'Software Engineer',        seniority: 'Mid',       is_lead: false, ai_tools: ['Cursor', 'Codex'],       supervisor_email: 'hank.reed@example.com' },
  { person_id: 'tom.alvarez@example.com',   name: 'Tom Alvarez',   department: 'Engineering', role: 'Software Engineer',        seniority: 'Mid',       is_lead: false, ai_tools: ['Cursor'],                supervisor_email: 'jake.fox@example.com' },
  { person_id: 'dave.sales@example.com',    name: 'Dave Hart',     department: 'Sales',       role: 'Account Executive',        seniority: 'Senior',    is_lead: false, ai_tools: [],                        supervisor_email: null },
];

const PEOPLE_BY_ID: Record<string, MockPerson> = Object.fromEntries(
  PEOPLE.map((p) => [p.person_id, p]),
);

function directReports(supervisorEmail: string): MockPerson[] {
  return PEOPLE.filter((p) => p.supervisor_email === supervisorEmail);
}

export type MockIdentityRaw = {
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  department: string;
  division: string;
  job_title: string;
  status: string;
  supervisor_email: string | null;
  supervisor_name: string | null;
  subordinates: MockIdentityRaw[];
};

export function buildIdentityTree(email: string): MockIdentityRaw | null {
  const root = PEOPLE_BY_ID[email];
  if (!root) return null;

  const splitName = (name: string): { first: string; last: string } => {
    const idx = name.indexOf(' ');
    return idx < 0
      ? { first: name, last: '' }
      : { first: name.slice(0, idx), last: name.slice(idx + 1) };
  };

  const toRaw = (p: MockPerson): MockIdentityRaw => {
    const { first, last } = splitName(p.name);
    const sup = p.supervisor_email ? PEOPLE_BY_ID[p.supervisor_email] : null;
    return {
      email: p.person_id,
      display_name: p.name,
      first_name: first,
      last_name: last,
      department: p.department,
      division: p.department,
      job_title: p.role,
      status: 'Active',
      supervisor_email: p.supervisor_email,
      supervisor_name: sup?.name ?? null,
      subordinates: directReports(p.person_id).map(toRaw),
    };
  };

  return toRaw(root);
}
