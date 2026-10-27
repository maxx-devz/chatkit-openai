import 'server-only';

const HUBSTAFF_API_ORIGIN = 'https://api.hubstaff.com';
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

function directoryError(code, message, status = 503) {
  return Object.assign(new Error(message), { publicDetails: { code, message, status } });
}

function hubstaffId(value) {
  const id = String(value ?? '');
  return /^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id)) ? id : '';
}

function displayName(value, id) {
  const name = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '';
  return name || `Hubstaff member ${id}`;
}

export async function listActiveHubstaffMembers({ fetchImpl = fetch,
  token = process.env.HUBSTAFF_ACCESS_TOKEN,
  teamId: configuredTeamId = process.env.HUBSTAFF_INTERNAL_TEAM_ID,
  aocOnly = true } = {}) {
  if (typeof token !== 'string' || !token.trim().startsWith('hsoat_')) {
    throw directoryError('hubstaff_directory_not_configured',
      'An organization Hubstaff token is required to list members.');
  }
  const teamId = hubstaffId(configuredTeamId);
  if (aocOnly && !teamId) {
    throw directoryError('hubstaff_team_not_configured',
      'Configure the AOC member team ID before creating internal users.');
  }

  async function get(path, params = {}) {
    const url = new URL(path, HUBSTAFF_API_ORIGIN);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token.trim()}` },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw directoryError('hubstaff_directory_unavailable', 'Hubstaff members could not be loaded. Try again shortly.');
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw directoryError('hubstaff_directory_unavailable', 'Hubstaff members could not be loaded. Check the organization token.');
    }
    try {
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
      return payload;
    } catch {
      throw directoryError('hubstaff_directory_unavailable', 'Hubstaff returned an invalid member list.');
    }
  }

  const organizationPayload = await get('/v2/organizations', { page_limit: String(PAGE_LIMIT) });
  const organizations = organizationPayload.organizations;
  const organizationId = Array.isArray(organizations) && organizations.length === 1
    && !organizationPayload.pagination?.next_page_start_id ? hubstaffId(organizations[0]?.id) : '';
  if (!organizationId) {
    throw directoryError('hubstaff_organization_ambiguous',
      'The organization token must identify exactly one Hubstaff organization.');
  }

  async function eachPage(path, collection, params, visit) {
    const visited = new Set();
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await get(path, { page_limit: String(PAGE_LIMIT), ...params,
        ...(cursor ? { page_start_id: cursor } : {}) });
      const items = payload[collection];
      if (!Array.isArray(items) || items.length > PAGE_LIMIT) {
        throw directoryError('hubstaff_directory_unavailable', 'Hubstaff returned an incomplete member list.');
      }
      visit(items, payload);
      const next = payload.pagination?.next_page_start_id;
      if (next === undefined || next === null || next === '') return;
      cursor = hubstaffId(next);
      if (!cursor || visited.has(cursor) || !items.length) {
        throw directoryError('hubstaff_directory_unavailable', 'Hubstaff member pagination could not be verified.');
      }
      visited.add(cursor);
    }
    throw directoryError('hubstaff_directory_unavailable', 'Hubstaff returned too many member pages to verify.');
  }

  const teamMemberIds = new Set();
  if (aocOnly) {
    let teamBelongsToOrganization = false;
    await eachPage(`/v2/organizations/${organizationId}/teams`, 'teams', {}, teams => {
      if (teams.some(team => hubstaffId(team?.id) === teamId)) teamBelongsToOrganization = true;
    });
    if (!teamBelongsToOrganization) {
      throw directoryError('hubstaff_team_unavailable',
        'The configured AOC member team is not in the Hubstaff organization.');
    }
    await eachPage(`/v2/teams/${teamId}/members`, 'team_members', {}, teamMembers => {
      for (const member of teamMembers) {
        const id = hubstaffId(member?.user_id);
        if (!id) throw directoryError('hubstaff_directory_unavailable', 'Hubstaff returned an incomplete team list.');
        teamMemberIds.add(id);
      }
    });
  }

  const members = new Map();
  await eachPage(`/v2/organizations/${organizationId}/members`, 'members', { include: 'users' },
    (organizationMembers, payload) => {
      if (!Array.isArray(payload.users)) {
        throw directoryError('hubstaff_directory_unavailable', 'Hubstaff returned an incomplete member list.');
      }
      const users = new Map(payload.users.map(user => [hubstaffId(user?.id), user]));
      for (const member of organizationMembers) {
        const id = hubstaffId(member?.user_id);
        const user = users.get(id);
        if (!id || !user) {
          throw directoryError('hubstaff_directory_unavailable', 'Hubstaff returned an incomplete member list.');
        }
        if ((!aocOnly || teamMemberIds.has(id))
          && member.membership_status === 'active' && user.status === 'active') {
          members.set(id, { id, name: displayName(user.name, id) });
        }
      }
    });
  return [...members.values()].sort((first, second) => first.name.localeCompare(second.name));
}
