import InternalSettingsControls from '@/components/internal/internal-settings-controls';

const USERS = [
  { id: '1', username: 'fixture.admin', name: 'Fixture Admin', position: 'team_member',
    positionLabel: 'Team Member', panelAccess: ['overview', 'account_settings'], roles: ['internal_admin'], active: true,
    hubstaffUserId: '101', connected: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: '2', username: 'fixture.target', name: 'Taylor Team', position: 'team_member',
    positionLabel: 'Team Member', panelAccess: ['overview', 'my_tasks', 'activity', 'account_settings', 'hubstaff'],
    roles: ['project_management'], active: true, hubstaffUserId: '202', connected: false,
    createdAt: '2026-01-01T00:00:00Z' },
];

export default async function RoleSettingsFixture({ searchParams }) {
  const params = await searchParams;
  const manager = params?.viewer === 'manager';
  const users = manager ? [{ ...USERS[0], roles: ['internal_access_manager'] }, USERS[1]] : USERS;
  return <InternalSettingsControls initialInternalUsers={users} schemaReady
    canManageOwnAccount={!manager} canManageRoles canResetPasswords isInternalAdmin={!manager} viewerId="1" />;
}
