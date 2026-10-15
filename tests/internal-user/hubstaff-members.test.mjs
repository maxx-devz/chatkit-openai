import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listActiveHubstaffMembers } from '../../lib/internal-hubstaff-members.js';

const token = 'hsoat_fixture_token';
const teamId = '77';
const organization = { organizations: [{ id: 9 }], pagination: {} };

function responseFor({ memberPages, teamPages = { first: { team_members: [
  { user_id: 101 }, { user_id: 202 }, { user_id: 303 },
], pagination: {} } }, teams = [{ id: 77 }] }, calls) {
  return async (url, options) => {
    calls.push({ url: String(url), options });
    if (url.pathname === '/v2/organizations') return Response.json(organization);
    if (url.pathname === '/v2/organizations/9/teams') return Response.json({ teams, pagination: {} });
    if (url.pathname === '/v2/teams/77/members') {
      return Response.json(teamPages[url.searchParams.get('page_start_id') || 'first']);
    }
    if (url.pathname === '/v2/organizations/9/members') {
      return Response.json(memberPages[url.searchParams.get('page_start_id') || 'first']);
    }
    throw new Error('Unexpected Hubstaff fixture route');
  };
}

test('only active AOC team members are returned, with safe display fields', async () => {
  const calls = [];
  const members = await listActiveHubstaffMembers({ token, teamId, fetchImpl: responseFor({ memberPages: { first: {
    members: [
      { user_id: 101, membership_status: 'active', sensitive: 'do not send' },
      { user_id: 202, membership_status: 'inactive' },
      { user_id: 303, membership_status: 'active' },
      { user_id: 404, membership_status: 'active' },
    ],
    users: [
      { id: 101, name: '  Avery\nAdmin  ', status: 'active', email: 'private@example.invalid' },
      { id: 202, name: 'Inactive Member', status: 'active' },
      { id: 303, name: 'Inactive User', status: 'inactive' },
      { id: 404, name: 'Outside AOC team', status: 'active' },
    ], pagination: {},
  } } }, calls) });
  assert.deepEqual(members, [{ id: '101', name: 'Avery Admin' }]);
  assert.equal(calls.length, 4);
  assert.equal(calls[2].url, 'https://api.hubstaff.com/v2/teams/77/members?page_limit=100');
  assert.equal(calls[3].url, 'https://api.hubstaff.com/v2/organizations/9/members?page_limit=100&include=users');
  assert.equal(calls[3].options.headers.Authorization, `Bearer ${token}`);
  assert.equal(calls[3].options.cache, 'no-store');
});

test('organization mode includes active non-AOC members without requiring the AOC team filter', async () => {
  const calls = [];
  const members = await listActiveHubstaffMembers({ token, teamId: '', aocOnly: false,
    fetchImpl: responseFor({ memberPages: { first: {
      members: [
        { user_id: 101, membership_status: 'active' },
        { user_id: 505, membership_status: 'active' },
        { user_id: 606, membership_status: 'inactive' },
      ],
      users: [
        { id: 101, name: 'AOC Member', status: 'active' },
        { id: 505, name: 'Outside AOC Team', status: 'active', email: 'private@example.invalid' },
        { id: 606, name: 'Inactive Member', status: 'active' },
      ], pagination: {},
    } } }, calls),
  });
  assert.deepEqual(members, [
    { id: '101', name: 'AOC Member' }, { id: '505', name: 'Outside AOC Team' },
  ]);
  assert.equal(calls.length, 2);
  assert.equal(calls.some(call => call.url.includes('/teams')), false);
});

test('all team and organization member pages are read before offering a mapping', async () => {
  const calls = [];
  const members = await listActiveHubstaffMembers({ token, teamId, fetchImpl: responseFor({
    teamPages: {
      first: { team_members: [{ user_id: 101 }], pagination: { next_page_start_id: 101 } },
      101: { team_members: [{ user_id: 202 }], pagination: {} },
    },
    memberPages: {
      first: { members: [{ user_id: 101, membership_status: 'active' }],
        users: [{ id: 101, name: 'Zoe', status: 'active' }], pagination: { next_page_start_id: 101 } },
      101: { members: [{ user_id: 202, membership_status: 'active' }],
        users: [{ id: 202, name: 'Avery', status: 'active' }], pagination: {} },
    },
  }, calls) });
  assert.deepEqual(members, [{ id: '202', name: 'Avery' }, { id: '101', name: 'Zoe' }]);
  assert.equal(calls.length, 6);
  assert.match(calls[3].url, /page_start_id=101/);
  assert.match(calls[5].url, /page_start_id=101/);
});

test('missing token, missing team configuration, or ambiguous organization fails closed', async () => {
  await assert.rejects(listActiveHubstaffMembers({ token: '', teamId }),
    error => error.publicDetails.code === 'hubstaff_directory_not_configured');
  await assert.rejects(listActiveHubstaffMembers({ token, teamId: '' }),
    error => error.publicDetails.code === 'hubstaff_team_not_configured');
  await assert.rejects(listActiveHubstaffMembers({ token, teamId,
    fetchImpl: async () => Response.json({ organizations: [{ id: 9 }, { id: 10 }] }) }),
  error => error.publicDetails.code === 'hubstaff_organization_ambiguous');
});

test('wrong team, incomplete pages, and provider errors fail closed without leaking details', async () => {
  await assert.rejects(listActiveHubstaffMembers({ token, teamId,
    fetchImpl: responseFor({ teams: [{ id: 88 }], memberPages: {} }, []) }),
  error => error.publicDetails.code === 'hubstaff_team_unavailable');
  await assert.rejects(listActiveHubstaffMembers({ token, teamId,
    fetchImpl: responseFor({ memberPages: { first: { members: [{ user_id: 101, membership_status: 'active' }],
      users: [], pagination: {} } } }, []) }),
  error => error.publicDetails.code === 'hubstaff_directory_unavailable');
  await assert.rejects(listActiveHubstaffMembers({ token, teamId,
    fetchImpl: responseFor({ teamPages: { first: { team_members: null } }, memberPages: {} }, []) }),
  error => error.publicDetails.code === 'hubstaff_directory_unavailable');
  const secret = 'provider-error-secret';
  await assert.rejects(listActiveHubstaffMembers({ token, teamId,
    fetchImpl: async () => Response.json({ error: secret }, { status: 403 }) }), error => {
    assert.equal(error.publicDetails.code, 'hubstaff_directory_unavailable');
    assert.equal(error.publicDetails.message.includes(secret), false);
    assert.equal(error.publicDetails.message.includes(token), false);
    return true;
  });
});
