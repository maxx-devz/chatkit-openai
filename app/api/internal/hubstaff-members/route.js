import { adminErrorResponse, loadAvailableAdminHubstaffMembers } from '@/lib/admin-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const values = params.getAll('aoc_only');
    if ([...params.keys()].some(key => key !== 'aoc_only') || values.length > 1
      || (values.length && !['true', 'false'].includes(values[0]))) {
      return Response.json({ code: 'invalid_member_filter', error: 'Select a valid Hubstaff member filter.' },
        { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return Response.json({ members: await loadAvailableAdminHubstaffMembers(request.headers,
      { aocOnly: values[0] !== 'false' }) }, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return adminErrorResponse(error); }
}
