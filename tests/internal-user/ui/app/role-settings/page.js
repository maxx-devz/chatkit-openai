import InternalSettingsControls from '@/components/internal/internal-settings-controls';

const USERS = [
  { id: '1', username: 'fixture.admin', name: 'Fixture Admin', position: 'team_member',
    positionLabel: 'Team Member', panelAccess: ['overview'], roles: ['internal_admin'], active: true,
    hubstaffUserId: '101', connected: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: '2', username: 'fixture.target', name: 'Taylor Team', position: 'team_member',
    positionLabel: 'Team Member', panelAccess: ['overview', 'my_tasks', 'activity', 'hubstaff'],
    roles: ['project_management'], active: true, hubstaffUserId: '202', connected: false,
    createdAt: '2026-01-01T00:00:00Z' },
];

export default function RoleSettingsFixture() {
  return <InternalSettingsControls initialInternalUsers={USERS} schemaReady
    canManageOwnAccount canManageRoles viewerId="1" />;
}
