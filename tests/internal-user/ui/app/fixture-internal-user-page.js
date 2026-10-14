import InternalUserDashboard from '../../../../components/internal/internal-user-dashboard';
import InternalUserShell from '../../../../components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '../../../../components/internal/internal-workspace-provider';
import HubstaffConnection from '../../../../components/internal/hubstaff-connection';

export default async function FixtureInternalUserPage({ searchParams, workspace = 'personal', manager = false, embedded = false }) {
  const params = await searchParams;
  const connected = params?.connected !== 'false';
  const isManager = manager || params?.manager === 'true';
  const position = isManager ? 'Project Manager' : 'Team Member';
  const panels = ['overview', 'my_tasks', 'activity', 'team_directory', 'hubstaff'];
  const permissions = ['work.overview.read', 'work.tasks.read', 'work.activity.read',
    'hubstaff.connection.read', 'people.directory.read'];
  const dashboard = <InternalUserDashboard name="Fixture Internal User" position={position} panelAccess={panels}
      workspace={workspace} connected={connected}>
    {workspace === 'settings' ? <HubstaffConnection connected={connected} /> : null}
  </InternalUserDashboard>;
  if (embedded) return dashboard;
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture Internal User" position={position} panelAccess={panels}
      permissions={permissions} connected={connected}>
      {dashboard}
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
