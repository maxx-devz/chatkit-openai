import EmployeeDashboard from '../../../../components/employee/employee-dashboard';
import EmployeeShell from '../../../../components/employee/employee-shell';
import { EmployeeWorkspaceProvider } from '../../../../components/employee/employee-workspace-provider';
import HubstaffConnection from '../../../../components/employee/hubstaff-connection';

export default async function FixtureEmployeePage({ searchParams, workspace = 'personal', manager = false, embedded = false }) {
  const params = await searchParams;
  const connected = params?.connected !== 'false';
  const isManager = manager || params?.manager === 'true';
  const position = isManager ? 'Project Manager' : 'Team Member';
  const panels = isManager
    ? ['overview', 'my_tasks', 'activity', 'team_directory', 'team_tasks', 'hubstaff']
    : ['overview', 'my_tasks', 'activity', 'hubstaff'];
  const dashboard = <EmployeeDashboard name="Fixture Employee" position={position} panelAccess={panels}
      workspace={workspace} connected={connected}>
    {workspace === 'settings' ? <HubstaffConnection connected={connected} /> : null}
  </EmployeeDashboard>;
  if (embedded) return dashboard;
  return <EmployeeWorkspaceProvider>
    <EmployeeShell name="Fixture Employee" position={position} panelAccess={panels} connected={connected}>
      {dashboard}
    </EmployeeShell>
  </EmployeeWorkspaceProvider>;
}
