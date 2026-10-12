import InternalUserDashboard from '../../../../components/internal/internal-user-dashboard';
import InternalUserShell from '../../../../components/internal/internal-shell';
import { InternalUserWorkspaceProvider } from '../../../../components/internal/internal-workspace-provider';
import HubstaffConnection from '../../../../components/internal/hubstaff-connection';

export default async function FixtureInternalUserPage({ searchParams, workspace = 'personal', manager = false, embedded = false }) {
  const params = await searchParams;
  const connected = params?.connected !== 'false';
  const isManager = manager || params?.manager === 'true';
  const position = isManager ? 'Project Manager' : 'Team Member';
  const panels = isManager
    ? ['overview', 'my_tasks', 'activity', 'team_directory', 'team_tasks', 'hubstaff']
    : ['overview', 'my_tasks', 'activity', 'hubstaff'];
  const dashboard = <InternalUserDashboard name="Fixture Internal User" position={position} panelAccess={panels}
      workspace={workspace} connected={connected}>
    {workspace === 'settings' ? <HubstaffConnection connected={connected} /> : null}
  </InternalUserDashboard>;
  if (embedded) return dashboard;
  return <InternalUserWorkspaceProvider>
    <InternalUserShell name="Fixture Internal User" position={position} panelAccess={panels} connected={connected}>
      {dashboard}
    </InternalUserShell>
  </InternalUserWorkspaceProvider>;
}
